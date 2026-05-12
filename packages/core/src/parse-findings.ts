import { findingsPayloadSchema, type FindingsPayload } from "./types.js";
import { FINDINGS_START_MARKER, FINDINGS_END_MARKER } from "./prompt.js";

export type ParseFindingsResult =
  | { ok: true; data: FindingsPayload }
  | { ok: false; reason: ParseFindingsErrorReason; detail?: string; raw?: string };

export type ParseFindingsErrorReason =
  | "no_start_marker"
  | "no_end_marker"
  | "invalid_json"
  | "schema_mismatch";

/**
 * Extracts a findings payload from agent stdout.
 *
 * The agent is instructed (by buildWalkPrompt) to wrap its JSON output in
 * FINDINGS_START_MARKER / FINDINGS_END_MARKER. We scan for the LAST start
 * marker (the agent may quote the format example earlier in its response),
 * then take everything up to the next end marker.
 */
export function parseFindings(stdout: string): ParseFindingsResult {
  const startIdx = stdout.lastIndexOf(FINDINGS_START_MARKER);
  if (startIdx === -1) {
    return { ok: false, reason: "no_start_marker" };
  }
  const afterStart = startIdx + FINDINGS_START_MARKER.length;
  const endIdx = stdout.indexOf(FINDINGS_END_MARKER, afterStart);
  if (endIdx === -1) {
    return { ok: false, reason: "no_end_marker" };
  }

  const raw = stdout.slice(afterStart, endIdx).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid_json",
      detail: err instanceof Error ? err.message : String(err),
      raw,
    };
  }

  const validation = findingsPayloadSchema.safeParse(parsed);
  if (!validation.success) {
    return {
      ok: false,
      reason: "schema_mismatch",
      detail: validation.error.message,
      raw,
    };
  }

  return { ok: true, data: validation.data };
}
