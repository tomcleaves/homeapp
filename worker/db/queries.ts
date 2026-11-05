import { and, asc, desc, eq, isNotNull, type SQL } from "drizzle-orm";
import type { Meal, Recipe } from "@shared/types";
import { recipeDisplayName, recipeHost } from "@shared/recipes";
import type { getDb } from "./client";
import { meals, recipes } from "./schema";

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
