import type { Doer, Job, Severity } from "@shared/types";
import { fold } from "./search";

export const SEVERITIES: { value: Severity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "med", label: "Med" },
  { value: "high", label: "High" },
];

export const SEVERITY_LABEL: Record<Severity, string> = { low: "Low", med: "Med", high: "High" };
const SEVERITY_RANK: Record<Severity, number> = { high: 3, med: 2, low: 1 };

export const DOER_OPTIONS: { value: Doer | "none"; label: string }[] = [
  { value: "diy", label: "DIY" },
  { value: "trade", label: "Tradesperson" },
  { value: "none", label: "Not sure" },
];

export const DOER_LABEL: Record<Doer, string> = { diy: "DIY", trade: "Tradesperson" };

export type JobSort = "urgent" | "newest" | "expensive";

export const JOB_SORTS: { value: JobSort; label: string }[] = [
  { value: "urgent", label: "Most urgent" },
  { value: "newest", label: "Newest" },
  { value: "expensive", label: "Most expensive" },
];

const newest = (a: Job, b: Job) => b.createdAt - a.createdAt || b.id - a.id;

export const jobSorters: Record<JobSort, (a: Job, b: Job) => number> = {
  urgent: (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || newest(a, b),
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

/** Distinct rooms already used, for suggestions and the room filter. */
export function roomsOf(jobs: Job[]): string[] {
  const byKey = new Map<string, string>();
  for (const j of jobs) if (j.room) byKey.set(fold(j.room), byKey.get(fold(j.room)) ?? j.room);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export const ROOMS_DATALIST_ID = "job-rooms";
