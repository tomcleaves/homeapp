import type { Slot } from "./week";

/** The recipe attached to a meal. */
export interface MealRecipe {
  id: number;
  url: string;
  title: string | null;
}

export interface Meal {
  date: string;
  slot: Slot;
  title: string;
  recipe: MealRecipe | null;
  updatedBy: string | null;
  updatedAt: number | null;
}

export interface WeekResponse {
  weekStart: string;
  meals: Meal[];
}

export interface MeResponse {
  email: string;
}

/**
 * Change a meal. Attach a recipe either by link (`recipeUrl`, which adds it to
 * the library if it's new) or by library id (`recipeId`). null/"" removes it.
 */
export interface MealUpdate {
  title?: string;
  recipeUrl?: string | null;
  recipeId?: number | null;
}

/** One time a recipe was put on the plan. */
export interface RecipeUse {
  date: string;
  slot: Slot;
  title: string;
}

export interface Recipe {
  id: number;
  url: string;
  title: string | null;
  /** title, else the latest meal's name, else the site's name. */
  displayName: string;
  host: string;
  createdAt: number;
  /** Every meal that used it, newest first. */
  uses: RecipeUse[];
}

export interface RecipesResponse {
  recipes: Recipe[];
}

export interface RecipeInput {
  url: string;
  title?: string | null;
}

export interface RecipePatch {
  url?: string;
  title?: string | null;
}

export type Severity = "low" | "med" | "high";
export type Doer = "diy" | "trade";

export interface Job {
  id: number;
  title: string;
  severity: Severity;
  room: string | null;
  /** null = not decided yet. */
  doer: Doer | null;
  notes: string;
  /** Whole pence. */
  estimatePence: number | null;
  actualPence: number | null;
  /** ms since epoch; null while still to do. */
  doneAt: number | null;
  doneBy: string | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface JobsResponse {
  jobs: Job[];
}

export interface JobInput {
  title: string;
  severity?: Severity;
  room?: string | null;
  doer?: Doer | null;
  notes?: string;
  estimatePence?: number | null;
}

export interface JobPatch extends Partial<JobInput> {
  actualPence?: number | null;
  done?: boolean;
}
