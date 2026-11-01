import { describe, expect, it } from "vitest";
import type { Meal, WeekResponse } from "@shared/types";
import { call, DEV_EMAIL, put } from "./helpers";

async function week(date: string) {
  const res = await call(`/api/weeks/${date}`);
  expect(res.status).toBe(200);
  return (await res.json()) as WeekResponse;
}

describe("meals API", () => {
  it("saves a meal and returns it in its week", async () => {
    const res = await put("/api/meals/2026-11-04/dinner", { title: "Chicken traybake" });
    expect(res.status).toBe(200);
    const { meal } = (await res.json()) as { meal: Meal };
    expect(meal).toMatchObject({ date: "2026-11-04", slot: "dinner", title: "Chicken traybake" });
    expect(meal.updatedBy).toBe(DEV_EMAIL);

    // Any date in the week returns the whole week, starting Monday.
    const w = await week("2026-11-07");
    expect(w.weekStart).toBe("2026-11-02");
    expect(w.meals.map((m) => m.title)).toContain("Chicken traybake");
  });

  it("keeps the link when only the title changes, and vice versa", async () => {
    await put("/api/meals/2026-11-10/dinner", {
      title: "Ragu",
      recipeUrl: "https://www.bbcgoodfood.com/recipes/ragu",
    });
    const res = await put("/api/meals/2026-11-10/dinner", { title: "Slow ragu" });
    const { meal } = (await res.json()) as { meal: Meal };
    expect(meal.title).toBe("Slow ragu");
    expect(meal.recipeUrl).toBe("https://www.bbcgoodfood.com/recipes/ragu");

    const res2 = await put("/api/meals/2026-11-10/dinner", { recipeUrl: null });
    expect(((await res2.json()) as { meal: Meal }).meal.title).toBe("Slow ragu");
  });

  it("deletes a slot once it has no title and no link", async () => {
    await put("/api/meals/2026-11-17/lunch", { title: "Soup" });
    const res = await put("/api/meals/2026-11-17/lunch", { title: "   " });
    expect(await res.json()).toEqual({ meal: null });
    expect((await week("2026-11-17")).meals).toHaveLength(0);
  });

  it("only accepts http(s) recipe links", async () => {
    const bad = await put("/api/meals/2026-11-18/lunch", { recipeUrl: "javascript:alert(1)" });
    expect(bad.status).toBe(400);
    const notUrl = await put("/api/meals/2026-11-18/lunch", { recipeUrl: "not a link" });
    expect(notUrl.status).toBe(400);
  });

  it("rejects bad dates, slots and empty updates", async () => {
    expect((await put("/api/meals/2026-02-30/lunch", { title: "x" })).status).toBe(400);
    expect((await put("/api/meals/2026-11-18/breakfast", { title: "x" })).status).toBe(400);
    expect((await put("/api/meals/2026-11-18/lunch", {})).status).toBe(400);
    expect((await call("/api/weeks/next-week")).status).toBe(400);
  });

  it("sends dinner leftovers to the next day's lunch, across a week boundary", async () => {
    await put("/api/meals/2026-11-29/dinner", { title: "Roast chicken" }); // Sunday
    await put("/api/meals/2026-11-30/lunch", { title: "Salad" }); // Monday

    const res = await call("/api/meals/2026-11-29/dinner/leftovers", { method: "POST" });
    expect(res.status).toBe(200);
    const { meal } = (await res.json()) as { meal: Meal };
    expect(meal).toMatchObject({ date: "2026-11-30", slot: "lunch", title: "Salad\nLeftovers: Roast chicken" });
  });

  it("refuses leftovers from an empty dinner", async () => {
    const res = await call("/api/meals/2026-12-08/dinner/leftovers", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("returns JSON 404 for unknown API paths", async () => {
    const res = await call("/api/nope");
    expect(res.status).toBe(404);
  });
});
