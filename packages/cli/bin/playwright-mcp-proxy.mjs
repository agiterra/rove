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
 *     [--live-persona-id <id> --live-persona-policy <policy>]
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
 *
 * Native dialogs — when @playwright/mcp surfaces a "Modal state" section in
 * a tool response, the proxy:
 *   1. Records the dialog as `dialog_payload` on the run_step that triggered it.
 *   2. Files a finding per persona policy (perceive_and_act / perceive_blind
 *      / dismiss_silently — set via --live-persona-policy).
 *   3. Issues an out-of-band browser_handle_dialog call to clear the dialog
 *      (action: dismiss, the safer default for confirm/prompt) and, for
 *      perceive_blind personas, strips the Modal state line from the
 *      response forwarded to the agent so the next call sees a responsive DOM.
 */

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFile, stat } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { rename } from "node:fs/promises";
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
// `--screenshots-dir` is the canonical per-walk screenshots directory.
// `--live-screenshots-dir` is kept as a legacy alias for older callers.
// The proxy uses this dir for two distinct jobs:
//   (a) Polling the newest png to upload as the run_step's screenshot_key
//       (live-step writes — only when supabase creds are also wired).
//   (b) Rewriting `browser_take_screenshot` filename args to absolute paths
//       under this dir so Playwright MCP's path-mangling can't drop the
//       file outside where the sink will look (any walk, any sink).
const screenshotsDir = pickOpt("--screenshots-dir") ?? pickOpt("--live-screenshots-dir");
const liveScreenshotsDir = screenshotsDir;
const livePersonaId = pickOpt("--live-persona-id");
const livePersonaPolicyRaw = pickOpt("--live-persona-policy");
const VALID_POLICIES = new Set(["perceive_and_act", "perceive_blind", "dismiss_silently"]);
const livePersonaPolicy = VALID_POLICIES.has(livePersonaPolicyRaw)
  ? livePersonaPolicyRaw
  : "perceive_and_act";
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
  return parsed;
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

// ── Out-of-band tools/call bookkeeping (for native-dialog handling) ────
// JSON-RPC ids the proxy issued itself. We swallow their responses instead
// of forwarding to the agent. Numbers in the 10_000_000+ range to stay
// clear of Claude's incrementing ids.
let proxyIdSeq = 10_000_000;
const proxyIssuedIds = new Set();

// ── browser_take_screenshot filename remap ─────────────────────────────
// Playwright MCP (≤0.0.75) does not honor --output-dir as the base for
// relative filenames passed via `arguments.filename`. With a basename it
// saves to MCP's cwd; with an absolute path it relativizes to many `../`
// segments and the file ends up nowhere findable. Both modes fail for us.
//
// Workaround: the proxy STRIPS arguments.filename on the way in (so MCP
// auto-names into --output-dir, which is the screenshotsDir we set). On
// the way out, we pick the newest png in screenshotsDir and rename it to
// the basename the agent asked for, and rewrite the response text so the
// agent sees the name it expects. End result: the file lands where the
// sink + finding references expect.
const intendedScreenshotByMessageId = new Map();

