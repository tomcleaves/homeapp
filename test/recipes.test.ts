import { describe, expect, it } from "vitest";
import type { Meal, Recipe, RecipesResponse } from "@shared/types";
import { normaliseRecipeUrl } from "@shared/recipes";
import { call, put } from "./helpers";

async function library() {
  const res = await call("/api/recipes");
  expect(res.status).toBe(200);
  return ((await res.json()) as RecipesResponse).recipes;
}

async function byUrl(url: string) {
  return (await library()).find((r) => r.url === url);
}

function post(path: string, body: unknown) {
  return call(path, { method: "POST", body: JSON.stringify(body) });
}

function patch(path: string, body: unknown) {
  return call(path, { method: "PATCH", body: JSON.stringify(body) });
}

describe("normaliseRecipeUrl", () => {
  it("drops tracking parameters and anchors but keeps real query strings", () => {
    expect(
      normaliseRecipeUrl(" https://WWW.Example.com/r/pie?utm_source=ig&id=4&fbclid=x#method "),
    ).toBe("https://www.example.com/r/pie?id=4");
  });

  it("rejects non-web links", () => {
    expect(normaliseRecipeUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseRecipeUrl("not a link")).toBeNull();
  });
});

describe("recipe library", () => {
  it("adds a recipe when a meal gets a link, and lists every use newest first", async () => {
    const url = "https://www.bbcgoodfood.com/recipes/chilli";
    await put("/api/meals/2026-12-01/dinner", { title: "Chilli", recipeUrl: url });
    await put("/api/meals/2026-12-15/dinner", { title: "Chilli again", recipeUrl: url + "?utm_source=x" });

    const recipe = await byUrl(url);
    expect(recipe).toBeDefined();
    expect(recipe!.uses.map((u) => u.date)).toEqual(["2026-12-15", "2026-12-01"]);
    expect(recipe!.displayName).toBe("Chilli again"); // no title yet: newest meal's name
    expect(recipe!.host).toBe("bbcgoodfood.com");
  });

  it("attaches an existing library recipe to a meal by id", async () => {
    const res = await post("/api/recipes", { url: "https://example.com/dal", title: "Tarka dal" });
    expect(res.status).toBe(201);
    const { recipe } = (await res.json()) as { recipe: Recipe };

    const put1 = await put("/api/meals/2026-12-03/dinner", { title: "Dal night", recipeId: recipe.id });
    const { meal } = (await put1.json()) as { meal: Meal };
    expect(meal.recipe).toEqual({ id: recipe.id, url: "https://example.com/dal", title: "Tarka dal" });

    expect((await put("/api/meals/2026-12-03/lunch", { recipeId: 999999 })).status).toBe(404);
  });

  it("keeps recipes that aren't on any meal", async () => {
    await put("/api/meals/2026-12-05/dinner", { title: "Pie", recipeUrl: "https://example.com/pie" });
    await put("/api/meals/2026-12-05/dinner", { recipeUrl: null });
    const recipe = await byUrl("https://example.com/pie");
    expect(recipe?.uses).toEqual([]);
    expect(recipe?.displayName).toBe("example.com");
  });

  it("returns the existing entry when the same link is added again", async () => {
    const a = (await (await post("/api/recipes", { url: "https://example.com/soup" })).json()) as { recipe: Recipe };
    const b = (await (await post("/api/recipes", { url: "https://example.com/soup#tips", title: "Soup" })).json()) as {
      recipe: Recipe;
    };
    expect(b.recipe.id).toBe(a.recipe.id);
    expect(b.recipe.title).toBe("Soup"); // fills in a missing name

    const c = (await (await post("/api/recipes", { url: "https://example.com/soup", title: "Other" })).json()) as {
      recipe: Recipe;
    };
    expect(c.recipe.title).toBe("Soup"); // but never overwrites one
  });

  it("renames a recipe and corrects its link", async () => {
    const { recipe } = (await (await post("/api/recipes", { url: "https://example.com/curry" })).json()) as {
      recipe: Recipe;
    };
    const res = await patch(`/api/recipes/${recipe.id}`, { title: "  Green curry  " });
    expect(((await res.json()) as { recipe: Recipe }).recipe.displayName).toBe("Green curry");

    const moved = await patch(`/api/recipes/${recipe.id}`, { url: "https://example.com/green-curry" });
    expect(((await moved.json()) as { recipe: Recipe }).recipe.url).toBe("https://example.com/green-curry");

    // A blank title clears it.
    const cleared = await patch(`/api/recipes/${recipe.id}`, { title: "" });
    expect(((await cleared.json()) as { recipe: Recipe }).recipe.title).toBeNull();
  });

  it("refuses a link that another recipe already has", async () => {
    await post("/api/recipes", { url: "https://example.com/taken" });
    const { recipe } = (await (await post("/api/recipes", { url: "https://example.com/free" })).json()) as {
      recipe: Recipe;
    };
    const res = await patch(`/api/recipes/${recipe.id}`, { url: "https://example.com/taken" });
    expect(res.status).toBe(409);
  });

  it("deleting a recipe unlinks its meals and clears link-only slots", async () => {
    const url = "https://example.com/lasagne";
    await put("/api/meals/2026-12-20/dinner", { title: "Lasagne", recipeUrl: url });
    await put("/api/meals/2026-12-21/lunch", { recipeUrl: url });
    const recipe = await byUrl(url);

    expect((await call(`/api/recipes/${recipe!.id}`, { method: "DELETE" })).status).toBe(200);
    expect(await byUrl(url)).toBeUndefined();

    // 20 Dec is a Sunday, so the two meals fall in different weeks.
    const sunday = (await (await call("/api/weeks/2026-12-20")).json()) as { meals: Meal[] };
    expect(sunday.meals.find((m) => m.date === "2026-12-20")).toMatchObject({ title: "Lasagne", recipe: null });
    const monday = (await (await call("/api/weeks/2026-12-21")).json()) as { meals: Meal[] };
    expect(monday.meals.find((m) => m.date === "2026-12-21")).toBeUndefined();

    expect((await call(`/api/recipes/${recipe!.id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("validates input", async () => {
    expect((await post("/api/recipes", { url: "ftp://example.com/x" })).status).toBe(400);
    expect((await patch("/api/recipes/abc", { title: "x" })).status).toBe(400);
    expect((await patch("/api/recipes/1", {})).status).toBe(400);
  });
});
