import { and, asc, desc, eq, isNotNull, type SQL } from "drizzle-orm";
import type { Job, Meal, Part, Recipe } from "@shared/types";
import { recipeDisplayName, recipeHost } from "@shared/recipes";
import type { getDb } from "./client";
import { jobParts, jobs, meals, recipes } from "./schema";

type Db = ReturnType<typeof getDb>;

/** Meals matching `where`, each with its recipe attached. */
export async function loadMeals(db: Db, where: SQL | undefined): Promise<Meal[]> {
  const rows = await db
    .select({ meal: meals, recipe: recipes })
    .from(meals)
    .leftJoin(recipes, eq(meals.recipeId, recipes.id))
    .where(where);
  return rows.map(({ meal, recipe }) => ({
    date: meal.date,
    slot: meal.slot,
    title: meal.title,
    recipe: recipe ? { id: recipe.id, url: recipe.url, title: recipe.title } : null,
    updatedBy: meal.updatedBy,
    updatedAt: meal.updatedAt ? meal.updatedAt.getTime() : null,
  }));
}

export async function loadMeal(db: Db, date: string, slot: Meal["slot"]): Promise<Meal | null> {
  const [meal] = await loadMeals(db, and(eq(meals.date, date), eq(meals.slot, slot)));
  return meal ?? null;
}

/** The library entry for `url` (already normalised), creating it if new. */
export async function findOrCreateRecipe(db: Db, url: string, userEmail: string): Promise<number> {
  const [created] = await db
    .insert(recipes)
    .values({ url, createdBy: userEmail })
    .onConflictDoNothing({ target: recipes.url })
    .returning({ id: recipes.id });
  if (created) return created.id;
  const existing = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.url, url)).get();
  if (!existing) throw new Error(`Recipe for ${url} vanished`);
  return existing.id;
}

/** Library recipes with every meal that used them. `id` narrows to one recipe. */
export async function loadRecipes(db: Db, id?: number): Promise<Recipe[]> {
  const [recipeRows, useRows] = await Promise.all([
    db.select().from(recipes).where(id === undefined ? undefined : eq(recipes.id, id)),
    db
      .select({ recipeId: meals.recipeId, date: meals.date, slot: meals.slot, title: meals.title })
      .from(meals)
      .where(id === undefined ? isNotNull(meals.recipeId) : eq(meals.recipeId, id))
      // Newest first; on the same day dinner ("d") sorts before lunch ("l").
      .orderBy(desc(meals.date), asc(meals.slot)),
  ]);

  const usesById = new Map<number, Recipe["uses"]>();
  for (const { recipeId, ...use } of useRows) {
    if (recipeId === null) continue;
    const list = usesById.get(recipeId) ?? [];
    list.push(use);
    usesById.set(recipeId, list);
  }

  return recipeRows.map((r) => {
    const uses = usesById.get(r.id) ?? [];
    const latestNamed = uses.find((u) => u.title.trim())?.title;
    return {
      id: r.id,
      url: r.url,
      title: r.title,
      displayName: recipeDisplayName(r, latestNamed),
      host: recipeHost(r.url),
      createdAt: r.createdAt.getTime(),
      uses,
    };
  });
}

/** Jobs with their parts (oldest part first). `id` narrows to one job. */
export async function loadJobs(db: Db, id?: number): Promise<Job[]> {
  const [jobRows, partRows] = await Promise.all([
    db.select().from(jobs).where(id === undefined ? undefined : eq(jobs.id, id)),
    db
      .select()
      .from(jobParts)
      .where(id === undefined ? undefined : eq(jobParts.jobId, id))
      .orderBy(asc(jobParts.id)),
  ]);

  const partsByJob = new Map<number, Part[]>();
  for (const p of partRows) {
    const list = partsByJob.get(p.jobId) ?? [];
    list.push({ id: p.id, name: p.name, url: p.url, boughtAt: p.boughtAt ? p.boughtAt.getTime() : null });
    partsByJob.set(p.jobId, list);
  }

  return jobRows.map((row) => ({
    id: row.id,
    title: row.title,
    severity: row.severity,
    room: row.room,
    doer: row.doer,
    notes: row.notes,
    estimatePence: row.estimatePence,
    actualPence: row.actualPence,
    doneAt: row.doneAt ? row.doneAt.getTime() : null,
    doneBy: row.doneBy,
    dueOn: row.dueOn,
    repeat: row.repeatEvery && row.repeatUnit ? { every: row.repeatEvery, unit: row.repeatUnit } : null,
    parts: partsByJob.get(row.id) ?? [],
    createdBy: row.createdBy,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }));
}

export async function loadJob(db: Db, id: number): Promise<Job | null> {
  const [job] = await loadJobs(db, id);
  return job ?? null;
}