// ── AFFORDANCE_GAPS::injection bookkeeping ─────────────────────────────
// Per `docs/theses/negative-space.md`: the cognitive operation that
// converts negative space into positive tokens has to happen AT the page,
// not from end-of-walk recall. When `detectSubstantivePage` fires + this
// is the first arrival to that URL this walk, we tag the outbound tool
// response so `maybeRewriteOutLine` can append a per-page enumeration
// directive to the snapshot/navigate text the agent reads. The agent
// records gaps inline in its working memory and emits them — anchored to
// the current step_index — in the end-of-walk `affordance_gaps[]` array.
// Keyed by jsonrpc id; cleared after the rewrite.
const enumerationInjectByMessageId = new Map();

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

    const dialog = !isError ? parseModalState(extractText(result)) : null;
    const dialogPayload = dialog
      ? {
          type: dialog.type,
          message: dialog.message,
          default_value: dialog.defaultValue ?? "",
          default_action_taken: "dismiss",
          fired_at: finishedAt,
          dismissed_at: new Date().toISOString(),
          persona_perceived: livePersonaPolicy === "perceive_and_act",
        }
      : null;

    // ── AFFORDANCE-GAPS::detection (additive, 2026-05-14) ──────────────────
    // Substantive-page detection per docs/plans/affordance-gaps.md §1.
    // Only consult when no native dialog is pending — modal states gate the
    // page from the persona and would skew the node-count signal. Marker:
    // AFFORDANCE_GAPS_DETECTION_BLOCK_v1.
    const substantive =
      !dialog && !isError
        ? detectSubstantivePage({
            toolName: match.toolName,
            urlAfter,
            ariaSnapshot,
            result,
          })
        : null;
    const shouldEnumerate = substantive ? markUrlForEnumeration(substantive.url) : false;
    if (shouldEnumerate) {
      enumerationInjectByMessageId.set(id, {
        stepIndex: match.stepIndex,
        url: substantive.url,
      });
    }
    // ── END AFFORDANCE-GAPS::detection ─────────────────────────────────────

    const update = {
      direction: isError ? "error" : "result",
      result_summary: resultSummary,
      aria_snapshot: ariaSnapshot,
      url_after: urlAfter,
      duration_ms: Number.isFinite(durationMs) ? durationMs : null,
      ...(dialogPayload ? { dialog_payload: dialogPayload } : {}),
      ...(shouldEnumerate ? { affordance_enum_phase: true } : {}),
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
      if (dialogPayload) {
        try {
          await fileDialogFinding({ stepIndex: match.stepIndex, dialog });
        } catch (err) {
          process.stderr.write(`mcp-proxy: file dialog finding failed: ${err?.message ?? err}\n`);
        }
      }
    });
    inFlight.push(work);

    if (dialogPayload) {
      // Side-channel: dismiss the dialog so the agent's next tool call sees
      // a responsive page. Safer default is dismiss (don't auto-confirm a
      // destructive action even when papering over).
      issueDismissDialog();
    }
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

// ── Modal-state parsing ────────────────────────────────────────────────
// @playwright/mcp emits a "### Modal state" section when a native dialog is
// pending. Format:
//   ### Modal state
//   - ["confirm" dialog with message "Are you sure?"]: can be handled by browser_handle_dialog
//
// Returns `{ type, message, defaultValue }` or null when no dialog section.
const DIALOG_LINE_RE =
  /^- \["([a-z]+)" dialog(?: with message "((?:[^"\\]|\\.)*)")?(?: with default value "((?:[^"\\]|\\.)*)")?\]/m;
function parseModalState(text) {
  if (!text || typeof text !== "string") return null;
  const sectionIdx = text.indexOf("### Modal state");
  if (sectionIdx === -1) return null;
  const tail = text.slice(sectionIdx);
  const m = tail.match(DIALOG_LINE_RE);
  if (!m) return null;
  return {
    type: m[1],
    message: unescapeJsonish(m[2] ?? ""),
    defaultValue: unescapeJsonish(m[3] ?? ""),
  };
}

function unescapeJsonish(s) {
  return s.replace(/\\(.)/g, "$1");
}

// ── AFFORDANCE_GAPS_DETECTION_BLOCK_v1 (additive, 2026-05-14) ──────────────
// Substantive-page detection per docs/plans/affordance-gaps.md §1.
//
// A page qualifies for affordance enumeration when ALL of these hold:
//   1. The triggering tool is a navigate or snapshot (those carry the
//      signals we need); it is NOT a click/type with no URL change.
//   2. The response is non-error (the upstream caller has already gated
//      on isError before invoking this).
//   3. There is NO native dialog pending in the response (the caller
//      also pre-gates on `dialog`); transient pages whose only renderable
//      chrome is a modal don't count.
//   4. We can extract a URL (`urlAfter` from a navigate, or sniff the
//      `### Page state` block from a snapshot).
//   5. The URL pathname is not in the auth-route block list.
//   6. The aria-tree contains ≥20 node lines AND at least one structural
//      landmark (`main`, `region`, `article`, or `section` with aria-label).
// The throttling rule (only enumerate once per URL per walk) is enforced
// by `markUrlForEnumeration` — this function only decides "is this page
// substantive?" not "have we already done it?"

const AUTH_ROUTE_BLOCKLIST = [
  "/signin",
  "/auth/callback",
  "/install",
  "/api/install",
];

function detectSubstantivePage({ toolName, urlAfter, ariaSnapshot, result }) {
  if (toolName !== "browser_navigate" && !isSnapshotTool(toolName)) return null;
  // Prefer the explicit urlAfter (navigate); fall back to sniffing the
  // snapshot text for a "### Page state\n- Page URL: …" line. Playwright
  // MCP emits that block on every snapshot.
  let url = urlAfter;
  const text = ariaSnapshot ?? extractText(result);
  if (!url && text) url = sniffPageUrl(text);
  if (!url) return null;
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.startsWith("/") ? url : null;
  }
  if (!path) return null;
  if (isAuthRoute(path)) return null;
  if (!text) return null;
  if (!ariaTreeIsSubstantive(text)) return null;
  return { url, path };
}

