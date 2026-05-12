# Dashboard Rules (Next.js 16, Tailwind 4)

Lives at `apps/dashboard/`. Deployed at `rove-agiterra.vercel.app` on Vercel project `rove`, linked to `agiterra/rove`. Auto-deploys on every push to main.

## Server vs client

Default to server components. Push `"use client"` to the leaf that needs interactivity. Specifically:

- Pages — server components. Read data via `createReadClient()` / `createServiceRoleSupabase()`.
- Forms with client-side state — client components.
- Data fetching for the dashboard — always server-side. Never expose the service role key to a client component.

### searchParams + params are Promises in Next 16

```ts
interface PageProps {
  params: Promise<{ flowId: string }>;
  searchParams: Promise<{ p?: string }>;
}

export default async function Page({ params, searchParams }: PageProps) {
  const { flowId } = await params;
  const sp = await searchParams;
  // …
}
```

This caught us once on `/findings` — treating `searchParams` as a plain object silently returned `undefined` for every field and broke the drawer. Always await.

## Project filtering

Every data page MUST filter by `project_id`. The pattern:

```ts
import { resolveProjectId } from "@/lib/project-context";
// …
const projectId = await resolveProjectId(searchParams);
supabase.from("runs").select("…").eq("project_id", projectId);
```

If you add a new query against a project-scoped table, add the `.eq("project_id", projectId)`. The lint isn't strict enough to catch a missing filter; reviewer's responsibility.

## Metadata + titles

The root layout sets `title.template: "%s · Rove"`. Every page exports `metadata: { title: "Whatever" }` (or `generateMetadata` for dynamic routes) so the browser tab actually identifies the page. Agent walks flag missing titles under `agent.titles_and_meta`.

Client-component pages can't export `metadata` directly. Add a sibling `layout.tsx` with the metadata export (see `app/signin/layout.tsx`).

## Auth + RLS

Dashboard auth is Supabase + GitHub OAuth. `is_team_member()` is a Postgres function (security definer) that gates RLS. Anyone in the `team_members` table can read every project's data — per-project membership is Phase D2.

To add a new teammate: `insert into public.team_members (github_handle, display_name) values ('handle', 'Name');`. The bind trigger ties them to `auth.users` on first sign-in.

## Theme

Cyan-to-navy gradient is the Rove signature. Use the brand vars, not hard-coded hex:

```css
var(--color-brand-cyan)
var(--color-brand-navy)
.bg-brand-gradient
.text-brand-gradient
```

All defined in `app/globals.css`. The signin hero + Run-walk button + AppMark mark all use this gradient.

## Realtime subscriptions

For client-side waits on `agent_jobs` UPDATEs (wizard "Generate", "Run walk" status), use `lib/authoring/wait-for-job.ts`. It:

1. Calls `supabase.realtime.setAuth(session.access_token)` so RLS doesn't drop the events (this caught us once).
2. Subscribes via Realtime.
3. Does a catch-up read on subscribe to handle the race where the daemon completes before the subscription attaches.
4. Resolves on completion, rejects on failure/timeout.

If you build another subscription path, copy this pattern.

## Vercel

- Single deployment serves all projects (multi-tenant via `project_id`). One Vercel project = one URL.
- Deployment Protection should stay OFF — Phase D demands the dashboard be reachable by agents without a Vercel SSO interstitial. Agent walks file `agent.captcha_friendly` if any is in the path.
- Env vars live in Vercel project settings. Use `vercel env pull .env.local` for local dev.

## Don't

- Don't add a `<title>` via `<head>` markup. Use `metadata.title`.
- Don't render empty live regions / role=alert. Agent walks flag them.
- Don't link the logo to a route that bounces back to the current page (the inert-mark pattern in `app/layout.tsx` handles this for unauthed visitors).
- Don't introduce a feature that only works for human personas. The whole point is parity.
