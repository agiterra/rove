-- Named-workers plan step 4: drop the daemon_heartbeats compat view.
--
-- The dashboard has been swapped to read `workers` directly:
--   - apps/dashboard/components/daemon-status-pill.tsx (step 1)
--   - apps/dashboard/app/flows/new/actions.ts          (step 4)
--   - apps/dashboard/app/flows/new/page.tsx            (step 4)
--
-- The new /workers page reads `workers` directly. No code path remains
-- that reads `daemon_heartbeats`.

drop view if exists public.daemon_heartbeats;
