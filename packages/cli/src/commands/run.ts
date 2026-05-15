import {
  BUILT_IN_PERSONAS,
  buildWalkPrompt,
  discoverFlows,
  parseFindings,
  type FindingSeverity,
  type FlowInfo,
  type Persona,
} from "@agiterra/rove-core";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { roleForPersonaCategory, userDataDir } from "../auth-state.js";
import { loadRoveConfig } from "../config.js";
import { createDispatcher, createSinks, type DispatcherId, type SinkId } from "../factories.js";
import { renderSinkResult, routeToSinks } from "../sinks/route.js";
import type { ResolvedWorkspace } from "../workspace.js";

export interface RunOptions {
  flowId: string;
  personaId: string;
  goal?: string;
  notes?: string;
  /** Origin (scheme + host[+port]) to walk. Defaults to the local dev server. */
  targetUrl?: string;
  dryRun: boolean;
  maxBudgetUsd: number;
  timeoutSeconds: number;
  dispatcher: DispatcherId;
  sinks: SinkId[];
  ghMinSeverity?: FindingSeverity;
  ghDryRun: boolean;
  /**
   * If true, look up the persona's role-keyed storage state file and pass
   * it to the dispatcher. Default true. Set false to walk anonymously.
   */
  authenticated: boolean;
  /**
   * Agent personas stay anonymous by default. Set true only for dogfood walks
   * that intentionally review authenticated surfaces.
   */
  authenticateAgent: boolean;
  /**
   * When the workspace was synthesized from Supabase (no local
   * rove.config.ts), this is the project slug. Skips the second
   * loadRoveConfig() call and is passed through to live-step writes.
   */
  projectIdOverride?: string;
}

