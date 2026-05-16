import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FindingsPayload, SinkInput } from "@agiterra/rove-core";
import { SupabaseSink } from "../sinks/supabase.js";

/**
 * Minimal fake of the supabase-js client surface SupabaseSink touches.
 * Records every call so we can assert what the sink wrote where.
 */
interface FakeOpts {
  /** Per-call queue: each entry is the data the next `select(...).maybeSingle()` returns. */
  selectMaybeSingleQueue?: Array<unknown | null>;
}

function makeFakeClient(opts: FakeOpts = {}) {
  const calls: {
    upserts: Array<{ table: string; rows: unknown }>;
    inserts: Array<{ table: string; rows: unknown }>;
    updates: Array<{ table: string; values: unknown; eq?: [string, unknown] }>;
    uploads: Array<{ bucket: string; key: string; size: number; contentType?: string }>;
    selects: Array<{ table: string }>;
  } = { upserts: [], inserts: [], updates: [], uploads: [], selects: [] };
  const nextFindingIds = ["finding-uuid-1", "finding-uuid-2"];
  let nextFindingIdx = 0;
  const maybeSingleQueue = [...(opts.selectMaybeSingleQueue ?? [])];

  // Chainable that swallows every filter/sort/limit method and resolves on
  // terminal `single()`/`maybeSingle()`. Sufficient for the queries the
  // SupabaseSink + SupabaseStore actually use.
  function makeChainable(table: string, data: unknown | null) {
    const chain: Record<string, unknown> = {
      select: () => {
        calls.selects.push({ table });
        return chain;
      },
      eq: () => chain,
      neq: () => chain,
      gte: () => chain,
      not: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data, error: null }),
      single: () => Promise.resolve({ data, error: null }),
    };
    return chain;
  }

  const fromTable = (table: string) => ({
    upsert(rows: unknown) {
      calls.upserts.push({ table, rows });
      return Promise.resolve({ error: null });
    },
    insert(rows: unknown) {
      calls.inserts.push({ table, rows });
      if (table === "findings") {
        const id = nextFindingIds[nextFindingIdx++] ?? `finding-uuid-${nextFindingIdx}`;
        return {
          select() {
            return {
              single() {
                return Promise.resolve({ data: { id }, error: null });
              },
            };
          },
        };
      }
      return Promise.resolve({ error: null });
    },
    update(values: unknown) {
      return {
        eq(col: string, val: unknown) {
          calls.updates.push({ table, values, eq: [col, val] });
          return Promise.resolve({ error: null });
        },
      };
    },
    select() {
      // Top-level select — the dedup oracle's path. Pop from the queue;
      // when exhausted, default to null (no prior).
      const next = maybeSingleQueue.length > 0 ? maybeSingleQueue.shift() : null;
      return makeChainable(table, next ?? null);
    },
  });

  const fakeClient = {
    from: fromTable,
    storage: {
      from(bucket: string) {
        return {
          async upload(
            key: string,
            buf: Buffer,
            opts?: { contentType?: string; upsert?: boolean },
          ) {
            calls.uploads.push({
              bucket,
              key,
              size: buf.byteLength,
              contentType: opts?.contentType,
            });
            return { error: null };
          },
        };
      },
    },
  };

  return { fakeClient, calls };
}

const PAYLOAD: FindingsPayload = {
  flow_id: "scheduling.create_job.dispatcher",
  persona_id: "dispatcher_novice",
  walked_url: "http://localhost:3000/admin/scheduling",
  summary: "Bounced to sign-in; evaluated login UX.",
  findings: [
    {
      id: "finding-1",
      severity: "critical",
      title: "Entry route requires auth",
      description: "Redirects to /auth/login.",
      step_index: 1,
      screenshots: [{ path: "step1-login.png", caption: "login page" }],
    },
    {
      id: "finding-2",
      severity: "minor",
      title: "Inputs lack labels",
      description: "...",
      screenshots: [],
    },
  ],
};

