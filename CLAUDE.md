# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"The Weekly Table": a lunch & dinner planner shared by two people (Tom and Sophia), on Cloudflare's free tier. It replaces an earlier claude.ai artifact. Planned later (not built yet): recipe import and per-meal cost estimates from Ocado order emails. Keep everything within free-tier services.

## Commands

Package manager is **pnpm**.

```bash
pnpm dev                      # Vite + Workers runtime at http://localhost:5173 (needs .dev.vars, see below)
pnpm test                     # all tests (run inside workerd with a throwaway D1)
pnpm test test/meals.test.ts  # one file
pnpm test -t "leftovers"      # tests whose name matches
pnpm typecheck                # tsc -b across all three tsconfigs
pnpm build                    # typecheck + vite build → dist/
pnpm run deploy               # build + wrangler deploy
pnpm cf-typegen               # regenerate worker/worker-configuration.d.ts after editing wrangler.jsonc
pnpm db:generate              # drizzle-kit: schema.ts → new SQL file in migrations/
pnpm db:migrate:local         # apply migrations to local D1 (needed once before `pnpm dev`)
pnpm db:migrate:remote        # apply migrations to the deployed D1
```

There is no linter configured. Local dev requires `cp .dev.vars.example .dev.vars`.

## Architecture

**One Worker serves everything.** `wrangler.jsonc` sets `assets.run_worker_first: ["/api/*"]`, so only `/api/*` reaches the Hono app in `worker/index.ts`; every other path is the built React app from Workers static assets, with SPA fallback to `index.html`. The `@cloudflare/vite-plugin` runs both in one `vite` dev server.

**Auth is Cloudflare Access, verified again in the Worker** (`worker/auth.ts`, `requireUser` middleware on all `/api/*`):
- In production, Access fronts the hostname and adds a JWT (`Cf-Access-Jwt-Assertion` header or `CF_Authorization` cookie). The Worker verifies signature, issuer (`https://<ACCESS_TEAM_DOMAIN>`) and audience (`ACCESS_AUD`) with `jose`.
- If `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` are empty, the API returns 503 for every request (fail closed). They are empty in the committed `wrangler.jsonc` until Access is set up.
- `DEV_AUTH_EMAIL` (from `.dev.vars`) bypasses Access **only when the request hostname is localhost**. Keep that hostname check.
- Optional `ALLOWED_EMAILS` secret (comma-separated) is a second allow-list.
- Every authenticated request upserts the email into `users`, because `meals.updated_by` is a foreign key to it.
- `resolveEmail` takes an injectable key-set function so tests can sign tokens with a local key pair.

**Data model** (`worker/db/schema.ts`, Drizzle on D1):
- `meals` has primary key `(date, slot)`; `slot` is `lunch | dinner`.
- An empty slot has no row: writing a slot with blank title and no `recipeUrl` deletes it (`writeSlot` in `worker/routes/meals.ts`).
- PUT merges partial updates, so title-only or link-only changes keep the other field.
- Schema changes go through `pnpm db:generate`. Never hand-edit or rewrite existing files in `migrations/`; tests apply them in order.

**Dates are `YYYY-MM-DD` strings everywhere**, with all arithmetic in UTC in `shared/week.ts` (weeks start Monday; `GET /api/weeks/:date` normalises any date to its Monday). Use those helpers rather than `Date` math, so the UK clock changes can't shift days. Only `localToday()` uses the browser's local time.

**Frontend ↔ API contract** is the plain types in `shared/types.ts`, consumed by `src/lib/api.ts` (a `fetch` wrapper). Hono's typed RPC client (`hc<AppType>`) is deliberately not used: importing Worker types into the DOM tsconfig pulls in Workers globals. The three tsconfigs (`app`, `worker`, `node`) keep those environments separate. `@shared/*` is aliased in both Vite and the tsconfigs.

**Client state** (`src/lib/queries.ts`, TanStack Query):
- Each week is cached under `["week", monday]`. Mutations patch that cache from the server response.
- Weeks poll every 20s to pick up the other person's edits (there is no realtime sync).
- `MealSlot` keeps a local draft and debounces saves (600 ms). It only adopts server values when the field isn't focused, dirty or mid-save. It flushes a pending edit on blur and on unmount, which happens when changing weeks.
- An expired Access session shows up as a redirect or non-JSON response. `api.ts` turns that into `SignedOutError`, and the UI offers a reload.

**UI**:
- shadcn/ui (new-york) in `src/components/ui`, Tailwind v4 configured in CSS: `src/index.css` maps the app's palette onto shadcn tokens and adds a custom `warm` colour. There is no `tailwind.config`.
- Dark mode follows the system setting via a `.dark` class toggled in `src/main.tsx`.
- The shadcn registry may be blocked in cloud sandboxes. If `pnpm dlx shadcn add` fails, write the component from shadcn's source by hand.

## Gotchas

- Tests use `@cloudflare/vitest-plugin` (not the retired `vitest-pool-workers`). `vitest.config.ts` blanks the auth bindings so `.dev.vars` doesn't leak into tests, and `test/apply-migrations.ts` applies migrations. Use distinct dates per test, since tests in a file share one database.
- `compatibility_date` in `wrangler.jsonc` must not be newer than the date the test plugin's bundled `workerd` supports, or the test runtime fails to start.
- `cf-typegen` uses `--strict-vars=false` so vars are typed as `string`, not as their current literal values.
- pnpm only runs install scripts for `esbuild` and `workerd` (`pnpm.onlyBuiltDependencies`). Add a package there if it needs a postinstall.
- Deployment and Access setup steps are in README.md. The D1 `database_id` in `wrangler.jsonc` is a placeholder until `wrangler d1 create homeapp` is run.
