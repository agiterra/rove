/**
 * GET /install
 *
 * Serves the macOS install script as text/plain with no-cache headers.
 * Clients fetch it via:
 *   curl -fsSL <origin>/install | bash -s -- --install-code=<uuid>
 *
 * The script body is built by string concatenation so that bash variable
 * references ($VAR, $#, $1, etc.) are literal in the output without
 * requiring per-dollar backslash escaping inside a TS template literal.
 * Only ${origin} is substituted at request time.
 *
 * File-size exception: longer than the 250-line component cap. This file
 * is a cohesive single-purpose artifact — the route handler and the bash
 * script it serves. Splitting them would require fs reads at runtime
 * (import.meta.url resolution differs across Next.js build targets).
 *
 * Steps implemented (install-flow plan v3, step 3 scope):
 *   1  – shell hygiene (set -euo pipefail)
 *   2  – argparse (--install-code=<uuid> and variants)
 *   3  – sanity checks (Darwin, node, curl)
 *   4  – umask 077
 *   5  – POST exchange → parse JSON → validate required fields
 *   6  – mkdir ~/.rove (chmod 700)
 *   7  – write ~/.rove/env (chmod 600)
 *   8  – write ~/.rove/auth.token (chmod 600)
 *   9  – download tarballs from <origin>/install/
 *   10 – npm install into ~/.rove/lib/; verify rove.js exists; print next steps
 *
 * Deferred to later steps:
 *   LaunchAgent plist (step 4)
 *   rove:// URL handler applet (step 5)
 *   launchctl invocations
 */
import "server-only";
import { getDashboardOrigin } from "@/lib/dashboard-origin";

export const runtime = "nodejs";

/**
 * Returns a node one-liner (for embedding in a bash $(...) substitution) that
 * extracts `field` from the JSON string held in the bash variable $RESP_BODY.
 *
 * When allowNull=false the node process exits 1 and prints an error if the
 * field is absent or null.  When allowNull=true it prints an empty string.
 */
function nodeExtract(field: string, allowNull = false): string {
  const check = allowNull
    ? ""
    : `if(v===undefined||v===null){process.stderr.write("error: exchange response missing field: ${field}\\n");process.exit(1);}`;
  const out = allowNull
    ? `process.stdout.write(v==null?"":String(v));`
    : `process.stdout.write(String(v));`;
  // $NODE_BIN and $RESP_BODY are bash variables — they must appear literally
  // in the output, not be interpolated by TypeScript.
  return `"$NODE_BIN" -e 'const j=JSON.parse(process.argv[1]);const v=j["${field}"];${check}${out}' -- "$RESP_BODY"`;
}

