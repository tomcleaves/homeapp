import type { Recipe } from "@shared/types";

/** Lower-case and strip accents, so "creme" finds "Crème brûlée". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** True when every word of `query` appears in the recipe's name, link or meal names. */
export function matchesSearch(recipe: Recipe, query: string): boolean {
  const haystack = fold(
    [recipe.displayName, recipe.title ?? "", recipe.url, ...recipe.uses.map((u) => u.title)].join(" "),
  );
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
