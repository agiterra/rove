# Workers

Rove walks your app by running a daemon — a local process that claims queued jobs and shells out to your **own** Claude Code (or Codex) session to do the work. Rove charges nothing for AI. The team's existing subscriptions are the substrate.

A **worker** is a registered daemon. Each one has a name, a kind, a list of capabilities, and a heartbeat. The dashboard's `/workers` page and `rove workers list` are the two ways to see who's around.

## The two kinds

| Kind | Where it runs | Always on? | Default claims | What it's for |
| --- | --- | --- | --- | --- |
| `laptop` | A developer's machine running `pnpm daemon` | No — closes with the lid | `manual`, `localhost` | The walks the dev triggers themselves, including walks against their own `localhost:*` |
| `dedicated` | An always-on machine the team operates | Yes | `manual`, `webhook` | Webhook-triggered walks (Phase E), and a safety net when no laptop is online |

A `cloud` kind is reserved in the schema but unused. Rove does not operate workers on your behalf. If you want walks to happen, you operate a worker.

## Capability routing — no tunnels, no priority, no API keys

The capability set on a worker is what decides which jobs it can claim. Laptops deliberately do **not** advertise `webhook`. That is the only mechanism webhook-triggered jobs need to flow to a dedicated team walker even when laptops are also online — the eligibility filter inside `claim_next_job` simply excludes laptops, so the dedicated worker is the only valid claimer.

This avoids three things we explicitly did **not** build:

- No ngrok / Cloudflare Tunnel / Tailscale Funnel — there is no inbound traffic to a daemon. Daemons poll Postgres outbound, the same way they already did.
- No priority sort — eligibility alone determines who can claim. Two daemons cannot race to claim the same job because `claim_next_job` uses `SELECT … FOR UPDATE SKIP LOCKED`.
- No Anthropic API key path. The daemon spawns `claude` as a subprocess on the host machine, which uses *that machine's* Claude Code login. Rove never sees a token and never bills you for inference.

## The home-desktop pattern

The most common reason to want a `dedicated` worker is: "I want walks to keep happening on PRs even when nobody's laptop is open."

On the always-on machine — could be a Mac mini, a $5/mo Linode, an unused desktop, a Raspberry Pi that's powerful enough — install the CLI and log into Claude Code as the user that owns the machine:

```bash
# One-time setup
pnpm install -g @agiterra/rove-cli
claude login                                # auth your local Claude Code

# Configure rove.config.ts pointing at your project, then:
rove daemon \
  --as=agiterra-home-mini \
  --kind=dedicated \
  --claims=manual,webhook
```

`--as` is required for a stable identity. Give it a name that reads well in the team's `/workers` page — `agiterra-home-mini`, `office-walker`, `brian-nuc`. The default name (`<githubHandle>-<hostname>`) works but is less legible.

### Running one machine against multiple projects

The daemon reads `projectId` from `rove.config.ts` in the cwd, but `--project-id` overrides it. Useful when one laptop walks several consumer projects without you having to `cd` between repos:

```bash
# Walk tankloop, even though I'm in the rove repo
rove daemon --project-id=tankloop --as=brian-laptop-tankloop

# In another terminal, walk a second project at the same time
rove daemon --project-id=acme --as=brian-laptop-acme
```

Each daemon registers a distinct worker row (unique on `(project_id, name)`), so they don't conflict. The same `--project-id` flag works on `rove workers list / disable / enable` so you can inspect or toggle workers in any project without changing cwd.

Now the team has:

- The dev's laptop daemons claiming `manual` + `localhost` work as before.
- The home desktop claiming `manual` + `webhook` work whenever it's online.
- Webhook jobs that fire at 3 AM have a real worker to go to.

You can run as many dedicated workers as you want. They split the load via `SKIP LOCKED`. If one goes down, the others claim its share.

## Inspecting workers

From the dashboard: `/workers` (linked from the green/red chip in the header).

From the CLI:

```bash
$ rove workers list
NAME                  KIND       OWNER          CLAIMS            STATUS    HEARTBEAT
agiterra-home-mini    dedicated  brian          manual,webhook    online    8s ago
brian-laptop          laptop     brian          manual,localhost  online    12s ago
sarah-laptop          laptop     sarah          manual,localhost  stopped   2h ago
```

Statuses:

- **online** — heartbeat in the last 30s. Eligible to claim.
- **stale** — alive but heartbeat is older than 30s. The recovery sweep starts releasing this worker's claims after 90s. UI flags it.
- **stopped** — the daemon shut down cleanly (SIGINT/SIGTERM). Its claims were released back to `pending` immediately.
- **disabled** — administratively soft-disabled. The daemon refuses to start. Survives restart.