/** Build the bash script with origin substituted in. */
function buildScript(origin: string): string {
  // Using string concatenation so that every $ in the bash body is literal.
  // Only the JS variables (origin, nodeExtract results) are interpolated here.
  const S = "$"; // shorthand so the code below reads naturally
  const lines: string[] = [
    `#!/usr/bin/env bash`,
    `# Rove macOS worker install script`,
    `# Fetched from: ${origin}/install`,
    `# Usage: curl -fsSL ${origin}/install | bash -s -- --install-code=<uuid>`,
    `#`,
    `# Implements install-flow plan v3, steps 1-10.`,
    `# Deferred: LaunchAgent (step 4), rove:// handler (step 5).`,
    `set -euo pipefail`,
    ``,
    `ORIGIN="${origin}"`,
    `echo "Rove installer — fetched from ${S}{ORIGIN}"`,
    `echo ""`,
    ``,
    `# ── step 1: argparse ─────────────────────────────────────────────────────`,
    `# Supports: --install-code=<uuid>  |  --install-code <uuid>  |  positional`,
    `INSTALL_CODE=""`,
    ``,
    `while [[ ${S}# -gt 0 ]]; do`,
    `  case "${S}1" in`,
    `    --install-code=*)`,
    `      INSTALL_CODE="${S}{1#--install-code=}"`,
    `      shift`,
    `      ;;`,
    `    --install-code)`,
    `      if [[ ${S}# -lt 2 ]]; then`,
    `        echo "error: --install-code requires a value" >&2`,
    `        exit 1`,
    `      fi`,
    `      INSTALL_CODE="${S}2"`,
    `      shift 2`,
    `      ;;`,
    `    *)`,
    `      if [[ -z "${S}INSTALL_CODE" && ${S}# -eq 1 ]]; then`,
    `        INSTALL_CODE="${S}1"`,
    `        shift`,
    `      else`,
    `        echo "error: unexpected argument: ${S}1" >&2`,
    `        echo "Usage: curl -fsSL ${S}{ORIGIN}/install | bash -s -- --install-code=<uuid>" >&2`,
    `        exit 1`,
    `      fi`,
    `      ;;`,
    `  esac`,
    `done`,
    ``,
    `if [[ -z "${S}INSTALL_CODE" ]]; then`,
    `  echo "error: --install-code is required" >&2`,
    `  echo "" >&2`,
    `  echo "Usage: curl -fsSL ${S}{ORIGIN}/install | bash -s -- --install-code=<uuid>" >&2`,
    `  echo "" >&2`,
    `  echo "Get an install code from ${S}{ORIGIN}/setup" >&2`,
    `  exit 1`,
    `fi`,
    ``,
    `# ── step 2: sanity checks ────────────────────────────────────────────────`,
    `if [[ "${S}(uname -s)" != "Darwin" ]]; then`,
    `  echo "error: this installer is macOS-only. Linux and Windows support is planned." >&2`,
    `  exit 1`,
    `fi`,
    ``,
    `if ! NODE_BIN="${S}(command -v node 2>/dev/null)"; then`,
    `  echo "error: node not found. Install Node.js (https://nodejs.org) and try again." >&2`,
    `  exit 1`,
    `fi`,
    ``,
    `if ! command -v npm &>/dev/null; then`,
    `  echo "error: npm not found. It should ship with Node.js — check your installation." >&2`,
    `  exit 1`,
    `fi`,
    ``,
    `if ! command -v curl &>/dev/null; then`,
    `  echo "error: curl not found. It ships with macOS; something is wrong with your PATH." >&2`,
    `  exit 1`,
    `fi`,
    ``,
    `echo "Using node : ${S}NODE_BIN"`,
    `echo "Using npm  : ${S}(command -v npm)"`,
    `echo ""`,
    ``,
    `# ── step 3: umask ────────────────────────────────────────────────────────`,
    `# All files created from here on are locked down by default (no group/other).`,
    `umask 077`,
    ``,
    `# ── step 4: exchange install code for credentials ────────────────────────`,
    `echo "Exchanging install code with ${S}{ORIGIN}/api/install/exchange ..."`,
    ``,
    // Single-quoted JSON with $INSTALL_CODE spliced in via quote-breaking:
    //   '{"install_code":"'$INSTALL_CODE'"}'
    `EXCHANGE_BODY='{"install_code":"'` + S + `INSTALL_CODE'"}'`,
    `RESP_TMP="${S}(mktemp)"`,
    ``,
    `# Drop -f so we can capture the body on non-200 responses for better errors.`,
    `HTTP_CODE="${S}(`,
    `  curl -sSL \\`,
    `    --write-out '%{http_code}' \\`,
    `    --output "${S}RESP_TMP" \\`,
    `    -X POST "${S}{ORIGIN}/api/install/exchange" \\`,
    `    -H 'Content-Type: application/json' \\`,
    `    -d "${S}EXCHANGE_BODY"`,
    `)" || {`,
    `  rm -f "${S}RESP_TMP"`,
    `  echo "error: curl failed to reach ${S}{ORIGIN}/api/install/exchange" >&2`,
    `  exit 1`,
    `}`,
    ``,
    `RESP_BODY="${S}(cat "${S}RESP_TMP")"`,
    `rm -f "${S}RESP_TMP"`,
    ``,
    `if [[ "${S}HTTP_CODE" != "200" ]]; then`,
    `  echo "error: exchange endpoint returned HTTP ${S}HTTP_CODE" >&2`,
    `  echo "${S}RESP_BODY" >&2`,
    `  exit 1`,
    `fi`,
    ``,
    `# Extract required fields from the JSON response via node one-liners.`,
    `# github_handle is nullable; all others are required.`,
    `TOKEN="${S}(${nodeExtract("token")})"`,
    `SUPABASE_URL="${S}(${nodeExtract("supabase_url")})"`,
    `SUPABASE_PUBLISHABLE_KEY="${S}(${nodeExtract("supabase_publishable_key")})"`,
    `PROJECT_ID="${S}(${nodeExtract("project_id")})"`,
    `WORKER_NAME="${S}(${nodeExtract("worker_name")})"`,
    `GITHUB_HANDLE="${S}(${nodeExtract("github_handle", true)})"`,
    ``,
    `echo "Credentials received for worker '${S}WORKER_NAME' in project '${S}PROJECT_ID'"`,
    `echo ""`,
    ``,
    `# ── step 5: mkdir ~/.rove (chmod 700) ────────────────────────────────────`,
    `mkdir -p "${S}HOME/.rove"`,
    `chmod 700 "${S}HOME/.rove"`,
    ``,
    `# ── step 6: write ~/.rove/env (chmod 600) ────────────────────────────────`,
    `# printf '%q' produces bash-safe quoting; the file is safely sourceable.`,
    `{`,
    `  printf 'ROVE_SUPABASE_URL=%q\\n'            "${S}SUPABASE_URL"`,
    `  printf 'ROVE_SUPABASE_PUBLISHABLE_KEY=%q\\n' "${S}SUPABASE_PUBLISHABLE_KEY"`,
    `  printf 'ROVE_DAEMON_GITHUB_HANDLE=%q\\n'    "${S}GITHUB_HANDLE"`,
    `  printf 'ROVE_WORKER_NAME=%q\\n'             "${S}WORKER_NAME"`,
    `  printf 'ROVE_PROJECT_ID=%q\\n'              "${S}PROJECT_ID"`,
    `} > "${S}HOME/.rove/env"`,
    `chmod 600 "${S}HOME/.rove/env"`,
    ``,
    `# ── step 7: write ~/.rove/auth.token (chmod 600) ─────────────────────────`,
    `printf '%s' "${S}TOKEN" > "${S}HOME/.rove/auth.token"`,
    `chmod 600 "${S}HOME/.rove/auth.token"`,
    ``,
    `echo "Credentials written to ~/.rove/"`,
    ``,
    `# ── step 8: download tarballs ────────────────────────────────────────────`,
    `echo "Downloading CLI tarballs from ${S}{ORIGIN}/install/ ..."`,
    ``,
    `curl -fsSL "${S}{ORIGIN}/install/agiterra-rove-core.tgz" -o "${S}HOME/.rove/core.tgz" || {`,
    `  echo "error: failed to download agiterra-rove-core.tgz from ${S}{ORIGIN}" >&2`,
    `  exit 1`,
    `}`,
    `curl -fsSL "${S}{ORIGIN}/install/agiterra-rove-cli.tgz" -o "${S}HOME/.rove/cli.tgz" || {`,
    `  echo "error: failed to download agiterra-rove-cli.tgz from ${S}{ORIGIN}" >&2`,
    `  exit 1`,
    `}`,
    ``,
    `echo "Tarballs downloaded."`,
    ``,
    `# ── step 9: npm install into ~/.rove/lib/ ────────────────────────────────`,
    `echo "Installing CLI into ~/.rove/lib/ (this may take ~30 seconds) ..."`,
    ``,
    `mkdir -p "${S}HOME/.rove/lib"`,
    ``,
    `# npm init -y is idempotent; re-running on an existing package.json is safe.`,
    `(cd "${S}HOME/.rove/lib" && npm init -y >/dev/null 2>&1)`,
    ``,
    `npm install --silent --no-save \\`,
    `  --prefix "${S}HOME/.rove/lib" \\`,
    `  "${S}HOME/.rove/core.tgz" "${S}HOME/.rove/cli.tgz"`,
    ``,
    `ROVE_JS="${S}HOME/.rove/lib/node_modules/@agiterra/rove-cli/bin/rove.js"`,
    ``,
    `if [[ ! -f "${S}ROVE_JS" ]]; then`,
    `  echo "error: npm install completed but ${S}ROVE_JS was not found." >&2`,
    `  echo "       Check that the tarballs from ${S}{ORIGIN}/install/ are valid." >&2`,
    `  exit 1`,
    `fi`,
    ``,
    `echo "CLI installed at ${S}ROVE_JS"`,
    `echo ""`,
    ``,
    `# ── step 10: success + next-step note ────────────────────────────────────`,
    `echo "=================================================================="`,
    `echo " Rove worker installed successfully!"`,
    `echo "=================================================================="`,
    `echo ""`,
    `echo " Worker name : ${S}WORKER_NAME"`,
    `echo " Project     : ${S}PROJECT_ID"`,
    `echo " Token file  : ~/.rove/auth.token  (chmod 600)"`,
    `echo " Env file    : ~/.rove/env          (chmod 600)"`,
    `echo ""`,
    `echo " To start the daemon manually, run:"`,
    `echo ""`,
    `echo "   ${S}NODE_BIN ${S}ROVE_JS daemon --as=${S}WORKER_NAME --project-id=${S}PROJECT_ID"`,
    `echo ""`,
    `echo " The auto-start LaunchAgent will land in a follow-up release."`,
    `echo " For now, start the daemon in a terminal or with nohup."`,
    `echo ""`,
    `echo " Verify auth : ${S}NODE_BIN ${S}ROVE_JS auth show-token"`,
    `echo "=================================================================="`,
  ];

  return lines.join("\n") + "\n";
}

export async function GET(request: Request) {
  const origin = getDashboardOrigin(request);
  const script = buildScript(origin);

  return new Response(script, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, must-revalidate",
    },
  });
}
