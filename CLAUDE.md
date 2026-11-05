# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"The Weekly Table": a lunch & dinner planner shared by two people (Tom and Sophia), with a recipe library of everything they've planned, on Cloudflare's free tier. It replaces an earlier claude.ai artifact. Planned later (not built yet): ingredient extraction and per-meal cost estimates from Ocado order emails, which will hang off the `recipes` table. Keep everything within free-tier services.

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
- `meals` has primary key `(date, slot)`; `slot` is `lunch | dinner`. A meal points to at most one library recipe via `recipe_id`.
- `recipes` is the recipe library: one row per distinct link (`url` is unique), with an optional user-chosen `title`. Recipes outlive their meals, so the library is a lasting record. Deleting one (`DELETE /api/recipes/:id`) unlinks its meals and removes meals that were only a link.
- An empty slot has no row: writing a slot with a blank title and no recipe deletes it (`writeSlot` in `worker/routes/meals.ts`).
- `PUT /api/meals/:date/:slot` merges partial updates. It attaches a recipe either by `recipeUrl` (find-or-create in the library) or by `recipeId`; send one or the other, and `null` detaches.
- Links are stored canonical via `normaliseRecipeUrl` (`shared/recipes.ts`: tracking params and `#anchor` stripped, host lower-cased), so the same recipe pasted twice is one library entry. Validation in `worker/validation.ts` applies it.
- A recipe's display name is its `title`, else the latest meal that used it, else the site's host (`recipeDisplayName`). `loadRecipes` in `worker/db/queries.ts` returns each recipe with every meal that used it, newest first.
- Schema changes go through `pnpm db:generate`. Never hand-edit or rewrite migrations that may already be applied; tests apply them in order. Drizzle omits `ON DELETE` on `ALTER TABLE … ADD` columns and can't express data backfills, so check a newly generated file before committing it (`0001_recipes.sql` was amended for both).

**Dates are `YYYY-MM-DD` strings everywhere**, with all arithmetic in UTC in `shared/week.ts` (weeks start Monday; `GET /api/weeks/:date` normalises any date to its Monday). Use those helpers rather than `Date` math, so the UK clock changes can't shift days. Only `localToday()` uses the browser's local time.

**Frontend ↔ API contract** is the plain types in `shared/types.ts`, consumed by `src/lib/api.ts` (a `fetch` wrapper). Hono's typed RPC client (`hc<AppType>`) is deliberately not used: importing Worker types into the DOM tsconfig pulls in Workers globals. The three tsconfigs (`app`, `worker`, `node`) keep those environments separate. `@shared/*` is aliased in both Vite and the tsconfigs.

**Pages**: two, the week plan (`/`, week in `?week=`) and the recipe library (`/recipes`). Routing is a tiny `pushState` router in `src/lib/router.ts` (`usePathname`, `navigate`, `linkProps`); add a real router only if pages multiply. Library search is client-side (`src/lib/search.ts`, accent-insensitive, every word must match), since the whole library is fetched at once.

**Client state** (`src/lib/queries.ts`, TanStack Query):
- Each week is cached under `["week", monday]`; the library under `["recipes"]`. Meal mutations patch the week cache from the server response and invalidate the library. Library mutations invalidate both, since weeks show recipe names.
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
