// Job helpers shared by the React app and the Worker's MCP tools.
import type { Job, Severity } from "./types";
import { fold } from "./search";
import { addDays } from "./week";

export const SEVERITY_RANK: Record<Severity, number> = { high: 3, med: 2, low: 1 };

const newest = (a: Job, b: Job) => b.createdAt - a.createdAt || b.id - a.id;

/** Soonest due first; jobs with no due date last. */
const byDue = (a: Job, b: Job) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999");

export type JobSort = "urgent" | "newest" | "expensive";

export const jobSorters: Record<JobSort, (a: Job, b: Job) => number> = {
  urgent: (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || byDue(a, b) || newest(a, b),
  newest,
  expensive: (a, b) => (b.estimatePence ?? -1) - (a.estimatePence ?? -1) || newest(a, b),
};

/** True when every word of `query` appears in the job's title, room or notes. */
export function jobMatches(job: Job, query: string): boolean {
  const haystack = fold([job.title, job.room ?? "", job.notes].join(" "));
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** How many days before its due date a job joins the to-do list. */
export const DUE_SOON_DAYS = 7;

export type DueState = "overdue" | "due-soon" | "upcoming" | "none";

/**
 * Where an open job sits: overdue, due within a week (both on the to-do list),
 * further off ("Coming up"), or with no due date.
 */
export function dueState(job: Job, today: string): DueState {
  if (!job.dueOn) return "none";
  if (job.dueOn < today) return "overdue";
  if (job.dueOn <= addDays(today, DUE_SOON_DAYS)) return "due-soon";
  return "upcoming";
}
