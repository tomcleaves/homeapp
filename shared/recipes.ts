// Recipe helpers shared by the Worker and the React app.

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$)/i;

/**
 * Canonical form of a recipe link, so the same recipe pasted twice (with or
 * without tracking junk or a #section anchor) is one library entry.
 * Returns null for anything that isn't an http(s) URL.
 */
export function normaliseRecipeUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

/** "bbcgoodfood.com" from "https://www.bbcgoodfood.com/recipes/…". */
export function recipeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The name to show: the user's title, else the latest meal that used it, else the site. */
export function recipeDisplayName(
  recipe: { url: string; title: string | null },
  latestMealTitle?: string | null,
): string {
  const title = recipe.title?.trim();
  if (title) return title;
  const fromMeal = latestMealTitle?.split("\n")[0]?.trim();
  if (fromMeal) return fromMeal;
  return recipeHost(recipe.url);
}
