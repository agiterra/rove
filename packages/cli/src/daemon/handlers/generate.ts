/**
 * Handlers for kind=generate_flow / generate_persona. Spawns the local
 * `claude` CLI in --print mode with a strict system prompt that forces
 * JSON-only output, then validates against the shared Zod schemas.
 *
 * Clean-room: claude is spawned with cwd = fresh tmpdir and a scrubbed
 * env so it can't read the operator's repo CLAUDE.md / AGENTS.md / any
 * project context — without this, dogfooding Rove on its own repo
 * produces wizard-aware prose instead of JSON.
 *
 * Why spawn the CLI instead of calling the Anthropic API directly:
 * - Uses the operator's existing Claude Code session (no shared API key).
 * - Cost rolls to the operator's account, which is exactly the
 *   "agent = developer's session" invariant from the plan.
 * - We already do this for walks via dispatchers/claude-code-cli.ts.
 */
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  flowDraftSchema,
  personaDraftSchema,
  type FlowDraft,
  type PersonaDraft,
} from "@agiterra/rove-core";

const SCRUB_ALLOW_EXACT: readonly string[] = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "PWD",
  "ANTHROPIC_API_KEY",
];
const SCRUB_ALLOW_PREFIXES: readonly string[] = ["CLAUDE_", "NODE_", "XDG_"];

function scrubbedEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const key of SCRUB_ALLOW_EXACT) {
    const v = source[key];
    if (v !== undefined) out[key] = v;
  }
  for (const [key, v] of Object.entries(source)) {
    if (v === undefined) continue;
    if (out[key] !== undefined) continue;
    if (SCRUB_ALLOW_PREFIXES.some((p) => key.startsWith(p))) {
      out[key] = v;
    }
  }
  return out;
}

const FLOW_SYSTEM_PROMPT = `You are a JSON generator for Rove flow specifications.

You will receive a teammate's PLAIN-ENGLISH DESCRIPTION of a user journey they
want walked. Your only job is to encode that description as a JSON flow spec.
You are NOT being asked to perform the journey, browse anything, run tools,
or do any work in any app. You are not a coding agent. You are a translator
from English → JSON for one schema.

Output schema (every field required):
{
  "flow_id":           string  (lowercase dotted snake_case, 2-4 segments, e.g. "scheduling.create_job.dispatcher"),
  "goal":              string  (one sentence, present tense, what a real user is trying to accomplish),
  "entry_route":       string  (URL path that ALWAYS starts with "/"),
  "success_criteria":  string[] (2-5 items, each an OBSERVABLE outcome under 200 chars)
}

Output rules — non-negotiable:
- Respond with a SINGLE JSON object and nothing else. No prose. No code fences.
  No "Here is..." preamble. No questions back to the user.
- If the description is vague (e.g. "figure out what the app does"), encode the
  closest reasonable flow spec anyway — produce the spec with a goal that
  captures the persona's intent. Do not refuse, do not ask follow-ups.
- If you do not know the exact entry_route, choose a sensible guess like "/"
  or "/dashboard" — the teammate will edit it after.
- Do NOT invent specific selectors. Do NOT pad with marketing language.
- success_criteria items must be observable in the running UI, not internal state.`;

const PERSONA_SYSTEM_PROMPT = `You are a JSON generator for Rove persona specifications.

You will receive a teammate's PLAIN-ENGLISH DESCRIPTION of a user persona they
want walking the app. Your only job is to encode that description as a JSON
persona spec. You are NOT being asked to perform any work, browse, or run
tools. You are a translator from English → JSON for one schema.

Output schema (every field required):
{
  "persona_id":         string  (snake_case, starts with a letter, e.g. "dispatcher_novice"),
  "expertise":          "low" | "medium" | "high",
  "shortcuts_allowed":  boolean (true if the persona uses keyboard shortcuts + URL tricks),
  "hovers_allowed":     boolean (true on desktop with mouse; false on mobile),
  "retries_per_step":   integer 0-5,
  "prompt_addendum":    string  (1-3 sentences in the SECOND PERSON, e.g. "You have used this app twice. You do not poke around.")
}

Output rules — non-negotiable:
- Respond with a SINGLE JSON object and nothing else. No prose. No code fences.
  No preamble. No questions back to the user.
- If the description is vague, produce the closest reasonable persona anyway.
  Do not refuse, do not ask follow-ups.
- Match expertise + shortcuts_allowed + retries_per_step to the personality
  you write in prompt_addendum.`;

