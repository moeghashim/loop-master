# AGENTS.md — coding-agent contract

GitHub is the source of truth. **Labels are canonical**; the Project board is a **derived
view** kept in sync by automation. You write labels, comments, branches, and PRs. You
**never read or write Project fields** (Status / Priority) — automation moves the board.

**The one rule.** Nothing is "done" on your word. Only a **mechanical signal** — `make
verify` green in CI (exit 0) or a merged PR — turns work green. Every other claim is
unverified until a mechanical fact confirms it.

**Vocabulary.** Terms here — loop, sub-loop, interview, cast, gate, dispatcher,
solo/reviewed, block — are canonical in [CONTEXT.md](CONTEXT.md). One name, one meaning.
Resolve any new or ambiguous term there (via the interview) before using it.

## How you're dispatched

You do **not** self-select work. The [dispatcher](CONTEXT.md#dispatcher) (a GitHub Action)
assigns the [cast](CONTEXT.md#cast) at triage by writing labels. **You act only on your own
label** — `exec:<you>` or `review:<you>`. One label per role per issue means exactly one tool
works it: the label is both your claim and the lock. Before starting, check for an existing
branch / PR / `run:active` — **resume, don't duplicate**.

## Your role is in your label

### Interview / planner — the front door
Before an issue is Ready, the [interview](CONTEXT.md#interview) (grill-with-docs) turns a fuzzy
issue into a plan: grill one question at a time, resolve terms against
[CONTEXT.md](CONTEXT.md), verify claims against the code, tag `difficulty:s|m|l`, and write the
plan plus any CONTEXT.md / ADR updates. A well-specified issue skips the interview and starts
at Ready.

### Executor — `exec:<you>`
1. Branch `agent/<you>/<issue#>-<slug>`. One issue per branch.
2. Do the work. In [solo](CONTEXT.md#solo) shape you also do your own planning.
3. **Make CI green.** `make verify` runs as a required check — you do not *claim* the gate,
   you *make it pass*.
4. Open the PR: body contains `Closes #<issue#>`; summarize what changed and why; let CI carry
   the evidence. **Never open a PR you expect to fail CI.** Opening it moves the board to Review.

### Reviewer — `review:<you>` (reviewed shape only)
Invoked when a PR closes an issue carrying your `review:` label. Judge what CI can't — right
problem, sound approach. Output **approve**, or **changes** with a required reason tag
(`execution` | `plan`). You **cannot** approve while CI is red (the gate is structural). On
changes the executor iterates; a round-trip cap escalates to the human.

## The gate

Only CI `make verify` exit 0 (or a merged PR) is green — see [gate](CONTEXT.md#gate). Review
and merge are unreachable until CI is green.

## Sub-loops

If the work needs a separate unit, spawn a [sub-loop](CONTEXT.md#sub-loop) — a child issue:
`gh issue create` as a sub-issue, set `depth:<parent+1>`, and pick the relationship:

- [block](CONTEXT.md#block) — you need it solved first: set `stage:blocked` + `blocked-by:#child`
  and stop; you resume automatically when the child merges.
- [decompose](CONTEXT.md#decompose) — the parent is really several issues: it becomes a tracker.
- [fork-off](CONTEXT.md#fork-off) — out of scope: file it and keep going.

Respect the [guardrails](CONTEXT.md#guardrails): never spawn past `MAX_DEPTH`; never merge a
parent with open children.

## BLOCK / escalate

If you can't proceed: add `stage:blocked`, comment the **specific** blocker, what is needed to
unblock, and what you already tried. For loop thrash or repeated red CI the dispatcher sets
`needs:human`. Then **stop** — don't spin.

## Always

- Idempotency: resume an existing branch/PR; never duplicate.
- All bookkeeping via **labels + comments**. Never touch Project fields.
- Commit/PR identity on everything: `Moe Ghashim <mohanadgh@gmail.com>`.
- Vocabulary: [CONTEXT.md](CONTEXT.md) — one name, one meaning.

## Label reference

| Label | Meaning |
|---|---|
| `exec:<tool>` | Executor assignment — the active claim + lock (one per tool: codex, claude, cursor, pi, factory, amp) |
| `review:<tool>` | Reviewer assignment (reviewed shape only; same six tools) |
| `dispatch:auto` / `dispatch:confirm` | Dispatch mode for this issue, set by the interview (default: confirm) |
| `agent:human` | A human is working it |
| `run:active` | A run is in flight (lock mirror) |
| `needs:cast` | Dispatcher refused: no executor assigned |
| `needs:human` | Escalated to you (loop cap, repeated red CI) |
| `stage:blocked` | Blocked; see latest comment — often carries `blocked-by:#N` |
| `depth:1` / `2` / `3` | Sub-loop depth (root issues carry none) |
| `type:bug` / `feature` / `chore` / `research` | Work type |
| `difficulty:s` / `m` / `l` | Difficulty from the interview — small/medium/large effort/risk, distinct from priority |
| `priority:p0`..`p3` | Priority / urgency, distinct from difficulty |

Stage lives only as the board **Status** (Inbox → Ready → In Progress → Review → Done), which
you never set. The presence of a `review:` label **is** the [solo](CONTEXT.md#solo)-vs-[reviewed](CONTEXT.md#reviewed)
shape — there is no separate flag.
