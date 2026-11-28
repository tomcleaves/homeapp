import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { Bindings } from "../worker/auth";
import app from "../worker/index";
import { call, DEV_EMAIL } from "./helpers";

type ToolResult = {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

let nextId = 1;

/** Sends one JSON-RPC request to /mcp as the local dev user and returns the result (SSE or JSON). */
async function rpc(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const res = await call("/mcp", {
    method: "POST",
    headers: { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  const body = await res.text();
  const json = res.headers.get("content-type")?.includes("text/event-stream")
    ? body.split("\n").find((l) => l.startsWith("data: "))!.slice(6)
    : body;
  return { status: res.status, message: JSON.parse(json) as { result?: unknown; error?: { message: string } } };
}

async function tool(name: string, args: Record<string, unknown> = {}) {
  const { message } = await rpc("tools/call", { name, arguments: args });
  expect(message.error).toBeUndefined();
  return message.result as ToolResult;
}

/** Calls a tool in JSON mode and returns its structured data. */
async function data<T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}) {
  const result = await tool(name, { ...args, response_format: "json" });
  expect(result.isError, result.content[0]?.text).toBeFalsy();
  return result.structuredContent as T;
}

type JobData = {
  id: number;
  title: string;
  doneAt: number | null;
  doneBy: string | null;
  estimatePence: number | null;
  actualPence: number | null;
  dueOn: string | null;
  parts: { id: number; name: string; boughtAt: number | null }[];
};

describe("MCP endpoint", () => {
  it("needs a signed-in user", async () => {
    const res = await app.request(
      "https://meals.example.com/mcp",
      { method: "POST", body: "{}" },
      { ...env, ACCESS_TEAM_DOMAIN: "homeapp.cloudflareaccess.com", ACCESS_AUD: "aud" } as Bindings,
    );
    expect(res.status).toBe(401);
  });

  it("refuses requests from other sites' pages", async () => {
    const { status } = await rpc("tools/list", {}, { origin: "https://evil.example.com" });
    expect(status).toBe(403);
  });

  it("lists the recipe and job tools", async () => {
    const { message } = await rpc("tools/list");
    const names = (message.result as { tools: { name: string }[] }).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "homeapp_add_part",
      "homeapp_add_recipe",
      "homeapp_create_job",
      "homeapp_delete_job",
      "homeapp_delete_part",
      "homeapp_delete_recipe",
      "homeapp_get_job",
      "homeapp_list_jobs",
      "homeapp_list_recipes",
      "homeapp_shopping_list",
      "homeapp_update_job",
      "homeapp_update_part",
      "homeapp_update_recipe",
    ]);
  });

  it("serves 2026-07-28 clients too", async () => {
    const { message } = await rpc(
      "tools/list",
      {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
      { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" },
    );
    expect(message.error).toBeUndefined();
    expect((message.result as { tools: unknown[] }).tools.length).toBe(13);
  });
});

describe("MCP recipe tools", () => {
  it("adds, finds, renames and deletes a recipe", async () => {
    const { recipe } = await data<{ recipe: { id: number; url: string } }>("homeapp_add_recipe", {
      url: "https://Example.com/mcp-crème-brûlée?utm_source=x",
      title: "Mcp crème brûlée",
    });
    expect(recipe.url).toBe("https://example.com/mcp-cr%C3%A8me-br%C3%BBl%C3%A9e");

    // Adding the same link again returns the same entry.
    const again = await data<{ recipe: { id: number } }>("homeapp_add_recipe", { url: recipe.url });
    expect(again.recipe.id).toBe(recipe.id);

    const found = await data<{ recipes: { id: number }[] }>("homeapp_list_recipes", { query: "creme brulee mcp" });
    expect(found.recipes.map((r) => r.id)).toEqual([recipe.id]);

    const renamed = await tool("homeapp_update_recipe", { recipe_id: recipe.id, title: "Mcp brûlée, renamed" });
    expect(renamed.content[0]!.text).toContain("**Mcp brûlée, renamed**");

    await tool("homeapp_delete_recipe", { recipe_id: recipe.id });
    const gone = await tool("homeapp_update_recipe", { recipe_id: recipe.id, title: "x" });
    expect(gone.isError).toBe(true);
    expect(gone.content[0]!.text).toMatch(/not found.*homeapp_list_recipes/i);
  });

  it("explains a bad link instead of failing silently", async () => {
    const result = await tool("homeapp_add_recipe", { url: "not a link" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("http(s) link");
  });
});

describe("MCP house job tools", () => {
  it("creates a job with parts, in pounds", async () => {
    const { job } = await data<{ job: JobData & { estimate: string } }>("homeapp_create_job", {
      title: "Mcp fix gutter",
      room: "Outside",
      severity: "high",
      doer: "trade",
      estimate_gbp: 120.5,
      parts: [{ name: "Gutter bracket" }, { name: "Sealant", url: "https://shop.example.com/sealant" }],
    });
    expect(job).toMatchObject({ estimatePence: 12050, estimate: "£120.50" });
    expect(job.parts.map((p) => p.name)).toEqual(["Gutter bracket", "Sealant"]);

    const md = await tool("homeapp_get_job", { job_id: job.id });
    expect(md.content[0]!.text).toContain("**Mcp fix gutter**");
    expect(md.content[0]!.text).toContain("estimate £120.50");
  });

  it("filters the list and shows the shopping list", async () => {
    const { job } = await data<{ job: JobData }>("homeapp_create_job", {
      title: "Mcp shopping job",
      room: "Loft",
      parts: [{ name: "Mcp insulation roll" }],
    });

    const loft = await data<{ jobs: JobData[] }>("homeapp_list_jobs", { room: "loft" });
    expect(loft.jobs.map((j) => j.id)).toEqual([job.id]);

    const list = await tool("homeapp_shopping_list");
    expect(list.content[0]!.text).toContain("Mcp insulation roll");

    await tool("homeapp_update_part", { part_id: job.parts[0]!.id, bought: true });
    const after = await tool("homeapp_shopping_list");
    expect(after.content[0]!.text).not.toContain("Mcp insulation roll");
  });

  it("ticks off a recurring job, creating the next one, and un-ticks it", async () => {
    const { job } = await data<{ job: JobData }>("homeapp_create_job", {
      title: "Mcp bleed radiators",
      repeat: { every: 1, unit: "year" },
      parts: [{ name: "Radiator key" }],
    });

    const done = await data<{ job: JobData; created: JobData }>("homeapp_update_job", {
      job_id: job.id,
      done: true,
      actual_gbp: 3,
    });
    expect(done.job).toMatchObject({ actualPence: 300, doneBy: DEV_EMAIL });
    expect(done.job.doneAt).not.toBeNull();
    expect(done.created.title).toBe("Mcp bleed radiators");
    expect(done.created.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(done.created.parts.map((p) => p.boughtAt)).toEqual([null]);

    const undone = await data<{ job: JobData; removed_id: number }>("homeapp_update_job", {
      job_id: job.id,
      done: false,
    });
    expect(undone.job.doneAt).toBeNull();
    expect(undone.removed_id).toBe(done.created.id);

    await tool("homeapp_delete_job", { job_id: job.id });
    const gone = await tool("homeapp_get_job", { job_id: job.id });
    expect(gone.content[0]!.text).toContain(`No job with id ${job.id}`);
  });

  it("rejects bad arguments before they reach the app", async () => {
    const result = await tool("homeapp_create_job", { title: "x", severity: "urgent" });
    expect(result.isError).toBe(true);
  });
});
