#!/usr/bin/env node
/**
 * Playwright MCP proxy — fronts @playwright/mcp over stdio and tees every
 * JSON-RPC message to a per-walk JSONL log. The dispatcher writes its MCP
 * config to point at this script; Claude (the parent) speaks to it as if
 * it were @playwright/mcp directly.
 *
 * Invocation (set in the dispatcher's MCP config):
 *   node playwright-mcp-proxy.mjs --log <path>
 *     [--live-run-id <uuid> --live-project-id <slug> --live-screenshots-dir <path>]
 *     -- <forwarded args>
 *
 * Forwarded args are passed verbatim to the bundled `@playwright/mcp` CLI.
 *
 * The log is newline-delimited JSON. Each line:
 *   { "t": "<iso>", "dir": "in" | "out" | "err", "raw": <parsed JSON or string> }
 *
 * "in" = parent → child (Claude calling a tool)
 * "out" = child → parent (MCP server responding)
 * "err" = stderr line from the child process (debug only)
 *
 * Track B2 — when --live-run-id is supplied AND
 * ROVE_SUPABASE_URL / ROVE_SUPABASE_SERVICE_ROLE_KEY are set, every tools/call
 * round-trip is also written to `run_steps` in real time (insert at request,
 * update at response). Screenshots are uploaded to the walks bucket as soon
 * as the local file appears under --live-screenshots-dir.
 */

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFile, stat } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const readFileP = promisify(readFile);
const statP = promisify(stat);

const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const dashIdx = argv.indexOf("--");
const proxyArgs = dashIdx === -1 ? argv : argv.slice(0, dashIdx);
const forwardArgs = dashIdx === -1 ? [] : argv.slice(dashIdx + 1);

function pickOpt(name) {
  const idx = proxyArgs.indexOf(name);
  if (idx === -1 || idx === proxyArgs.length - 1) return null;
  const v = proxyArgs[idx + 1];
  return v && v.length > 0 ? v : null;
}

const logPath = pickOpt("--log");
if (!logPath) {
  process.stderr.write("playwright-mcp-proxy: missing --log <path>\n");
  process.exit(2);
}

const liveRunId = pickOpt("--live-run-id");
const liveProjectId = pickOpt("--live-project-id");
const liveScreenshotsDir = pickOpt("--live-screenshots-dir");
const liveSupabaseUrl = process.env.ROVE_SUPABASE_URL ?? null;
const liveSupabaseKey = process.env.ROVE_SUPABASE_SERVICE_ROLE_KEY ?? null;
const liveEnabled = !!(liveRunId && liveProjectId && liveSupabaseUrl && liveSupabaseKey);

mkdirSync(dirname(logPath), { recursive: true });
const logStream = createWriteStream(logPath, { flags: "a" });

function logLine(dir, raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // not JSON — keep as string
    }
  }
  logStream.write(JSON.stringify({ t: new Date().toISOString(), dir, raw: parsed }) + "\n");
  if (liveEnabled) onJsonRpc(dir, parsed);
}

// ── Track B2 live-step writes ───────────────────────────────────────────
// For each jsonrpc id we keep:
//   - rowIdPromise: resolves to the Supabase-generated run_steps.id once
//     the INSERT round-trip completes. The response handler awaits this
//     before issuing its PATCH, which fixes the race where the MCP server
//     responds faster than the insert returns.
//   - meta: toolName, args, startedAt, stepIndex.

const pending = new Map();
let stepCounter = 0;
const inFlight = []; // bookkeeping for graceful shutdown

function onJsonRpc(dir, msg) {
  if (!msg || typeof msg !== "object") return;
  if (dir === "in") {
    if (msg.method !== "tools/call") return;
    const id = msg.id;
    if (id === undefined || id === null) return;
    const params = msg.params ?? {};
    const toolName = typeof params.name === "string" ? params.name : null;
    if (!toolName) return;
    stepCounter += 1;
    const stepIndex = stepCounter;
    const startedAt = new Date().toISOString();
    const args = params.arguments ?? null;
    const rowIdPromise = insertCallRow({ stepIndex, toolName, args }).catch((err) => {
      process.stderr.write(`mcp-proxy: insert run_step failed: ${err?.message ?? err}\n`);
      return null;
    });
    pending.set(id, { rowIdPromise, toolName, args, startedAt, stepIndex });
    return;
  }
  if (dir === "out") {
    const id = msg.id;
    if (id === undefined || id === null) return;
    const match = pending.get(id);
    if (!match) return;
    pending.delete(id);
    const finishedAt = new Date().toISOString();
    const durationMs = Date.parse(finishedAt) - Date.parse(match.startedAt);
    const isError = msg.error !== undefined;
    const result = msg.result;
    const resultSummary = summarizeResult(match.toolName, isError ? msg.error : result);
    const ariaSnapshot = isSnapshotTool(match.toolName) ? extractText(result) : null;
    const urlAfter = match.toolName === "browser_navigate" && match.args?.url ? String(match.args.url) : null;

    const update = {
      direction: isError ? "error" : "result",
      result_summary: resultSummary,
      aria_snapshot: ariaSnapshot,
      url_after: urlAfter,
      duration_ms: Number.isFinite(durationMs) ? durationMs : null,
    };

    const work = match.rowIdPromise.then(async (rowId) => {
      if (!rowId) return;
      try {
        await updateRow(rowId, update);
      } catch (err) {
        process.stderr.write(`mcp-proxy: update run_step failed: ${err?.message ?? err}\n`);
      }
      if (match.toolName === "browser_take_screenshot" && !isError) {
        try {
          await uploadScreenshotForStep({ ...match, rowId });
        } catch (err) {
          process.stderr.write(`mcp-proxy: screenshot upload failed: ${err?.message ?? err}\n`);
        }
      }
    });
    inFlight.push(work);
  }
}

