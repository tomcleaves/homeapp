/**
 * How MCP tools talk to the app: by calling the existing /api routes in-process,
 * as the signed-in user. Every rule the UI relies on (validation, link
 * normalisation, recurring jobs, sign-in checks) therefore applies to agents too.
 */

export type ApiCall = <T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown) => Promise<T>;

/** The caller's sign-in, copied from the /mcp request onto each internal API request. */
const FORWARDED_HEADERS = ["cf-access-jwt-assertion", "cookie"];

export function inProcessApi(
  incoming: Request,
  fetchApi: (request: Request) => Response | Promise<Response>,
): ApiCall {
  const origin = new URL(incoming.url).origin;
  const auth: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = incoming.headers.get(name);
    if (value) auth[name] = value;
  }

  return async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetchApi(
      new Request(`${origin}${path}`, {
        method,
        headers: { ...auth, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) throw new Error(errorMessage(res.status, data));
    return data as T;
  };
}

/** Turns an API error into text that tells the agent what to do next. */
function errorMessage(status: number, data: unknown): string {
  const detail = describe(data);
  switch (status) {
    case 400:
      return `The app rejected the input: ${detail || "invalid request"}. Fix the arguments and try again.`;
    case 401:
      return "Not signed in to The Weekly Table. Reconnect the connector to sign in again.";
    case 403:
      return "This account isn't allowed to use The Weekly Table.";
    case 404:
      return `${detail || "Not found"}. List the items first (homeapp_list_jobs / homeapp_list_recipes) to get a current id.`;
    case 409:
      return `${detail || "Conflict"}. Use homeapp_list_recipes to find the existing entry.`;
    case 503:
      return "The app's sign-in isn't configured on the server yet.";
    default:
      return `The app returned an error (${status})${detail ? `: ${detail}` : ""}. Try again shortly.`;
  }
}

/** Reads `{error: "..."}` bodies and zod-validator failures (`{error: ZodError}`). */
function describe(data: unknown): string {
  if (!data || typeof data !== "object" || !("error" in data)) return "";
  const error = (data as { error: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    try {
      const issues = JSON.parse(error.message) as { path?: (string | number)[]; message: string }[];
      return issues.map((i) => (i.path?.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
    } catch {
      return error.message;
    }
  }
  return "";
}
