# Installing Rove into a project

Rove is published to **GitHub Packages** under the `@agiterra` scope. During alpha the repo is private, so installers need a GitHub PAT with `read:packages` scope.

## One-time per machine

Generate a PAT at https://github.com/settings/tokens/new with the `read:packages` scope (only). Store it somewhere your shell can source — `~/.zshrc`, `~/.config/.envrc`, a password manager, your call.

Add a `.npmrc` to the consuming project's repo root (commit this; it has no secrets):

```ini
@agiterra:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Export the PAT in the shell that will run `pnpm install`:

```bash
export GITHUB_TOKEN=ghp_…
```

## Add Rove to the project

```bash
pnpm add -D @agiterra/rove-cli
npx rove init --target-url http://localhost:3000 --github-repo myorg/myrepo
```

`rove init` writes three files into your repo:

```
rove.config.ts          # required config, edit projectId here
rove/flows/.gitkeep     # where your *.flow.yaml files go
.env.rove.example       # secrets your daemon will need
```

## Configure secrets

Copy the example and fill in the two Supabase values (get them from your Rove dashboard → Settings → API) plus the daemon's GitHub handle:

```bash
cp .env.rove.example .env.rove
# edit .env.rove:
#   ROVE_SUPABASE_URL=
#   ROVE_SUPABASE_SERVICE_ROLE_KEY=
#   ROVE_DAEMON_GITHUB_HANDLE=your-gh-handle
```

## Start the daemon

```bash
set -a && source .env.rove && set +a
npx rove daemon
```

The daemon claims `agent_jobs` rows for **your project's `projectId`** only. Two projects running daemons against the same Rove store won't step on each other.

## Removing Rove

```bash
pnpm remove @agiterra/rove-cli
rm -rf rove.config.ts rove/ .env.rove .env.rove.example .npmrc
```

That's all of Rove's footprint in your repo.