const SNAPSHOT_TOOLS = new Set(["browser_snapshot", "browser_take_snapshot"]);
function isSnapshotTool(name) {
  return SNAPSHOT_TOOLS.has(name);
}
function extractText(result) {
  if (!result || typeof result !== "object") return null;
  const content = result.content;
  if (!Array.isArray(content)) return null;
  const text = content.find((c) => c && c.type === "text")?.text;
  return typeof text === "string" ? text : null;
}
function summarizeResult(toolName, payload) {
  if (!payload) return null;
  if (payload.message && typeof payload.message === "string") return payload.message;
  const text = extractText(payload);
  if (!text) return null;
  if (isSnapshotTool(toolName)) return `${text.length.toLocaleString()} chars`;
  return text.length > 140 ? text.slice(0, 137) + "…" : text;
}

async function sb(method, path, body) {
  const url = `${liveSupabaseUrl}/rest/v1/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: liveSupabaseKey,
      Authorization: `Bearer ${liveSupabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`supabase ${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function insertCallRow({ stepIndex, toolName, args }) {
  // `started_at` isn't a column on run_steps (use created_at default).
  const rows = await sb("POST", "run_steps", {
    run_id: liveRunId,
    project_id: liveProjectId,
    step_index: stepIndex,
    direction: "call",
    tool_name: toolName,
    args,
  });
  return rows?.[0]?.id ?? null;
}

async function updateRow(rowId, patch) {
  await sb("PATCH", `run_steps?id=eq.${encodeURIComponent(rowId)}`, patch);
}

async function uploadScreenshotForStep(match) {
  if (!liveScreenshotsDir) return;
  // Playwright MCP writes screenshots into --output-dir with deterministic
  // names; we don't know the exact filename it picked, so we poll the dir
  // and pick the newest .png/.jpg file. Best-effort — if multiple are
  // created simultaneously, the proxy still picks the most recent.
  const file = await pickFreshScreenshot(liveScreenshotsDir, Date.parse(match.startedAt) - 1500);
  if (!file) return;
  const buf = await readFileP(file);
  const ext = file.toLowerCase().endsWith(".jpg") ? "jpg" : "png";
  const storageKey = `runs/${liveRunId}/step-${String(match.stepIndex).padStart(3, "0")}.${ext}`;
  const url = `${liveSupabaseUrl}/storage/v1/object/walks/${storageKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: liveSupabaseKey,
      Authorization: `Bearer ${liveSupabaseKey}`,
      "Content-Type": ext === "jpg" ? "image/jpeg" : "image/png",
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`storage upload: ${res.status} ${text.slice(0, 200)}`);
  }
  await updateRow(match.rowId, { screenshot_key: storageKey });
}

async function pickFreshScreenshot(dir, sinceMs) {
  const { readdir } = await import("node:fs/promises");
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const candidates = [];
  for (const name of entries) {
    if (!/\.(png|jpe?g)$/i.test(name)) continue;
    const full = join(dir, name);
    try {
      const s = await statP(full);
      if (s.mtimeMs >= sinceMs) candidates.push({ full, mtimeMs: s.mtimeMs });
    } catch {
      // skip
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.full ?? null;
}

// ── child process plumbing ─────────────────────────────────────────────

let mcpCliPath;
try {
  const pkgJsonPath = require.resolve("@playwright/mcp/package.json");
  mcpCliPath = join(dirname(pkgJsonPath), "cli.js");
} catch (err) {
  process.stderr.write(
    `playwright-mcp-proxy: could not resolve @playwright/mcp — make sure it's installed alongside @agiterra/rove-cli (${err?.message ?? err}).\n`,
  );
  process.exit(2);
}
const child = spawn(process.execPath, [mcpCliPath, ...forwardArgs], {
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});

// parent stdin → child stdin, tee to log
let inBuf = "";
process.stdin.on("data", (chunk) => {
  const s = chunk.toString("utf8");
  inBuf += s;
  let nl;
  while ((nl = inBuf.indexOf("\n")) !== -1) {
    const line = inBuf.slice(0, nl);
    inBuf = inBuf.slice(nl + 1);
    if (line.length > 0) logLine("in", line);
  }
  child.stdin.write(chunk);
});
process.stdin.on("end", () => {
  if (inBuf.length > 0) logLine("in", inBuf);
  child.stdin.end();
});

// child stdout → parent stdout, tee to log
let outBuf = "";
child.stdout.on("data", (chunk) => {
  const s = chunk.toString("utf8");
  outBuf += s;
  let nl;
  while ((nl = outBuf.indexOf("\n")) !== -1) {
    const line = outBuf.slice(0, nl);
    outBuf = outBuf.slice(nl + 1);
    if (line.length > 0) logLine("out", line);
  }
  process.stdout.write(chunk);
});

// child stderr → parent stderr, log lines for debugging
let errBuf = "";
child.stderr.on("data", (chunk) => {
  const s = chunk.toString("utf8");
  errBuf += s;
  let nl;
  while ((nl = errBuf.indexOf("\n")) !== -1) {
    const line = errBuf.slice(0, nl);
    errBuf = errBuf.slice(nl + 1);
    if (line.length > 0) logLine("err", line);
  }
  process.stderr.write(chunk);
});

child.on("close", (code) => {
  if (outBuf.length > 0) logLine("out", outBuf);
  if (errBuf.length > 0) logLine("err", errBuf);
  // Best-effort drain of in-flight PATCH + screenshot uploads.
  Promise.allSettled(inFlight).finally(() => {
    logStream.end(() => process.exit(code ?? 0));
  });
});

child.on("error", (err) => {
  logLine("err", `proxy child spawn error: ${err.message}`);
  logStream.end(() => process.exit(1));
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
