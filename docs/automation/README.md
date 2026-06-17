# Vendor runners — local automation, one per tool

Each vendor in the cast (Codex, Claude Code, Cursor, Pi, Factory, Amp) runs its side of the
pipeline from a **local automation on your own machine** — a launchd LaunchAgent that wakes
on a fixed interval, does one finite batch, and exits. The automation is deliberately *not* a
GitHub Action: keeping it local is what lets you open the same vendor app and jump into a live
run.

Every runner has the same shape — only the labels it answers to and the CLI it spawns differ:

- **Fresh per tick.** launchd re-launches a brand-new, finite dispatcher process each
  interval. There is no resident daemon living between ticks.
- **Two tiers.** A light *dispatcher* tick finds eligible items, locks them, and spawns one
  fresh *worker* per item. The worker does the actual execute/review, then exits.
- **The lock has a release.** A worker holds `run:active` + a marker comment while it runs and
  clears both on done/fail; the dispatcher *reaps* any lock older than `RUN_TIMEOUT` with no
  resulting PR/review, so a dead worker can't wedge an item. See
  [DISPATCHER.md](../../DISPATCHER.md).
- **Prove before you schedule.** Each runner's Phase 0 drives one real assigned item to a PR
  by hand before the launchd timer is trusted.

Each tool answers only to its own assignment labels (`exec:<tool>` / `review:<tool>`) — the
label the dispatcher writes is both the claim and the lock, so two runners never collide on
the same item.

| Runner | Answers to | Spawns |
|---|---|---|
| [codex-runner.md](codex-runner.md) | `exec:codex`, `review:codex` | Codex `/goal` workers |
| [claude-runner.md](claude-runner.md) | `review:claude`, `exec:claude` | headless `claude -p` workers |

Cursor / Pi / Factory / Amp follow the same template — copy a runner, rebind the labels, the
CLI, and the LaunchAgent label.

Read [AGENTS.md](../../AGENTS.md) (role contracts) and [DISPATCHER.md](../../DISPATCHER.md)
(locks, `RUN_TIMEOUT` reaping, fan-out budget) first — these runners implement that spec, they
don't redefine it.
