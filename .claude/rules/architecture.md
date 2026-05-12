# Architecture Rules

## Package layout

```
apps/dashboard/        ← Next.js 16 dashboard. Hosted at rove-agiterra.vercel.app.
                         Imports nothing from packages/cli. May import from
                         packages/core/authoring-schemas (browser-safe subpath).

packages/cli/          ← @agiterra/rove-cli. CLI + daemon. Owns:
                          - `rove init` / `list` / `sync` / `run` / `daemon` / …
                          - daemon claim loop + dispatch
                          - sinks (markdown / supabase / github-issues)
                          - dispatchers (claude-code / codex)
                         Imports from @agiterra/rove-core. NEVER imports the dashboard.

packages/core/         ← @agiterra/rove-core. Types + Zod schemas + walk prompt
                         + persona library + flow discovery. Two subpath exports:
                          - "@agiterra/rove-core"             (full surface, Node)
                          - "@agiterra/rove-core/authoring-schemas"
                              (browser-safe — Zod schemas only, no fs imports)

infra/supabase/        ← Migrations + supabase CLI config. The hosted project
                         is `tceosllezmydpouvfuzf`. Each migration is timestamp-
                         prefixed and idempotent. `supabase db push` applies.

examples/flows/        ← Generic example flow YAMLs. Ship in the published tarball.
```

## Dependency direction

```
              dashboard ─────────┐
                                 ▼
                packages/cli ──► packages/core ◄── examples/flows
                     │                  ▲
                     │                  │
                  consumer            consumer
                  project's           project's
                  rove.config.ts      *.flow.yaml
```

- The dashboard NEVER depends on `@agiterra/rove-cli`. Dashboard ↔ daemon communication is via Supabase Realtime + the `agent_jobs` table, never a shared in-process import.
- The CLI's daemon spawns the local `claude` (or `codex`) subprocess. The dashboard is unaware of dispatcher internals.
- `@agiterra/rove-core` is the only thing both halves import from. Keep it tiny.

## Project tenancy (Phase C-lite)

Every row in every Rove table carries a `project_id text not null` column. Set by:

- The CLI: read from `rove.config.ts → projectId`, stamped on every write.
- The dashboard: resolved per-request via `lib/project-context.ts` (URL `?p=<slug>` → cookie → `ROVE_DEFAULT_PROJECT_ID` env → `'tankloop'` fallback).
- The daemon: claims only `agent_jobs.project_id = config.projectId`. Two daemons in two projects can't claim each other's work.

If you add a new table, add `project_id` and an index on `(project_id, *)`.

## Validation (Zod 4)

All schemas use Zod 4. Prefer the modern top-level format validators:

```ts
z.url()           // not z.string().url() — that signature is deprecated
z.email()
z.uuid()
```

Authoring schemas live in `packages/core/src/authoring-schemas.ts` and have a dedicated subpath export so the dashboard's client bundle can import them without pulling Node-only modules.

## Env-var conventions

- `ROVE_*` is canonical (`ROVE_SUPABASE_URL`, `ROVE_SUPABASE_SERVICE_ROLE_KEY`, `ROVE_DAEMON_GITHUB_HANDLE`, `ROVE_GITHUB_APP_*`).
- `EVAL_*` aliases exist as a one-version fallback for tankloop's old `.env.eval`. Treat as deprecated; remove when tankloop drops the legacy daemon.
- The dashboard's `lib/env.ts` reads both via `requireEither` / `readEither` helpers.
- The CLI reads `process.env.ROVE_*` only.
