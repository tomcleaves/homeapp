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
