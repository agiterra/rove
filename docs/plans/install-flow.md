# Plan — Web-Driven Local Worker Install

**Status**: Proposed, not started. v3 — incorporates two rounds of Codex review. Sits above [`worker-tokens.md`](worker-tokens.md) (v2).
**Owner**: Brian.
**Why now**: The dashboard cannot, by browser security model, launch a process on the user's machine. The realistic "user never leaves the interface" experience is therefore *one* terminal moment (the install paste) followed by an always-on local daemon plus a `rove://` protocol handler the dashboard can poke when the daemon is stopped or crashed.

## v3 changes (responses to second Codex review)

1. **Install code framing tightened.** v2 called the install code "not a credential" — too strong. It IS a short-lived single-use bearer secret while it's live (5 minutes); whoever captures it before exchange can redeem it. v3 phrases it as such and recommends `HISTCONTROL=ignorespace` (so a leading-space-prefixed paste isn't recorded) for users who want extra hardening.
2. **Exchange endpoint auth model is explicit.** v2 said "both gated against `is_team_member()`" which was misleading for the exchange endpoint. v3 makes it explicit: the **mint** endpoint (`/api/install/mint`, called from `/setup`) is user-session-authenticated (must be a signed-in team member). The **exchange** endpoint (`/api/install/exchange`, called by the install script) is *code-authenticated* — it validates the install_code row, indirectly enforcing team membership via the user_id stamped at mint time.
3. **LaunchAgent invokes `node` directly with the absolute `.js` path, not the `.bin/rove` shim.** v2's example used `~/.rove/lib/node_modules/.bin/rove`, which is a shell shim with a `#!/usr/bin/env node` shebang. Under `launchctl`'s sparse PATH, `env node` can fail. v3 invokes `<NODE_BIN> <ROVE_JS_PATH> daemon …` literally — both paths resolved at install time.
4. **AppleScript source has paths substituted before `osacompile`.** v2 wrote `"$HOME/.rove/url-handler.sh"` inside the AppleScript string literal. AppleScript doesn't expand shell variables in compiled scripts. v3's install script does `sed 's|__URL_HANDLER__|'"$HOME/.rove/url-handler.sh"'|'` on the AppleScript source before compiling.
5. **`rove://start` no longer calls `launchctl enable`.** v2's start path was `bootstrap` + `enable` + `kickstart`. The `enable` step would override a user's deliberate `launchctl disable` (e.g., from `rove workers disable` having run an enable-flag side effect, or from the user manually disabling). v3's `rove://start` only does `bootstrap` + `kickstart`. The persistent enable/disable flag is owned by the user (via `rove workers disable/enable` CLI), never the URL handler. The handler's action table is updated accordingly.
6. **Stale `launchctl load -w` wording in Security section corrected** to the modern `bootstrap`/`bootout` verbs.

## v2 changes (responses to first Codex review)

1. **No secrets in argv.** v1 passed `--token=<jwt>` on the install command line — that leaks into shell history and `ps -ef` listings. v2 ships a short-lived single-use **install code** instead; the install script POSTs the code to `/api/install/exchange` to receive the real JWT over HTTPS. The exchange call also returns the supabase URL, project, handle, and worker name, so the one-liner shrinks to a single non-secret argument.
2. **Ship tarballs, not a git clone + build.** v1's `git clone … && pnpm install && pnpm --filter rove-cli build` was brittle (toolchain-dependent) and slow (>30s on most machines, much more on cold pnpm cache). v2 has the dashboard's Vercel build pack `@agiterra/rove-core` and `@agiterra/rove-cli` as tarballs into `apps/dashboard/public/install/`. The install script downloads the two tarballs and runs `npm install --prefix ~/.rove/lib …` once.
3. **Absolute `node` path baked into the LaunchAgent plist.** v1 used `$(which node)` inside the plist's command string. `launchd` starts with a sparse PATH and may not find Node. v2 resolves the absolute `node` path at install time and writes it into the plist literally. Same for any other tool the plist invokes.
4. **Prefer modern `launchctl` verbs.** v1 used `launchctl load -w` / `unload`, which are legacy and easy to misuse on modern macOS. v2 prefers `launchctl bootstrap gui/$UID <plist>` and `bootout gui/$UID <plist>` for load/unload; `enable gui/$UID/<label>` and `disable gui/$UID/<label>` for the persistent flag. `load/unload` only appear as documented fallbacks.
5. **`rove://stop` and admin-disable are explicitly distinct.** v1's action table conflated "pause until next login" with "administratively disabled." v2 maps `rove://stop` to `bootout` only (next login restarts) and routes admin-disable through `rove workers disable <name>` (which also sets `workers.disabled_at`, so re-enable requires either the CLI or the dashboard). The two action surfaces don't overlap.
6. **`rove://` handler is an AppleScript applet, not a raw shell `.app`.** macOS URL handlers receive `kAEGetURL` Apple Events; a bare shell executable in `Contents/MacOS/` cannot intercept those. v2's install script builds an AppleScript applet (via `osacompile`) whose `on open location` handler shells out to the action script. The shell layer is still where the logic lives, but the Apple Events plumbing goes through the applet.
7. **URL handler ignores untrusted URL parameters.** v1 implied `rove://start?name=<worker_name>` was meaningful. Any website can craft such a URL. v2's handler reads `worker_name` and `project_id` from `~/.rove/env` (local trusted state) and ignores all URL query parameters. The action keyword (`start` / `stop` / `restart` / `reveal-logs`) is the only thing the URL controls, and it's a closed enum.

