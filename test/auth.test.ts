import { env } from "cloudflare:workers";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveEmail, type Bindings } from "../worker/auth";
import app from "../worker/index";
import { call, DEV_EMAIL } from "./helpers";

const TEAM = "homeapp.cloudflareaccess.com";
const AUD = "test-audience-tag";
const accessEnv = { ...env, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD } as Bindings;

let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

function sign(claims: Record<string, unknown>, opts: { aud?: string; iss?: string; exp?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? `https://${TEAM}`)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(privateKey);
}

function requestWith(token: string, as: "header" | "cookie" = "header") {
  const headers: Record<string, string> =
    as === "header" ? { "cf-access-jwt-assertion": token } : { cookie: `x=1; CF_Authorization=${token}` };
  return new Request("https://meals.example.com/api/me", { headers });
}

describe("Cloudflare Access verification", () => {
  it("accepts a valid token from the header or the cookie", async () => {
    const token = await sign({ email: "Sophia@Example.com" });
    expect(await resolveEmail(requestWith(token), accessEnv, () => keys)).toBe("sophia@example.com");
    expect(await resolveEmail(requestWith(token, "cookie"), accessEnv, () => keys)).toBe(
      "sophia@example.com",
    );
  });

  it("rejects a token for another application", async () => {
    const token = await sign({ email: "a@example.com" }, { aud: "someone-elses-app" });
    expect(await resolveEmail(requestWith(token), accessEnv, () => keys)).toBeNull();
  });

  it("rejects a token from another team", async () => {
    const token = await sign({ email: "a@example.com" }, { iss: "https://evil.cloudflareaccess.com" });
    expect(await resolveEmail(requestWith(token), accessEnv, () => keys)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await sign({ email: "a@example.com" }, { exp: "-1m" });
    expect(await resolveEmail(requestWith(token), accessEnv, () => keys)).toBeNull();
  });

  it("rejects a token signed by a different key", async () => {
    const other = await generateKeyPair("RS256");
    const token = await new SignJWT({ email: "a@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(`https://${TEAM}`)
      .setAudience(AUD)
      .setExpirationTime("1h")
      .sign(other.privateKey);
    expect(await resolveEmail(requestWith(token), accessEnv, () => keys)).toBeNull();
  });
});

describe("API sign-in rules", () => {
  it("returns 401 with no Access token", async () => {
    const res = await app.request("https://meals.example.com/api/me", {}, accessEnv);
    expect(res.status).toBe(401);
  });

  it("fails closed when Access is not configured", async () => {
    const res = await app.request("https://meals.example.com/api/me", {}, env);
    expect(res.status).toBe(503);
  });

  it("ignores the local dev user on a real hostname", async () => {
    const res = await app.request(
      "https://meals.example.com/api/me",
      {},
      { ...accessEnv, DEV_AUTH_EMAIL: DEV_EMAIL },
    );
    expect(res.status).toBe(401);
  });

  it("uses the local dev user on localhost", async () => {
    const res = await call("/api/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: DEV_EMAIL });
  });

  it("enforces the email allow-list when one is set", async () => {
    const blocked = await call("/api/me", {}, { ALLOWED_EMAILS: "sophia@example.com" });
    expect(blocked.status).toBe(403);
    const allowed = await call("/api/me", {}, { ALLOWED_EMAILS: `sophia@example.com, ${DEV_EMAIL}` });
    expect(allowed.status).toBe(200);
  });
});
