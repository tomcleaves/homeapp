import type { Meal, MealUpdate, MeResponse, WeekResponse } from "@shared/types";
import type { Slot } from "@shared/week";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Thrown when the Cloudflare Access session has expired. */
export class SignedOutError extends ApiError {
  constructor() {
    super("Your session has expired", 401);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...init?.headers },
  });

  // When the Access session expires, Access answers with a redirect to its
  // login page instead of letting the request through to the API.
  const isJson = res.headers.get("content-type")?.includes("application/json");
  if (res.status === 401 || res.redirected || !isJson) {
    if (res.status === 401 || res.redirected) throw new SignedOutError();
    throw new ApiError(`Unexpected response (${res.status})`, res.status);
  }

  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body;
}

export const api = {
  me: () => request<MeResponse>("/api/me"),

  week: (weekStart: string) => request<WeekResponse>(`/api/weeks/${weekStart}`),

  updateMeal: (date: string, slot: Slot, update: MealUpdate) =>
    request<{ meal: Meal | null }>(`/api/meals/${date}/${slot}`, {
      method: "PUT",
      body: JSON.stringify(update),
    }),

  sendLeftovers: (date: string) =>
    request<{ meal: Meal | null }>(`/api/meals/${date}/dinner/leftovers`, { method: "POST" }),
};