## Disabling and re-enabling

To temporarily stop a worker from claiming, without touching the host:

```bash
rove workers disable agiterra-home-mini
# … later …
rove workers enable agiterra-home-mini
```

A disabled worker:

- Cannot start (`registerWorker` throws).
- Cannot claim (`claim_next_job` filters it out).
- Stays disabled across host reboots and CLI upgrades, until explicitly enabled.

Use this when a host is going down for maintenance, when you want to temporarily isolate a flaky worker without uninstalling, or when a teammate's machine was decommissioned and the row is just there for history.

## What happens when a worker dies mid-walk

Three failure modes, three behaviors:

| Failure | What happens |
| --- | --- |
| Clean shutdown (SIGINT/SIGTERM) | In-flight claims released back to `pending` within seconds. `workers.stopped_at` stamped. Peer daemons see the freed jobs and claim them. |
| Crash / `kill -9` / loss of network | Heartbeat stops. After 90s a peer daemon's recovery sweep notices and releases the worker's claims. `recovery_count` increments on those jobs. |
| Late completion (claim was recovered, daemon comes back) | Daemon tries `markCompleted`. The ownership predicate inside the UPDATE filters by `claimed_by_worker_id = :self AND status = 'running'`. 0 rows affected → daemon logs and discards the result. The new claimer's progress wins. |

This is why every status-mutating UPDATE in `packages/cli/src/daemon/claim.ts` carries the predicate. The recovery sweep is the only writer permitted to bypass it.

## What workers do NOT do

- Receive inbound traffic. No tunnels, no ports, no callbacks.
- Run AI inference on Rove's account. Walks consume *your* Claude Code subscription. If you want it on a dedicated machine, that machine logs in.
- Reach across project tenancy. A daemon's `rove.config.ts → projectId` scopes everything: claim eligibility, heartbeat row, recovery sweep, shutdown release. A misconfigured daemon in project A cannot touch jobs or workers in project B.

## Adding a new capability

The current capability set is `manual` · `localhost` · `webhook`. To add (say) `nightly`:

1. Add `'nightly'` to the `check (required_capability in (…))` constraint on `agent_jobs` via a new migration.
2. Add it to the parser in `packages/cli/src/cli.ts` (the `--claims` validator).
3. Decide which `kind` (or kinds) advertise it by default in `packages/cli/src/daemon/heartbeat.ts → defaultCapabilities`.
4. Update the job-creator(s) that fire `nightly`-tagged work to set `required_capability: 'nightly'`.
5. Update this file.

No schema change is needed beyond the constraint; the `capabilities` jsonb on each worker is already free-form.

## First install (macOS)

This section is for a teammate installing the daemon on their machine for the first time. The whole flow takes one terminal paste and about 30 seconds.

**Prerequisites.** You must already be in the Rove `team_members` table. Ask an existing team member to add you if you don't have dashboard access.

1. **Sign in** at `https://rove-agiterra.vercel.app/` with your GitHub account.

2. **Open `/setup`.** The header chip links directly to `/setup` when no worker is registered for your account.

3. **Fill in the form.**
   - **Worker name** — defaults to `<hostname>-<github_handle>`. Change it to something legible on the `/workers` page if you prefer (e.g. `brian-laptop`, `office-mini`).
   - **Kind** — `laptop` for your daily dev machine; `dedicated` for an always-on host.

4. **Click "Generate install command."** A one-liner appears:
   ```bash
    curl -fsSL https://rove-agiterra.vercel.app/install | bash -s -- --install-code=<uuid>
   ```
   The install code is a **short-lived single-use bearer secret** (5-minute TTL). It is safer than a real credential, but treat it like one — don't share the line with anyone who shouldn't be able to register a worker in your name.

   **Optional — keep the code out of shell history.** Run this first, then prefix the paste with a leading space:
   ```bash
   export HISTCONTROL=ignorespace   # bash
   # or, for zsh:
   setopt hist_ignore_space
   ```
   Most shells skip leading-space commands from history. This is belt-and-suspenders; the 5-minute one-shot window already bounds exposure significantly.

