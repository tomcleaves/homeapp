import type { Doer, Job, Repeat, Severity } from "@shared/types";
import { addDays, REPEAT_PRESETS, repeatLabel, type RepeatUnit } from "@shared/week";
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

/** Soonest due first; jobs with no due date last. */
const byDue = (a: Job, b: Job) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999");

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

/** Distinct rooms already used, for suggestions and the room filter. */
export function roomsOf(jobs: Job[]): string[] {
  const byKey = new Map<string, string>();
  for (const j of jobs) if (j.room) byKey.set(fold(j.room), byKey.get(fold(j.room)) ?? j.room);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export const ROOMS_DATALIST_ID = "job-rooms";

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

/** Options for the "Repeats" select; the value encodes the interval. */
export const REPEAT_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "Doesn’t repeat" },
  ...REPEAT_PRESETS.map((p) => ({ value: `${p.every}-${p.unit}`, label: p.label })),
];

export function repeatToValue(repeat: Repeat | null): string {
  return repeat ? `${repeat.every}-${repeat.unit}` : "none";
}

export function valueToRepeat(value: string): Repeat | null {
  const [every, unit] = value.split("-");
  return value === "none" || !every || !unit ? null : { every: Number(every), unit: unit as RepeatUnit };
}

/** Repeat options, plus the job's own interval if it isn't one of the presets. */
export function repeatOptionsFor(repeat: Repeat | null) {
  const value = repeatToValue(repeat);
  return REPEAT_OPTIONS.some((o) => o.value === value) || !repeat
    ? REPEAT_OPTIONS
    : [...REPEAT_OPTIONS, { value, label: repeatLabel(repeat.every, repeat.unit) }];
}
