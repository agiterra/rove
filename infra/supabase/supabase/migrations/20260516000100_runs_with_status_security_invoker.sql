-- Make `runs_with_status` enforce RLS as the calling user.
--
-- Without `security_invoker`, a Postgres view runs with the owner's
-- privileges and bypasses RLS on the base table. Today that's only a
-- defense-in-depth concern (is_team_member() gates the entire app), but
-- if per-project membership lands in Phase D2 the view must honor the
-- caller's row-visibility — otherwise anyone with select on the view
-- could read across project boundaries.

alter view public.runs_with_status set (security_invoker = true);
