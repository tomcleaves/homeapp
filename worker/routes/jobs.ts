import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Job, JobsResponse, JobUpdateResponse } from "@shared/types";
import { addInterval } from "@shared/week";
import type { AppEnv } from "../auth";
import { getDb } from "../db/client";
import { loadJob, loadJobs } from "../db/queries";
import { jobParts, jobs } from "../db/schema";
import { doer, idParam, isoDate, pence, repeat, room, severity, webUrl } from "../validation";

const title = z.string().trim().min(1, "Give the job a name").max(200);
const notes = z.string().max(2000);

/** Fields a job can be created with, all optional except the title. */
const jobFields = {
  severity: severity.optional(),
  room: room.optional(),
  doer: doer.nullable().optional(),
  notes: notes.optional(),
  estimatePence: pence.nullable().optional(),
  dueOn: isoDate.nullable().optional(),
  repeat: repeat.nullable().optional(),
};

const jobInput = z.object({ title, ...jobFields });

const jobPatch = z
  .object({
    title: title.optional(),
    ...jobFields,
    actualPence: pence.nullable().optional(),
    done: z.boolean().optional(),
    today: isoDate.optional(),
  })
  .refine(
    (v) => Object.entries(v).some(([k, x]) => k !== "today" && x !== undefined),
    "Nothing to update",
  );

