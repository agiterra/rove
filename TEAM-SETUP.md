# Adding Rove to one of your projects

Read this if you're a teammate adding Rove to a new project (or your second, fifth, fortieth). It's the canonical paste-along.

**Total time, fresh project: ~5 minutes.**

---

## Once per machine (skip if already done)

You need a GitHub PAT with `read:packages` so npm can pull `@agiterra/rove-*` from GitHub Packages.

Two paths:

**a) Use your existing `gh` CLI auth.** If you already use `gh`:

```bash
echo "//npm.pkg.github.com/:_authToken=$(gh auth token)" >> ~/.npmrc
```

(Your `gh` token already has `read:packages` if you authed with the default scopes.)

**b) Create a fresh PAT.** https://github.com/settings/tokens/new?scopes=read:packages → name it `rove-install` → 90-day expiry → generate → copy → then:

```bash
echo "//npm.pkg.github.com/:_authToken=ghp_…" >> ~/.npmrc
```

Verify:

```bash
npm whoami --registry=https://npm.pkg.github.com
# → should print your gh handle
```

## In the project you're adding Rove to

```bash
cd /path/to/your/project

# 1. Tell pnpm where the @agiterra scope lives
printf '@agiterra:registry=https://npm.pkg.github.com\n' >> .npmrc
git add .npmrc
git commit -m "chore: add @agiterra scope to .npmrc for rove"

# 2. Install the CLI
pnpm add -D @agiterra/rove-cli

# 3. Bootstrap — this writes rove.config.ts + flows dir + .env.rove.example
npx rove init --target-url http://localhost:3000 --github-repo agiterra/your-project

# 4. Fill in secrets (get the service role key from Brian)
cp .env.rove.example .env.rove
$EDITOR .env.rove

# 5. Sanity check
npx rove doctor
```

## See your project in the dashboard

`rove init` picks a `projectId` from your repo's basename — visible at the top of `rove.config.ts`. Open the dashboard with that slug:

> https://rove-agiterra.vercel.app/?p=YOUR_PROJECT_ID

The project pill in the top-right header lets you switch between projects later — selection sticks via cookie.

## Start your daemon

The daemon claims walks queued for **your project** and runs them via your local Claude Code session. One terminal per machine, one daemon per project:

```bash
set -a && source .env.rove && set +a
npx rove daemon
# → leave this running. Ctrl-C to stop.
```

You should see `[daemon] up as <handle>-<host> (project=<projectId>)` and `[daemon] realtime SUBSCRIBED` within a couple seconds.

## Author your first flow + walk it

Two paths:

**a) Via the dashboard wizard** — easiest:
- /flows/new → "From description" tab → describe the flow → Generate → review → Open PR.
- Merge the PR. Run `npx rove sync` in the project repo to push the new flow YAML to the store.
- Click into the flow → Run walk → pick a persona → Go.

**b) Via a YAML drop** — fastest:
- Create `rove/flows/<flow_id>.flow.yaml` (mirror the shape in `examples/flows/eval_dashboard.discover_flows.flow.yaml`).
- `npx rove sync` to upsert into the store.
- Then either run from the dashboard, or:
  ```bash
  npx rove run --flow <flow_id> --persona dispatcher_novice
  ```

## Pitfalls

- **`pnpm add` fails with 401**: your PAT is missing `read:packages` scope, or your `~/.npmrc` doesn't reference it for `npm.pkg.github.com`.
- **`rove doctor` complains about Playwright MCP**: install it: `claude mcp add playwright npx @playwright/mcp@latest`.
- **Daemon says "Not a team member"**: your GitHub handle isn't in `team_members` yet — ping Brian to add you.
- **Dashboard shows "no daemon online"**: your daemon process died or never started. `ps aux | grep rove`. The pill goes green ~30s after the daemon comes back.
- **Dashboard pill stuck on `tankloop` when you want your project**: append `?p=<your_slug>` to any URL once; cookie sticks afterwards.

## Removing Rove

```bash
pnpm remove @agiterra/rove-cli
rm -rf rove.config.ts rove/ .env.rove .env.rove.example
# Optional — kill the .npmrc entry if no other @agiterra deps:
$EDITOR .npmrc
```

Your project's data stays in the Rove store under its `projectId` until somebody purges it.
