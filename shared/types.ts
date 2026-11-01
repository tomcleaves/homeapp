import type { Slot } from "./week";

export interface Meal {
  date: string;
  slot: Slot;
  title: string;
  recipeUrl: string | null;
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

export interface MealUpdate {
  title?: string;
  recipeUrl?: string | null;
}
