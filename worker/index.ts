import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { MeResponse } from "@shared/types";
import { requireUser, type AppEnv } from "./auth";
import { mealRoutes } from "./routes/meals";

// Static files (the React app) are served by Workers Assets before this code
// runs. Only /api/* reaches the Worker (see run_worker_first in wrangler.jsonc).
const app = new Hono<AppEnv>().basePath("/api");

app.use("*", requireUser);

app.get("/me", (c) => c.json<MeResponse>({ email: c.get("userEmail") }));
app.route("/", mealRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
});

export default app;
