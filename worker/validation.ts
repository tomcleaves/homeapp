import { z } from "zod";
import { normaliseRecipeUrl } from "@shared/recipes";
import { isIsoDate } from "@shared/week";

export const isoDate = z.string().refine(isIsoDate, "Expected a date as YYYY-MM-DD");

/** An http(s) link, returned in canonical form (see normaliseRecipeUrl). */
export const recipeUrl = z
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

export const recipeTitle = z
  .string()
  .trim()
  .max(200)
  .transform((v) => v || null)
  .nullable();

export const idParam = z.object({ id: z.coerce.number().int().positive() });