export async function runRunCommand(ws: ResolvedWorkspace, opts: RunOptions): Promise<number> {
  const flow = await resolveFlow(ws, opts.flowId);
  if (!flow) return 1;
  const persona = resolvePersona(opts.personaId);
  if (!persona) return 1;

  let authProfilePath: string | undefined;
  const isAgent = persona.category === "agent";
  // Agent personas walk anonymously by default — the whole point of the
  // agent-readiness rubric is "is this app usable by a fresh agent with
  // no session context?" Dogfood runs can opt into auth for protected surfaces.
  const effectivelyAuthenticated = opts.authenticated && (!isAgent || opts.authenticateAgent);
  if (effectivelyAuthenticated) {
    const role = roleForPersonaCategory(persona.category);
    const candidate = userDataDir(role);
    if (existsSync(candidate)) {
      authProfilePath = candidate;
    } else {
      const setupCommand = isAgent
        ? "rove dashboard-auth-setup --role dispatcher"
        : `rove auth-setup --role ${role}`;
      console.error(
        `✗ No auth profile for role=${role} at ${candidate}. Run \`${setupCommand}\` first, ` +
          `or pass --no-auth to walk anonymously.`,
      );
      return 1;
    }
  }

  // Agent personas (and, when shipped, change-review walks) run in a
  // clean-room: fresh cwd, scrubbed env, no source-read MCP tools. This is
  // the black-box guarantee that makes their findings credible. Human
  // personas keep the shared cwd so they can resolve flow-spec paths.
  const isolation: "clean-room" | "shared" =
    persona.category === "agent" ? "clean-room" : "shared";
  const isolated = isolation === "clean-room";

  // When projectIdOverride is supplied (workspace synthesized from
  // Supabase — daemon installed via /setup), skip the second loadRoveConfig
  // call entirely. Otherwise read the in-repo config for projectId +
  // defaultTargetUrl.
  const config = opts.projectIdOverride
    ? { projectId: opts.projectIdOverride, defaultTargetUrl: undefined as string | undefined }
    : (await loadRoveConfig(ws.rootDir)).config;

  const runId = randomUUID();
  const runDir = join(ws.reportsDir, "agentic-walks", runId);
  const screenshotsDir = join(runDir, "screenshots");
  const trajectoryLogPath = join(runDir, "trajectory.jsonl");
  await mkdir(screenshotsDir, { recursive: true });

  const baseTargetUrl =
    opts.targetUrl ??
    process.env.ROVE_TARGET_URL ??
    process.env.EVAL_TARGET_URL ??
    config.defaultTargetUrl;
  // Stamp project_id into the target URL so any dashboard-side queueing the
  // agent does (Generate, Run-walk) lands in the same tenant as this run.
  const targetUrl = baseTargetUrl ? withProjectParam(baseTargetUrl, config.projectId) : undefined;

  const prompt = buildWalkPrompt({
    flow,
    goal: opts.goal ?? flow.goal,
    persona,
    notes: opts.notes,
    workspacePath: ws.rootDir,
    authenticated: Boolean(authProfilePath),
    screenshotsDir,
    targetUrl,
    isolated,
  });

  if (opts.dryRun) {
    console.log(prompt);
    return 0;
  }

  const { commitSha, branch } = readGitContext(ws.rootDir);

  // Track B2 — if Supabase creds are available AND the supabase sink is
  // enabled, pre-create the run row and let the MCP proxy stream
  // per-step writes into it. The dashboard's filmstrip lights up in real
  // time. Without this, run_steps are batch-written by the sink at end.
  const liveStepWrites = await maybePrepareLiveStepWrites({
    runId,
    projectId: config.projectId,
    flowId: flow.flowId,
    personaId: persona.id,
    personaPolicy: persona.constraints.native_dialog_policy ?? "perceive_and_act",
    dispatcherId: opts.dispatcher,
    sinks: opts.sinks,
    commitSha,
    branch,
    startedAt: new Date(),
  });

  const dispatcher = createDispatcher(opts.dispatcher, {
    userDataDirPath: authProfilePath,
    isolation,
  });
  const preflight = await dispatcher.preflight();
  if (!preflight.ok) {
    console.error("Dispatcher preflight failed:");
    for (const c of preflight.checks) {
      if (c.status === "fail") {
        console.error(`  ✗ ${c.name}: ${c.detail ?? ""}`);
        if (c.remedy) console.error(`    fix: ${c.remedy}`);
      }
    }
    await maybeFailRun(runId, config.projectId, liveStepWrites, {
      error: "dispatcher preflight failed",
    });
    return 1;
  }

  const startedAt = new Date();
  console.error(`→ Dispatching walk via ${dispatcher.label}…`);
  const result = await dispatcher.dispatch({
    prompt,
    sessionName: `UX Walk · ${flow.flowId} / ${persona.id}`,
    maxBudgetUsd: opts.maxBudgetUsd,
    timeoutSeconds: opts.timeoutSeconds,
    cwd: ws.rootDir,
    trajectoryLogPath,
    screenshotsDir,
    liveStepWrites: liveStepWrites ?? undefined,
  });
  const finishedAt = new Date();

  // Even when the subprocess exits non-zero, the agent may have already
  // emitted a valid findings payload — the work product is the JSON, not
  // the exit code. We parse first and only fail-hard if both the exit code
  // is bad AND we can't recover findings from stdout. This unblocks the
  // dogfood pattern where Claude Code occasionally exits 1 after a
  // successful emission (post-emission cleanup hiccup, budget-cap nudge,
  // etc.) and we'd otherwise throw away real findings.
  const parsed = parseFindings(result.stdout);

  if (result.exitCode !== 0 && !parsed.ok) {
    console.error(`✗ Dispatcher exited with code ${result.exitCode}`);
    if (result.stderr.trim()) console.error(result.stderr.trim());
    await maybeFailRun(runId, config.projectId, liveStepWrites, {
      exitCode: result.exitCode,
      error: `dispatcher exited ${result.exitCode}; no parsable findings`,
    });
    return result.exitCode;
  }

  if (!parsed.ok) {
    console.error(`✗ Could not parse findings JSON: ${parsed.reason}`);
    if (parsed.detail) console.error(`  ${parsed.detail}`);
    console.error("--- agent stdout (tail) ---");
    console.error(result.stdout.slice(-2000));
    await maybeFailRun(runId, config.projectId, liveStepWrites, {
      exitCode: result.exitCode,
      error: `findings parse failed: ${parsed.reason}${parsed.detail ? ` — ${parsed.detail}` : ""}`,
    });
    return 1;
  }

  if (result.exitCode !== 0) {
    console.warn(
      `⚠ Dispatcher exited with code ${result.exitCode} but emitted valid findings — proceeding.`,
    );
  }

  const sinks = createSinks(opts.sinks, ws, config.projectId, {
    ghMinSeverity: opts.ghMinSeverity,
    ghDryRun: opts.ghDryRun,
  });
  const sinkResults = await routeToSinks(sinks, {
    payload: parsed.data,
    runId,
    dispatcherId: dispatcher.id,
    startedAt,
    finishedAt,
    rawStdout: result.stdout,
    screenshotsDir,
    trajectoryLogPath,
    commitSha,
    branch,
    liveStepsAlreadyWritten: liveStepWrites != null,
  });
  for (let i = 0; i < sinks.length; i++) {
    console.log(renderSinkResult(sinks[i].label, sinkResults[i]));
  }

  const total = parsed.data.findings.length;
  console.log(`✓ Walk complete · ${total} finding${total === 1 ? "" : "s"}`);
  return sinkResults.every((r) => r.ok) ? 0 : 1;
}