describe("SupabaseSink", () => {
  let screenshotsDir: string;
  let screenshotPath: string;

  beforeAll(async () => {
    screenshotsDir = await mkdtemp(join(tmpdir(), "rove-supabase-sink-"));
    screenshotPath = join(screenshotsDir, "step1-login.png");
    // Minimal valid PNG (8-byte signature is enough — sink reads bytes, doesn't validate).
    await writeFile(screenshotPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
  afterAll(async () => {
    await rm(screenshotsDir, { recursive: true, force: true });
  });

  it("upserts persona+flow, inserts a run+findings+screenshots, completes the run", async () => {
    const { fakeClient, calls } = makeFakeClient();
    const sink = new SupabaseSink({
      client: fakeClient as never,
      deleteLocalAfterUpload: false,
    });

    const input: SinkInput = {
      payload: PAYLOAD,
      runId: "11111111-2222-3333-4444-555555555555",
      dispatcherId: "claude-code",
      startedAt: new Date("2026-05-11T10:00:00Z"),
      finishedAt: new Date("2026-05-11T10:03:00Z"),
      rawStdout: "",
      screenshotsDir,
      commitSha: "abcdef",
      branch: "feat/eval-dashboard-supabase",
    };

    const result = await sink.route(input);
    expect(result.ok).toBe(true);
    expect(result.routedCount).toBe(2);
    expect(result.error).toBeUndefined();

    // Upserts: persona + flow + run (createRun uses upsert with onConflict).
    expect(calls.upserts.map((u) => u.table)).toEqual(["personas", "flows", "runs"]);

    // Inserts: 2 findings, 1 finding_screenshot
    const insertedTables = calls.inserts.map((i) => i.table);
    expect(insertedTables.filter((t) => t === "findings")).toHaveLength(2);
    expect(insertedTables.filter((t) => t === "finding_screenshots")).toHaveLength(1);

    // Each finding row carries a content_hash
    const findingRows = calls.inserts.filter((i) => i.table === "findings").map((i) => i.rows);
    for (const row of findingRows) {
      expect((row as { content_hash: string }).content_hash).toMatch(/^[0-9a-f]{64}$/);
    }

    // The screenshot got uploaded under runs/<runId>/ with a sanitized name
    expect(calls.uploads).toHaveLength(1);
    expect(calls.uploads[0].bucket).toBe("walks");
    expect(calls.uploads[0].key).toBe(`runs/${input.runId}/step1-login.png`);
    expect(calls.uploads[0].contentType).toBe("image/png");

    // Run was marked completed
    const completeUpdate = calls.updates.find((u) => u.table === "runs");
    expect(completeUpdate).toBeDefined();
    expect((completeUpdate?.values as { status: string }).status).toBe("completed");

    // Artifacts include the run prefix + the screenshot key
    expect(result.artifacts).toContain(`runs/${input.runId}`);
    expect(result.artifacts).toContain(`runs/${input.runId}/step1-login.png`);
  });

  it("optionally deletes the local screenshot copy after upload", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "rove-supabase-cleanup-"));
    const p = join(tempDir, "step1.png");
    await writeFile(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const { fakeClient } = makeFakeClient();
    const sink = new SupabaseSink({
      client: fakeClient as never,
      deleteLocalAfterUpload: true,
    });

    await sink.route({
      payload: {
        flow_id: "f",
        persona_id: "dispatcher_novice",
        findings: [
          {
            id: "x",
            severity: "minor",
            title: "t",
            description: "d",
            screenshots: [{ path: "step1.png" }],
          },
        ],
      },
      runId: "22222222-2222-2222-2222-222222222222",
      dispatcherId: "claude-code",
      startedAt: new Date(),
      finishedAt: new Date(),
      rawStdout: "",
      screenshotsDir: tempDir,
    });

    expect(existsSync(p)).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("treats a missing referenced screenshot as a soft warning, NOT a run-fatal error", async () => {
    // alpha.32: screenshot ENOENT became a warning so a single dropped
    // file doesn't flip the entire run to status=failed. The finding
    // still persists; only the screenshot link is skipped.
    const { fakeClient, calls } = makeFakeClient();
    const sink = new SupabaseSink({ client: fakeClient as never, deleteLocalAfterUpload: false });
    const result = await sink.route({
      payload: {
        flow_id: "f",
        persona_id: "dispatcher_novice",
        findings: [
          {
            id: "x",
            severity: "minor",
            title: "t",
            description: "d",
            screenshots: [{ path: "missing.png" }],
          },
        ],
      },
      runId: "33333333-3333-3333-3333-333333333333",
      dispatcherId: "claude-code",
      startedAt: new Date(),
      finishedAt: new Date(),
      rawStdout: "",
      screenshotsDir,
    });
    expect(result.ok).toBe(true);
    expect(result.routedCount).toBe(1);
    // The finding still got inserted even though its screenshot didn't upload.
    expect(calls.inserts.filter((i) => i.table === "findings")).toHaveLength(1);
    expect(calls.inserts.filter((i) => i.table === "finding_screenshots")).toHaveLength(0);
    // Run is marked completed, not failed.
    const completeUpdate = calls.updates.find((u) => u.table === "runs");
    expect((completeUpdate?.values as { status: string }).status).toBe("completed");
  });

  // Sanity-check what we actually wrote to disk in the happy-path setup.
  it("staged screenshot exists before the test (sanity)", async () => {
    expect((await readFile(screenshotPath)).byteLength).toBeGreaterThan(0);
  });

  it("links a new finding to a prior GH issue when content_hash already exists (Phase 8 dedup)", async () => {
    // Queue: 1st maybeSingle = prior found; 2nd maybeSingle = no prior for finding-2.
    const { fakeClient, calls } = makeFakeClient({
      selectMaybeSingleQueue: [
        {
          id: "prior-finding-uuid",
          run_id: "prior-run-uuid",
          github_issue_url: "https://github.com/example/example/issues/999",
          first_seen_at: "2026-05-10T00:00:00Z",
          last_seen_at: "2026-05-10T00:00:00Z",
          status: "filed",
        },
        null,
      ],
    });
    const sink = new SupabaseSink({
      client: fakeClient as never,
      deleteLocalAfterUpload: false,
    });

    const result = await sink.route({
      payload: {
        flow_id: "scheduling.create_job.dispatcher",
        persona_id: "dispatcher_novice",
        findings: [
          {
            id: "finding-1",
            severity: "critical",
            title: "Entry route requires auth",
            description: "...",
            screenshots: [],
          },
          {
            id: "finding-2",
            severity: "minor",
            title: "Brand new finding",
            description: "...",
            screenshots: [],
          },
        ],
      },
      runId: "44444444-4444-4444-4444-444444444444",
      dispatcherId: "claude-code",
      startedAt: new Date(),
      finishedAt: new Date("2026-05-11T10:03:00Z"),
      rawStdout: "",
      screenshotsDir,
    });
    expect(result.ok).toBe(true);

    const findingInserts = calls.inserts.filter((i) => i.table === "findings");
    expect(findingInserts).toHaveLength(2);

    // First finding got the prior issue URL stamped + status='filed' at insert.
    const first = findingInserts[0].rows as {
      github_issue_url: string | null;
      status: string;
    };
    expect(first.github_issue_url).toBe("https://github.com/example/example/issues/999");
    expect(first.status).toBe("filed");

    // Second finding is new — no URL, status='new'.
    const second = findingInserts[1].rows as {
      github_issue_url: string | null;
      status: string;
    };
    expect(second.github_issue_url).toBeNull();
    expect(second.status).toBe("new");

    // Prior's last_seen_at was bumped.
    const touchUpdate = calls.updates.find(
      (u) =>
        u.table === "findings" &&
        (u.values as { last_seen_at?: string }).last_seen_at !== undefined,
    );
    expect(touchUpdate).toBeDefined();
    expect(touchUpdate?.eq).toEqual(["id", "prior-finding-uuid"]);
  });
});