## Goal

A team member opens the dashboard, clicks a single button, pastes a single command into their terminal once, and never has to think about the daemon again. The dashboard auto-detects the worker, shows it online, and — if the daemon ever stops — has an in-page action that resumes it without another terminal trip.

## Non-goals

- **No silent install from the browser.** OS security models forbid it; we won't pretend otherwise. The first install is a one-time terminal paste.
- **No service-role key in install scripts.** Worker tokens are the only credential the install flow ships. Service-role stays server-only.
- **No hosted walker / Vercel Sandbox.** Workers run on team-operated hardware.
- **No Linux or Windows support in this plan.** macOS-only for alpha. Linux + Windows follow the same shape (`systemd --user` and Task Scheduler + registry handler) but ship later.
- **No code-signing pipeline.** The `rove://` handler `.app` is ad-hoc signed (`codesign -s -`) for alpha. Gatekeeper will warn once; user clicks through. Real signing is a future ops task.

## Dependencies

- **[`docs/plans/worker-tokens.md`](worker-tokens.md) must ship first.** The install script writes a worker token to `~/.rove/auth.token`. Without that plan, the only credential we could hand out is the service-role key, which we explicitly refuse to do.
- Worker tokens can be prototyped *locally* against service-role to feel the UX, but the install flow does not ship until JWT lands.

## User flow

1. User signs into the dashboard at `rove-agiterra.vercel.app`.
2. They navigate to `/setup` (linked from the header chip when no worker is online, and from the `/workers` empty state).
3. The page server-mints a single-use **install code** (UUID v4, 5min TTL) bound to (auth user, project, worker_name) via `POST /api/install/mint` (user-session-authenticated; must be a signed-in team member). The code is a **short-lived single-use bearer secret** while it's live — anyone who captures it within 5 minutes can redeem it once for the real worker token. Once consumed or expired, it's inert. This is dramatically safer than passing the JWT itself in argv, but reviewers should not conflate "not as bad as a token" with "not a credential."
4. The page renders one copyable command:
   ```bash
   curl -fsSL https://rove-agiterra.vercel.app/install | bash -s -- --install-code=<uuid>
   ```
   No tokens, no URLs, no project slugs, no GitHub handles in argv — all of that flows over HTTPS in step 5.
