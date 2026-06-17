# Claude runner

A **local** automation that runs Claude Code's side of the loop-master pipeline. In the
cold-start cast Claude is the **reviewer** (`review:claude`), so this runner leads with review
— it signs off green-gate PRs assigned to Claude — and also executes issues when the
dispatcher assigns `exec:claude`. It runs on your Mac as a launchd LaunchAgent — **not** a
GitHub Action — so you can open the Claude Code app and jump into any live run.

See [README.md](README.md) for the shape shared by every vendor runner, and
[DISPATCHER.md](../../DISPATCHER.md) for the `run:active` lock, `RUN_TIMEOUT` reaping, and the
gate-before-review rule these instructions implement. It is the same runner as
[codex-runner.md](codex-runner.md) with three things rebound: the labels (`:claude`), the CLI
it spawns (headless `claude -p`), and the review-first emphasis.

## How to use

Paste the prompt below to Claude Code, in a local clone of the repo, and let it build the
runner. The three things it must get right — local (not an Action), fresh per tick, and a
prove-it-spawns step before any schedule — are stated as hard constraints.

## The prompt

```text
GOAL: Build a LOCAL automation on this Mac that runs loop-master's Claude side of the
pipeline. In the cold-start cast Claude is the REVIEWER, so this runner's main job is to
review PRs assigned to Claude (`review:claude`); it also EXECUTES issues when assigned
`exec:claude`. Repo: moeghashim/loop-master (you are working in a local clone).

READ FIRST: AGENTS.md (reviewer + executor role contracts), CONTEXT.md (vocabulary),
DISPATCHER.md (the coordinator spec — run:active locks, RUN_TIMEOUT reaping, fan-out
budget, the gate-before-review rule). Honor those exactly; this automation is the Claude
runner for that system, not a new design.

THREE HARD CONSTRAINTS — get these wrong and it's wrong:
1. LOCAL, NOT A GITHUB ACTION. This runs on this Mac via a launchd LaunchAgent. Do NOT
   open a PR that adds a .github/workflows/*.yml. If you catch yourself writing YAML for
   GitHub Actions, stop.
2. FRESH PER TICK. Each scheduled tick starts a brand-new, finite dispatcher process:
   it boots, does one bounded batch, and EXITS. There is no long-lived/"woken" daemon
   thread that stays resident between ticks. launchd's StartInterval re-launches it.
3. PROVE BEFORE YOU SCHEDULE. Do Phase 0 below and drive one real review (and, if one is
   assigned, one real `exec:claude` issue) to completion by hand before you install the
   launchd schedule. Don't trust the timer until the spawn works.

WHERE THE WORK LIVES (GitHub is the source of truth — read it live with `gh`):
- PRs to REVIEW (primary): open PRs in moeghashim/loop-master labeled `review:claude`
  whose gate is GREEN (the `verify` check passed). The reviewer is unreachable on a red
  gate — skip any PR whose verify isn't green. Review what CI can't: right problem, sound
  approach. Post approve, or request-changes with a reason tag (`execution` | `plan`).
- Issues to EXECUTE (when assigned): open issues labeled `exec:claude`. The issue body +
  the dispatcher's triage comment already contain the full plan and a ready-to-paste
  executor prompt — implement that one issue; you don't re-plan it.
- Ignore anything carrying `run:active` (it's locked by a live worker) unless you're the
  reaper clearing a stale one (see LOCKING).

TWO-TIER SHAPE:
- A light DISPATCHER process (the tick) that only finds eligible items, locks them, and
  spawns workers. It does not review or implement anything itself.
- One fresh, finite WORKER per item — a headless `claude -p` run scoped to that single
  item — that does the actual review or execution, then exits.

── PHASE 0 — PROVE ONE WORKER SPAWNS (do this first, manually, no schedule yet) ──
Before any launchd setup, prove the mechanism end to end:
  a. Confirm you can spawn a fresh headless Claude worker for a single item with
     non-interactive permissions (a pre-approved tool allowlist or an unattended permission
     mode so it can run gh/git/make without prompting) and CAPTURE a run id — e.g.
     `claude -p --output-format json` returns a `session_id`. If you can't capture an id,
     say so and propose the closest reliable handle before continuing.
  b. Take ONE real open `review:claude` PR with a green gate, lock it (apply `run:active` +
     post the marker comment with the run id), spawn the worker, and let it post a real
     review (approve / request-changes with a reason tag). If an `exec:claude` issue is
     also open, prove that path to a PR too.
  c. Confirm the worker then RELEASES the lock (removes `run:active`, updates its marker).
Report what worked and what the spawn/id mechanism actually is. Only proceed to install
the schedule after this proof passes.

── THE DISPATCHER TICK (fresh process, finite, runs each interval) ──
On each run, in order:
1. Preflight: `gh auth status` ok, claude CLI present, repo clone clean/pulled. Bail with a
   logged reason if not.
2. REAP stale locks first (see LOCKING): clear dead workers so their items retry.
3. Find eligible REVIEW items: open PRs with `review:claude`, gate green, NOT `run:active`,
   no existing Claude review.
4. Find eligible EXEC items: open issues with `exec:claude`, NOT `run:active`, no open PR
   already linked.
5. Apply a FAN-OUT BUDGET: spawn at most N workers per tick (start N=2) so a backlog can't
   launch a swarm. Log what you deferred.
6. For each chosen item: apply `run:active`, post a marker comment (see LOCKING), spawn ONE
   fresh finite worker for it.
7. EXIT. Workers run independently and release their own locks.

── THE WORKER (one fresh headless `claude -p` run per item) ──
REVIEW PR: review against the green gate per AGENTS.md (reviewer role) — judge what CI
can't. Post an approve, or a request-changes review carrying a reason tag
(`execution` | `plan`), as the Claude reviewer identity. You CANNOT approve while CI is red.
EXEC issue: branch `agent/claude/<issue>-<slug>` off main, implement end to end, run
`make verify` yourself until it exits 0 (you never claim the gate — the CI check does),
open a PR whose body has `Closes #<issue>` and the verify output. Don't touch the board.
ALWAYS, on completion OR failure: remove `run:active` and update the marker comment to a
terminal state (`done <url>` / `failed <reason>`), then exit. A worker must never leave its
lock set.

