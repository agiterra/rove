import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read `<projectRoot>/.env.rove` if it exists and inject any KEY=VALUE
 * pairs into `process.env`. Variables already present in `process.env`
 * take precedence — explicit shell env wins over the file. Logged to
 * stderr so an agent driving the CLI sees the autoload happen.
 *
 * Idempotent: loads once per (process, root) pair.
 *
 * Why: requiring `set -a && source .env.rove && set +a` as ceremony
 * before every `rove` invocation is exactly the kind of out-of-band
 * setup step agents skip silently. Without env, the supabase sink
 * no-ops, dashboard shows nothing, and there's no error telling you
 * why. This makes "ROVE_SUPABASE_URL not set" the error you actually
 * see when something's broken — not a silent absence.
 */
const loaded = new Set<string>();

export function loadEnvRove(projectRoot: string): void {
  if (loaded.has(projectRoot)) return;
  loaded.add(projectRoot);

  const path = join(projectRoot, ".env.rove");
  if (!existsSync(path)) return;

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }

  let added = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    if (key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    added++;
  }

  if (added > 0) {
    process.stderr.write(`→ Loaded ${added} env var(s) from .env.rove\n`);
  }
}
