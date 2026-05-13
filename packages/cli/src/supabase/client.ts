import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Auth mode
// ---------------------------------------------------------------------------

export type AuthMode =
  | { mode: "worker"; token: string; publishableKey: string }
  | { mode: "service-role"; key: string };

function readFileTrimmed(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8").trim();
}

function readIfExists(filePath: string): string | undefined {
  try {
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    return raw || undefined;
  } catch {
    return undefined;
  }
}

function validateToken(raw: string, source: string): string {
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  if (lines.length > 1) {
    throw new Error(
      `Worker token from ${source} spans multiple non-empty lines. Provide a single JWT string.`,
    );
  }
  return raw.trim();
}

export function pickAuth(): AuthMode {
  const tokenInline = process.env.ROVE_WORKER_TOKEN;
  const tokenFilePath = process.env.ROVE_WORKER_TOKEN_FILE;

  let rawToken: string | undefined;
  let tokenSource: string;

  if (tokenInline) {
    rawToken = tokenInline;
    tokenSource = "ROVE_WORKER_TOKEN env";
  } else if (tokenFilePath) {
    rawToken = readFileTrimmed(tokenFilePath);
    tokenSource = `ROVE_WORKER_TOKEN_FILE (${tokenFilePath})`;
  } else {
    const defaultPath = path.join(os.homedir(), ".rove", "auth.token");
    rawToken = readIfExists(defaultPath);
    tokenSource = `default token file (${defaultPath})`;
  }

  if (rawToken) {
    const token = validateToken(rawToken, tokenSource);
    const publishableKey =
      process.env.ROVE_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      throw new Error(
        "Worker token present but no ROVE_SUPABASE_PUBLISHABLE_KEY set. " +
          "Both are required: the publishable key authenticates the project to PostgREST; " +
          "the worker token authenticates THIS worker. " +
          "Set ROVE_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      );
    }
    return { mode: "worker", token, publishableKey };
  }

  const serviceRoleKey =
    process.env.ROVE_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.EVAL_SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return { mode: "service-role", key: serviceRoleKey };
  }

  throw new Error(
    "No worker token and no service-role key configured. " +
      "Set ROVE_WORKER_TOKEN_FILE (or ROVE_WORKER_TOKEN) for worker-token mode, " +
      "or ROVE_SUPABASE_SERVICE_ROLE_KEY for service-role mode.",
  );
}

function buildSupabase(url: string, auth: AuthMode): SupabaseClient {
  if (auth.mode === "worker") {
    // apikey must always be the publishable key; worker JWT goes in Authorization only.
    return createClient(url, auth.publishableKey, {
      global: { headers: { Authorization: `Bearer ${auth.token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return createClient(url, auth.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Daemon client — returns both client and auth mode so runner.ts can branch.
// ---------------------------------------------------------------------------

export interface DaemonSupabase {
  client: SupabaseClient;
  auth: AuthMode;
}

let cachedDaemon: DaemonSupabase | null = null;

export function getDaemonSupabase(): DaemonSupabase {
  if (cachedDaemon) return cachedDaemon;
  const url =
    process.env.ROVE_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.EVAL_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "Supabase URL is not set. Provide ROVE_SUPABASE_URL. See TEAM-SETUP.md.",
    );
  }
  const auth = pickAuth();
  const client = buildSupabase(url, auth);
  cachedDaemon = { client, auth };
  return cachedDaemon;
}

// ---------------------------------------------------------------------------
// Legacy service-role client — used by non-daemon CLI commands.
// Keep backward-compatible: callers import getSupabaseClient() unchanged.
// ---------------------------------------------------------------------------

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const url =
    process.env.ROVE_SUPABASE_URL ??
    process.env.EVAL_SUPABASE_URL;
  const serviceRoleKey =
    process.env.ROVE_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.EVAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase env vars are not set. Provide ROVE_SUPABASE_URL and " +
        "ROVE_SUPABASE_SERVICE_ROLE_KEY in your .env.rove. See TEAM-SETUP.md.",
    );
  }
  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Test seam — reset cached clients between integration tests. */
export function resetSupabaseClientCache(): void {
  cached = null;
  cachedDaemon = null;
}
