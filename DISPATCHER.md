# DISPATCHER.md — the coordinator (GitHub Actions, not a daemon)

> Vocabulary is canonical in [CONTEXT.md](CONTEXT.md). This file specifies the coordinator;
> it does not redefine terms. One name, one meaning.

The dispatcher is a **decision layer that runs as GitHub Actions**, not a long-running local
process. At triage it reads an issue and the [routing table](CONTEXT.md#routing-table), picks
the [cast](CONTEXT.md#cast) and the pipeline shape ([solo](CONTEXT.md#solo) vs
[reviewed](CONTEXT.md#reviewed)), and **writes labels**. It decides and labels; it never runs
an agent. Execution is delegated to each vendor's native automation, and the
[gate](CONTEXT.md#gate) is CI. One writer of board Status + assignment-based dispatch + a
mechanical gate give single-issue safety with no bespoke daemon.

> Supersedes the earlier local-daemon spec. Because the dispatcher no longer spawns agents,
> the old "must run locally, not Actions" constraint is gone — local auth/subscription now
> lives only in the vendor apps, where execution actually happens.

## Where each piece runs

| Piece | Runtime | Responsibility |
|---|---|---|
| Dispatcher | GitHub Actions | triage decision, reviewer re-trigger, unblock, merge-gate |
| Execution | vendor app — the [roster](CONTEXT.md#roster) | the diff + PR; you can jump into the live session |
| Gate | CI (Actions) | `make verify` as a required check |
| Learning loop | scheduled Action | nightly grader → ratings → `routing.json` |

## Per-issue flow

`Inbox → (interview, if the issue needs planning) → Ready → [dispatcher assigns cast + shape]
→ executor opens PR → CI gate → (reviewer signs off, if reviewed) → your merge → Done.`

The **only** branch in the whole system is the presence of a `review:` label. See the
converged-architecture diagram for the picture.

## The triage decision — solo vs reviewed

Trigger: an issue enters **Ready** (to re-triage, move it back to Ready).

Inputs, all from GitHub + `routing.json`: `type:*`, `priority:*` (urgency), `difficulty:*`
(effort/risk), and the candidate executor's confidence (`score` + sample size `n`) for
`(agent × executor × work_type)`.

```python
executor = argmax_recent(eligible(work_type))          # exploit, with an explore epsilon
reviewed = (priority in {"p0", "p1"}
            or work_type == "bug"
            or difficulty == "l"
            or confidence(executor, work_type) is thin   # n < MIN_SAMPLE
            or low)                                       # score below threshold
reviewer = argmax_recent(reviewer_role, work_type)       # a DIFFERENT tool, only if reviewed
# writes: exec:<executor> always; review:<reviewer> only when reviewed
```

The presence of `review:` **is** the shape — nothing else to encode. Cold start (empty
`routing.json`): everything non-trivial is reviewed; `type:chore`/`p3` may go solo. As
ratings accumulate, proven executors earn the right to run solo. The issue's
[dispatch mode](CONTEXT.md#dispatch-mode) (set at the interview) decides what happens next:
`dispatch:auto` assigns the cast and triggers the tool; `dispatch:confirm` posts the proposed
cast and waits for you. Default when absent: confirm.

## The Actions

1. **Triage dispatcher** — on an issue entering Ready: run the policy above and write cast
   labels. If `dispatch:auto`, move the board to In Progress (via `gh-stage.sh`) and trigger
   the executor's vendor automation; if `dispatch:confirm`, post the proposed cast and wait.
2. **Reviewer re-trigger** — on PR opened/ready that closes an issue carrying `review:<tool>`:
   trigger that reviewer's vendor automation. Solo issues have no `review:` label → straight
   to you.
3. **Unblock-on-merge** — on issue closed / PR merged: find issues with `blocked-by:#<this>`,
   clear their `stage:blocked`, and re-trigger.
4. **Parent-merge gate** — a required check that fails while a parent has open sub-issues, so
   a parent [loop](CONTEXT.md#loop) can't merge ahead of its children.
5. **project-sync** (existing, evolved) — labels/PR → board Status: PR opened → Review,
   merge/close → Done. The old `agent:* → In Progress` rule is now the triage Action's job —
   drop it or leave it as a no-op.
6. **Nightly grader** — scheduled; see *Learning loop*.

Every board write routes through [scripts/gh-stage.sh](scripts/gh-stage.sh), the single
Projects API entry point. Execution itself is the vendors' own automations — out of scope for
these Actions (each tool has an adapter: how its label/assignment triggers its runner).

## Native execution and jump-in

Each tool acts only on **its own** `exec:` / `review:` label (assignment-based dispatch), so
even with four vendor automations live, exactly one touches an issue — the label is the lock,
set once at triage, so there is no claim race. Work runs in that vendor's app, so you can open
it and take over the live session. `run:active` mirrors the in-flight lock; the idempotency
rule (resume, don't duplicate) absorbs a double-fire.

## Sub-loops

A [sub-loop](CONTEXT.md#sub-loop) is a child issue (GitHub sub-issue) an agent creates with
`gh issue create`. Relationships: [block](CONTEXT.md#block) (default — parent pauses on the
child), [decompose](CONTEXT.md#decompose) (parent becomes a tracker), and
[fork-off](CONTEXT.md#fork-off) (independent). Nesting is emergent: the dispatcher runs every
issue as a loop. Guardrails, enforced by the Actions above:

- [depth cap](CONTEXT.md#depth-cap) — `depth:N` label (child = parent + 1); refuse past `MAX_DEPTH`.
- [parent-merge gate](CONTEXT.md#parent-merge-gate) — Action 4.
- [unblock-on-merge](CONTEXT.md#unblock-on-merge) — Action 3.
- [fan-out budget](CONTEXT.md#fan-out-budget) — cap children-per-loop and in-flight loops.

## The gate

`make verify` runs as a **required CI check** on the PR. Exit 0 (or a merge) is the only
green-able signal — the executor's claim is never the gate, and review/merge are structurally
unreachable until CI is green. This is the daemon's "dispatcher runs verify" idea, now enforced
by GitHub itself: unfakeable and vendor-neutral.

## Learning loop

Nightly scheduled Action over the day's merged issues. Scores from durable, mostly-objective
signals, with LLM judgment on anchors it can't fabricate:

```python
def nightly():
    for issue in merged_since(watermark):
        grader   = pick_grader(issue.cast)        # any roster tool NOT in this issue's cast
        evidence = strip_identities({             # blinded: "exec A", never "Codex executed"
            "diffs": ..., "review_notes": ...,
            "verify_first_pass": ..., "round_trips": ...,
            "human_edit_lines": ..., "reverted_within": window(issue),
        })
        scores = grader.grade(evidence, RUBRIC)   # exec / review scores
        write_rating(issue, scores, key=(agent, role, work_type))
    recompute_routing_table()                     # -> routing.json
```

Stored in-repo as `routing.json` + `ratings/` (GitHub-only; no external store). Blinding kills
LLM self-preference — the thing being measured *is* "Claude-reviewer vs Codex-reviewer," so an
unblinded grader would corrupt it. Calibrate by hand-grading ~1 in 10.

Triage routing policy (run at Ready):

```python
def pick_cast(work_type):
    exec_ = explore_or_exploit("executor", work_type)        # epsilon higher when cells are thin
    if needs_review(work_type, exec_): rev = explore_or_exploit("reviewer", work_type)
    enforce_distinct(exec_, rev)                              # executor != reviewer
    return exec_, rev   # -> writes exec:* (+ review:*), or proposes for you to confirm
```

`MIN_SAMPLE` gates exploitation so two noisy points don't decide a routing; the explore term
keeps the table fresh and notices when a new model version improves.

## Invariants

- Review and merge are unreachable until CI is green (structural, via the required check).
- Done is only ever a merge/close — no agent and no Action sets Done.
- Exactly one tool per issue per role (the assignment label is the lock).
- A parent loop can't merge ahead of an open child (Action 4).
- Every review rejection carries a reason tag (`execution` | `plan`), or it is re-requested.

## Knobs left for you

`MAX_DEPTH`, `MIN_SAMPLE`, explore epsilon, `MAX_CHILDREN`, `MAX_INFLIGHT`, the grader rubric,
and auto-assign vs propose-and-confirm.

## How this fits the repo

- [scripts/labels.sh](scripts/labels.sh) — the converged label set (`exec:*`, `review:*`,
  `run:active`, `needs:cast`, `needs:human`, `depth:1..3`, plus type/difficulty/priority and
  `stage:blocked`).
- [.github/workflows/project-sync.yml](.github/workflows/project-sync.yml) — keep PR→Review and
  merge→Done; drop the redundant `agent:* → In Progress`. Actions 1–4 above are **to build**.
- [AGENTS.md](AGENTS.md) — the per-role contracts (interview/planner, executor, reviewer).
- Per-vendor execution adapters (how each tool's automation is triggered by its label) — **to build**.
