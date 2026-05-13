/**
 * `rove auth show-token`
 *
 * Decodes and displays the active worker token's claims without verifying
 * the signature (PostgREST does that). Useful for debugging "why is my
 * daemon getting denied?" without exposing the raw token credential.
 *
 * Discovery order matches the daemon's pickAuth() exactly:
 *   1. ROVE_WORKER_TOKEN env (inline)
 *   2. ROVE_WORKER_TOKEN_FILE env (path to file)
 *   3. ~/.rove/auth.token (default file)
 */

import {
  decodeJwtPayload,
  discoverToken,
  DEFAULT_TOKEN_PATH,
  type WorkerTokenClaims,
} from "../supabase/decode-token.js";

function humanizeExpiry(exp: number | undefined): string {
  if (exp === undefined) return "no expiry claim";
  const nowMs = Date.now();
  const expMs = exp * 1000;
  const diffMs = expMs - nowMs;
  const absDays = Math.abs(diffMs) / (24 * 60 * 60 * 1000);
  const absHours = Math.abs(diffMs) / (60 * 60 * 1000);
  const absMinutes = Math.abs(diffMs) / 60_000;

  let magnitude: string;
  if (absDays >= 1) {
    magnitude = `${Math.round(absDays)} day${Math.round(absDays) !== 1 ? "s" : ""}`;
  } else if (absHours >= 1) {
    magnitude = `${Math.round(absHours)} hour${Math.round(absHours) !== 1 ? "s" : ""}`;
  } else {
    magnitude = `${Math.round(absMinutes)} minute${Math.round(absMinutes) !== 1 ? "s" : ""}`;
  }

  if (diffMs > 0) return `expires in ${magnitude}`;
  return `EXPIRED ${magnitude} ago`;
}

function printSummary(claims: WorkerTokenClaims, source: string): void {
  const workerId = (claims.worker_id as string | undefined) ?? "(missing)";
  const shortId = workerId.length >= 8 ? workerId.slice(0, 8) : workerId;
  const expiry = humanizeExpiry(claims.exp as number | undefined);

  console.log("");
  console.log("Source:      " + source);
  console.log("kind:        " + ((claims.kind as string | undefined) ?? "(missing)"));
  console.log("worker_name: " + ((claims.worker_name as string | undefined) ?? "(missing)"));
  console.log("project_id:  " + ((claims.project_id as string | undefined) ?? "(missing)"));
  console.log("worker_id:   " + shortId + "…");
  console.log("expires:     " + expiry);
  console.log("");
}

export async function runAuthShowTokenCommand(): Promise<number> {
  const discovery = discoverToken();

  if (!discovery) {
    console.error("No worker token found. Tried (in order):");
    console.error("  1. ROVE_WORKER_TOKEN (env, inline)");
    console.error("  2. ROVE_WORKER_TOKEN_FILE (env → file path)");
    console.error(`  3. Default token file: ${DEFAULT_TOKEN_PATH}`);
    console.error("");
    console.error("To create a token, visit the dashboard at https://rove-agiterra.vercel.app/workers");
    console.error("or run the install one-liner from your project's /setup page.");
    return 1;
  }

  const { token, source } = discovery;

  let claims: WorkerTokenClaims;
  try {
    claims = decodeJwtPayload(token);
  } catch (err) {
    console.error(`Could not parse JWT from source: ${source}`);
    console.error(`  ${(err as Error).message}`);
    console.error("");
    console.error("The token may be truncated or corrupted. Try re-minting it from the dashboard.");
    return 1;
  }

  console.log("--- Worker token claims (decoded, signature not verified) ---");
  console.log(JSON.stringify(claims, null, 2));
  printSummary(claims, source);

  return 0;
}
