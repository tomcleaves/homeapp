import { z } from "zod";
import { dueState } from "@shared/jobs";
import { formatPence, MAX_PENCE } from "@shared/money";
import type { Job, Part, Recipe } from "@shared/types";
import { repeatLabel } from "@shared/week";

/** Keep any one tool result comfortably inside an agent's context. */
export const CHARACTER_LIMIT = 25_000;

export const responseFormat = z
  .enum(["markdown", "json"])
  .default("markdown")
  .describe("'markdown' for readable text (default), 'json' for the full structured data");

export const paging = {
  limit: z.number().int().min(1).max(100).default(25).describe("Maximum number of items to return"),
  offset: z.number().int().min(0).default(0).describe("Number of items to skip, for paging"),
};

/** Pounds in tool arguments, e.g. 12.5 for £12.50; converted to whole pence for the API. */
export const pounds = z.number().min(0).max(MAX_PENCE / 100);
export const toPence = (gbp: number) => Math.round(gbp * 100);

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
};

export const text = (value: string): ToolResult => ({ content: [{ type: "text", text: value }] });

/** JSON mode: the data as structuredContent plus the same data as text, per the MCP spec. */
export const json = (value: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
});

export const reply = (format: "markdown" | "json", markdown: string, data: Record<string, unknown>) =>
  format === "json" ? json(data) : text(markdown);

/**
 * One page of `items`, rendered in `format`. Stays under CHARACTER_LIMIT by
 * returning fewer items (never by cutting text), so next_offset stays correct.
 */
export function page<T>(
  all: T[],
  { limit, offset, format }: { limit: number; offset: number; format: "markdown" | "json" },
  render: { key: string; heading: string; empty: string; item: (x: T) => string; data: (x: T) => unknown },
): ToolResult {
  const build = (items: T[]) => {
    const next = offset + items.length;
    const hasMore = all.length > next;
    const data = {
      total: all.length,
      count: items.length,
      offset,
      has_more: hasMore,
      ...(hasMore ? { next_offset: next } : {}),
      [render.key]: items.map(render.data),
    };
    if (format === "json") return json(data);
    if (!all.length) return text(render.empty);
    const lines = [`# ${render.heading}`, `Showing ${items.length} of ${all.length}.`, "", ...items.map(render.item)];
    if (hasMore) lines.push("", `More: call again with offset=${next}.`);
    return text(lines.join("\n"));
  };

  let items = all.slice(offset, offset + limit);
  let result = build(items);
  while (items.length > 1 && result.content[0]!.text.length > CHARACTER_LIMIT) {
    items = items.slice(0, Math.ceil(items.length / 2));
    result = build(items);
  }
  return result;
}

// ---- Recipes ----

export function recipeMarkdown(r: Recipe): string {
  const last = r.uses[0];
  const used = r.uses.length
    ? `planned ${r.uses.length}× (last ${last!.date} ${last!.slot}${last!.title && last!.title !== r.displayName ? `, as "${last!.title}"` : ""})`
    : "not planned yet";
  return `- **${r.displayName}** (recipe_id ${r.id}) — ${r.url} — ${used}`;
}

// ---- Jobs ----

const DUE_TEXT = { overdue: "OVERDUE", "due-soon": "due soon", upcoming: "coming up", none: "" } as const;

function partMarkdown(p: Part): string {
  return `  - [${p.boughtAt ? "x" : " "}] ${p.name} (part_id ${p.id})${p.url ? ` — ${p.url}` : ""}`;
}

export function jobMarkdown(job: Job, today: string): string {
  const facts = [
    `${job.severity} priority`,
    job.room,
    job.doer === "diy" ? "DIY" : job.doer === "trade" ? "tradesperson" : "doer not decided",
    job.dueOn && `due ${job.dueOn}${job.doneAt ? "" : DUE_TEXT[dueState(job, today)] ? ` (${DUE_TEXT[dueState(job, today)]})` : ""}`,
    job.repeat && repeatLabel(job.repeat.every, job.repeat.unit).toLowerCase(),
    job.estimatePence !== null && `estimate ${formatPence(job.estimatePence)}`,
    job.actualPence !== null && `cost ${formatPence(job.actualPence)}`,
    job.doneAt && `done ${new Date(job.doneAt).toISOString().slice(0, 10)}${job.doneBy ? ` by ${job.doneBy}` : ""}`,
  ].filter(Boolean);
  const lines = [`- ${job.doneAt ? "~~" : ""}**${job.title}**${job.doneAt ? "~~" : ""} (job_id ${job.id}) — ${facts.join(", ")}`];
  if (job.notes.trim()) lines.push(`  Notes: ${job.notes.trim().replace(/\s*\n\s*/g, " / ")}`);
  lines.push(...job.parts.map(partMarkdown));
  return lines.join("\n");
}

/** A job for JSON output: the API's shape plus pounds and its due state, for convenience. */
export function jobData(job: Job, today: string) {
  return {
    ...job,
    estimate: job.estimatePence === null ? null : formatPence(job.estimatePence),
    actual: job.actualPence === null ? null : formatPence(job.actualPence),
    due_state: job.doneAt ? null : dueState(job, today),
  };
}
