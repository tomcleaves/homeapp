import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Job, JobsResponse } from "@shared/types";
import type { AppEnv } from "../auth";
import { getDb } from "../db/client";
import { jobs } from "../db/schema";
import { doer, idParam, pence, room, severity } from "../validation";

const title = z.string().trim().min(1, "Give the job a name").max(200);
const notes = z.string().max(2000);

const jobInput = z.object({
  title,
  severity: severity.optional(),
  room: room.optional(),
  doer: doer.nullable().optional(),
  notes: notes.optional(),
  estimatePence: pence.nullable().optional(),
});

const jobPatch = z
  .object({
    title: title.optional(),
    severity: severity.optional(),
    room: room.optional(),
    doer: doer.nullable().optional(),
    notes: notes.optional(),
    estimatePence: pence.nullable().optional(),
    actualPence: pence.nullable().optional(),
    done: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update");

type JobRow = typeof jobs.$inferSelect;

function toJob(row: JobRow): Job {
  return {
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
    createdBy: row.createdBy,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export const jobRoutes = new Hono<AppEnv>()
  // Every job, done ones included; the page filters and sorts.
  .get("/jobs", async (c) => {
    const rows = await getDb(c.env).select().from(jobs);
    return c.json<JobsResponse>({ jobs: rows.map(toJob) });
  })

  .post("/jobs", zValidator("json", jobInput), async (c) => {
    const input = c.req.valid("json");
    const [row] = await getDb(c.env)
      .insert(jobs)
      .values({ ...input, createdBy: c.get("userEmail") })
      .returning();
    return c.json<{ job: Job }>({ job: toJob(row!) }, 201);
  })

  // Change any field. `done: true` ticks it off (recording who and when);
  // `done: false` puts it back on the list but keeps any actual cost.
  .patch("/jobs/:id", zValidator("param", idParam), zValidator("json", jobPatch), async (c) => {
    const { id } = c.req.valid("param");
    const { done, ...fields } = c.req.valid("json");
    const db = getDb(c.env);

    const existing = await db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!existing) return c.json({ error: "Job not found" }, 404);

    const doneFields =
      done === undefined
        ? {}
        : done
          ? // Ticking an already-done job keeps its original date.
            { doneAt: existing.doneAt ?? new Date(), doneBy: existing.doneBy ?? c.get("userEmail") }
          : { doneAt: null, doneBy: null };

    const [row] = await db
      .update(jobs)
      .set({ ...fields, ...doneFields, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return c.json<{ job: Job }>({ job: toJob(row!) });
  })

  .delete("/jobs/:id", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await getDb(c.env).delete(jobs).where(eq(jobs.id, id)).returning({ id: jobs.id });
    if (!deleted.length) return c.json({ error: "Job not found" }, 404);
    return c.json({ ok: true });
  });
