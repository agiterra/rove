// Rove dogfood config — Rove walking Rove's own dashboard.
// Per §17.2 of docs/reviews/2026-05-12-walk-model-and-roadmap-review.md.
// (Type import skipped — this repo is the source of @agiterra/rove-cli,
// not a consumer; the CLI parses + validates this object via Zod at load.)

export default {
  projectId: "rove-dogfood",
  flowsDir: "examples/flows",
  defaultTargetUrl: "https://rove-agiterra.vercel.app",
  sinks: ["markdown", "supabase"],
};
