import { env } from "cloudflare:workers";
import app from "../worker/index";

export const DEV_EMAIL = "tom@example.com";

/** Calls the API as a signed-in local developer. */
export function call(path: string, init?: RequestInit, extraEnv: Record<string, string> = {}) {
  return app.request(
    `http://localhost${path}`,
    { ...init, headers: { "content-type": "application/json", ...init?.headers } },
    { ...env, DEV_AUTH_EMAIL: DEV_EMAIL, ...extraEnv },
  );
}

export function put(path: string, body: unknown, extraEnv?: Record<string, string>) {
  return call(path, { method: "PUT", body: JSON.stringify(body) }, extraEnv);
}

export function post(path: string, body: unknown, extraEnv?: Record<string, string>) {
  return call(path, { method: "POST", body: JSON.stringify(body) }, extraEnv);
}

export function patch(path: string, body: unknown, extraEnv?: Record<string, string>) {
  return call(path, { method: "PATCH", body: JSON.stringify(body) }, extraEnv);
}

export function del(path: string, extraEnv?: Record<string, string>) {
  return call(path, { method: "DELETE" }, extraEnv);
}
