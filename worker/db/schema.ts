import { sql } from "drizzle-orm";
import { check, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** People who have signed in through Cloudflare Access. */
export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * The recipe library. One row per distinct recipe link; a recipe stays here
 * after it's removed from every meal, so the library is a lasting record.
 */
export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  // A name the user gave it. When empty, the UI names it after a meal that used it.
  title: text("title"),
  createdBy: text("created_by").references(() => users.email),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** One row per planned meal. A slot with no row is empty. */
export const meals = sqliteTable(
  "meals",
  {
    date: text("date").notNull(), // YYYY-MM-DD
    slot: text("slot", { enum: ["lunch", "dinner"] }).notNull(),
    title: text("title").notNull().default(""),
    recipeId: integer("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => users.email),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.slot] }),
    check("meals_slot_check", sql`${t.slot} in ('lunch', 'dinner')`),
  ],
);