── LOCKING + REAPING (the lock HAS a release) ──
- Lock = the `run:active` label PLUS a marker comment of a fixed machine-readable form,
  e.g. `<!-- loopmaster:run worker=<id> started=<ISO8601> -->`, so it's parseable.
- Release = the worker removes `run:active` and rewrites its marker to terminal state when
  it finishes or fails (above). This is the normal path.
- REAPER (runs at the top of every dispatcher tick, for dead/timed-out workers): for each
  item with `run:active`, parse its marker `started` time. If it's older than RUN_TIMEOUT
  (set 45 min) AND there's no posted review (review) / no resulting PR (exec), treat the
  worker as dead: remove `run:active`, mark the marker `reaped (timeout)`, and let the item
  become eligible again next tick. This is what stops a crashed worker from wedging an item
  forever.

── INSTALL THE SCHEDULE (only after Phase 0 passes) ──
- A launchd LaunchAgent at ~/Library/LaunchAgents/co.bannaa.loopmaster-claude.plist with
  StartInterval 1800 (30 min), pointed at the dispatcher entrypoint, WorkingDirectory the
  repo clone, StandardOut/StandardError to ~/Library/Logs/loopmaster-claude.log.
- It launches a FRESH dispatcher process each interval (constraint #2) — no `KeepAlive`
  resident daemon. Load with `launchctl load`; document `launchctl unload` to stop.

CONSTRAINTS:
- Commit identity on everything: Moe Ghashim <mohanadgh@gmail.com>; sign off DCO
  (`git commit -s`, Signed-off-by: Moe Ghashim <mohanadgh@gmail.com>).
- Don't touch the Project board — project-sync.yml owns Status.
- Don't add a GitHub Action. Don't modify branch protection or repo settings.
- Log every tick (found / spawned / deferred / reaped) to the log file so a human can see
  what each finite run did.

DONE = Phase 0 proof passed and reported; the dispatcher entrypoint + worker logic exist
as local scripts (not a workflow); locks release on the happy path and get reaped on the
dead path; the LaunchAgent is installed and a real tick has spawned a worker that posted a
review (and ran an exec issue to a PR, if one was assigned). Open a PR with the scripts + a
short README for the runner (no workflow yaml).
```
