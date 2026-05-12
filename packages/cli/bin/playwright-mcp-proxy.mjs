#!/usr/bin/env node
/**
 * Playwright MCP proxy — fronts @playwright/mcp over stdio and tees every
 * JSON-RPC message to a per-walk JSONL log. The dispatcher writes its MCP
 * config to point at this script; Claude (the parent) speaks to it as if
 * it were @playwright/mcp directly.
 *
 * Invocation (set in the dispatcher's MCP config):
 *   node playwright-mcp-proxy.mjs --log <path> -- <forwarded args>
 *
 * Forwarded args are passed verbatim to `npx -y @playwright/mcp@latest`.
 *
 * The log is newline-delimited JSON. Each line:
 *   { "t": "<iso>", "dir": "in" | "out" | "err", "raw": <parsed JSON or string> }
 *
 * "in" = parent → child (Claude calling a tool)
 * "out" = child → parent (MCP server responding)
 * "err" = stderr line from the child process (debug only)
 */

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const dashIdx = argv.indexOf("--");
const proxyArgs = dashIdx === -1 ? argv : argv.slice(0, dashIdx);
const forwardArgs = dashIdx === -1 ? [] : argv.slice(dashIdx + 1);

const logIdx = proxyArgs.indexOf("--log");
if (logIdx === -1 || logIdx === proxyArgs.length - 1) {
  process.stderr.write("playwright-mcp-proxy: missing --log <path>\n");
  process.exit(2);
}
const logPath = proxyArgs[logIdx + 1];

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
}

// Resolve @playwright/mcp from rove-cli's own node_modules so we don't pay
// the npx cold-start cost (network + cache miss) on every walk. The package
// only exports its main entry, so we go via package.json + the declared bin.
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
  logStream.end(() => process.exit(code ?? 0));
});

child.on("error", (err) => {
  logLine("err", `proxy child spawn error: ${err.message}`);
  logStream.end(() => process.exit(1));
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
