/**
 * Handlers for kind=generate_flow / generate_persona. Spawns the local
 * `claude` CLI in --print mode with a strict system prompt that forces
 * JSON-only output, then validates against the shared Zod schemas.
 *
 * Why spawn the CLI instead of calling the Anthropic API directly:
 * - Uses the operator's existing Claude Code session (no shared API key).
 * - Cost rolls to the operator's account, which is exactly the
 *   "agent = developer's session" invariant from the plan.
 * - We already do this for walks via dispatchers/claude-code-cli.ts.
 */
import { spawn } from "node:child_process";
import {
  flowDraftSchema,
  personaDraftSchema,
  type FlowDraft,
  type PersonaDraft,
} from "@tankloop/agentic-ux-evaluator-core";

const FLOW_SYSTEM_PROMPT = `You produce JSON for a TankLoop UX-walk flow specification.

Schema:
{
  "flow_id":           string  (lowercase dotted snake_case, 2-4 segments, e.g. "scheduling.create_job.dispatcher"),
  "goal":              string  (one sentence, present tense, what a real user is trying to accomplish),
  "entry_route":       string  (URL path that ALWAYS starts with "/"),
  "success_criteria":  string[] (2-5 items, each an OBSERVABLE outcome under 200 chars)
}

Rules:
- Respond with ONLY a single JSON object. No prose, no code fences, no preamble.
- Do NOT invent specific selectors. Do NOT pad with marketing language.
- success_criteria items must be observable in the running UI, not internal state.`;

const PERSONA_SYSTEM_PROMPT = `You produce JSON for a TankLoop UX-walk persona.

Schema:
{
  "persona_id":         string  (snake_case, starts with a letter, e.g. "dispatcher_novice"),
  "expertise":          "low" | "medium" | "high",
  "shortcuts_allowed":  boolean (true if the persona uses keyboard shortcuts + URL tricks),
  "hovers_allowed":     boolean (true on desktop with mouse; false on mobile),
  "retries_per_step":   integer 0-5,
  "prompt_addendum":    string  (1-3 sentences in the SECOND PERSON, e.g. "You have used this app twice. You do not poke around.")
}

Rules:
- Respond with ONLY a single JSON object. No prose, no code fences, no preamble.
- Match expertise + shortcuts_allowed + retries_per_step to the personality you write in prompt_addendum.`;

export interface GenerateInput {
  description: string;
  modelOverride?: string;
}

export async function generateFlow(input: GenerateInput): Promise<FlowDraft> {
  const raw = await spawnClaudeForJson(FLOW_SYSTEM_PROMPT, input);
  return flowDraftSchema.parse(raw);
}

export async function generatePersona(
  input: GenerateInput,
): Promise<PersonaDraft> {
  const raw = await spawnClaudeForJson(PERSONA_SYSTEM_PROMPT, input);
  return personaDraftSchema.parse(raw);
}

async function spawnClaudeForJson(
  systemPrompt: string,
  input: GenerateInput,
): Promise<unknown> {
  const claudeBin = process.env.EVAL_CLAUDE_BIN ?? "claude";
  const model = input.modelOverride ?? process.env.EVAL_DAEMON_MODEL ?? "haiku";
  const stdout = await spawnAndCapture(
    claudeBin,
    [
      "--print",
      "--model",
      model,
      "--append-system-prompt",
      systemPrompt,
      input.description,
    ],
    { timeoutMs: 90_000 },
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
  opts: { timeoutMs: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
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
