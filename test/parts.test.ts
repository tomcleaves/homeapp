import { describe, expect, it } from "vitest";
import type { Job } from "@shared/types";
import { del, patch, post } from "./helpers";

async function newJob(title: string) {
  return ((await (await post("/api/jobs", { title })).json()) as { job: Job }).job;
}

async function addPart(jobId: number, body: Record<string, unknown>) {
  const res = await post(`/api/jobs/${jobId}/parts`, body);
  expect(res.status).toBe(201);
  return ((await res.json()) as { job: Job }).job;
}

describe("parts to buy", () => {
  it("adds parts to a job, with or without a link", async () => {
    const job = await newJob("Fix wobbly shelf");
    await addPart(job.id, { name: "Wall plugs", url: "https://www.diy.com/plugs?utm_source=x#reviews" });
    const after = await addPart(job.id, { name: "  4 × 50mm screws " });
    expect(after.parts).toEqual([
      { id: expect.any(Number), name: "Wall plugs", url: "https://www.diy.com/plugs", boughtAt: null },
      { id: expect.any(Number), name: "4 × 50mm screws", url: null, boughtAt: null },
    ]);
  });

  it("renames, re-links, ticks bought and un-ticks", async () => {
    const job = await addPart((await newJob("Replace tap washer")).id, { name: "Washer" });
    const id = job.parts[0]!.id;

    const renamed = ((await (await patch(`/api/parts/${id}`, { name: "15mm washer", url: "https://example.com/w" })).json()) as { job: Job }).job;
    expect(renamed.parts[0]).toMatchObject({ name: "15mm washer", url: "https://example.com/w" });

    const bought = ((await (await patch(`/api/parts/${id}`, { bought: true })).json()) as { job: Job }).job;
    expect(bought.parts[0]!.boughtAt).toEqual(expect.any(Number));

    const unbought = ((await (await patch(`/api/parts/${id}`, { bought: false, url: "" })).json()) as { job: Job }).job;
    expect(unbought.parts[0]).toMatchObject({ boughtAt: null, url: null });
  });

  it("deletes a part, and a job's parts go with it", async () => {
    const job = await newJob("Hang curtains");
    const withParts = await addPart(job.id, { name: "Curtain pole" });
    await addPart(job.id, { name: "Brackets" });

    const res = await del(`/api/parts/${withParts.parts[0]!.id}`);
    expect(((await res.json()) as { job: Job }).job.parts.map((p) => p.name)).toEqual(["Brackets"]);

    const remaining = (await addPart(job.id, { name: "Rings" })).parts;
    await del(`/api/jobs/${job.id}`);
    for (const p of remaining) {
      expect((await patch(`/api/parts/${p.id}`, { bought: true })).status).toBe(404);
    }
  });

  it("validates input", async () => {
    const job = await newJob("Valid job");
    expect((await post(`/api/jobs/${job.id}/parts`, { name: "  " })).status).toBe(400);
    expect((await post(`/api/jobs/${job.id}/parts`, { name: "x", url: "javascript:alert(1)" })).status).toBe(400);
    expect((await post(`/api/jobs/999999/parts`, { name: "x" })).status).toBe(404);
    expect((await patch(`/api/parts/999999`, { bought: true })).status).toBe(404);
    expect((await del(`/api/parts/999999`)).status).toBe(404);
    const part = (await addPart(job.id, { name: "x" })).parts[0]!;
    expect((await patch(`/api/parts/${part.id}`, {})).status).toBe(400);
  });
});