/**
 * Wrap the teammate's description so Claude reads it as INPUT DATA to encode,
 * not as a conversational instruction. Without this wrap, "figure out what
 * the app does" reads as a request to actually figure out what the app does.
 */
function wrapDescriptionForFlow(description: string): string {
  return [
    "A teammate wants to author a new Rove flow. They described the journey as:",
    "",
    "<<<DESCRIPTION>>>",
    description.trim(),
    "<<<END DESCRIPTION>>>",
    "",
    "Encode that description as the flow JSON spec defined in the system prompt.",
    "Do not perform the journey. Do not ask follow-up questions. Output JSON only.",
  ].join("\n");
}

function wrapDescriptionForPersona(description: string): string {
  return [
    "A teammate wants to author a new Rove persona. They described the persona as:",
    "",
    "<<<DESCRIPTION>>>",
    description.trim(),
    "<<<END DESCRIPTION>>>",
    "",
    "Encode that description as the persona JSON spec defined in the system prompt.",
    "Do not ask follow-up questions. Output JSON only.",
  ].join("\n");
}

export interface GenerateInput {
  description: string;
  modelOverride?: string;
}

export async function generateFlow(input: GenerateInput): Promise<FlowDraft> {
  const raw = await spawnClaudeForJson(FLOW_SYSTEM_PROMPT, wrapDescriptionForFlow(input.description), input.modelOverride);
  return flowDraftSchema.parse(raw);
}

export async function generatePersona(
  input: GenerateInput,
): Promise<PersonaDraft> {
  const raw = await spawnClaudeForJson(PERSONA_SYSTEM_PROMPT, wrapDescriptionForPersona(input.description), input.modelOverride);
  return personaDraftSchema.parse(raw);
}

async function spawnClaudeForJson(
  systemPrompt: string,
  userMessage: string,
  modelOverride: string | undefined,
): Promise<unknown> {
  const claudeBin = process.env.ROVE_CLAUDE_BIN ?? process.env.EVAL_CLAUDE_BIN ?? "claude";
  const model = modelOverride ?? process.env.ROVE_DAEMON_MODEL ?? process.env.EVAL_DAEMON_MODEL ?? "haiku";
  // Clean-room: fresh cwd (no CLAUDE.md / AGENTS.md / .claude in scope) and
  // scrubbed env so claude can't see the operator's project context. Without
  // this, claude on a generation run inside the Rove repo writes prose
  // about the wizard instead of returning the JSON draft.
  const cleanCwd = await mkdtemp(join(tmpdir(), "rove-gen-"));
  const env = scrubbedEnv(process.env);
  const stdout = await spawnAndCapture(
    claudeBin,
    [
      "--print",
      "--model",
      model,
      "--append-system-prompt",
      systemPrompt,
      userMessage,
    ],
    { timeoutMs: 90_000, cwd: cleanCwd, env },
  );
  return parseJsonStrict(stdout);
}

function parseJsonStrict(text: string): unknown {
  // Strip markdown fences if Claude added them despite instructions.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  // Find the outermost JSON object — sometimes the CLI leaks a one-line
  // banner before the body (e.g. "Using model X").
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Claude output was not JSON-shaped: ${cleaned.slice(0, 200)}`);
  }
  const slice = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (e) {
    throw new Error(
      `JSON parse failed: ${(e as Error).message}\n--- output ---\n${slice.slice(0, 500)}`,
    );
  }
}

function spawnAndCapture(
  bin: string,
  args: string[],
  opts: { timeoutMs: number; cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: opts.cwd,
      env: opts.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${bin} timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    child.stdout.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `${bin} exited with code ${code}\n--- stderr ---\n${stderr.slice(0, 500)}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });
}