function isAuthRoute(pathname) {
  for (const prefix of AUTH_ROUTE_BLOCKLIST) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
  }
  return false;
}

function sniffPageUrl(text) {
  const m = text.match(/^- Page URL:\s*(\S+)/m);
  return m ? m[1] : null;
}

function ariaTreeIsSubstantive(text) {
  // Count list-bullet lines that look like aria nodes (`- role …`). This is
  // a conservative proxy for tree size; we under-count by ignoring inline
  // nodes, which is fine — we only need a yes/no on the 20-node threshold.
  const nodeLines = text.split(/\n/).filter((l) => /^\s*-\s+[a-z]+/i.test(l));
  if (nodeLines.length < 20) return false;
  // At least one landmark must be present. The aria-tree text from
  // Playwright MCP renders landmarks as lines like `- main`, `- region`,
  // `- region "Walk overview"`, etc.
  const hasLandmark = nodeLines.some((l) =>
    /^\s*-\s+(main\b|region\b|article\b|section\b)/i.test(l),
  );
  return hasLandmark;
}

const enumeratedUrls = new Set();
function markUrlForEnumeration(url) {
  if (enumeratedUrls.has(url)) return false;
  enumeratedUrls.add(url);
  return true;
}
// ── END AFFORDANCE_GAPS_DETECTION_BLOCK_v1 ────────────────────────────────

// Strip the "### Modal state" section from a response text so the agent
// doesn't see it (used for perceive_blind / dismiss_silently policies).
// Sections are separated by blank lines in the MCP text payload.
function stripModalStateSection(text) {
  if (!text || typeof text !== "string") return text;
  const idx = text.indexOf("### Modal state");
  if (idx === -1) return text;
  // find end of section — next "### " heading or end-of-text
  let end = text.indexOf("\n### ", idx + 1);
  if (end === -1) end = text.length;
  return (text.slice(0, idx) + text.slice(end)).replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
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

async function fileDialogFinding({ stepIndex, dialog }) {
  if (livePersonaPolicy === "dismiss_silently") return;
  const destructive = dialog.type === "confirm" || dialog.type === "beforeunload";
  let heuristic;
  let severity;
  let title;
  let description;
  if (livePersonaPolicy === "perceive_blind") {
    heuristic = "agent.accessibility_tree_completeness";
    severity = destructive ? "critical" : "major";
    title = `Native ${dialog.type}() blocks agent — no DOM-perceivable equivalent`;
    description =
      `A native ${dialog.type}() dialog fired with message "${dialog.message}". A real agent ` +
      `runtime cannot perceive browser-native chrome — this action is invisible to it and ` +
      `the page is blocked until the dialog is handled. Surface this control as an in-page ` +
      `modal with a proper aria-role so the agent's accessibility tree includes it.`;
  } else {
    // perceive_and_act: file only when destructive (Nielsen "user control and freedom").
    if (!destructive) return;
    heuristic = "nielsen-5";
    severity = "major";
    title = `Native ${dialog.type}() used for destructive action`;
    description =
      `A native ${dialog.type}() dialog fired with message "${dialog.message}". Native dialogs ` +
      `lack a clear undo path and can't be styled or audited. Use an in-page confirm modal ` +
      `with an explicit Cancel default and (where the action is irreversible) an undo affordance.`;
  }
  // Best-effort: write directly to findings. We don't know the run's
  // findings schema in v1 — guard with a try/catch above.
  await sb("POST", "findings", {
    run_id: liveRunId,
    project_id: liveProjectId,
    severity,
    title,
    description,
    step_index: stepIndex,
    heuristic,
    evidence: `Dialog type=${dialog.type}, message="${dialog.message}", persona=${livePersonaId ?? "unknown"}, policy=${livePersonaPolicy}`,
  });
}

function issueDismissDialog() {
  const id = ++proxyIdSeq;
  proxyIssuedIds.add(id);
  const rpc = {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: "browser_handle_dialog", arguments: { accept: false } },
  };
  try {
    child.stdin.write(JSON.stringify(rpc) + "\n");
  } catch (err) {
    process.stderr.write(`mcp-proxy: dismiss-dialog write failed: ${err?.message ?? err}\n`);
  }
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
    if (line.length === 0) {
      child.stdin.write("\n");
      continue;
    }
    const parsed = logLine("in", line);
    const rewritten = maybeRewriteInLine(parsed, line);
    child.stdin.write(rewritten + "\n");
  }
});
process.stdin.on("end", () => {
  if (inBuf.length > 0) logLine("in", inBuf);
  child.stdin.end();
});

