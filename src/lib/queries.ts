import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Meal, MealUpdate, WeekResponse } from "@shared/types";
import { addDays, mondayOf, type Slot } from "@shared/week";
import { api } from "./api";

export const weekKey = (weekStart: string) => ["week", weekStart] as const;

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
