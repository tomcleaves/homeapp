import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Recipe, RecipesResponse } from "@shared/types";
import type { AppEnv } from "../auth";
import { getDb } from "../db/client";
import { findOrCreateRecipe, loadRecipes } from "../db/queries";
import { meals, recipes } from "../db/schema";
import { idParam, recipeTitle, recipeUrl } from "../validation";

const recipeInput = z.object({ url: recipeUrl, title: recipeTitle.optional() });

const recipePatch = z
  .object({ url: recipeUrl.optional(), title: recipeTitle.optional() })
  .refine((v) => v.url !== undefined || v.title !== undefined, "Nothing to update");

/** SQLite's message for a UNIQUE violation, as D1 reports it. */
const isUniqueViolation = (e: unknown) =>
  e instanceof Error && /UNIQUE constraint failed/i.test(`${e.message} ${String(e.cause ?? "")}`);

export const recipeRoutes = new Hono<AppEnv>()
  // The whole library, each recipe with the meals that used it.
  .get("/recipes", async (c) => {
    const list = await loadRecipes(getDb(c.env));
    return c.json<RecipesResponse>({ recipes: list });
  })

  // Add a recipe to the library without putting it on the plan.
  // Adding a link that's already there returns the existing entry.
  .post("/recipes", zValidator("json", recipeInput), async (c) => {
    const { url, title } = c.req.valid("json");
    const db = getDb(c.env);
    const id = await findOrCreateRecipe(db, url, c.get("userEmail"));
    if (title) {
      // Only fills in a missing name; never overwrites one already chosen.
      await db.update(recipes).set({ title }).where(and(eq(recipes.id, id), isNull(recipes.title)));
    }
    const [recipe] = await loadRecipes(db, id);
    return c.json<{ recipe: Recipe | undefined }>({ recipe }, 201);
  })

  // Rename a recipe or correct its link.
  .patch("/recipes/:id", zValidator("param", idParam), zValidator("json", recipePatch), async (c) => {
    const { id } = c.req.valid("param");
    const patch = c.req.valid("json");
    const db = getDb(c.env);
    try {
      const updated = await db
        .update(recipes)
        .set(patch)
        .where(eq(recipes.id, id))
        .returning({ id: recipes.id });
      if (!updated.length) return c.json({ error: "Recipe not found" }, 404);
    } catch (e) {
      if (isUniqueViolation(e)) return c.json({ error: "Another recipe already has that link" }, 409);
      throw e;
    }
    const [recipe] = await loadRecipes(db, id);
    return c.json<{ recipe: Recipe | undefined }>({ recipe });
  })

  // Remove from the library. Meals keep their names but lose the link;
  // a meal that was only a link becomes an empty slot.
  .delete("/recipes/:id", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const found = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, id)).get();
    if (!found) return c.json({ error: "Recipe not found" }, 404);

    await db.batch([
      db.delete(meals).where(and(eq(meals.recipeId, id), sql`trim(${meals.title}) = ''`)),
      db.update(meals).set({ recipeId: null }).where(eq(meals.recipeId, id)),
      db.delete(recipes).where(eq(recipes.id, id)),
    ]);
    return c.json({ ok: true });
  });
