import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface WorkerTokenClaims {
  // Standard JWT claims
  iss?: string;
  sub?: string;
  aud?: string;
  role?: string;
  iat?: number;
  exp?: number;
  jti?: string;
  // Worker-specific claims
  kind?: string;
  worker_id?: string;
  project_id?: string;
  worker_name?: string;
  github_handle?: string;
  // Raw payload for display
  [key: string]: unknown;
}

export interface DecodedToken {
  claims: WorkerTokenClaims;
  source: string;
  raw: string;
}

export interface WorkerClaims {
  workerId: string;
  projectId: string;
  workerName: string;
  githubHandle: string | null;
}

/**
 * Decode the payload segment of a JWT without signature verification.
 * PostgREST / Supabase verifies the signature server-side; we only need
 * the claims for diagnostic purposes and daemon startup.
 */
export function decodeJwtPayload(token: string): WorkerTokenClaims {
  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new Error(
      `Malformed JWT: expected 3 segments separated by '.', got ${segments.length}.`,
    );
  }
  const payloadB64 = segments[1];
  let jsonStr: string;
  try {
    jsonStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
  } catch {
    throw new Error("Malformed JWT: base64url decode of payload failed.");
  }
  try {
    return JSON.parse(jsonStr) as WorkerTokenClaims;
  } catch {
    throw new Error("Malformed JWT: payload is not valid JSON.");
  }
}

/**
 * Decode a worker token into the structured claims the daemon needs.
 * Throws if the token is malformed.
 */
export function decodeWorkerToken(token: string): WorkerClaims {
  const claims = decodeJwtPayload(token);
  return {
    workerId: claims.worker_id as string,
    projectId: claims.project_id as string,
    workerName: claims.worker_name as string,
    githubHandle: (claims.github_handle as string | undefined) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Token discovery — mirrors pickAuth() in client.ts without requiring a
// publishable key. Used by `rove auth show-token` which only decodes.
// ---------------------------------------------------------------------------

interface TokenDiscovery {
  token: string;
  source: string;
}

function readIfExists(filePath: string): string | undefined {
  try {
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    return raw || undefined;
  } catch {
    return undefined;
  }
}

const DEFAULT_TOKEN_PATH = path.join(os.homedir(), ".rove", "auth.token");

/**
 * Try to find an active worker token using the same discovery order
 * as pickAuth() in client.ts:
 *   1. ROVE_WORKER_TOKEN env (inline)
 *   2. ROVE_WORKER_TOKEN_FILE env (path to file)
 *   3. ~/.rove/auth.token (default file)
 *
 * Returns null if no token is found, along with the paths that were tried.
 */
export function discoverToken(): TokenDiscovery | null {
  const tokenInline = process.env.ROVE_WORKER_TOKEN;
  if (tokenInline) {
    return { token: tokenInline.trim(), source: "ROVE_WORKER_TOKEN (env, inline)" };
  }

  const tokenFilePath = process.env.ROVE_WORKER_TOKEN_FILE;
  if (tokenFilePath) {
    const raw = fs.readFileSync(tokenFilePath, "utf-8").trim();
    if (raw) {
      return { token: raw, source: `ROVE_WORKER_TOKEN_FILE → ${tokenFilePath}` };
    }
  }

  const raw = readIfExists(DEFAULT_TOKEN_PATH);
  if (raw) {
    return { token: raw, source: `default token file → ${DEFAULT_TOKEN_PATH}` };
  }

  return null;
}

export { DEFAULT_TOKEN_PATH };
