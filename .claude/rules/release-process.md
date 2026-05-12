# Release Process

Rove publishes two packages to GitHub Packages (private, `@agiterra` scope):

- `@agiterra/rove-core` — types + schemas + prompt + persona library
- `@agiterra/rove-cli` — CLI + daemon (depends on rove-core)

The dashboard (`@agiterra/rove-dashboard`) is `private: true` — never published; deployed via Vercel Git integration.

## Tagging triggers publish

`.github/workflows/publish.yml` runs on every push of a `v*` tag. It:

1. Installs the workspace.
2. Builds `rove-core` then `rove-cli` (order matters; cli imports core).
3. Publishes both to `npm.pkg.github.com` using the workflow's `GITHUB_TOKEN`.

## To cut a release

```bash
# 1. Bump versions in ALL FOUR package.json files in lockstep:
sed -i '' 's/"version": "0.0.0-alpha.N"/"version": "0.0.0-alpha.N+1"/' \
  packages/core/package.json \
  packages/cli/package.json \
  apps/dashboard/package.json \
  package.json

# 2. Refresh the lockfile
pnpm install

# 3. Verify
pnpm -r build

# 4. Commit + push
git add -A && git commit -m "chore: bump versions to 0.0.0-alpha.N+1"
git push

# 5. Tag + push
git tag v0.0.0-alpha.N+1 -m "Alpha N+1 — <one-liner>"
git push --tags
```

The publish workflow runs automatically. Watch with `gh run list --repo agiterra/rove --workflow=publish.yml`.

## If publish fails

- **`409 Conflict — Cannot publish over existing version`** → you tagged without bumping `package.json`. Delete the tag (`git tag -d <v>; git push --delete origin <v>`), bump, re-tag.
- **`401 Unauthorized`** → the workflow's `GITHUB_TOKEN` permissions are wrong. The workflow uses `permissions: packages: write`. Don't touch the org's `.npmrc`.
- **Tarball contains only `package.json`** → `dist/` wasn't built. The workflow's build step has an `ls -la packages/*/dist` block; check the log.

## After publish

Consumers upgrade with:

```bash
pnpm add -D @agiterra/rove-cli@0.0.0-alpha.N+1
# restart the daemon
```

There's no auto-upgrade. Tankloop's pnpm-lock pins the version; bumping is a manual `pnpm add` + commit.

## Pre-release vs stable

We're `0.0.0-alpha.*` until the agent-readiness rubric stabilizes and we have a second external consumer. Then we'll consider `0.1.0` and a `latest` dist-tag.

Don't publish to `latest` while we're in alpha — every tag goes to GitHub Packages with whatever dist-tag npm uses by default. Consumers explicitly version-pin.
