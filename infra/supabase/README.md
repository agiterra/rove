# Rove — Supabase project

This directory owns the schema for the **rove Supabase project**
(hosted at `tceosllezmydpouvfuzf.supabase.co`).

This is **a separate database from the TankLoop application database**.
The app DB lives in `packages/db` (Drizzle, source of truth). The eval DB
lives here as raw SQL because:

- Schema decisions belong with the dashboard + CLI that consume it, not
  with `@tankloop/db`.
- Supabase-specific features (RLS, Storage policies, `auth.users` FKs)
  are awkward to express in Drizzle and natural in SQL.
- The eval DB is a sidecar for the agentic UX evaluator; it shares no
  rows or types with the app DB.

## Layout

```
infra/supabase/eval/
├── README.md                            ← you are here
└── supabase/
    ├── config.toml                      ← Supabase CLI config for the hosted project
    └── migrations/                      ← timestamp-prefixed, picked up by `supabase db push`
        ├── 20260507000000_eval_core.sql
        ├── 20260507000100_team_and_rls.sql
        ├── 20260511200000_fix_team_member_recursion.sql
        └── 20260511210000_agent_jobs.sql
```

## Applying migrations

Migrations live under `supabase/migrations/` (the conventional Supabase
CLI location) and are timestamp-prefixed. The remote tracking table
(`supabase_migrations.schema_migrations`) is in sync as of 2026-05-11.

First-time setup against the hosted project:

```bash
cd infra/supabase/eval
supabase link --project-ref tceosllezmydpouvfuzf
supabase db push
```

Subsequent migrations: drop a new file in `supabase/migrations/` named
`<UTC-timestamp>_<slug>.sql`, then:

```bash
cd infra/supabase/eval
supabase db push
```

For local iteration:

```bash
cd infra/supabase/eval
supabase start
supabase db reset    # applies all migrations against the local DB
```

If a migration was applied out-of-band (e.g. via Studio SQL editor),
mark it as applied without re-running:

```bash
supabase migration repair --status applied <timestamp>
```

## Cleanup model

Screenshots accumulate. To keep us inside the Supabase Free tier:

- Every finding row carries `resolved_at` (set when status moves to
  `fixed` or `dismissed`) and `screenshots_purged_at` (set after the
  Storage objects + `finding_screenshots` rows have been deleted).
- The `rove cleanup-resolved` CLI command finds rows where
  `resolved_at IS NOT NULL AND screenshots_purged_at IS NULL`, deletes
  the referenced Storage objects, deletes the join rows, then stamps
  `screenshots_purged_at`. Idempotent.
- Phase 8 wires the dedup loop to flip findings to `fixed` when a prior
  finding does not reappear in a new run on the same flow.
