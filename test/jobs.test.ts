import { describe, expect, it } from "vitest";
import type { Job, JobsResponse } from "@shared/types";
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