// child stdout → parent stdout. Line-buffered: we may rewrite a tool-call
// response (strip modal state for blind personas) or suppress a proxy-issued
// response (browser_handle_dialog we sent out-of-band).
let outBuf = "";
child.stdout.on("data", (chunk) => {
  const s = chunk.toString("utf8");
  outBuf += s;
  let nl;
  while ((nl = outBuf.indexOf("\n")) !== -1) {
    const line = outBuf.slice(0, nl);
    outBuf = outBuf.slice(nl + 1);
    if (line.length === 0) continue;
    const parsed = logLine("out", line);
    if (parsed && typeof parsed === "object" && proxyIssuedIds.has(parsed.id)) {
      proxyIssuedIds.delete(parsed.id);
      continue;
    }
    // browser_take_screenshot response: rename the auto-named file to
    // the basename the agent asked for, and rewrite the result text to
    // reference that basename so the agent sees the name it expects.
    const intended =
      parsed && typeof parsed === "object" ? intendedScreenshotByMessageId.get(parsed.id) : null;
    if (intended) {
      intendedScreenshotByMessageId.delete(parsed.id);
      const isErrorOut = parsed.error !== undefined;
      if (!isErrorOut) {
        const renameWork = renameAutoNamedScreenshot(intended, Date.now() - 60_000)
          .catch((err) => {
            process.stderr.write(`mcp-proxy: rename screenshot failed: ${err?.message ?? err}\n`);
            return null;
          });
        inFlight.push(renameWork);
        const rewritten = rewriteTakeScreenshotResultText(parsed, intended);
        process.stdout.write(JSON.stringify(rewritten) + "\n");
        continue;
      }
    }
    const outLine = maybeRewriteOutLine(parsed, line);
    process.stdout.write(outLine + "\n");
  }
});

