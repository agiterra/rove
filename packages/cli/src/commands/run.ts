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
}

export async function runRunCommand(ws: ResolvedWorkspace, opts: RunOptions): Promise<number> {
  const flow = await resolveFlow(ws, opts.flowId);
  if (!flow) return 1;
  const persona = resolvePersona(opts.personaId);
  if (!persona) return 1;

  let authProfilePath: string | undefined;
  if (opts.authenticated) {
    const role = roleForPersonaCategory(persona.category);
    const candidate = userDataDir(role);
    if (existsSync(candidate)) {
      authProfilePath = candidate;
    } else {
      console.error(
        `✗ No auth profile for role=${role} at ${candidate}. Run \`rove auth-setup --role ${role}\` first, ` +
          `or pass --no-auth to walk anonymously.`,
      );
      return 1;
    }
  }

  const runId = randomUUID();
  const screenshotsDir = join(ws.reportsDir, "agentic-walks", runId, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });

  const prompt = buildWalkPrompt({
    flow,
    goal: opts.goal ?? flow.goal,
    persona,
    notes: opts.notes,
    workspacePath: ws.rootDir,
    authenticated: Boolean(authProfilePath),
    screenshotsDir,
    targetUrl: opts.targetUrl ?? process.env.EVAL_TARGET_URL,
  });

  if (opts.dryRun) {
    console.log(prompt);
    return 0;
  }

  const { commitSha, branch } = readGitContext(ws.rootDir);

  const dispatcher = createDispatcher(opts.dispatcher, { userDataDirPath: authProfilePath });
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
  console.error(`→ Dispatching walk via ${dispatcher.label}…`);
  const result = await dispatcher.dispatch({
    prompt,
    sessionName: `UX Walk · ${flow.flowId} / ${persona.id}`,
    maxBudgetUsd: opts.maxBudgetUsd,
    timeoutSeconds: opts.timeoutSeconds,
    cwd: ws.rootDir,
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

  const { config } = await loadRoveConfig(ws.rootDir);
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
    commitSha,
    branch,
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
