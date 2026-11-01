import { zValidator } from "@hono/zod-validator";
import { and, between, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Meal, WeekResponse } from "@shared/types";
import { addDays, isIsoDate, mondayOf, SLOTS, type Slot } from "@shared/week";
import type { AppEnv } from "../auth";
import { getDb } from "../db/client";
import { meals } from "../db/schema";

const isoDate = z.string().refine(isIsoDate, "Expected a date as YYYY-MM-DD");

const slotParams = z.object({ date: isoDate, slot: z.enum(SLOTS) });

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Expected an http(s) link");

const mealUpdate = z
  .object({
    title: z.string().max(500).optional(),
    recipeUrl: z.union([httpUrl, z.literal(""), z.null()]).optional(),
  })
  .refine((v) => v.title !== undefined || v.recipeUrl !== undefined, "Nothing to update");

type MealRow = typeof meals.$inferSelect;

function toMeal(row: MealRow): Meal {
  return {
    date: row.date,
    slot: row.slot,
    title: row.title,
    recipeUrl: row.recipeUrl,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : null,
  };
}

/**
 * Writes one slot. A slot left with no title and no link is deleted, so the
 * table only ever holds meals that exist.
 */
async function writeSlot(
  db: ReturnType<typeof getDb>,
  date: string,
  slot: Slot,
  title: string,
  recipeUrl: string | null,
  userEmail: string,
): Promise<Meal | null> {
  const where = and(eq(meals.date, date), eq(meals.slot, slot));
  if (!title.trim() && !recipeUrl) {
    await db.delete(meals).where(where);
    return null;
  }
  const values = { title, recipeUrl, updatedBy: userEmail, updatedAt: new Date() };
  const [row] = await db
    .insert(meals)
    .values({ date, slot, ...values })
    .onConflictDoUpdate({ target: [meals.date, meals.slot], set: values })
    .returning();
  return row ? toMeal(row) : null;
}

export const mealRoutes = new Hono<AppEnv>()
  // Everything planned for the week containing :date (normally its Monday).
  .get("/weeks/:date", zValidator("param", z.object({ date: isoDate })), async (c) => {
    const weekStart = mondayOf(c.req.valid("param").date);
    const rows = await getDb(c.env)
      .select()
      .from(meals)
      .where(between(meals.date, weekStart, addDays(weekStart, 6)));
    return c.json<WeekResponse>({ weekStart, meals: rows.map(toMeal) });
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

      const existing = await db
        .select()
        .from(meals)
        .where(and(eq(meals.date, date), eq(meals.slot, slot)))
        .get();

      const title = update.title ?? existing?.title ?? "";
      const recipeUrl =
        update.recipeUrl === undefined ? (existing?.recipeUrl ?? null) : update.recipeUrl || null;

      const meal = await writeSlot(db, date, slot, title, recipeUrl, c.get("userEmail"));
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

      const meal = await writeSlot(
        db,
        nextDate,
        "lunch",
        title,
        lunch?.recipeUrl ?? null,
        c.get("userEmail"),
      );
      return c.json({ meal });
    },
  );
