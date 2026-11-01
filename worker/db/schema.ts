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
 * One row per planned meal. A slot with no row is empty.
 * Recipes become their own table later; for now a meal can carry a link.
 */
export const meals = sqliteTable(
  "meals",
  {
    date: text("date").notNull(), // YYYY-MM-DD
    slot: text("slot", { enum: ["lunch", "dinner"] }).notNull(),
    title: text("title").notNull().default(""),
    recipeUrl: text("recipe_url"),
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
