import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { sql } from "drizzle-orm";
import { getDb } from "./db/client";
import { users } from "./db/schema";

/** Bindings plus values that only exist as secrets or in .dev.vars. */
export type Bindings = Env & {
  ALLOWED_EMAILS?: string;
  DEV_AUTH_EMAIL?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { userEmail: string };
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// One key set per team domain, kept for the life of the isolate.
// jose caches the fetched keys and refreshes them when Cloudflare rotates them.
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function keySetFor(teamDomain: string) {
  let set = keySets.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    keySets.set(teamDomain, set);
  }
  return set;
}

function normaliseTeamDomain(value: string): string {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/**
 * Works out who is making the request.
 *
 * In production Cloudflare Access sits in front of the whole app and adds a
 * signed JWT to every request it lets through. We verify that JWT ourselves
 * too, so the Worker is safe even if it's reached by a route Access doesn't cover
 * (for example the workers.dev URL).
 *
 * Locally there is no Access, so DEV_AUTH_EMAIL from .dev.vars is used, but
 * only when the request really is for localhost.
 */
export async function resolveEmail(
  req: Request,
  env: Bindings,
  getKeys: (teamDomain: string) => JWTVerifyGetKey = keySetFor,
): Promise<string | null> {
  const url = new URL(req.url);
  if (env.DEV_AUTH_EMAIL && LOCAL_HOSTS.has(url.hostname)) {
    return env.DEV_AUTH_EMAIL.trim().toLowerCase();
  }

  const teamDomain = normaliseTeamDomain(env.ACCESS_TEAM_DOMAIN ?? "");
  // One AUD tag per Access application: the app itself, plus the /mcp app.
  const audience = (env.ACCESS_AUD ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (!teamDomain || !audience.length) {
    // Fail closed: never serve data if Access isn't configured.
    throw new HTTPException(503, { message: "Cloudflare Access is not configured" });
  }

  const token =
    req.headers.get("cf-access-jwt-assertion") ??
    readCookie(req.headers.get("cookie"), "CF_Authorization");
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getKeys(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience,
    });
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

function allowedEmails(env: Bindings): Set<string> | null {
  const list = (env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? new Set(list) : null;
}

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const email = await resolveEmail(c.req.raw, c.env);
  if (!email) return c.json({ error: "Not signed in" }, 401);

  // Optional second gate on top of the Access policy.
  const allowed = allowedEmails(c.env);
  if (allowed && !allowed.has(email)) return c.json({ error: "Not allowed" }, 403);

  await getDb(c.env)
    .insert(users)
    .values({ email })
    .onConflictDoUpdate({ target: users.email, set: { lastSeenAt: sql`(unixepoch() * 1000)` } });

  c.set("userEmail", email);
  await next();
});
