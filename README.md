# loop-master — a GitHub-native multi-agent coding system

Run several coding agents (Codex, Claude, Pi, Amp) against your backlog without
babysitting them. **GitHub is the single source of truth**: issues + labels are
canonical, and the Project board is a derived view kept in sync by automation.

## The one rule

Nothing is ever "done" on an agent's word. Only a **mechanical signal** — a passing
`make verify` (exit 0) or a merged PR — turns work green. Every other claim is treated
as unverified until a mechanical fact confirms it. The whole design falls out of this.

## How work flows

Each unit of work is an issue: `Inbox → Ready → In Progress → Review → Done`
(`Blocked` is an orthogonal flag, not a column). A single deterministic **dispatcher**
advances each issue through three roles — planner, executor, reviewer — running two gates
in series before you merge:

1. `make verify` — the mechanical floor, run by the dispatcher itself, not the agent.
2. Reviewer sign-off — reachable only on a green gate; judges what verify can't.
3. Your merge — final.

A nightly blinded grader scores merged work into ratings (agent × role × work-type) that
feed a routing table and shape the next cast.

## Repo layout

| Path | What it is |
|---|---|
| [`AGENTS.md`](AGENTS.md) | The agent contract — how an agent claims, works, gates, and opens a PR (labels-canonical model). |
| [`DISPATCHER.md`](DISPATCHER.md) | The orchestrator spec — state machine, poll-tick, router, nightly grader, ratings/routing stores. |
| [`SETUP.md`](SETUP.md) | One-time human setup — Project board, built-in workflows, repo variables and secrets. |
| [`scripts/labels.sh`](scripts/labels.sh) | Idempotent label bootstrap, loopable across repos. |
| [`scripts/gh-stage.sh`](scripts/gh-stage.sh) | The single controlled entry point to the Projects API. |
| [`.github/workflows/project-sync.yml`](.github/workflows/project-sync.yml) | Label/PR → board automations. |
| [`docs/diagrams/`](docs/diagrams/) | `agent-flow.html`, `system-map.html`, `system-map-interactive.html` — open in a browser. |
| [`docs/TRANSCRIPT.md`](docs/TRANSCRIPT.md) | The full design session, turn by turn. |
| [`docs/claude-design-website-prompt.md`](docs/claude-design-website-prompt.md) | Paste-ready prompt to build the showcase website. |

## Getting started

Follow [`SETUP.md`](SETUP.md): create the Project (Status options
`Inbox / Ready / In Progress / Review / Done`), wire its built-in workflows, then per
repo run `scripts/labels.sh` and set `PROJECT_OWNER` / `PROJECT_NUMBER` (variables) and
`PROJECTS_TOKEN` (secret).

## Known follow-up

`AGENTS.md` is currently the **base single-agent contract**. Adopting the
planner/executor/reviewer pipeline in `DISPATCHER.md` means rewriting `AGENTS.md` into
three role contracts and extending `labels.sh` with the cast/phase/control labels. That
reconciliation pass was the next step discussed but not yet applied.

---

Commit identity for everything: `Moe Ghashim <mohanadgh@gmail.com>`.
