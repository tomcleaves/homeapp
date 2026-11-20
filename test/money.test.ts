import { describe, expect, it } from "vitest";
import { formatPence, parsePounds, penceToInput } from "@shared/money";

describe("parsePounds", () => {
  it("reads the ways people type amounts", () => {
    expect(parsePounds("12")).toBe(1200);
    expect(parsePounds("12.5")).toBe(1250);
    expect(parsePounds("£12.50")).toBe(1250);
    expect(parsePounds(" £1,200 ")).toBe(120000);
    expect(parsePounds("0")).toBe(0);
    expect(parsePounds("0.05")).toBe(5);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "abc", "-3", "12.345", "1e3", "£", "12.", "£2,000,000"]) {
      expect(parsePounds(bad), bad).toBeNull();
    }
  });
});

describe("formatPence", () => {
  it("drops pence on whole pounds", () => {
    expect(formatPence(1200)).toBe("£12");
    expect(formatPence(120000)).toBe("£1,200");
    expect(formatPence(1250)).toBe("£12.50");
    expect(formatPence(5)).toBe("£0.05");
  });

  it("round-trips through an input", () => {
    expect(penceToInput(1250)).toBe("12.50");
    expect(penceToInput(1200)).toBe("12");
    expect(penceToInput(null)).toBe("");
    expect(parsePounds(penceToInput(98765))).toBe(98765);
  });
});
