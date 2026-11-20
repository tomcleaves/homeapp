// Money is stored and sent as whole pence (integers), never floating-point pounds.

export const MAX_PENCE = 100_000_000; // £1,000,000

/**
 * Pence from what someone typed: "£12.50", "12.5", "1,200", "12".
 * Returns null for anything that isn't a non-negative amount with at most 2 decimal places.
 */
export function parsePounds(input: string): number | null {
  const cleaned = input.trim().replace(/^£/, "").replace(/,/g, "").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const pence = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return pence <= MAX_PENCE ? pence : null;
}

const whole = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 });

/** "£12" for whole pounds, "£12.50" otherwise. */
export function formatPence(pence: number): string {
  return pence % 100 === 0 ? whole.format(pence / 100) : exact.format(pence / 100);
}

/** For pre-filling an input: "12" or "12.50", no symbol or separators. */
export function penceToInput(pence: number | null): string {
  if (pence === null) return "";
  return pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2);
}
