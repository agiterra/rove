import { getSupabaseClient } from "../supabase/client.js";

const WALKS_BUCKET = "walks";
const PAGE_SIZE = 200;

export interface CleanupResolvedOptions {
  /** When true, log what would be deleted but don't delete. Default false. */
  dryRun: boolean;
}

/**
 * Deletes Supabase Storage objects + finding_screenshots rows for every
 * finding where `resolved_at IS NOT NULL AND screenshots_purged_at IS NULL`.
 * Then stamps `screenshots_purged_at = now()`.
 *
 * Idempotent. Safe to run on a cron. Safe for any agent to invoke.
 */
export async function runCleanupResolvedCommand(opts: CleanupResolvedOptions): Promise<number> {
  const db = getSupabaseClient();

  let totalFindings = 0;
  let totalObjects = 0;
  let totalRows = 0;
  let totalErrors = 0;

  for (;;) {
    const { data: findings, error } = await db
      .from("findings")
      .select("id, run_id, finding_screenshots(id, storage_bucket, storage_key)")
      .not("resolved_at", "is", null)
      .is("screenshots_purged_at", null)
      .limit(PAGE_SIZE);

    if (error) {
      console.error(`✗ Failed to query findings: ${error.message}`);
      return 1;
    }
    if (!findings || findings.length === 0) break;

    for (const finding of findings) {
      const screenshots = (finding as { finding_screenshots: ScreenshotRow[] }).finding_screenshots;
      const keys = screenshots.map((s) => s.storage_key);

      if (opts.dryRun) {
        console.log(
          `[dry-run] finding ${finding.id}: would remove ${keys.length} storage object(s)`,
        );
        totalFindings++;
        totalObjects += keys.length;
        continue;
      }

      if (keys.length > 0) {
        const { error: rmErr } = await db.storage.from(WALKS_BUCKET).remove(keys);
        if (rmErr) {
          totalErrors++;
          console.error(`✗ Storage remove failed for finding ${finding.id}: ${rmErr.message}`);
          continue;
        }
        totalObjects += keys.length;

        const { error: delErr } = await db
          .from("finding_screenshots")
          .delete()
          .eq("finding_id", finding.id);
        if (delErr) {
          totalErrors++;
          console.error(
            `✗ Row delete failed for finding ${finding.id}: ${delErr.message}. ` +
              `Storage was cleared but the join rows remain — rerun to retry.`,
          );
          continue;
        }
        totalRows += screenshots.length;
      }

      const { error: stampErr } = await db
        .from("findings")
        .update({ screenshots_purged_at: new Date().toISOString() })
        .eq("id", finding.id);
      if (stampErr) {
        totalErrors++;
        console.error(`✗ Failed to stamp purged_at for finding ${finding.id}: ${stampErr.message}`);
        continue;
      }
      totalFindings++;
    }

    if (findings.length < PAGE_SIZE) break;
  }

  const prefix = opts.dryRun ? "[dry-run] " : "";
  console.log(
    `${prefix}✓ Purged ${totalObjects} screenshot${totalObjects === 1 ? "" : "s"} ` +
      `(${totalRows} row${totalRows === 1 ? "" : "s"}) across ${totalFindings} resolved finding${
        totalFindings === 1 ? "" : "s"
      }.`,
  );
  if (totalErrors > 0) console.error(`✗ ${totalErrors} error(s) — see above. Safe to rerun.`);
  return totalErrors === 0 ? 0 : 1;
}

interface ScreenshotRow {
  id: string;
  storage_bucket: string;
  storage_key: string;
}
