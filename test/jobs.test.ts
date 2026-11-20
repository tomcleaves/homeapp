import { describe, expect, it } from "vitest";
import type { Job, JobsResponse, JobUpdateResponse } from "@shared/types";
import { call, del, DEV_EMAIL, patch, post } from "./helpers";

async function create(body: Record<string, unknown>) {
  const res = await post("/api/jobs", body);
  expect(res.status).toBe(201);
  return ((await res.json()) as { job: Job }).job;
}

async function update(id: number, body: Record<string, unknown>) {
  const res = await patch(`/api/jobs/${id}`, body);
  expect(res.status).toBe(200);
  return ((await res.json()) as { job: Job }).job;
}

describe("house jobs API", () => {
  it("creates a job with sensible defaults", async () => {
    const job = await create({ title: "  Fix dripping tap " });
    expect(job).toMatchObject({
      title: "Fix dripping tap",
      severity: "med",
      room: null,
      doer: null,
      notes: "",
      estimatePence: null,
      actualPence: null,
      doneAt: null,
      createdBy: DEV_EMAIL,
    });

    const list = (await (await call("/api/jobs")).json()) as JobsResponse;
    expect(list.jobs.map((j) => j.id)).toContain(job.id);
  });

  it("stores every detail, tidying the room name", async () => {
    const job = await create({
      title: "Regrout shower",
      severity: "high",
      room: "  Main   bathroom ",
      doer: "trade",
      notes: "Ask about the extractor fan too",
      estimatePence: 25000,
    });
    expect(job).toMatchObject({
      severity: "high",
      room: "Main bathroom",
      doer: "trade",
      notes: "Ask about the extractor fan too",
      estimatePence: 25000,
    });
  });

  it("updates only the fields sent", async () => {
    const job = await create({ title: "Paint fence", severity: "low", room: "Garden", estimatePence: 4000 });
    const updated = await update(job.id, { severity: "high", room: "" });
    expect(updated).toMatchObject({ title: "Paint fence", severity: "high", room: null, estimatePence: 4000 });
    expect(updated.updatedAt).toBeGreaterThanOrEqual(job.updatedAt);
  });

  it("ticks a job off and back on, keeping the actual cost", async () => {
    const job = await create({ title: "Bleed radiators", estimatePence: 0 });

    const done = await update(job.id, { done: true, actualPence: 799 });
    expect(done.doneAt).toEqual(expect.any(Number));
    expect(done.doneBy).toBe(DEV_EMAIL);
    expect(done.actualPence).toBe(799);

    // Ticking again doesn't move the date it was done.
    const again = await update(job.id, { done: true });
    expect(again.doneAt).toBe(done.doneAt);

    const undone = await update(job.id, { done: false });
    expect(undone).toMatchObject({ doneAt: null, doneBy: null, actualPence: 799 });
  });

  it("deletes a job", async () => {
    const job = await create({ title: "Hang mirror" });
    expect((await del(`/api/jobs/${job.id}`)).status).toBe(200);
    expect((await del(`/api/jobs/${job.id}`)).status).toBe(404);
    expect((await patch(`/api/jobs/${job.id}`, { title: "x" })).status).toBe(404);
  });

  it("validates input", async () => {
    const bad = [
      {},
      { title: "   " },
      { title: "x".repeat(201) },
      { title: "x", severity: "urgent" },
      { title: "x", doer: "plumber" },
      { title: "x", estimatePence: -100 },
      { title: "x", estimatePence: 12.5 },
      { title: "x", notes: "n".repeat(2001) },
    ];
    for (const body of bad) {
      expect((await post("/api/jobs", body)).status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    const job = await create({ title: "Valid" });
    expect((await patch(`/api/jobs/${job.id}`, {})).status).toBe(400);
    expect((await patch(`/api/jobs/${job.id}`, { actualPence: -1 })).status).toBe(400);
    expect((await patch("/api/jobs/abc", { title: "x" })).status).toBe(400);
  });
});

describe("recurring jobs", () => {
  async function tick(id: number, body: Record<string, unknown>) {
    const res = await patch(`/api/jobs/${id}`, body);
    expect(res.status).toBe(200);
    return (await res.json()) as JobUpdateResponse;
  }

  async function allJobs() {
    return ((await (await call("/api/jobs")).json()) as JobsResponse).jobs;
  }

  it("ticking off creates the next one, due one interval later, parts unbought", async () => {
    const job = await create({
      title: "Bleed radiators",
      severity: "low",
      room: "Whole house",
      doer: "diy",
      notes: "Key is in the kitchen drawer",
      estimatePence: 0,
      repeat: { every: 6, unit: "month" },
    });
    expect(job.repeat).toEqual({ every: 6, unit: "month" });
    const part = (await (await post(`/api/jobs/${job.id}/parts`, { name: "Radiator key" })).json()) as { job: Job };
    await patch(`/api/parts/${part.job.parts[0]!.id}`, { bought: true });

    const res = await tick(job.id, { done: true, today: "2026-11-20", actualPence: 0 });
    expect(res.job.doneAt).toEqual(expect.any(Number));
    expect(res.created).toMatchObject({
      title: "Bleed radiators",
      severity: "low",
      room: "Whole house",
      doer: "diy",
      notes: "Key is in the kitchen drawer",
      estimatePence: 0,
      actualPence: null,
      doneAt: null,
      dueOn: "2027-05-20",
      repeat: { every: 6, unit: "month" },
    });
    expect(res.created!.parts).toEqual([
      { id: expect.any(Number), name: "Radiator key", url: null, boughtAt: null },
    ]);
  });

  it("doesn't create a second copy when ticked again", async () => {
    const job = await create({ title: "Descale kettle", repeat: { every: 1, unit: "month" } });
    const first = await tick(job.id, { done: true, today: "2026-11-20" });
    const again = await tick(job.id, { done: true, today: "2026-11-21" });
    expect(first.created).toBeDefined();
    expect(again.created).toBeUndefined();
    expect((await allJobs()).filter((j) => j.title === "Descale kettle")).toHaveLength(2);
  });

  it("un-ticking removes the untouched next copy", async () => {
    const job = await create({ title: "Clean gutters", repeat: { every: 1, unit: "year" } });
    const { created } = await tick(job.id, { done: true, today: "2026-11-20" });
    const undo = await tick(job.id, { done: false });
    expect(undo.removedId).toBe(created!.id);
    expect((await allJobs()).some((j) => j.id === created!.id)).toBe(false);

    // Ticking again after the undo creates a fresh copy.
    const redo = await tick(job.id, { done: true, today: "2026-11-22" });
    expect(redo.created?.dueOn).toBe("2027-11-22");
  });

  it("un-ticking keeps a next copy that's already been done", async () => {
    const job = await create({ title: "Test smoke alarms", repeat: { every: 1, unit: "week" } });
    const { created } = await tick(job.id, { done: true, today: "2026-11-20" });
    await tick(created!.id, { done: true, today: "2026-11-27" });
    const undo = await tick(job.id, { done: false });
    expect(undo.removedId).toBeUndefined();
    expect((await allJobs()).some((j) => j.id === created!.id)).toBe(true);
  });

  it("one-off jobs create nothing, and repeat can be switched off", async () => {
    const job = await create({ title: "Fix gate latch", dueOn: "2026-12-01" });
    expect(job.dueOn).toBe("2026-12-01");
    expect((await tick(job.id, { done: true })).created).toBeUndefined();

    const rec = await create({ title: "Change filter", repeat: { every: 3, unit: "month" } });
    const off = await tick(rec.id, { repeat: null });
    expect(off.job.repeat).toBeNull();
    expect((await tick(rec.id, { done: true })).created).toBeUndefined();
  });

  it("validates repeat and due date", async () => {
    for (const body of [
      { title: "x", repeat: { every: 2 } },
      { title: "x", repeat: { every: 0, unit: "week" } },
      { title: "x", repeat: { every: 1, unit: "day" } },
      { title: "x", dueOn: "2026-02-30" },
      { title: "x", dueOn: "tomorrow" },
    ]) {
      expect((await post("/api/jobs", body)).status, JSON.stringify(body)).toBe(400);
    }
    const job = await create({ title: "y" });
    expect((await patch(`/api/jobs/${job.id}`, { today: "2026-11-20" })).status).toBe(400);
  });
});
