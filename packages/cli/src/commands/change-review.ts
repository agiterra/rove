/**
 * `rove change-review` — walks a changed route under a local design
 * contract inferred from neighboring reference routes. Reports coherence,
 * intent, and navigation deltas as findings with the `change.*` heuristic
 * prefix. Reuses the rest of the dispatch + sink pipeline.
 */
import {
  BUILT_IN_PERSONAS,
  buildChangeReviewPrompt,
  parseFindings,
  type Persona,
} from "@agiterra/rove-core";
import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadRoveConfig } from "../config.js";
import { createDispatcher, createSinks, type DispatcherId, type SinkId } from "../factories.js";
import { renderSinkResult, routeToSinks } from "../sinks/route.js";
import type { ResolvedWorkspace } from "../workspace.js";

export interface ChangeReviewOptions {
  changedRoutes: string[];
  referenceRoutes: string[];
  goal: string;
  personaId: string;
  notes?: string;
  targetUrl?: string;
  dryRun: boolean;
  maxBudgetUsd: number;
  timeoutSeconds: number;
  dispatcher: DispatcherId;
  sinks: SinkId[];
}

export async function runChangeReviewCommand(
  ws: ResolvedWorkspace,
  opts: ChangeReviewOptions,
): Promise<number> {
  if (opts.changedRoutes.length === 0) {
    console.error("✗ At least one --changed-route is required.");
    return 1;
  }

  const persona = resolvePersona(opts.personaId);
  if (!persona) return 1;

  // Reviewer always runs clean-room — no source-context, fresh session.
  // This is a stricter requirement than agent-persona walks (§16.5 #1).
  const isolation = "clean-room" as const;

  const { config } = await loadRoveConfig(ws.rootDir);
  const targetUrl =
    opts.targetUrl ??
    process.env.ROVE_TARGET_URL ??
    process.env.EVAL_TARGET_URL ??
    config.defaultTargetUrl ??
    "http://localhost:3000";

  const referenceRoutes =
    opts.referenceRoutes.length > 0 ? opts.referenceRoutes : defaultReferences(opts.changedRoutes);

  const runId = randomUUID();
  const runDir = join(ws.reportsDir, "agentic-walks", runId);
  const screenshotsDir = join(runDir, "screenshots");
  const trajectoryLogPath = join(runDir, "trajectory.jsonl");
  await mkdir(screenshotsDir, { recursive: true });

  const prompt = buildChangeReviewPrompt({
    changedRoutes: opts.changedRoutes,
    referenceRoutes,
    goal: opts.goal,
    persona,
    targetUrl,
    notes: opts.notes,
    screenshotsDir,
    isolated: true,
  });

  if (opts.dryRun) {
    console.log(prompt);
    return 0;
  }

  const { commitSha, branch } = readGitContext(ws.rootDir);

  const dispatcher = createDispatcher(opts.dispatcher, { isolation });
  const preflight = await dispatcher.preflight();
  if (!preflight.ok) {
    console.error("Dispatcher preflight failed:");
    for (const c of preflight.checks) {
      if (c.status === "fail") {
        console.error(`  ✗ ${c.name}: ${c.detail ?? ""}`);
        if (c.remedy) console.error(`    fix: ${c.remedy}`);
      }
    }
    return 1;
  }

  const startedAt = new Date();
  console.error(`→ Dispatching change-review walk via ${dispatcher.label}…`);
  const result = await dispatcher.dispatch({
    prompt,
    sessionName: `Change Review · ${opts.changedRoutes.join(",")} / ${persona.id}`,
    maxBudgetUsd: opts.maxBudgetUsd,
    timeoutSeconds: opts.timeoutSeconds,
    cwd: ws.rootDir,
    trajectoryLogPath,
    screenshotsDir,
  });
  const finishedAt = new Date();

  if (result.exitCode !== 0) {
    console.error(`✗ Dispatcher exited with code ${result.exitCode}`);
    if (result.stderr.trim()) console.error(result.stderr.trim());
    return result.exitCode === 0 ? 1 : result.exitCode;
  }

  const parsed = parseFindings(result.stdout);
  if (!parsed.ok) {
    console.error(`✗ Could not parse findings JSON: ${parsed.reason}`);
    if (parsed.detail) console.error(`  ${parsed.detail}`);
    console.error("--- agent stdout (tail) ---");
    console.error(result.stdout.slice(-2000));
    return 1;
  }

  const sinks = createSinks(opts.sinks, ws, config.projectId);
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
    kind: "change_review",
  });
  for (let i = 0; i < sinks.length; i++) {
    console.log(renderSinkResult(sinks[i].label, sinkResults[i]));
  }

  const deltas = parsed.data.change_review?.deltas ?? [];
  const findings = parsed.data.findings.length;
  console.log(
    `✓ Change review complete · ${deltas.length} delta${deltas.length === 1 ? "" : "s"} · ${findings} finding${findings === 1 ? "" : "s"}`,
  );
  return sinkResults.every((r) => r.ok) ? 0 : 1;
}

function resolvePersona(personaId: string): Persona | null {
  const match = BUILT_IN_PERSONAS.find((p) => p.id === personaId);
  if (!match) {
    console.error(`✗ Persona not found: ${personaId}`);
    console.error(`Available: ${BUILT_IN_PERSONAS.map((p) => p.id).join(", ")}`);
  }
  return match ?? null;
}

/**
 * Derive a sensible default reference list when the caller didn't supply
 * one. Heuristic: the parent path of each changed route (e.g. `/clients`
 * for `/clients/new`). Deduplicated, falsy-stripped.
 */
function defaultReferences(changedRoutes: string[]): string[] {
  const out = new Set<string>();
  for (const r of changedRoutes) {
    const parent = r.replace(/\/[^/]+\/?$/, "");
    if (parent && parent !== r) out.add(parent);
  }
  return Array.from(out);
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
