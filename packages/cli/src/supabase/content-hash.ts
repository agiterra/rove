import { createHash } from "node:crypto";
import type { Finding } from "@agiterra/rove-core";

/**
 * Deterministic hash used by Phase 8 dedup. Phase 7 stores it on every
 * finding even though no lookups happen yet; that means Phase 8 is "add a
 * query" instead of "add a migration + a backfill".
 *
 * Recipe (v1): sha256(flow_id || '|' || severity || '|' || normalize(title))
 *
 * Normalization is intentionally simple — lowercase, collapse whitespace,
 * strip trailing punctuation. The harder cases (semantic clustering,
 * embeddings) are explicitly out of scope for v1.
 *
 * Bump the version prefix if you change the recipe so old + new hashes
 * don't accidentally collide.
 */
const HASH_VERSION = "v1";

export function computeContentHash(flowId: string, finding: Finding): string {
  const title = normalizeTitle(finding.title);
  const input = `${HASH_VERSION}|${flowId}|${finding.severity}|${title}`;
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s ]+/g, " ")
    .replace(/[.,;:!?"'`]+$/g, "")
    .trim();
}
