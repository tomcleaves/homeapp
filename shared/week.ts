// Date helpers shared by the Worker and the React app.
// Dates are plain "YYYY-MM-DD" strings. All arithmetic is done in UTC so the
// result never depends on the server's or browser's timezone.

export const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;

export const SLOTS = ["lunch", "dinner"] as const;
export type Slot = (typeof SLOTS)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function parse(date: string): Date {
  return new Date(date + "T00:00:00Z");
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + n);
  return format(d);
}

/** The Monday on or before `date`. */
export function mondayOf(date: string): string {
  const dow = parse(date).getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** The seven dates (Mon..Sun) of the week starting on `monday`. */
export function weekDates(monday: string): string[] {
  return DAYS.map((_, i) => addDays(monday, i));
}

/** Today's date in the user's local timezone, as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const REPEAT_UNITS = ["week", "month", "year"] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

/**
 * `date` plus `every` weeks/months/years. Months clamp to the month's last
 * day, so 31 Jan + 1 month is 28 (or 29) Feb, not 3 March.
 */
export function addInterval(date: string, every: number, unit: RepeatUnit): string {
  if (unit === "week") return addDays(date, every * 7);
  const d = parse(date);
  const months = unit === "year" ? every * 12 : every;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return format(target);
}

export const REPEAT_PRESETS: { every: number; unit: RepeatUnit; label: string }[] = [
  { every: 1, unit: "week", label: "Every week" },
  { every: 2, unit: "week", label: "Every 2 weeks" },
  { every: 1, unit: "month", label: "Every month" },
  { every: 3, unit: "month", label: "Every 3 months" },
  { every: 6, unit: "month", label: "Every 6 months" },
  { every: 1, unit: "year", label: "Every year" },
];

/** "Every 6 months", "Every week", "Every 3 years". */
export function repeatLabel(every: number, unit: RepeatUnit): string {
  return every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`;
}

/** Today's date in the UK, for code with no browser (the Worker's MCP tools). */
export function londonToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}