const partName = z.string().trim().min(1, "Name the part").max(200);
const partInput = z.object({ name: partName, url: z.union([webUrl, z.literal(""), z.null()]).optional() });
const partPatch = z
  .object({
    name: partName.optional(),
    url: z.union([webUrl, z.literal(""), z.null()]).optional(),
    bought: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update");

type Db = ReturnType<typeof getDb>;
type JobRow = typeof jobs.$inferSelect;

/** Splits the API's `repeat` object into the two DB columns. */
function repeatColumns(r: z.infer<typeof repeat> | null | undefined) {
  if (r === undefined) return {};
  return { repeatEvery: r?.every ?? null, repeatUnit: r?.unit ?? null };
}

/**
 * Creates the next copy of a recurring job that's just been ticked off: same
 * details, due one interval after `today`, its parts back on the shopping list.
 */
async function createNextOccurrence(db: Db, job: JobRow, today: string, userEmail: string): Promise<number> {
  const [next] = await db
    .insert(jobs)
    .values({
      title: job.title,
      severity: job.severity,
      room: job.room,
      doer: job.doer,
      notes: job.notes,
      estimatePence: job.estimatePence,
      repeatEvery: job.repeatEvery,
      repeatUnit: job.repeatUnit,
      dueOn: addInterval(today, job.repeatEvery!, job.repeatUnit!),
      createdBy: userEmail,
    })
    .returning({ id: jobs.id });
  const nextId = next!.id;

  const parts = await db.select().from(jobParts).where(eq(jobParts.jobId, job.id));
  await db.batch([
    db.update(jobs).set({ nextJobId: nextId }).where(eq(jobs.id, job.id)),
    ...parts.map((p) => db.insert(jobParts).values({ jobId: nextId, name: p.name, url: p.url })),
  ]);
  return nextId;
}

async function partOwner(db: Db, partId: number) {
  return db.select({ jobId: jobParts.jobId }).from(jobParts).where(eq(jobParts.id, partId)).get();
}

export const jobRoutes = new Hono<AppEnv>()
  // Every job with its parts, done ones included; the page filters and sorts.
  .get("/jobs", async (c) => {
    return c.json<JobsResponse>({ jobs: await loadJobs(getDb(c.env)) });
  })

  .post("/jobs", zValidator("json", jobInput), async (c) => {
    const { repeat: r, ...input } = c.req.valid("json");
    const db = getDb(c.env);
    const [row] = await db
      .insert(jobs)
      .values({ ...input, ...repeatColumns(r), createdBy: c.get("userEmail") })
      .returning({ id: jobs.id });
    return c.json<{ job: Job | null }>({ job: await loadJob(db, row!.id) }, 201);
  })

  // Change any field. `done: true` ticks it off (recording who and when) and,
  // for a recurring job, creates the next one. `done: false` puts it back on
  // the list, keeps any actual cost, and removes a next copy not yet done.
  .patch("/jobs/:id", zValidator("param", idParam), zValidator("json", jobPatch), async (c) => {
    const { id } = c.req.valid("param");
    const { done, today, repeat: r, ...fields } = c.req.valid("json");
    const db = getDb(c.env);
    const user = c.get("userEmail");

    const existing = await db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!existing) return c.json({ error: "Job not found" }, 404);

    const doneFields =
      done === undefined
        ? {}
        : done
          ? // Ticking an already-done job keeps its original date.
            { doneAt: existing.doneAt ?? new Date(), doneBy: existing.doneBy ?? user }
          : { doneAt: null, doneBy: null };

    const [row] = await db
      .update(jobs)
      .set({ ...fields, ...repeatColumns(r), ...doneFields, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();

    const response: JobUpdateResponse = { job: (await loadJob(db, id))! };

    if (done === true && row!.repeatEvery && row!.repeatUnit) {
      const live = row!.nextJobId
        ? await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, row!.nextJobId)).get()
        : undefined;
      if (!live) {
        const day = today ?? new Date().toISOString().slice(0, 10);
        const nextId = await createNextOccurrence(db, row!, day, user);
        response.created = (await loadJob(db, nextId)) ?? undefined;
      }
    } else if (done === false && existing.nextJobId) {
      // Undo a mis-tap: remove the next copy if nobody has ticked it off yet.
      const removed = await db
        .delete(jobs)
        .where(and(eq(jobs.id, existing.nextJobId), isNull(jobs.doneAt)))
        .returning({ id: jobs.id });
      await db.update(jobs).set({ nextJobId: null }).where(eq(jobs.id, id));
      if (removed.length) response.removedId = existing.nextJobId;
    }

    return c.json<JobUpdateResponse>(response);
  })

  .delete("/jobs/:id", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await getDb(c.env).delete(jobs).where(eq(jobs.id, id)).returning({ id: jobs.id });
    if (!deleted.length) return c.json({ error: "Job not found" }, 404);
    return c.json({ ok: true });
  })

  // Parts to buy. Each change returns the whole job, parts included.
  .post("/jobs/:id/parts", zValidator("param", idParam), zValidator("json", partInput), async (c) => {
    const { id } = c.req.valid("param");
    const { name, url } = c.req.valid("json");
    const db = getDb(c.env);
    const job = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, id)).get();
    if (!job) return c.json({ error: "Job not found" }, 404);
    await db.insert(jobParts).values({ jobId: id, name, url: url || null });
    return c.json<{ job: Job | null }>({ job: await loadJob(db, id) }, 201);
  })

  .patch("/parts/:id", zValidator("param", idParam), zValidator("json", partPatch), async (c) => {
    const { id } = c.req.valid("param");
    const { name, url, bought } = c.req.valid("json");
    const db = getDb(c.env);
    const owner = await partOwner(db, id);
    if (!owner) return c.json({ error: "Part not found" }, 404);
    await db
      .update(jobParts)
      .set({
        ...(name !== undefined && { name }),
        ...(url !== undefined && { url: url || null }),
        ...(bought !== undefined && { boughtAt: bought ? new Date() : null }),
      })
      .where(eq(jobParts.id, id));
    return c.json<{ job: Job | null }>({ job: await loadJob(db, owner.jobId) });
  })

  .delete("/parts/:id", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const owner = await partOwner(db, id);
    if (!owner) return c.json({ error: "Part not found" }, 404);
    await db.delete(jobParts).where(eq(jobParts.id, id));
    return c.json<{ job: Job | null }>({ job: await loadJob(db, owner.jobId) });
  });
