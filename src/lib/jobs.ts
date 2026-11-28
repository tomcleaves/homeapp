import type { JobSort } from "@shared/jobs";
import type { Doer, Job, Repeat, Severity } from "@shared/types";
import { REPEAT_PRESETS, repeatLabel, type RepeatUnit } from "@shared/week";
import { fold } from "@shared/search";

export { DUE_SOON_DAYS, dueState, jobMatches, jobSorters, type DueState, type JobSort } from "@shared/jobs";

export const SEVERITIES: { value: Severity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "med", label: "Med" },
  { value: "high", label: "High" },
];

export const SEVERITY_LABEL: Record<Severity, string> = { low: "Low", med: "Med", high: "High" };

export const DOER_OPTIONS: { value: Doer | "none"; label: string }[] = [
  { value: "diy", label: "DIY" },
  { value: "trade", label: "Tradesperson" },
  { value: "none", label: "Not sure" },
];

export const DOER_LABEL: Record<Doer, string> = { diy: "DIY", trade: "Tradesperson" };

export const JOB_SORTS: { value: JobSort; label: string }[] = [
  { value: "urgent", label: "Most urgent" },
  { value: "newest", label: "Newest" },
  { value: "expensive", label: "Most expensive" },
];

/** Distinct rooms already used, for suggestions and the room filter. */
export function roomsOf(jobs: Job[]): string[] {
  const byKey = new Map<string, string>();
  for (const j of jobs) if (j.room) byKey.set(fold(j.room), byKey.get(fold(j.room)) ?? j.room);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export const ROOMS_DATALIST_ID = "job-rooms";

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