5. User pastes into a terminal. The installer immediately POSTs the install code to `https://rove-agiterra.vercel.app/api/install/exchange`. **The exchange endpoint is code-authenticated, not user-session-authenticated** — it has no notion of the calling user beyond what the install_codes row says. Its only credential is the install code itself. It:
   - Looks up the `install_codes` row by code value (single index hit).
   - Validates: not consumed, not expired, the originally-issuing user is still a team member (`is_team_member()` against `install_codes.user_id`).
   - Marks the row consumed (`consumed_at = now()`, `consumed_ip = request IP`) within the same transaction.
   - Mints a worker JWT (via the worker-tokens plan's mint logic) using the row's stored `worker_name` + `project_id`.
   - Returns `{ token, supabase_url, supabase_publishable_key, project_id, worker_name, github_handle, expires_at }` as JSON over HTTPS.

To harden against an attacker who briefly sees the install code in someone's shell history: the `/setup` page suggests users run `export HISTCONTROL=ignorespace` (or use `setopt hist_ignore_space` in zsh) before pasting, and prefix the curl command with a leading space — which most shells then exclude from history. Optional; the 5-minute one-shot window already bounds the exposure.
6. The installer writes the returned token to `~/.rove/auth.token` (chmod 600), writes the rest to `~/.rove/env` (chmod 600), and proceeds with the package + LaunchAgent + URL handler install (~30s total).
7. Within seconds of completion, the dashboard's realtime subscription on `workers` fires; the page flips to "✓ Daemon installed and running on `<worker_name>`."
8. The user never returns to the terminal for normal operation. Dashboard "Run walk" buttons just work.

### Install code storage

```sql
create table public.install_codes (
  code         uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   text not null,
  worker_name  text not null,
  worker_kind  text not null default 'laptop' check (worker_kind in ('laptop','dedicated')),
  expires_at   timestamptz not null default (now() + interval '5 minutes'),
  consumed_at  timestamptz,
  consumed_ip  inet,
  created_at   timestamptz not null default now()
);

create index install_codes_lookup_idx
  on public.install_codes (code)
  where consumed_at is null;

alter table public.install_codes enable row level security;
-- Read by the issuing user (so /setup can show "your install code is still valid" if they reload).
create policy install_codes_self_read
  on public.install_codes for select
  using (user_id = auth.uid());
-- No client-side writes. Mint + exchange both run server-side with service-role.
```

A nightly cron (or just a query inside the exchange endpoint) prunes consumed/expired rows older than a day.

## Runtime model

Two cooperating local pieces. One credential.

| Piece | Purpose | Lives at |
| --- | --- | --- |
| **The CLI tarballs** | `@agiterra/rove-core` + `@agiterra/rove-cli`, packed by the dashboard's build pipeline and downloaded once | `~/.rove/lib/node_modules/@agiterra/…` |
| **The daemon** (`rove daemon …`) | Long-running worker that claims jobs and dispatches walks | Invoked via absolute path `~/.rove/lib/node_modules/@agiterra/rove-cli/bin/rove.js` |
| **`launchd` LaunchAgent** | Auto-starts the daemon at user login; respawns on crash | `~/Library/LaunchAgents/com.agiterra.rove.daemon.plist` |
| **`rove://` handler `.app`** (AppleScript applet) | URL handler the dashboard invokes to start/stop/restart the daemon. Wraps a shell action script. | `~/Applications/Rove Launcher.app/` |
| **Worker token** | Per-worker JWT, single credential for all DB writes | `~/.rove/auth.token` (chmod 600) |
| **Local config** | `worker_name`, `project_id`, supabase URL — the trusted-local source the URL handler reads | `~/.rove/env` (chmod 600) |

The daemon is the engine. The LaunchAgent is the spine — it handles the "user logs in, daemon starts" path with zero clicks. The `rove://` handler is the recovery/control surface — it handles every case where the LaunchAgent didn't carry the user (crashed, disabled, never installed correctly, manually paused, etc.). Both rely on the same token file.

### Auto-start (the default path)

A `launchd` LaunchAgent fires at login. The install script resolves the absolute path of `node` once (`command -v node`) and writes the result into the plist literally — `launchctl` runs with a sparse PATH, so a `$(which node)` substitution at runtime is unreliable. Same for `$HOME`; the install script substitutes the user's actual home before writing.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Label</key>          <string>com.agiterra.rove.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <!-- Invoke node directly with the absolute .js path. Avoiding the
         .bin/rove shim sidesteps its `#!/usr/bin/env node` shebang, which
         can fail under launchctl's sparse PATH. -->
    <string>/usr/local/bin/node</string>
    <string>/Users/brian/.rove/lib/node_modules/@agiterra/rove-cli/bin/rove.js</string>
    <string>daemon</string>
    <!-- Worker name + project resolved at install time, written literally. -->
    <string>--as=brian-laptop</string>
    <string>--project-id=rove-dogfood</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>                              <string>/usr/local/bin:/usr/bin:/bin</string>
    <key>ROVE_SUPABASE_URL</key>                 <string>https://….supabase.co</string>
    <key>ROVE_SUPABASE_PUBLISHABLE_KEY</key>     <string>eyJ…</string>
    <key>ROVE_WORKER_TOKEN_FILE</key>            <string>/Users/brian/.rove/auth.token</string>
    <key>ROVE_DAEMON_GITHUB_HANDLE</key>         <string>brian</string>
  </dict>
  <key>RunAtLoad</key>      <true/>
  <key>KeepAlive</key>
  <dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key> <integer>10</integer>
  <key>StandardOutPath</key> <string>/Users/brian/.rove/daemon.log</string>
  <key>StandardErrorPath</key> <string>/Users/brian/.rove/daemon.err</string>
</dict></plist>
```

Notes:

- **Both paths in `ProgramArguments` are absolute and resolved at install time.** The install script does `NODE_BIN="$(command -v node)"` and `ROVE_JS="$HOME/.rove/lib/node_modules/@agiterra/rove-cli/bin/rove.js"`; both are written literally into the plist. No `env`, no shim, no PATH lookup at execution time.
- **The publishable key lands in `EnvironmentVariables`.** Worker-tokens v2 requires both the publishable key (as `apikey`) and the worker token (as `Authorization: Bearer`). The token stays in a file outside the plist (via `ROVE_WORKER_TOKEN_FILE`) so it doesn't appear in `launchctl print` output.
- The daemon CLI's `pickAuth()` (worker-tokens plan) reads `ROVE_WORKER_TOKEN_FILE` and falls back to `ROVE_WORKER_TOKEN` env var. Token-file support is a worker-tokens dependency; this plan depends on that.

Load + persist at install time:

```bash
# Install-time only: enable runs once, so the LaunchAgent is allowed to run by
# default. After install, only the user controls the persistent enable/disable
# flag via `rove workers …` (or `launchctl enable/disable` directly).
launchctl bootstrap gui/$UID "$HOME/Library/LaunchAgents/com.agiterra.rove.daemon.plist"
launchctl enable    gui/$UID/com.agiterra.rove.daemon
launchctl kickstart -k gui/$UID/com.agiterra.rove.daemon
```

The `enable` step at install time is necessary because a never-before-seen LaunchAgent might be in the "unknown" state on some configurations. **After install, no other code path calls `enable`** — `rove://start` deliberately omits it (see the action table below). That keeps the persistent enable/disable flag under user control: a user who runs `launchctl disable gui/$UID/com.agiterra.rove.daemon` (or `rove workers disable`, which sets a DB-level kill switch) stays disabled until they explicitly re-enable, regardless of what any website tries to do via `rove://`.

Unload (session-scoped pause):

```bash
launchctl bootout gui/$UID "$HOME/Library/LaunchAgents/com.agiterra.rove.daemon.plist"
```

Legacy `launchctl load -w` / `unload` work but are documented only as fallbacks if the modern verbs misbehave on a specific macOS version.

### `rove://` handler (the recovery/control surface)

A minimal **AppleScript applet** at `~/Applications/Rove Launcher.app/`. Apple Events route URL-open events (`kAEGetURL`) to an applet's `on open location` handler — a bare shell executable in `Contents/MacOS/` does *not* receive these events, so the URL handler has to be Apple-Events-aware. The applet itself does almost nothing; it shells out to a small action script that holds the real logic.

Built at install time. **AppleScript does not expand shell variables inside compiled scripts** — paths must be substituted into the source before `osacompile`. The install script generates the AppleScript with the real path baked in:

```bash
# Resolve the absolute path once at install time.
URL_HANDLER="$HOME/.rove/url-handler.sh"

# Generate AppleScript source with the literal path embedded. Note the path is
# expanded by the *shell* during heredoc evaluation, so the compiled .scpt
# carries the absolute path, not the string "$HOME/.rove/url-handler.sh".
cat > /tmp/rove-launcher.applescript <<OSA
on open location this_url
  do shell script "${URL_HANDLER} " & quoted form of this_url
end open location
OSA

osacompile -o "$HOME/Applications/Rove Launcher.app" /tmp/rove-launcher.applescript
rm /tmp/rove-launcher.applescript
```

`Info.plist` (written by the install script after `osacompile`):

```xml
<key>CFBundleURLTypes</key>
<array><dict>
  <key>CFBundleURLName</key>    <string>Rove Launcher</string>
  <key>CFBundleURLSchemes</key> <array><string>rove</string></array>
</dict></array>
```

Ad-hoc-signed with `codesign -s - "$HOME/Applications/Rove Launcher.app"` and registered with LaunchServices via `lsregister -R "$HOME/Applications/Rove Launcher.app"`.

The action script `~/.rove/url-handler.sh` (chmod 700):

```bash
#!/bin/bash
set -euo pipefail

# Parse only the action keyword from the URL path. Ignore all query params —
# any website can craft a rove:// URL with arbitrary params; we never let
# them control which worker is targeted.
url="$1"
action="${url#rove://}"
action="${action%%[?/]*}"   # everything before the first ? or /

PLIST="$HOME/Library/LaunchAgents/com.agiterra.rove.daemon.plist"

case "$action" in
  start)
    # Bootstrap loads the agent into the user's launchctl domain; kickstart
    # forces an immediate start.
    # IMPORTANT: do NOT call `launchctl enable` here. A website crafting
    # rove://start should never be able to override a user's deliberate
    # `launchctl disable` or admin-level disable. If the agent is in the
    # "disabled" state, bootstrap will fail-silent and the daemon stays down
    # until the user explicitly re-enables.
    launchctl bootstrap gui/$UID "$PLIST" 2>/dev/null || true
    launchctl kickstart -k gui/$UID/com.agiterra.rove.daemon 2>/dev/null || true
    ;;
  stop)
    # Session-scoped pause. Next login (or a re-bootstrap) restarts.
    # Does NOT call `launchctl disable` — disable is for the admin path,
    # not the URL handler.
    launchctl bootout gui/$UID "$PLIST" 2>/dev/null || true
    ;;
  restart)
    launchctl bootout gui/$UID "$PLIST" 2>/dev/null || true
    launchctl bootstrap gui/$UID "$PLIST" 2>/dev/null || true
    launchctl kickstart -k gui/$UID/com.agiterra.rove.daemon 2>/dev/null || true
    ;;
  reveal-logs)
    open -R "$HOME/.rove/daemon.log"
    ;;
  *)
    # Closed enum — refuse anything else, silently.
    exit 0
    ;;
esac
```

Action table:

| URL | What it does | What it does NOT do |
| --- | --- | --- |
| `rove://start` | `bootstrap` + `kickstart`. Daemon runs now. | Does NOT call `launchctl enable` — cannot override a user's `launchctl disable` or the install-time disabled state. Does NOT change `workers.disabled_at` (admin disable owned by `rove workers disable/enable`). |
| `rove://stop` | `bootout`. Daemon stops; next login (or `bootstrap`) restarts. | Does NOT call `launchctl disable` — session-scoped only. Does NOT set `workers.disabled_at`. |
| `rove://restart` | `bootout` + `bootstrap` + `kickstart`. | Same caveats as `start` re. enable. |
| `rove://reveal-logs` | Opens Finder to the daemon log. | — |

Admin-disable is intentionally **not** in this table. `rove workers disable <name>` sets `workers.disabled_at` in the DB, which the daemon's startup refuses to come up through. That's the persistent kill switch; it survives reboots, re-installs, and `rove://start`. To re-enable: `rove workers enable <name>` or the dashboard's enable button.

Likewise, `launchctl disable gui/$UID/com.agiterra.rove.daemon` (run manually by the user) is a local kill switch that `rove://start` deliberately does not undo. The user owns both kill switches; the URL handler cannot override either.

The browser shows a one-time confirmation prompt ("Open Rove Launcher?") on the first invocation; users can check "Always allow" so subsequent invocations are silent. Until they do, every dashboard click requires one OS-level "yes" — that's the deliberate user-consent gate macOS enforces for any web → native crossing.

## Dashboard UX

`/setup`:

- Inputs: worker_name (default `<hostname>-<handle>`), kind (default `laptop`), project (read from URL/cookie).
- Renders the install one-liner with the user's data baked in. Copy-to-clipboard button.
- Realtime-subscribed status panel below:
  - **Installing** (default) — waiting for the worker to appear.
  - **Online** — flips when `workers.last_heartbeat_at` is within the last 30s. Includes a "Done — return to dashboard" link.
  - **Offline / stopped / disabled** — appears if the worker exists but isn't healthy. Shows the `rove://` action that fits the current state.

Header chip + `/workers` page:

- When the user's worker is **online**: chip is green, normal case.
- When the user's worker is **offline** (stopped / stale / never came back): chip is red, links to `/workers` where each row of *the current user's* workers shows a "Resume" button → `window.location.href = "rove://start?name=<worker_name>"`. After click, the page realtime-watches for the worker to come back online (same pattern as `/setup`).
- When the user has **no worker yet** in this project: chip links to `/setup` instead of `/workers`.

Universal "Pause walker" affordance lives on `/workers` per row → `rove://stop?name=<name>`. Useful for "I'm going to do heavy local work, I don't want walks contending for CPU."

## The install script

Served by `apps/dashboard/app/install/route.ts` as `text/plain`. Single bash file, ~100 lines.

```bash
set -euo pipefail

# 1. Argparse: --install-code=<uuid>. That's the only arg.
# 2. Sanity:
#    - uname -s == Darwin (macOS only for this plan).
#    - node present; resolve absolute path with `command -v node`.
#    - curl, osacompile, codesign, launchctl, lsregister all present
#      (all macOS defaults; bail with friendly message if missing).
# 3. Exchange the install code for credentials via HTTPS:
#      curl -fsSL -X POST https://rove-agiterra.vercel.app/api/install/exchange \
#        -H 'content-type: application/json' \
#        -d '{"install_code":"'"$CODE"'"}'
#    Parse JSON response: token, supabase_url, supabase_publishable_key,
#    project_id, worker_name, github_handle. Bail on non-200 with the
#    server's error message.
# 4. mkdir -p ~/.rove (chmod 700)
# 5. Write ~/.rove/env (chmod 600) with supabase_url, supabase_publishable_key,
#    github_handle, worker_name, project_id. Write ~/.rove/auth.token
#    (chmod 600) with the JWT. Permissions enforced before write (umask 077).
# 6. Download tarballs:
#      curl -fsSL https://rove-agiterra.vercel.app/install/agiterra-rove-core.tgz   -o ~/.rove/core.tgz
#      curl -fsSL https://rove-agiterra.vercel.app/install/agiterra-rove-cli.tgz    -o ~/.rove/cli.tgz
# 7. Install:
#      mkdir -p ~/.rove/lib
#      cd ~/.rove/lib && npm init -y >/dev/null
#      npm install --silent --no-save ~/.rove/core.tgz ~/.rove/cli.tgz
#    (No global install; everything stays under ~/.rove/. Avoids `pnpm` / `nvm` /
#    PATH headaches and keeps uninstall to `rm -rf ~/.rove`.)
# 8. Resolve absolute paths once:
#      NODE_BIN="$(command -v node)"
#      ROVE_JS="$HOME/.rove/lib/node_modules/@agiterra/rove-cli/bin/rove.js"
#      URL_HANDLER="$HOME/.rove/url-handler.sh"
#    Both NODE_BIN and ROVE_JS are written literally into the LaunchAgent
#    plist — never the .bin/rove shim, never $(...) substitution.
# 9. Write ~/Library/LaunchAgents/com.agiterra.rove.daemon.plist with literal
#    absolute paths and worker_name + project_id + supabase_url +
#    supabase_publishable_key + token-file path substituted in.
# 10. Bootstrap + enable (one-time) + kickstart with modern launchctl verbs:
#       launchctl bootout gui/$UID "$PLIST" 2>/dev/null || true   # idempotent re-run
#       launchctl bootstrap gui/$UID "$PLIST"
#       launchctl enable    gui/$UID/com.agiterra.rove.daemon    # install-time only
#       launchctl kickstart -k gui/$UID/com.agiterra.rove.daemon
# 11. Build the URL handler applet:
#       cat > /tmp/rove-launcher.applescript <<OSA
#       on open location this_url
#         do shell script "${URL_HANDLER} " & quoted form of this_url
#       end open location
#       OSA
#       (Heredoc with double-quoted opener so $URL_HANDLER expands NOW, not
#       inside the compiled AppleScript — see "rove:// handler" section.)
#       osacompile -o ~/Applications/Rove\ Launcher.app /tmp/rove-launcher.applescript
#       rm /tmp/rove-launcher.applescript
#    Patch the .app's Info.plist (PlistBuddy) to add CFBundleURLTypes for rove://.
#    Write ~/.rove/url-handler.sh (chmod 700) with the action dispatcher.
#    codesign -s - --force ~/Applications/Rove\ Launcher.app   (ad-hoc)
#    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
#      -R ~/Applications/Rove\ Launcher.app
# 12. Print success line and the next-step note ("Return to the dashboard;
#     your worker will appear within a few seconds").
```

Re-running the install is idempotent — every artifact is `force`-written, the LaunchAgent is `bootout`-then-`bootstrap`'d (modern equivalent of unload/load), the token rotates (the worker-tokens mint endpoint revokes any prior token for the same worker, so an older daemon would 401 on its next claim and exit). User can re-run safely to recover from any inconsistent state.

Uninstall (manual, for now):

```bash
launchctl bootout gui/$UID ~/Library/LaunchAgents/com.agiterra.rove.daemon.plist 2>/dev/null || true
rm -f ~/Library/LaunchAgents/com.agiterra.rove.daemon.plist
rm -rf ~/Applications/Rove\ Launcher.app
rm -rf ~/.rove
```

A `rove://uninstall` action is intentionally NOT in the URL handler — uninstall is rare enough that a documented manual path is fine, and removing the binary that hosts the URL handler from inside the URL handler is awkward.

## Security

- **Worker token only.** No service-role key on the user's machine. A leaked token is recoverable (revoke + re-mint); a leaked service-role key is catastrophic.
- **chmod 600** on `~/.rove/env` and `~/.rove/auth.token`.
- **No SUID, no admin privilege escalation.** Everything runs as the user.
- **`launchctl bootstrap gui/$UID` and `lsregister`** are user-scope only. No `sudo` anywhere. Legacy `load -w` is not used.
- **The `rove://` handler is the only privilege escalation surface.** Per its action table, it can start/stop the daemon and reveal logs — nothing else. The shell script that backs it explicitly rejects unknown actions.
- **Browser-prompt model** for `rove://` is the user's safety net. The first invocation always prompts; the user can revoke by removing the .app.
- **No "always allow" by default.** The user opts into silent activation on their own.

## Order of work

Each step independently shippable. JWT plan must land before step 2 merges.

1. **Build pipeline ships tarballs.** A `prebuild` script in `apps/dashboard/package.json` runs `pnpm --filter @agiterra/rove-core pack --pack-destination ../../apps/dashboard/public/install/` and the same for `rove-cli`. Vercel build picks them up at fixed URLs. Tarballs are versioned (`agiterra-rove-cli-0.0.0-alpha.X.tgz`), and the install route serves the symlinks/copies named `agiterra-rove-cli.tgz`, `agiterra-rove-core.tgz` so the install script doesn't have to know the version. (~2 hours)
2. **Install-code table + mint + exchange.** `install_codes` migration; `/api/install/mint` server action called from `/setup` (returns the code); `/api/install/exchange` endpoint called by the install script (returns the JWT bundle by invoking the worker-tokens mint logic). Both gated against `is_team_member()`. (~half day)
3. **macOS install script** (`apps/dashboard/app/install/route.ts` serves it as `text/plain`). Steps 1–8 from "The install script" section above — through writing token + downloading tarballs + npm-installing locally, but NOT yet LaunchAgent or URL handler. Verify: a daemon can be invoked manually from `~/.rove/lib/node_modules/.bin/rove daemon` using the token. (~half day)
4. **Auto-start integration.** Add steps 9–10: write launchd plist with literal absolute paths, `bootstrap`+`enable`+`kickstart`. `/setup` page realtime-watches the workers table and flips to "online" when the daemon appears. (~half day)
5. **`rove://` handler applet build + dispatch.** Add step 11. AppleScript applet compiled and registered; action script written; codesigned; `lsregister`'d. `/workers` page gains "Resume" / "Pause" buttons wired to `window.location.href`. Header chip swaps target by state (no-worker → `/setup`, worker-offline → `/workers`). (~half day)
6. **Docs**: a "First install" section in `docs/walkers.md` pointing at `/setup`. Troubleshooting subsection: log paths, manual launchctl recovery, the `rm -rf ~/.rove` uninstall recipe. (~1 hour)

Total: ~2 days on top of worker-tokens' ~2 days. Combined: ~4 days for the full "paste once, never leaves the interface" experience on macOS.

## Acceptance criteria

- A team member, signed into the dashboard, can complete the entire install by pasting one command from `/setup` and waiting <60 seconds.
- The daemon survives a reboot — user logs in, daemon is already running, dashboard shows green chip.
- The daemon survives a crash — `kill -9` the process, launchd respawns within `ThrottleInterval` (10s); recovery sweep handles any stuck claims.
- The dashboard's "Resume walker" button (after a `launchctl unload`) restarts the daemon via `rove://start` in <5 seconds.
- The dashboard's "Pause walker" button stops it; status flips to `stopped` in the registry; the daemon does not respawn.
- Re-running the install command on a machine where Rove is already installed updates everything in place without manual cleanup. Token rotates; old daemon dies via revocation; new daemon starts.
- View-source on `/setup` exposes a worker token (single-worker scope). View-source on `/setup` does **not** expose the Supabase service-role key.
- Removing the .app and the LaunchAgent plist + `rm -rf ~/.rove` fully uninstalls — no daemon left running, no scheduled task.

## Open questions

1. ~~**Where does the install script source the CLI?**~~ Resolved in v2 — published tarballs served from `apps/dashboard/public/install/`, generated by the Vercel build's `prebuild` step. No clone, no `pnpm install` on the user's machine.
2. **Worker name collision.** If the user pastes the install on two machines with the same hostname (rare), the second registration overwrites the first row. The mint endpoint should detect at mint time and refuse with "a worker named X already exists in this project; pass `--worker-name` to override" — or rather, the `/setup` page should pre-fill a unique name when the default would collide. Resolve before step 2.
3. **`SUPABASE_JWT_SECRET` not currently in env.** Worker-tokens plan already raised this. Must be added to Vercel + local `.env.local` before step 2 ships.
4. **Tarball naming + caching.** Tarballs change per release, but the install script references stable URLs (`agiterra-rove-cli.tgz` without version). Vercel's static asset cache headers on these need to be `no-cache` or short-TTL; otherwise post-publish installs get the old tarball. Decide caching strategy in step 1.
5. **Pause via dashboard vs disable via CLI.** `rove workers disable <name>` is admin-level (refuses to start). `rove://stop` is session-level (next login restarts). v2 keeps these distinct in the action table and removes admin-disable from the URL handler entirely, but the dashboard UI still needs to make the distinction visually clear ("Pause until logout" vs "Disable permanently"). Decide labels in step 5.
6. **Code signing.** Ad-hoc signing (`codesign -s -`) suppresses Gatekeeper warnings on the *same* Mac the applet was built on; it does NOT travel. Since each user builds their own applet at install time on their own Mac, ad-hoc is sufficient. If we ever ship a pre-signed binary, real Developer ID signing is required. Out of scope for this plan; flag for the future.
7. **What does `/setup` do for a user whose laptop is air-gapped or behind a corporate firewall?** The install requires fetching from the dashboard (tarballs) + connecting to Supabase. Out of scope; we'll see if it becomes a real concern.

## Reviewer cheatsheet

Flag if you see:

1. Any place this design uses the service-role key in the install script or in the user's `~/.rove/`. Worker tokens are the only credential allowed.
2. **Any secret in argv.** v2 fix: install code is the only thing in the curl command. Tokens flow over HTTPS via the `/api/install/exchange` POST. If you see `--token`, `--jwt`, or any other credential as a command-line argument, regress.
3. Any place the dashboard tries to start the daemon directly via JavaScript without going through `rove://`. Browser sandboxing forbids this; if the prototype seems to work via WebExtensions or hacks, that's a category mistake.
4. Auto-start being skipped in favor of `rove://`-only. Auto-start is the default UX; `rove://` is the recovery/control surface. Both ship together.
5. **`rove://` URL handler accepting arbitrary URL parameters.** v2 fix: the handler reads `worker_name` and `project_id` from `~/.rove/env` only and ignores everything in the URL except the action keyword. The action enum is closed (`start` / `stop` / `restart` / `reveal-logs`). Anything else exits silently.
6. **Shell-only `.app` for the URL handler.** v2 fix: must be an AppleScript applet (built via `osacompile`) because macOS Apple Events (`kAEGetURL`) don't route to bare `Contents/MacOS/` executables. If you see `cat > Contents/MacOS/launcher.sh`-style construction without an `.applescript` source, regress.
7. **`launchctl load -w` / `unload` instead of modern verbs.** v2 fix: `bootstrap gui/$UID`, `bootout gui/$UID`, `enable` / `disable`, `kickstart`. Legacy verbs only as documented fallbacks.
8. **`rove://stop` mapped to `disable` instead of `bootout`.** v2 fix: stop is session-scoped (`bootout`); admin-disable lives behind `rove workers disable` and the dashboard. The two are deliberately distinct — confusing them produces a "why doesn't my daemon come back after reboot?" support thread.
9. **`$(which node)` or other dynamic command resolution inside the LaunchAgent plist.** v2 fix: install script writes literal absolute paths after resolving them with `command -v` once.
10. Tarballs cached aggressively. Static-asset caching on `agiterra-rove-cli.tgz` should be `no-cache` or short — otherwise a fresh install picks up a stale tarball after a release.
11. The `install_codes` row being read by RLS in a way that exposes another user's pending code (e.g., `select using (true)` instead of `select using (user_id = auth.uid())`).
12. **The exchange endpoint claiming "team-member" authentication.** v3 fix: exchange is *code-authenticated*. Team membership is enforced indirectly by re-checking `is_team_member()` against the install_codes row's `user_id`. Distinguish these two auth modes in any doc/code/PR description that refers to "the install endpoints."
13. **Install code framed as "not a credential."** v3 fix: it's a short-lived single-use *bearer* credential, just much safer than the JWT. Wording matters for reviewers.
14. **LaunchAgent invoking `.bin/rove` shim, `env`, or any non-absolute `node` reference.** v3 fix: literal `<NODE_BIN> <ROVE_JS> daemon …` with both paths resolved at install time.
15. **AppleScript source containing `"$HOME"` or any other unexpanded shell variable.** v3 fix: install script substitutes the absolute path into the source before `osacompile`. Compiled scripts cannot resolve shell vars at runtime.
16. **`rove://start` (or any URL-handler action) calling `launchctl enable`.** v3 fix: `enable` runs exactly once at install time. Post-install, the persistent enable/disable flag is owned by the user; the URL handler cannot override a deliberate disable.
17. Code paths that prompt the user with shell instructions to recover from a broken state. The dashboard should always provide an action (`rove://start`, "Re-install" link to `/setup`) instead of asking the user to open a terminal.
18. Sizing — does ~2 days on top of the JWT plan feel right?