async function resolveFlow(ws: ResolvedWorkspace, flowId: string): Promise<FlowInfo | null> {
  const flows = await discoverFlows(ws.flowsDir);
  const match = flows.find((f) => f.flowId === flowId);
  if (!match) {
    console.error(`✗ Flow not found: ${flowId}`);
    console.error(`Available: ${flows.map((f) => f.flowId).join(", ") || "(none)"}`);
  }
  return match ?? null;
}

function resolvePersona(personaId: string): Persona | null {
  const match = BUILT_IN_PERSONAS.find((p) => p.id === personaId);
  if (!match) {
    console.error(`✗ Persona not found: ${personaId}`);
    console.error(`Available: ${BUILT_IN_PERSONAS.map((p) => p.id).join(", ")}`);
  }
  return match ?? null;
}

function readGitContext(cwd: string): { commitSha?: string; branch?: string } {
  const sha = git(cwd, ["rev-parse", "HEAD"]);
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return {
    commitSha: sha ?? undefined,
    branch: branch && branch !== "HEAD" ? branch : undefined,
  };
}

function git(cwd: string, args: string[]): string | null {
  const r = spawnSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}

/**
 * Pre-create the run row and return live-step credentials when Supabase
 * env vars are available AND the supabase sink is enabled. Returns null
 * to fall back to legacy batch-write behavior.
 *
 * The sink's createRun is now idempotent (upsert), so re-stamping the row
 * post-walk doesn't error.
 */
/**
 * Flip the pre-created run row to `failed` when run.ts bails before the
 * supabase sink would have done it. No-op when live writes weren't set up
 * (no supabase sink / no creds) — there's no run row to update.
 */
async function maybeFailRun(
  runId: string,
  projectId: string,
  liveStepWrites: { runId: string } | null | undefined,
  detail: { exitCode?: number; error?: string },
): Promise<void> {
  if (!liveStepWrites) return;
  try {
    const { getSupabaseClient } = await import("../supabase/client.js");
    const { SupabaseStore } = await import("../supabase/store.js");
    const store = new SupabaseStore(getSupabaseClient(), projectId);
    await store.failRun({
      runId,
      finishedAt: new Date(),
      exitCode: detail.exitCode,
      error: detail.error,
    });
  } catch (err) {
    console.error(
      `⚠ Could not mark run ${runId} failed (${(err as Error)?.message ?? err}). The job row is still terminal; the run row may show as running until the recovery sweep.`,
    );
  }
}

async function maybePrepareLiveStepWrites(input: {
  runId: string;
  projectId: string;
  flowId: string;
  personaId: string;
  personaPolicy: "perceive_and_act" | "perceive_blind" | "dismiss_silently";
  dispatcherId: DispatcherId;
  sinks: SinkId[];
  commitSha?: string;
  branch?: string;
  startedAt: Date;
}): Promise<{
  runId: string;
  projectId: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  personaId: string;
  personaPolicy: "perceive_and_act" | "perceive_blind" | "dismiss_silently";
} | null> {
  if (!input.sinks.includes("supabase")) return null;
  const { readRoveSupabaseEnv } = await import("../supabase/env.js");
  const env = readRoveSupabaseEnv();
  if (!env) return null;
  const { getSupabaseClient } = await import("../supabase/client.js");
  const { SupabaseStore } = await import("../supabase/store.js");
  const store = new SupabaseStore(getSupabaseClient(), input.projectId);
  try {
    await store.createRun({
      runId: input.runId,
      flowId: input.flowId,
      personaId: input.personaId,
      dispatcher: input.dispatcherId,
      commitSha: input.commitSha,
      branch: input.branch,
      startedAt: input.startedAt,
    });
  } catch (err) {
    console.error(
      `⚠ Could not pre-create run row for live writes (${(err as Error)?.message ?? err}). ` +
        `Falling back to post-walk batch sync.`,
    );
    return null;
  }
  return {
    runId: input.runId,
    projectId: input.projectId,
    supabaseUrl: env.url,
    supabaseServiceRoleKey: env.serviceRoleKey,
    personaId: input.personaId,
    personaPolicy: input.personaPolicy,
  };
}

/** Append `?p=<projectId>` to a target URL, preserving any existing query. */
function withProjectParam(targetUrl: string, projectId: string): string {
  try {
    const u = new URL(targetUrl);
    if (!u.searchParams.get("p")) u.searchParams.set("p", projectId);
    return u.toString().replace(/\/$/, "");
  } catch {
    const sep = targetUrl.includes("?") ? "&" : "?";
    return `${targetUrl}${sep}p=${encodeURIComponent(projectId)}`;
  }
}
