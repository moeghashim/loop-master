# CONTEXT.md — canonical vocabulary

The single glossary for loop-master. The interview (grill-with-docs) maintains it: when
a term is unclear, overloaded, or new, the interview resolves it **here** before any code
or doc uses it.

## The naming rule — one name, one meaning

Every term below means **exactly one thing**. No name is overloaded (one word → two
concepts), and no two names mean the same concept. If two words are drifting toward the
same meaning, one is made canonical and the other is dropped — aliases are not kept "for
convenience." New or ambiguous terms get grilled against this file in the interview, and
the resolved definition is written back here. Link to a term by its anchor, e.g.
[loop](CONTEXT.md#loop).

## Core

### Source of truth
GitHub **issues + labels**. The Project board is a *derived view* kept in sync by
automation. Nothing else holds state.

### Loop
One issue's trip through the pipeline: interview? → Ready → execute → [gate](#gate) →
review? → merge. **One issue is one loop** — the words are interchangeable only in that
1:1 sense; prefer "loop" for the run, "issue" for the GitHub record.

### Interview
The **planning front-door** of a [loop](#loop) (the grill-with-docs method): it grills the
work one question at a time, resolves terms against this file, verifies claims against the
code, and writes the plan. Runs only when an issue needs planning (Inbox); a well-specified
issue skips it and starts Ready.

### Sub-loop
A **child issue** spawned by an agent *during* a [loop](#loop), and itself a full
[loop](#loop). Implemented as a GitHub **sub-issue** (parent ↔ child). There is no special
nested executor — the [dispatcher](#dispatcher) runs every issue as a loop, so nesting is
emergent.

### Dispatcher
The **GitHub Action** that, at triage, picks the [cast](#cast) and the pipeline shape
([solo](#solo) vs [reviewed](#reviewed)) and advances state by writing labels. It
**decides and labels; it never executes** — so it needs no local auth and lives in Actions.

### Cast
The agents assigned to one issue for its roles: an [executor](#executor) and, on the
[reviewed](#reviewed) shape, a [reviewer](#reviewer). Distinct from the
[routing table](#routing-table) (the cast is *this issue's* assignment; the routing table
is the *aggregate* that informs it).

### Executor
The assigned **vendor app** (Claude / Codex / Cursor) that produces the diff and opens the
PR, running in its own app where you can jump in. Never claims the gate.

### Reviewer
A **different** vendor app that signs off on the PR. Present only on the
[reviewed](#reviewed) shape.

### Gate
`make verify` run as a **required CI check**. Exit 0 is the only mechanical signal that can
turn work green; the agent cannot fake it, and review/merge are unreachable until it passes.

## Pipeline shapes

### Solo
One tool plans and executes end-to-end; review is your PR review + merge. **No `review:`
label.**

### Reviewed
[Executor](#executor) + an independent [reviewer](#reviewer) before your merge. A `review:`
label is present — its presence *is* this shape.

## Sub-loop relationships

### Block
The default sub-loop relationship. The parent [loop](#loop) pauses (`stage:blocked`,
`blocked-by:#child`) until the child loop merges, then **resumes**. Execution-time.

### Decompose
The parent becomes a **tracker** (epic): it runs no code and closes when all child loops
merge. Planning-time.

### Fork-off
Independent out-of-scope work spun off as a new [loop](#loop); the parent **does not wait**.

## Guardrails

### Depth cap
`depth:N` label (child = parent + 1). The [dispatcher](#dispatcher) refuses to spawn past
`MAX_DEPTH`.

### Parent-merge gate
A parent loop cannot merge or close while any child loop is open.

### Unblock-on-merge
When a child loop merges, an Action clears the parent's `stage:blocked`.

### Fan-out budget
Caps on children-per-loop and total in-flight loops, so one issue can't spawn many.

## Learning loop

### Grader
A nightly Action that **blind-scores** merged work (never an agent that worked the issue)
into [ratings](#ratings).

### Ratings
Per-issue scores keyed by agent × role × work-type, produced by the [grader](#grader).

### Routing table
Aggregated [ratings](#ratings) keyed by agent × role × work-type. Drives the
[dispatcher](#dispatcher)'s [cast](#cast) and [solo](#solo)-vs-[reviewed](#reviewed)
decision. Distinct from the [cast](#cast).
