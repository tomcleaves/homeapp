import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Meal, MealUpdate, RecipeInput, RecipePatch, WeekResponse } from "@shared/types";
import { addDays, mondayOf, type Slot } from "@shared/week";
import { api } from "./api";

export const weekKey = (weekStart: string) => ["week", weekStart] as const;
const RECIPES_KEY = ["recipes"] as const;

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: Infinity });
}

export function useWeek(weekStart: string) {
  return useQuery({
    queryKey: weekKey(weekStart),
    queryFn: () => api.week(weekStart),
    // Picks up the other person's edits. Polling pauses while the tab is hidden.
    refetchInterval: 20_000,
  });
}

/** Replaces (or removes) one meal in a cached week. */
function patchWeek(week: WeekResponse | undefined, date: string, slot: Slot, meal: Meal | null) {
  if (!week) return week;
  const others = week.meals.filter((m) => !(m.date === date && m.slot === slot));
  return { ...week, meals: meal ? [...others, meal] : others };
}

export function useUpdateMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { date: string; slot: Slot; update: MealUpdate }) =>
      api.updateMeal(v.date, v.slot, v.update),
    onSuccess: ({ meal }, { date, slot }) => {
      qc.setQueryData<WeekResponse>(weekKey(mondayOf(date)), (w) => patchWeek(w, date, slot, meal));
      // Meal names and links feed the library (names, history), so refresh it.
      void qc.invalidateQueries({ queryKey: RECIPES_KEY });
    },
  });
}

export function useSendLeftovers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => api.sendLeftovers(date),
    onSuccess: ({ meal }, date) => {
      const next = addDays(date, 1);
      qc.setQueryData<WeekResponse>(weekKey(mondayOf(next)), (w) =>
        patchWeek(w, next, "lunch", meal),
      );
    },
  });
}

export function useRecipes() {
  return useQuery({ queryKey: RECIPES_KEY, queryFn: api.recipes, staleTime: 30_000 });
}

/** After a library change, refresh the library and any cached weeks that show recipes. */
function useInvalidateRecipes() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: RECIPES_KEY }),
      qc.invalidateQueries({ queryKey: ["week"] }),
    ]);
}

export function useCreateRecipe() {
  const invalidate = useInvalidateRecipes();
  return useMutation({ mutationFn: (input: RecipeInput) => api.createRecipe(input), onSuccess: invalidate });
}

export function useUpdateRecipe() {
  const invalidate = useInvalidateRecipes();
  return useMutation({
    mutationFn: (v: { id: number; patch: RecipePatch }) => api.updateRecipe(v.id, v.patch),
    onSuccess: invalidate,
  });
}

export function useDeleteRecipe() {
  const invalidate = useInvalidateRecipes();
  return useMutation({ mutationFn: (id: number) => api.deleteRecipe(id), onSuccess: invalidate });
}
