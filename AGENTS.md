# AGENTS.md — coding-agent contract

GitHub is the source of truth. **Labels are canonical**; the Project board is a
**derived view** kept in sync by automation. You write labels, comments, branches,
and PRs. You **never read or write Project fields** (Status / Priority) — automation
moves the board. Your only judgment writes are **CLAIM** and **BLOCK**.

## How you get work

You work the **one issue you were dispatched to** — the issue number you were invoked
on. You do **not** self-select from the board, and you do **not** gate on any "Ready"
signal. Dispatch is out of band: the human (or a dispatcher) invoked you on this issue,
which is what guarantees exactly one agent per issue.

## CLAIM — your "I'm starting" write

1. Add the label `agent:<you>` (one of `agent:codex`, `agent:claude`, `agent:pi`,
   `agent:amp`).
2. If you have your **own** GitHub identity, also assign yourself, then re-read the
   issue; if it is assigned to anyone other than you, **yield** — remove your label and
   assignment and stop. (With a shared identity this re-read is a no-op; single dispatch
   already guarantees you are alone on this issue, so the label is the claim marker.)

Adding `agent:<you>` triggers automation that moves the board to **In Progress**. You
never set Status yourself.

## Do the work

- Branch: `agent/<you>/<issue#>-<slug>`. One issue per branch.
- Run the repo's mechanical gate (`make verify`, or tests + lint + typecheck) and
  capture the exit code.
- **A red gate means fix it or BLOCK — never open a PR on red.**

## Open the PR

- Body must contain `Closes #<issue#>`.
- Summarize what changed and why.
- **Paste the verify output / exit status as evidence.** Do not merely claim it passed.
- Opening (or marking ready) the PR triggers automation that moves the issue to
  **Review**. **Done** is reserved for merge/close — you never set it.

## BLOCK

If you can't proceed: add `stage:blocked`, comment the **specific** blocker, what is
needed to unblock, and what you already tried. Then **stop** — don't spin.

## Always

- Idempotency: before starting, check for an existing branch/PR for this issue —
  resume, don't duplicate.
- All bookkeeping via **labels + comments**. Never touch Project fields.
- Commit/PR author identity on everything: `Moe Ghashim <mohanadgh@gmail.com>`.

## Label reference

| Label | Meaning |
|---|---|
| `agent:codex` / `claude` / `pi` / `amp` | Active claim — this agent is working it (absence = unassigned) |
| `agent:human` | A human is working it |
| `stage:blocked` | Orthogonal flag — blocked; see latest comment |
| `type:bug` / `feature` / `chore` / `research` | Work type (no `type:review` — that collides with Status=Review) |
| `priority:p0`..`p3` | Priority |

Stage lives only as the board **Status** field (Inbox → Ready → In Progress → Review →
Done), which you never touch. There is no `status:ready`/`stage:done` label.
