import { z } from "zod";
import { MAX_PENCE } from "@shared/money";
import { normaliseRecipeUrl } from "@shared/recipes";
import { isIsoDate, REPEAT_UNITS } from "@shared/week";

export const isoDate = z.string().refine(isIsoDate, "Expected a date as YYYY-MM-DD");

/**
 * An http(s) link, returned in canonical form (see normaliseRecipeUrl):
 * tracking params and #anchors dropped. Used for recipe and shop links.
 */
export const webUrl = z
  .string()
  .max(2000)
  .transform((v, ctx) => {
    const url = normaliseRecipeUrl(v);
    if (!url) {
      ctx.addIssue({ code: "custom", message: "Expected an http(s) link" });
      return z.NEVER;
    }
    return url;
  });

export const recipeUrl = webUrl;

export const recipeTitle = z
  .string()
  .trim()
  .max(200)
  .transform((v) => v || null)
  .nullable();

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const pence = z.number().int().min(0).max(MAX_PENCE);
export const severity = z.enum(["low", "med", "high"]);
export const doer = z.enum(["diy", "trade"]);

/** "  Downstairs   loo " → "Downstairs loo"; blank → null. */
export const room = z
  .string()
  .max(60)
  .transform((v) => v.trim().replace(/\s+/g, " ") || null)
  .nullable();

export const repeat = z.object({
  every: z.number().int().min(1).max(52),
  unit: z.enum(REPEAT_UNITS),
});
