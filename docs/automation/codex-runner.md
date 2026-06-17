# Codex runner

A **local** automation that runs Codex's side of the loop-master pipeline: it picks up issues
assigned to Codex (`exec:codex`), runs each to a PR, and reviews PRs assigned to Codex
(`review:codex`). It runs on your Mac as a launchd LaunchAgent — **not** a GitHub Action — so
you can open the Codex app and jump into any live run.

See [README.md](README.md) for the shape shared by every vendor runner, and
[DISPATCHER.md](../../DISPATCHER.md) for the `run:active` lock, `RUN_TIMEOUT` reaping, and
fan-out budget these instructions implement.

## How to use

Paste the prompt below to Codex, in a local clone of the repo, and let it build the runner.
The three things it must get right — local (not an Action), fresh per tick, and a
prove-it-spawns step before any schedule — are stated as hard constraints so the
GitHub-Action mistake can't recur.

## The prompt

```text
GOAL: Build a LOCAL automation on this Mac that runs loop-master's Codex side of the
pipeline — it picks up issues assigned to Codex, runs each to a PR, and reviews PRs
assigned to Codex. Repo: moeghashim/loop-master (you are working in a local clone).

READ FIRST: AGENTS.md (executor + reviewer role contracts), CONTEXT.md (vocabulary),
DISPATCHER.md (the coordinator spec — run:active locks, RUN_TIMEOUT reaping, fan-out
budget, the gate-before-review rule). Honor those exactly; this automation is the Codex
runner for that system, not a new design.

THREE HARD CONSTRAINTS — get these wrong and it's wrong:
1. LOCAL, NOT A GITHUB ACTION. This runs on this Mac via a launchd LaunchAgent. Do NOT
   open a PR that adds a .github/workflows/*.yml. If you catch yourself writing YAML for
   GitHub Actions, stop — that's the mistake from last time.
2. FRESH PER TICK. Each scheduled tick starts a brand-new, finite dispatcher process:
   it boots, does one bounded batch, and EXITS. There is no long-lived/"woken" daemon
   thread that stays resident between ticks. launchd's StartInterval re-launches it.
3. PROVE BEFORE YOU SCHEDULE. Do Phase 0 below and drive one real issue to a PR by hand
   before you install the launchd schedule. Don't trust the timer until the spawn works.

WHERE THE WORK LIVES (GitHub is the source of truth — read it live with `gh`):
- Issues to EXECUTE: open issues in moeghashim/loop-master labeled `exec:codex`.
  The issue body + the dispatcher's triage comment already contain the full plan and a
  ready-to-paste executor prompt. You run your goal agent (`/goal`) scoped to that one
  issue — it has all the details; you don't re-plan it.
- PRs to REVIEW: open PRs labeled `review:codex` whose gate is GREEN (the `verify` check
  passed). Reviewer is unreachable on a red gate — skip any PR whose verify isn't green.
- Ignore anything carrying `run:active` (it's locked by a live worker) unless you're the
  reaper clearing a stale one (see LOCKING).

TWO-TIER SHAPE:
- A light DISPATCHER process (the tick) that only finds eligible items, locks them, and
  spawns workers. It does not implement or review anything itself.
- One fresh, finite WORKER thread per item that does the actual `/goal` execution or
  review, then exits.

── PHASE 0 — PROVE ONE WORKER SPAWNS (do this first, manually, no schedule yet) ──
Before any launchd setup, prove the mechanism end to end:
  a. Confirm you can programmatically SPAWN a fresh Codex worker thread for a single item
     and CAPTURE its thread/session id (whatever your CLI/API exposes). If you can't
     capture an id, say so and propose the closest reliable handle before continuing.
  b. Take ONE real open `exec:codex` issue, lock it (apply `run:active` + post the marker
     comment with the worker id), spawn the worker, and let it run to an actual PR with
     `Closes #<issue>` and the `make verify` output.
  c. Confirm the worker then RELEASES the lock (removes `run:active`, updates its marker).
Report what worked and what the spawn/id mechanism actually is. Only proceed to install
the schedule after this proof passes.

── THE DISPATCHER TICK (fresh process, finite, runs each interval) ──
On each run, in order:
1. Preflight: `gh auth status` ok, codex CLI present, repo clone clean/pulled. Bail with a
   logged reason if not.
2. REAP stale locks first (see LOCKING): clear dead workers so their items retry.
3. Find eligible EXEC items: open issues with `exec:codex`, NOT `run:active`, no open PR
   already linked.
4. Find eligible REVIEW items: open PRs with `review:codex`, gate green, NOT `run:active`,
   no existing Codex review.
5. Apply a FAN-OUT BUDGET: spawn at most N workers per tick (start N=2) so a backlog can't
   launch a swarm. Log what you deferred.
6. For each chosen item: apply `run:active`, post a marker comment (see LOCKING), spawn ONE
   fresh finite worker for it.
7. EXIT. Workers run independently and release their own locks.

── THE WORKER (one fresh finite thread per item) ──
EXEC issue: branch `agent/codex/<issue>-<slug>` off main, implement end to end, run
`make verify` yourself until it exits 0 (you never claim the gate — the CI check does),
open a PR whose body has `Closes #<issue>` and the verify output. Don't touch the board.
REVIEW PR: review against the green gate per AGENTS.md (reviewer role); post an approve or
request-changes review as the Codex reviewer identity.
ALWAYS, on completion OR failure: remove `run:active` and update the marker comment to a
terminal state (`done <pr-url>` / `failed <reason>`), then exit. A worker must never leave
its lock set.

── LOCKING + REAPING (the lock HAS a release) ──
- Lock = the `run:active` label PLUS a marker comment of a fixed machine-readable form,
  e.g. `<!-- loopmaster:run worker=<id> started=<ISO8601> -->`, so it's parseable.
- Release = the worker removes `run:active` and rewrites its marker to terminal state when
  it finishes or fails (above). This is the normal path.
- REAPER (runs at the top of every dispatcher tick, for dead/timed-out workers): for each
  item with `run:active`, parse its marker `started` time. If it's older than RUN_TIMEOUT
  (set 45 min) AND there's no resulting PR (exec) / no posted review (review), treat the
  worker as dead: remove `run:active`, mark the marker `reaped (timeout)`, and let the item
  become eligible again next tick. This is what stops a crashed worker from wedging an item
  forever.

── INSTALL THE SCHEDULE (only after Phase 0 passes) ──
- A launchd LaunchAgent at ~/Library/LaunchAgents/co.bannaa.loopmaster-codex.plist with
  StartInterval 1800 (30 min), pointed at the dispatcher entrypoint, WorkingDirectory the
  repo clone, StandardOut/StandardError to ~/Library/Logs/loopmaster-codex.log.
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
dead path; the LaunchAgent is installed and a real tick has spawned a worker that reached a
PR. Open a PR with the scripts + a short README for the runner (no workflow yaml).
```
