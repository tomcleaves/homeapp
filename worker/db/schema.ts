import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

/**
 * House jobs: small jobs around the house, ticked off as they're done.
 * Money is whole pence (see shared/money.ts), never floating-point pounds.
 */
export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    severity: text("severity", { enum: ["low", "med", "high"] }).notNull().default("med"),
    room: text("room"),
    // Who'll do it: ourselves, a tradesperson, or not decided (null).
    doer: text("doer", { enum: ["diy", "trade"] }),
    notes: text("notes").notNull().default(""),
    estimatePence: integer("estimate_pence"),
    actualPence: integer("actual_pence"),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
    doneBy: text("done_by").references(() => users.email),
    // YYYY-MM-DD. Any job can have one; recurring jobs always get one.
    dueOn: text("due_on"),
    // Repeat every N units; both set or both null (enforced in validation).
    repeatEvery: integer("repeat_every"),
    repeatUnit: text("repeat_unit", { enum: ["week", "month", "year"] }),
    // The copy created when this recurring job was ticked off.
    nextJobId: integer("next_job_id").references((): AnySQLiteColumn => jobs.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => users.email),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    check("jobs_severity_check", sql`${t.severity} in ('low', 'med', 'high')`),
    check("jobs_doer_check", sql`${t.doer} is null or ${t.doer} in ('diy', 'trade')`),
    check("jobs_estimate_check", sql`${t.estimatePence} is null or ${t.estimatePence} >= 0`),
    check("jobs_actual_check", sql`${t.actualPence} is null or ${t.actualPence} >= 0`),
  ],
);

/** Parts to buy for a job, each with an optional shop link. */
export const jobParts = sqliteTable(
  "job_parts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url"),
    boughtAt: integer("bought_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("job_parts_job_id_idx").on(t.jobId)],
);