function rewriteTakeScreenshotResultText(parsed, intendedBasename) {
  const result = parsed.result;
  if (!result || !Array.isArray(result.content)) return parsed;
  const dest = intendedBasename.toLowerCase().endsWith(".png")
    ? intendedBasename
    : `${intendedBasename}.png`;
  const newContent = result.content.map((c) => {
    if (!c || c.type !== "text" || typeof c.text !== "string") return c;
    // MCP's response text references the auto-named path in a markdown
    // link + a `path: '...'` comment. Replace any *.png reference with
    // our intended basename so the agent doesn't get confused.
    const text = c.text.replace(/[^\s'"`()\[\]]*\.png/gi, `./${dest}`);
    return text === c.text ? c : { ...c, text };
  });
  return { ...parsed, result: { ...result, content: newContent } };
}

function maybeRewriteInLine(parsed, fallbackLine) {
  if (!parsed || typeof parsed !== "object") return fallbackLine;
  if (parsed.method !== "tools/call") return fallbackLine;
  const params = parsed.params ?? {};
  if (params.name !== "browser_take_screenshot") return fallbackLine;
  const args = params.arguments ?? null;
  if (!args || typeof args !== "object") return fallbackLine;
  const raw = typeof args.filename === "string" ? args.filename : null;
  if (!raw) return fallbackLine;
  if (!screenshotsDir) return fallbackLine;
  // Record what the agent INTENDED to name this; strip the arg so MCP
  // auto-names into --output-dir (= screenshotsDir). The OUT handler
  // will rename the auto-named file to the intended basename and rewrite
  // the response text so the agent sees the name it asked for.
  const intended = basename(raw);
  intendedScreenshotByMessageId.set(parsed.id, intended);
  const newArgs = { ...args };
  delete newArgs.filename;
  const rewritten = {
    ...parsed,
    params: { ...params, arguments: newArgs },
  };
  return JSON.stringify(rewritten);
}

async function renameAutoNamedScreenshot(intended, sinceMs) {
  if (!screenshotsDir) return null;
  const file = await pickFreshScreenshot(screenshotsDir, sinceMs);
  if (!file) return null;
  const destBasename = intended.toLowerCase().endsWith(".png") ? intended : `${intended}.png`;
  const dest = join(screenshotsDir, destBasename);
  if (file === dest) return destBasename;
  try {
    await rename(file, dest);
    return destBasename;
  } catch (err) {
    process.stderr.write(
      `mcp-proxy: rename screenshot ${file} → ${dest} failed: ${err?.message ?? err}\n`,
    );
    return null;
  }
}

function maybeRewriteOutLine(parsed, fallbackLine) {
  if (!parsed || typeof parsed !== "object") return fallbackLine;
  const result = parsed.result;
  if (!result || typeof result !== "object" || !Array.isArray(result.content)) {
    return fallbackLine;
  }

  const stripModal = livePersonaPolicy !== "perceive_and_act";
  const enumDirective = enumerationInjectByMessageId.get(parsed.id);
  if (!stripModal && !enumDirective) return fallbackLine;

  let mutated = false;
  let directiveApplied = false;
  const newContent = result.content.map((c) => {
    if (!c || c.type !== "text" || typeof c.text !== "string") return c;
    let text = c.text;
    if (stripModal && text.includes("### Modal state")) {
      text = stripModalStateSection(text);
      mutated = true;
    }
    if (enumDirective && !directiveApplied) {
      text = appendEnumerationDirective(text, enumDirective);
      mutated = true;
      directiveApplied = true;
    }
    return text === c.text ? c : { ...c, text };
  });

  if (enumDirective) enumerationInjectByMessageId.delete(parsed.id);
  if (!mutated) return fallbackLine;
  return JSON.stringify({ ...parsed, result: { ...result, content: newContent } });
}

/**
 * Per `docs/theses/negative-space.md`: convert negative space into positive
 * tokens AT the page. Appended to the playwright tool-result text the agent
 * receives on first arrival to a substantive page. The directive instructs
 * the walker to perform the enumeration here-and-now and to record absences
 * in the end-of-walk findings JSON with `step_index` anchored to this step.
 */
function appendEnumerationDirective(text, { stepIndex, url }) {
  const directive = [
    "",
    "─────────────────────────────────────────────────────────────",
    "[Rove · negative-space enumeration]",
    `First arrival this walk to a substantive page (${url}). Before your`,
    "next browser_* call, perform a per-page negative-space enumeration:",
    "",
    "As your persona pursuing the walk's goal, enumerate the affordances",
    "a user would expect to be able to do HERE. Consider each kind only",
    "to the extent it applies: create, read, update, delete, undo, recover,",
    "navigate, status, confirm, save_state, empty, error.",
    "",
    "For every kind that is ABSENT from this page, add one entry to the",
    `final \`affordance_gaps[]\` array in your end-of-walk findings JSON,`,
    `with \`step_index: ${stepIndex}\` so it anchors to this exact arrival.`,
    "Matches are silent — only record the gaps you find.",
    "",
    "Then resume your task.",
    "─────────────────────────────────────────────────────────────",
  ].join("\n");
  return text + directive;
}

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
  if (outBuf.length > 0) {
    const parsed = logLine("out", outBuf);
    if (!(parsed && typeof parsed === "object" && proxyIssuedIds.has(parsed.id))) {
      const outLine = maybeRewriteOutLine(parsed, outBuf);
      process.stdout.write(outLine + "\n");
    }
  }
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
