import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { marked } from "marked";
import type { ResolvedWorkspace } from "../workspace.js";

export interface UiOptions {
  port: number;
  /** When true, attempt to open the URL in the default browser. Default true. */
  open: boolean;
}

const REPORTS_SUBDIR = "agentic-walks";

interface ReportSummary {
  filename: string;
  title: string;
  startedAt: string | null;
  persona: string | null;
  dispatcher: string | null;
  findingCount: number | null;
}

export async function runUiCommand(ws: ResolvedWorkspace, opts: UiOptions): Promise<number> {
  const reportsDir = join(ws.reportsDir, REPORTS_SUBDIR);
  if (!existsSync(reportsDir)) {
    console.error(`✗ No reports directory at ${reportsDir}. Run a walk first.`);
    return 1;
  }

  const server = createServer((req, res) => {
    handle(req, res, reportsDir).catch((err) => {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain");
      res.end(`internal error: ${err instanceof Error ? err.message : String(err)}`);
    });
  });

  return new Promise<number>((resolve) => {
    server.listen(opts.port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${opts.port}`;
      console.log(`✓ rove ui serving ${reportsDir}`);
      console.log(`  Open ${url}  (Ctrl-C to stop)`);
      if (opts.open) openInBrowser(url);
    });
    server.on("error", (err) => {
      console.error(`✗ Server error: ${err.message}`);
      resolve(1);
    });
    process.on("SIGINT", () => {
      console.log("\n→ Shutting down ui server");
      server.close(() => resolve(0));
    });
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  reportsDir: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const reports = await listReports(reportsDir);
    return sendHtml(res, renderIndexPage(reports));
  }
  if (url.pathname.startsWith("/report/")) {
    const filename = decodeURIComponent(url.pathname.replace(/^\/report\//, ""));
    if (!filename.endsWith(".md") || filename.includes("..") || filename.includes("/")) {
      return send404(res);
    }
    const filePath = join(reportsDir, filename);
    if (!existsSync(filePath)) return send404(res);
    const md = await readFile(filePath, "utf8");
    const html = await marked.parse(md);
    return sendHtml(res, renderReportPage(filename, html));
  }
  send404(res);
}

async function listReports(reportsDir: string): Promise<ReportSummary[]> {
  const entries = await readdir(reportsDir);
  const summaries: ReportSummary[] = [];
  for (const filename of entries) {
    if (extname(filename) !== ".md") continue;
    const stats = await stat(join(reportsDir, filename));
    if (!stats.isFile()) continue;
    const content = await readFile(join(reportsDir, filename), "utf8");
    summaries.push(summarize(filename, content));
  }
  summaries.sort((a, b) => ((a.startedAt ?? "") < (b.startedAt ?? "") ? 1 : -1));
  return summaries;
}

function summarize(filename: string, content: string): ReportSummary {
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? basename(filename, ".md");
  const startedAt = content.match(/\*\*Started\*\*:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const persona = content.match(/\*\*Persona\*\*:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const dispatcher = content.match(/\*\*Dispatcher\*\*:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const findingMatch = content.match(/##\s+Findings\s*\((\d+)\)/);
  const findingCount = findingMatch ? Number(findingMatch[1]) : null;
  return { filename, title, startedAt, persona, dispatcher, findingCount };
}

function renderIndexPage(reports: ReportSummary[]): string {
  const rows = reports
    .map(
      (r) => `
    <tr>
      <td><a href="/report/${encodeURIComponent(r.filename)}">${escapeHtml(r.title)}</a></td>
      <td>${escapeHtml(r.persona ?? "")}</td>
      <td>${escapeHtml(r.dispatcher ?? "")}</td>
      <td>${r.findingCount ?? ""}</td>
      <td>${escapeHtml(r.startedAt ?? "")}</td>
    </tr>`,
    )
    .join("");

  return shell(
    "rove — Walks",
    `<h1>Agentic UX Walks</h1>
     <p class="muted">${reports.length} report${reports.length === 1 ? "" : "s"}</p>
     <table>
       <thead>
         <tr><th>Flow</th><th>Persona</th><th>Dispatcher</th><th>Findings</th><th>Started</th></tr>
       </thead>
       <tbody>${rows || `<tr><td colspan="5" class="muted">No walks yet.</td></tr>`}</tbody>
     </table>`,
  );
}

function renderReportPage(filename: string, html: string): string {
  return shell(
    `rove — ${filename}`,
    `<p><a href="/">← Back</a></p>
     <article class="report">${html}</article>`,
  );
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: rgb(34,34,34); }
    h1 { margin-top: 0; }
    .muted { color: rgb(136,136,136); }
    a { color: rgb(37,99,235); text-decoration: none; }
    a:hover { text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid rgb(238,238,238); }
    th { font-weight: 600; background: rgb(247,247,247); }
    article.report h2 { margin-top: 2rem; border-bottom: 1px solid rgb(238,238,238); padding-bottom: 0.25rem; }
    article.report h3 { margin-top: 1.5rem; }
    article.report h4 { margin-top: 1rem; color: rgb(68,68,68); }
    article.report code { background: rgb(243,243,243); padding: 1px 4px; border-radius: 3px; }
    article.report sub { color: rgb(102,102,102); }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function sendHtml(res: ServerResponse, html: string): void {
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(html);
}

function send404(res: ServerResponse): void {
  res.statusCode = 404;
  res.setHeader("content-type", "text/plain");
  res.end("not found");
}

function openInBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  import("node:child_process").then(({ spawn }) => {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  });
}
