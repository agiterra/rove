import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { BUILT_IN_PERSONAS, discoverFlows, type FlowInfo, type Persona } from "@agiterra/rove-core";
import { loadRoveConfig } from "../config.js";
import { getSupabaseClient } from "../supabase/client.js";
import { SupabaseStore } from "../supabase/store.js";
import type { ResolvedWorkspace } from "../workspace.js";

export interface SyncOptions {
  /** When true, print what would be written but don't write. */
  dryRun: boolean;
}

/**
 * Push the in-repo personas + flow YAML into the eval Supabase store.
 *
 * Git is canonical for these; Supabase is a mirror so the dashboard can
 * render labels and goals without reading the repo. Run this after
 * persona or flow YAML changes land on the branch you're walking.
 *
 * The runtime auto-upserts on every walk already (see SupabaseSink), so
 * `sync` is mostly useful for:
 *   - seeding a freshly-applied schema before the first walk
 *   - re-stamping `synced_from_yaml_at` after a YAML edit
 *   - detecting drift in dry-run mode
 */
export async function runSyncCommand(ws: ResolvedWorkspace, opts: SyncOptions): Promise<number> {
  const db = getSupabaseClient();
  const { config } = await loadRoveConfig(ws.rootDir);
  const store = new SupabaseStore(db, config.projectId);

  const flows = await discoverFlows(ws.flowsDir);
  console.log(`Discovered ${BUILT_IN_PERSONAS.length} personas + ${flows.length} flows.`);

  let written = 0;
  let errors = 0;

  // Project-level binding: mirror `github.repo` from rove.config.ts into
  // `projects.github_repo` so the dashboard's "Send to GitHub issue"
  // button knows which repo to file against. Clears the binding when
  // config omits `github`.
  const desiredRepo = config.github?.repo ?? null;
  try {
    if (opts.dryRun) {
      console.log(
        `[dry-run] project ${config.projectId} github_repo=${desiredRepo ?? "(none)"}`,
      );
    } else {
      await store.upsertProjectGithubRepo(desiredRepo);
      written++;
    }
  } catch (err) {
    errors++;
    console.error(
      `✗ project ${config.projectId} github_repo sync: ${err instanceof Error ? err.message : err}`,
    );
  }

  for (const persona of BUILT_IN_PERSONAS) {
    try {
      const sha = personaSha(persona);
      if (opts.dryRun) {
        console.log(`[dry-run] persona ${persona.id} (sha=${sha.slice(0, 12)}…)`);
      } else {
        await store.upsertPersonaWithYaml(persona, sha);
        written++;
      }
    } catch (err) {
      errors++;
      console.error(`✗ persona ${persona.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  for (const flow of flows) {
    try {
      const sha = await flowSha(flow);
      if (opts.dryRun) {
        console.log(`[dry-run] flow ${flow.flowId} (sha=${sha.slice(0, 12)}…)`);
      } else {
        await store.upsertFlowWithYaml(flow, sha);
        written++;
      }
    } catch (err) {
      errors++;
      console.error(`✗ flow ${flow.flowId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  const prefix = opts.dryRun ? "[dry-run] " : "";
  console.log(`${prefix}✓ Synced ${written} row(s). ${errors} error(s).`);
  return errors === 0 ? 0 : 1;
}

function personaSha(p: Persona): string {
  // Stable canonical encoding so the hash only changes when the persona
  // semantically changes. Built-in personas have no source YAML, so we hash
  // the in-code shape; workspace personas (Phase 9+) will hash their YAML.
  const canonical = JSON.stringify(
    {
      id: p.id,
      label: p.label,
      description: p.description,
      category: p.category,
      expertise: p.expertise,
      constraints: p.constraints,
      promptAddendum: p.promptAddendum,
      isBuiltIn: p.isBuiltIn,
      icon: p.icon ?? null,
    },
    Object.keys({
      id: 0,
      label: 0,
      description: 0,
      category: 0,
      expertise: 0,
      constraints: 0,
      promptAddendum: 0,
      isBuiltIn: 0,
      icon: 0,
    }).sort(),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

async function flowSha(flow: FlowInfo): Promise<string> {
  const buf = await readFile(flow.filePath);
  return createHash("sha256").update(buf).digest("hex");
}
