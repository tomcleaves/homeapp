import { zValidator } from "@hono/zod-validator";
import { and, between, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Meal, WeekResponse } from "@shared/types";
import { addDays, mondayOf, SLOTS, type Slot } from "@shared/week";
import type { AppEnv } from "../auth";
import { getDb } from "../db/client";
import { findOrCreateRecipe, loadMeal, loadMeals } from "../db/queries";
import { meals, recipes } from "../db/schema";
import { isoDate, recipeUrl } from "../validation";

const slotParams = z.object({ date: isoDate, slot: z.enum(SLOTS) });

const mealUpdate = z
  .object({
    title: z.string().max(500).optional(),
    recipeUrl: z.union([recipeUrl, z.literal(""), z.null()]).optional(),
    recipeId: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (v) => v.title !== undefined || v.recipeUrl !== undefined || v.recipeId !== undefined,
    "Nothing to update",
  )
  .refine((v) => v.recipeUrl === undefined || v.recipeId === undefined, {
    message: "Send recipeUrl or recipeId, not both",
  });

type Db = ReturnType<typeof getDb>;

/**
 * Writes one slot. A slot left with no title and no recipe is deleted, so the
 * table only ever holds meals that exist.
 */
async function writeSlot(
  db: Db,
  date: string,
  slot: Slot,
  title: string,
  recipeId: number | null,
  userEmail: string,
): Promise<Meal | null> {
  if (!title.trim() && recipeId === null) {
    await db.delete(meals).where(and(eq(meals.date, date), eq(meals.slot, slot)));
    return null;
  }
  const values = { title, recipeId, updatedBy: userEmail, updatedAt: new Date() };
  await db
    .insert(meals)
    .values({ date, slot, ...values })
    .onConflictDoUpdate({ target: [meals.date, meals.slot], set: values });
  return loadMeal(db, date, slot);
}

export const mealRoutes = new Hono<AppEnv>()
  // Everything planned for the week containing :date (normally its Monday).
  .get("/weeks/:date", zValidator("param", z.object({ date: isoDate })), async (c) => {
    const weekStart = mondayOf(c.req.valid("param").date);
    const list = await loadMeals(getDb(c.env), between(meals.date, weekStart, addDays(weekStart, 6)));
    return c.json<WeekResponse>({ weekStart, meals: list });
  })

  // Create, change or clear one meal slot.
  .put(
    "/meals/:date/:slot",
    zValidator("param", slotParams),
    zValidator("json", mealUpdate),
    async (c) => {
      const { date, slot } = c.req.valid("param");
      const update = c.req.valid("json");
      const db = getDb(c.env);
      const user = c.get("userEmail");

      const existing = await db
        .select()
        .from(meals)
        .where(and(eq(meals.date, date), eq(meals.slot, slot)))
        .get();

      let recipeId = existing?.recipeId ?? null;
      if (update.recipeUrl !== undefined) {
        recipeId = update.recipeUrl ? await findOrCreateRecipe(db, update.recipeUrl, user) : null;
      } else if (update.recipeId !== undefined) {
        recipeId = update.recipeId;
        if (recipeId !== null) {
          const found = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, recipeId)).get();
          if (!found) return c.json({ error: "That recipe isn't in the library" }, 404);
        }
      }

      const title = update.title ?? existing?.title ?? "";
      const meal = await writeSlot(db, date, slot, title, recipeId, user);
      return c.json({ meal });
    },
  )

  // Copy a dinner into the next day's lunch as leftovers.
  .post(
    "/meals/:date/dinner/leftovers",
    zValidator("param", z.object({ date: isoDate })),
    async (c) => {
      const { date } = c.req.valid("param");
      const db = getDb(c.env);

      const dinner = await db
        .select()
        .from(meals)
        .where(and(eq(meals.date, date), eq(meals.slot, "dinner")))
        .get();
      const dinnerTitle = dinner?.title.trim();
      if (!dinnerTitle) return c.json({ error: "That dinner is empty" }, 400);

      const nextDate = addDays(date, 1);
      const lunch = await db
        .select()
        .from(meals)
        .where(and(eq(meals.date, nextDate), eq(meals.slot, "lunch")))
        .get();

      const line = `Leftovers: ${dinnerTitle}`;
      const current = lunch?.title.trim() ?? "";
      const title = current ? `${current}\n${line}` : line;

      const meal = await writeSlot(db, nextDate, "lunch", title, lunch?.recipeId ?? null, c.get("userEmail"));
      return c.json({ meal });
    },
  );
