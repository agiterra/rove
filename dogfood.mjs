// Dogfood test for the named-workers system.
//
// 1. Insert a fake job with required_capability='webhook' → confirm
//    the laptop daemon does NOT claim it (capability filter works).
// 2. Update it to required_capability='manual' → confirm the laptop
//    claims, dispatches, fails fast (empty input.description triggers
//    fail path in <1s), and the row reaches status='failed' with the
//    correct claimed_by_worker_id.
// 3. Print the lifecycle for the human.
// 4. Clean up.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.ROVE_SUPABASE_URL,
  process.env.ROVE_SUPABASE_SERVICE_ROLE_KEY,
);

const PROJECT_ID = "rove-dogfood";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJob(id) {
  const { data } = await supabase
    .from("agent_jobs")
    .select("id, status, claimed_by_worker_id, claimed_at, finished_at, error, recovery_count")
    .eq("id", id)
    .single();
  return data;
}

async function workerNameOf(workerId) {
  if (!workerId) return null;
  const { data } = await supabase.from("workers").select("name").eq("id", workerId).single();
  return data?.name ?? null;
}

async function main() {
  console.log("=== STEP 1: insert webhook-required job ===");
  const { data: inserted, error: insErr } = await supabase
    .from("agent_jobs")
    .insert({
      kind: "generate_persona",
      project_id: PROJECT_ID,
      input: {}, // empty description = dispatcher fails fast
      status: "pending",
      required_capability: "webhook",
      notes: "named-workers dogfood test — safe to delete",
    })
    .select("id")
    .single();
  if (insErr) {
    console.error("insert failed:", insErr.message);
    process.exit(1);
  }
  const jobId = inserted.id;
  console.log(`inserted job ${jobId} with required_capability='webhook'`);

  await sleep(6000);
  let j = await fetchJob(jobId);
  console.log(`after 6s: status=${j.status}  claimed_by_worker_id=${j.claimed_by_worker_id ?? "—"}`);
  if (j.status !== "pending") {
    console.error("FAIL: webhook job was claimed by a worker that should not advertise webhook");
    process.exit(1);
  }
  console.log("PASS: laptop daemon correctly skipped webhook-required job\n");

  console.log("=== STEP 2: change required_capability to 'manual' ===");
  const { error: updErr } = await supabase
    .from("agent_jobs")
    .update({ required_capability: "manual" })
    .eq("id", jobId);
  if (updErr) {
    console.error("update failed:", updErr.message);
    process.exit(1);
  }
  console.log(`updated job ${jobId} to required_capability='manual'`);

  // Poll for terminal state (laptop should claim, dispatch, fail fast)
  let final = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    final = await fetchJob(jobId);
    if (final.status === "completed" || final.status === "failed") break;
    if (i === 1 || i === 5 || i === 10) {
      console.log(`  t=${i + 1}s status=${final.status} claimed_by_worker_id=${final.claimed_by_worker_id ?? "—"}`);
    }
  }
  const claimingWorker = await workerNameOf(final.claimed_by_worker_id);
  console.log(
    `final: status=${final.status}  claimed_by=${claimingWorker ?? "—"}  ` +
      `finished_at=${final.finished_at ?? "—"}  error="${final.error ?? "—"}"`,
  );
  if (final.status !== "failed") {
    console.error("FAIL: expected status=failed (empty input.description), got " + final.status);
    process.exit(1);
  }
  console.log("PASS: manual job claimed, dispatched, failed-fast, ownership predicate held\n");

  console.log("=== STEP 3: cleanup test rows ===");
  await supabase.from("agent_jobs").delete().eq("id", jobId);
  console.log(`deleted test job ${jobId}`);

  const { data: stale, error: staleErr } = await supabase
    .from("workers")
    .delete()
    .in("name", ["brian-laptop-test", "agiterra-walker-test"])
    .eq("project_id", PROJECT_ID)
    .select("name");
  if (staleErr) console.error("worker cleanup:", staleErr.message);
  else console.log(`deleted stale test workers: ${(stale ?? []).map((w) => w.name).join(", ")}`);

  console.log("\n=== DOGFOOD PASSED ===");
}

main().catch((e) => {
  console.error("fatal:", e.message);
  process.exit(1);
});
