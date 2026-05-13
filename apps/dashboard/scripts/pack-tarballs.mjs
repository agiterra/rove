/**
 * Runs as the `prebuild` step for the dashboard. Packs @agiterra/rove-core and
 * @agiterra/rove-cli into apps/dashboard/public/install/ under stable,
 * version-less names so the install script can fetch them at a fixed URL.
 *
 * Why explicit build before pack: `pnpm pack` does not reliably run prepack
 * lifecycle hooks across pnpm versions. We build first so dist/ is fresh.
 *
 * Why stable names: the install script references agiterra-rove-cli.tgz
 * (not agiterra-rove-cli-0.0.0-alpha.9.tgz). After pack we glob the versioned
 * file and copy it to the stable name. The versioned file is also left in place
 * for debugging.
 */

import { execFileSync } from "node:child_process";
import { readdir, rm, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const destDir = resolve(__dirname, "../public/install");

// pnpm workspace root — run all pnpm commands from here.
const pnpmRoot = repoRoot;

function run(cmd, args, cwd = pnpmRoot) {
  console.log(`  $ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

async function cleanDest() {
  const entries = await readdir(destDir).catch(() => []);
  for (const name of entries) {
    if (name === ".gitkeep") continue;
    await rm(join(destDir, name), { force: true });
  }
  console.log("  cleaned public/install/");
}

async function packPackage(filter, stablePrefix) {
  // Build the package so dist/ is current.
  run("pnpm", ["--filter", filter, "run", "build"]);

  // Pack into the destination directory.
  run("pnpm", [
    "--filter",
    filter,
    "pack",
    "--pack-destination",
    destDir,
  ]);

  // Glob the versioned tarball that was just produced.
  const entries = await readdir(destDir);
  const versioned = entries.find(
    (n) => n.startsWith(stablePrefix + "-") && n.endsWith(".tgz")
  );
  if (!versioned) {
    throw new Error(`pack produced no tarball matching "${stablePrefix}-*.tgz" in ${destDir}`);
  }

  const stableName = stablePrefix + ".tgz";
  await copyFile(join(destDir, versioned), join(destDir, stableName));
  console.log(`  ${versioned}  →  ${stableName}`);
}

async function main() {
  console.log("pack-tarballs: cleaning public/install/");
  await cleanDest();

  console.log("pack-tarballs: packing @agiterra/rove-core");
  await packPackage("@agiterra/rove-core", "agiterra-rove-core");

  console.log("pack-tarballs: packing @agiterra/rove-cli");
  await packPackage("@agiterra/rove-cli", "agiterra-rove-cli");

  console.log("pack-tarballs: done");
}

main().catch((err) => {
  console.error("pack-tarballs failed:", err.message);
  process.exit(1);
});
