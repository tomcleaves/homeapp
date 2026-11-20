import type {
  Job,
  JobInput,
  JobPatch,
  JobsResponse,
  JobUpdateResponse,
  Meal,
  PartInput,
  PartPatch,
  MealUpdate,
  MeResponse,
  Recipe,
  RecipeInput,
  RecipePatch,
  RecipesResponse,
  WeekResponse,
} from "@shared/types";
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

  recipes: () => request<RecipesResponse>("/api/recipes"),

  createRecipe: (input: RecipeInput) =>
    request<{ recipe: Recipe }>("/api/recipes", { method: "POST", body: JSON.stringify(input) }),

  updateRecipe: (id: number, patch: RecipePatch) =>
    request<{ recipe: Recipe }>(`/api/recipes/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteRecipe: (id: number) => request<{ ok: true }>(`/api/recipes/${id}`, { method: "DELETE" }),

  jobs: () => request<JobsResponse>("/api/jobs"),

  createJob: (input: JobInput) =>
    request<{ job: Job }>("/api/jobs", { method: "POST", body: JSON.stringify(input) }),

  updateJob: (id: number, patch: JobPatch) =>
    request<JobUpdateResponse>(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteJob: (id: number) => request<{ ok: true }>(`/api/jobs/${id}`, { method: "DELETE" }),

  addPart: (jobId: number, input: PartInput) =>
    request<{ job: Job }>(`/api/jobs/${jobId}/parts`, { method: "POST", body: JSON.stringify(input) }),

  updatePart: (id: number, patch: PartPatch) =>
    request<{ job: Job }>(`/api/parts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deletePart: (id: number) => request<{ job: Job }>(`/api/parts/${id}`, { method: "DELETE" }),
};
