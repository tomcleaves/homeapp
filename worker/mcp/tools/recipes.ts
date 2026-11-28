import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { matchesSearch } from "@shared/search";
import type { Recipe, RecipesResponse } from "@shared/types";
import type { ApiCall } from "../api";
import { page, paging, recipeMarkdown, reply, responseFormat, text } from "../format";

const recipeId = z.number().int().positive().describe("The recipe's id, from homeapp_list_recipes");

/** Most recently planned first, then newest added. */
function byRecent(a: Recipe, b: Recipe) {
  const lastA = a.uses[0]?.date ?? "";
  const lastB = b.uses[0]?.date ?? "";
  return lastB.localeCompare(lastA) || b.createdAt - a.createdAt;
}

export function registerRecipeTools(server: McpServer, api: ApiCall) {
  server.registerTool(
    "homeapp_list_recipes",
    {
      title: "List recipes",
      description: `List or search the recipe library: every recipe link Tom and Sophia have saved or planned, with when it was last on the meal plan.

Most recently planned first. Search is accent-insensitive and every word must match the name, link or the names of meals that used it.

Examples:
  - "What curry recipes do we have?" -> query="curry"
  - "Show the recipe library" -> no query`,
      inputSchema: z.strictObject({
        query: z.string().max(200).optional().describe("Words to search for, e.g. 'chicken traybake'"),
        ...paging,
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, limit, offset, response_format }) => {
      const { recipes } = await api<RecipesResponse>("GET", "/api/recipes");
      const found = recipes.filter((r) => !query || matchesSearch(r, query)).sort(byRecent);
      return page(found, { limit, offset, format: response_format }, {
        key: "recipes",
        heading: query ? `Recipes matching "${query}"` : "Recipe library",
        empty: query ? `No recipes match "${query}". Try fewer or different words.` : "The recipe library is empty.",
        item: recipeMarkdown,
        data: (r) => r,
      });
    },
  );

  server.registerTool(
    "homeapp_add_recipe",
    {
      title: "Add recipe",
      description: `Save a recipe link to the library without putting it on the meal plan.

Links are stored in canonical form (tracking parameters and #anchors removed), so adding a link that's already saved returns the existing entry. A title only fills in a missing name; it never renames an existing recipe (use homeapp_update_recipe for that).`,
      inputSchema: z.strictObject({
        url: z.string().min(1).max(2000).describe("The recipe's http(s) link"),
        title: z.string().max(200).optional().describe("A name for it, e.g. 'Nigella's chicken traybake'"),
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ url, title, response_format }) => {
      const { recipe } = await api<{ recipe: Recipe }>("POST", "/api/recipes", { url, title });
      return reply(response_format, `Saved to the library:\n${recipeMarkdown(recipe)}`, { recipe });
    },
  );

  server.registerTool(
    "homeapp_update_recipe",
    {
      title: "Update recipe",
      description:
        "Rename a recipe or correct its link. Pass title=null to clear the chosen name (it then shows the latest meal's name, or the site's name).",
      inputSchema: z.strictObject({
        recipe_id: recipeId,
        title: z.string().max(200).nullable().optional().describe("New name, or null to clear it"),
        url: z.string().min(1).max(2000).optional().describe("Corrected http(s) link"),
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ recipe_id, title, url, response_format }) => {
      if (title === undefined && url === undefined) return text("Nothing to change: pass a title and/or a url.");
      const { recipe } = await api<{ recipe: Recipe }>("PATCH", `/api/recipes/${recipe_id}`, { title, url });
      return reply(response_format, `Updated:\n${recipeMarkdown(recipe)}`, { recipe });
    },
  );

  server.registerTool(
    "homeapp_delete_recipe",
    {
      title: "Delete recipe",
      description:
        "Remove a recipe from the library for good. Meals that used it keep their names but lose the link; a meal that was only the link becomes an empty slot. Confirm with the user first.",
      inputSchema: z.strictObject({ recipe_id: recipeId }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ recipe_id }) => {
      await api("DELETE", `/api/recipes/${recipe_id}`);
      return text(`Deleted recipe ${recipe_id} from the library.`);
    },
  );
}
