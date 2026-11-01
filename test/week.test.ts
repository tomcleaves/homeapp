import { describe, expect, it } from "vitest";
import { addDays, isIsoDate, mondayOf, weekDates } from "@shared/week";

describe("week helpers", () => {
  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-11-02")).toBe("2026-11-02"); // Monday
    expect(mondayOf("2026-11-05")).toBe("2026-11-02"); // Thursday
    expect(mondayOf("2026-11-08")).toBe("2026-11-02"); // Sunday belongs to the week before
  });

  it("crosses month and year boundaries", () => {
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekDates("2026-12-28").at(-1)).toBe("2027-01-03");
  });

  it("is unaffected by the clocks changing", () => {
    // UK clocks went back on 25 Oct 2026.
    expect(weekDates("2026-10-19")).toEqual([
      "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22",
      "2026-10-23", "2026-10-24", "2026-10-25",
    ]);
  });

  it("validates dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("yesterday")).toBe(false);
  });
});
