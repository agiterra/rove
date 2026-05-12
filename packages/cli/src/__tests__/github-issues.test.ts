import { describe, it, expect } from "vitest";
import type { FindingsPayload, SinkInput } from "@tankloop/agentic-ux-evaluator-core";
import { GitHubIssuesSink } from "../sinks/github-issues.js";
import type { DedupMatch } from "../supabase/store.js";
import type { SupabaseStore } from "../supabase/store.js";

const PAYLOAD: FindingsPayload = {
  flow_id: "scheduling.create_job.dispatcher",
  persona_id: "dispatcher_novice",
  walked_url: "http://localhost:3000/admin/scheduling",
  summary: "Mixed severities for filter tests.",
  findings: [
    {
      id: "f1",
      severity: "critical",
      title: "Hard block",
      description: "blocked",
      screenshots: [],
    },
    {
      id: "f2",
      severity: "major",
      title: "Major friction",
      description: "frictional",
      screenshots: [],
    },
    {
      id: "f3",
      severity: "minor",
      title: "Polish",
      description: "polishy",
      screenshots: [],
    },
    {
      id: "f4",
      severity: "nit",
      title: "Wording",
      description: "wordy",
      screenshots: [],
    },
  ],
};

function makeInput(): SinkInput {
  return {
    payload: PAYLOAD,
    runId: "test-run-id",
    dispatcherId: "claude-code-cli",
    startedAt: new Date("2026-05-11T10:00:00Z"),
    finishedAt: new Date("2026-05-11T10:03:00Z"),
    rawStdout: "",
    screenshotsDir: "/tmp/test",
  };
}

describe("GitHubIssuesSink — filter + dry-run", () => {
  it("defaults to severity >= major (filters out minor + nit)", async () => {
    const sink = new GitHubIssuesSink({ dryRun: true });
    const result = await sink.route(makeInput());
    expect(result.ok).toBe(true);
    expect(result.routedCount).toBe(2);
    expect(result.skippedCount).toBe(2);
    expect(result.artifacts).toEqual([]);
  });

  it("includes minor when minSeverity is minor", async () => {
    const sink = new GitHubIssuesSink({ dryRun: true, minSeverity: "minor" });
    const result = await sink.route(makeInput());
    expect(result.routedCount).toBe(3);
    expect(result.skippedCount).toBe(1);
  });

  it("only files criticals when minSeverity is critical", async () => {
    const sink = new GitHubIssuesSink({ dryRun: true, minSeverity: "critical" });
    const result = await sink.route(makeInput());
    expect(result.routedCount).toBe(1);
    expect(result.skippedCount).toBe(3);
  });

  it("includes everything when minSeverity is nit", async () => {
    const sink = new GitHubIssuesSink({ dryRun: true, minSeverity: "nit" });
    const result = await sink.route(makeInput());
    expect(result.routedCount).toBe(4);
    expect(result.skippedCount).toBe(0);
  });
});

describe("GitHubIssuesSink — Phase 8 dedup", () => {
  function makeFakeStore(matches: Record<string, DedupMatch | null>): SupabaseStore {
    const calls = { lookups: 0, writebacks: 0 };
    const store = {
      findExistingByContentHash: async (hash: string) => {
        calls.lookups++;
        return matches[hash] ?? null;
      },
      setFindingGithubUrlByRun: async () => {
        calls.writebacks++;
      },
      // The other methods aren't used by GitHubIssuesSink — leave undefined.
    } as unknown as SupabaseStore;
    (store as unknown as { __calls: typeof calls }).__calls = calls;
    return store;
  }

  it("comments on the existing issue when a prior with the same content_hash exists", async () => {
    // Compute the same hash the sink will compute for f1.
    const { computeContentHash } = await import("../supabase/content-hash.js");
    const hash = computeContentHash(PAYLOAD.flow_id, PAYLOAD.findings[0]);
    const store = makeFakeStore({
      [hash]: {
        id: "prior-id",
        runId: "prior-run-id",
        githubIssueUrl: "https://github.com/agiterra/tankloop/issues/777",
        firstSeenAt: "2026-05-10T00:00:00Z",
        lastSeenAt: "2026-05-10T00:00:00Z",
        status: "filed",
      },
    });
    const sink = new GitHubIssuesSink({
      dryRun: true,
      minSeverity: "critical",
      dedupStore: store,
    });
    const result = await sink.route({
      ...makeInput(),
      runId: "fresh-run",
      screenshotsDir: "/tmp/x",
    });
    expect(result.ok).toBe(true);
    expect(result.routedCount).toBe(1);
    expect(result.artifacts).toEqual(["https://github.com/agiterra/tankloop/issues/777"]);
  });

  it("files a fresh issue when no prior exists (dry-run still consults the store)", async () => {
    const store = makeFakeStore({});
    const sink = new GitHubIssuesSink({
      dryRun: true,
      minSeverity: "critical",
      dedupStore: store,
    });
    const result = await sink.route({
      ...makeInput(),
      runId: "fresh-run",
      screenshotsDir: "/tmp/x",
    });
    expect(result.ok).toBe(true);
    expect(result.routedCount).toBe(1);
    // dry-run filing returns null URL, so artifacts stays empty.
    expect(result.artifacts).toEqual([]);
  });
});
