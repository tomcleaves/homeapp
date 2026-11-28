import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { MeResponse } from "@shared/types";
import { requireUser, type AppEnv } from "./auth";
import { handleMcp } from "./mcp/server";
import { mealRoutes } from "./routes/meals";
import { jobRoutes } from "./routes/jobs";
import { recipeRoutes } from "./routes/recipes";

function onError(err: Error, c: Context<AppEnv>) {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
}

// Static files (the React app) are served by Workers Assets before this code
// runs. Only /api/* and /mcp reach the Worker (see run_worker_first in wrangler.jsonc).
const api = new Hono<AppEnv>().basePath("/api");

api.use("*", requireUser);

api.get("/me", (c) => c.json<MeResponse>({ email: c.get("userEmail") }));
api.route("/", mealRoutes);
api.route("/", recipeRoutes);
api.route("/", jobRoutes);

api.notFound((c) => c.json({ error: "Not found" }, 404));
api.onError(onError);

const app = new Hono<AppEnv>();

app.route("/", api);

// MCP endpoint for Claude and other agents. Cloudflare Access (managed OAuth)
// signs the agent in and forwards the same JWT the browser gets; requireUser
// verifies it. Tools then call the /api routes in-process as that user.
app.use("/mcp", async (c, next) => {
  // Browsers send Origin; block other sites' pages from driving the endpoint.
  // Agents connect server-to-server and usually send none.
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: "Origin not allowed" }, 403);
  await next();
});
app.use("/mcp", requireUser);
app.all("/mcp", (c) => handleMcp(c.req.raw, (request) => api.fetch(request, c.env)));

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError(onError);

export default app;