5. **Paste into Terminal.** The script will:
   - POST the install code to the dashboard and exchange it for a worker JWT over HTTPS.
   - Write `~/.rove/auth.token` (the JWT, chmod 600) and `~/.rove/env` (worker name, project, Supabase URL — chmod 600). The `~/.rove/` directory itself is chmod 700.
   - Download `@agiterra/rove-core` and `@agiterra/rove-cli` as tarballs from the dashboard and `npm install` them into `~/.rove/lib/`. No global install; everything is self-contained.
   - Write `~/Library/LaunchAgents/com.agiterra.rove.daemon.plist` with your worker name, project, and absolute paths to `node` and the CLI baked in. Registers the LaunchAgent and starts the daemon immediately.
   - Compile `~/Applications/Rove Launcher.app` — an AppleScript applet that handles `rove://` URLs. The dashboard uses `rove://start`, `rove://stop`, `rove://restart`, and `rove://reveal-logs` to drive the daemon without another terminal trip.

6. **Watch the dashboard.** The `/setup` page realtime-subscribes to the `workers` table and flips to "Daemon installed and running on `<your_worker>`" within ~30 seconds once the heartbeat lands.

That's it. Return to the dashboard — the header chip turns cyan and the daemon runs at every login automatically.

**macOS only.** The install script bails immediately on non-Darwin. Linux (`systemd --user`) and Windows (Task Scheduler) follow the same shape but ship after alpha.

### Troubleshooting

- **Daemon isn't appearing online?**
  - Run `rove auth show-token` to see what the active token says (worker name, project, expiry).
  - Check `~/.rove/daemon.err` for fatal startup errors. The message `worker token rejected (revoked or expired)` means the token was invalidated — re-run the install one-liner from `/setup` to mint a fresh one.
  - Run `launchctl print gui/$UID/com.agiterra.rove.daemon` to confirm the agent is loaded and see its last exit code.
  - Check whether the agent is in the disabled state: `launchctl print-disabled gui/$UID | grep rove`. If it shows `true`, the agent was disabled (either by `launchctl disable` or a previous `rove workers disable`). Re-enable it: `launchctl enable gui/$UID/com.agiterra.rove.daemon`, then re-run the install one-liner. The URL handler (`rove://start`) deliberately does **not** auto-undo a `disable` — that's the intended behavior so a deliberate pause isn't overridden by a website click.

- **Log paths.** The daemon writes to:
  - `~/.rove/daemon.log` — stdout (normal operation).
  - `~/.rove/daemon.err` — stderr (errors, startup failures).

  View live: `tail -f ~/.rove/daemon.log`. Or click "Reveal logs" on the `/workers` page, which triggers `rove://reveal-logs` and opens Finder to the log file.

- **Worker stuck "paused" (amber chip)?** The `stopped_at` timestamp is set within the last hour. Click "Resume" on `/workers` — this invokes `rove://start`, which runs `bootstrap` + `kickstart` to bring the daemon back up without needing a terminal.

- **Worker stuck "offline" + can't resume via the chip?** The worker either went beyond the 1-hour paused window or never recovered from a crash. Use the "Restart" button on `/workers` (`rove://restart`). If that also fails, re-run the install one-liner from `/setup` — it's fully idempotent, rotates the token, and restarts everything cleanly.

- **`rove://` prompt never appears?** The first time any page invokes a `rove://` URL, macOS shows an "Open Rove Launcher?" confirmation. Check "Always allow" to make subsequent clicks silent. If the prompt never appears at all, the `lsregister` step at the end of the install script may have failed silently — re-running the install one-liner will re-register the applet.

- **Uninstall.** There is no `rove://uninstall` action (removing the binary that hosts the URL handler from inside the URL handler is awkward). Uninstall is manual:
  ```bash
  launchctl bootout gui/$UID ~/Library/LaunchAgents/com.agiterra.rove.daemon.plist 2>/dev/null || true
  rm -f ~/Library/LaunchAgents/com.agiterra.rove.daemon.plist
  rm -rf ~/Applications/Rove\ Launcher.app
  rm -rf ~/.rove
  ```
  This removes all local artifacts. The `workers` row in the Rove database is **not** deleted — the daemon never removes its own registration. To fully retire the worker name (so it won't show up on `/workers`), an admin runs `rove workers disable <name>` or removes the row directly.

## See also

- [`docs/plans/named-workers.md`](plans/named-workers.md) — the design document, with the rationale + the four rounds of review that shaped this implementation.
- [`docs/plans/install-flow.md`](plans/install-flow.md) — the full install-flow plan (v3/v3.1) with the security model, script pseudocode, and reviewer cheatsheet.
- [`docs/ROADMAP.md`](ROADMAP.md) — where workers fit in the larger phase plan.
