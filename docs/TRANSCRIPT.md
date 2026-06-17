# Transcript — designing a multi-agent coding system on GitHub

A working session that went from "GitHub Issues + Projects as the source of truth for
coding agents" to a full planner / executor / reviewer pipeline with a deterministic
dispatcher, a measurement-and-routing loop, and an interactive system diagram.

Convention: user turns are quoted in full. Assistant turns preserve the reasoning and
decisions; rendered diagrams and generated code are referenced by filename rather than
pasted inline (the files themselves are in this bundle).

---

## 1 — Review the proposed GitHub setup

**User:** Asked for a critical review of a proposed setup: GitHub Issues as the master
backlog, GitHub Projects for stage tracking, agents (Codex, Claude, Pi, Amp). Project
fields for Stage / Agent / Work Type / Priority; a parallel set of repo labels; a
workflow Inbox → Ready → In Progress → Review → Done with Blocked; and expected agent
behaviors. Six questions: what's good, what breaks, what's redundant, what to automate
vs. do manually, the recommended final setup, and what instructions every agent should
follow. Don't replace GitHub as source of truth; keep it practical for a solo founder.

**Assistant:** The shape is sound but it models the same state twice (Project fields and
labels), which is what agents fail to keep in sync.

- **Good:** GitHub-as-truth needs no sync layer and survives any agent dying; the linear
  pipeline is legible; the explicit Agent dimension is a smart, uncommon idea; writing
  down an agent contract at all is the right instinct.
- **Breaks:** double bookkeeping; Project fields are hostile to agents (setting a
  single-select needs opaque project/field/option IDs via GraphQL, vs. one-line labels);
  self-reported stage moves can't be trusted (the founder's own rule); claim races when
  "Ready + unassigned" invites two agents; Blocked-as-a-column erases the prior stage;
  Review is underspecified.
- **Redundant:** Work Type / Agent / Priority duplicated as field and label — pick one
  (labels). Stage should be one thing (the Status field); drop `stage:ready`/`stage:done`;
  keep `stage:blocked` only, as an orthogonal flag. Drop the "Unassigned" value (absence
  of an agent label = unassigned).
- **Automate vs. manual:** automate every transition with a mechanical trigger (new issue
  → Inbox; PR opened → Review; merged/closed → Done); leave judgment transitions manual
  (Inbox → Ready, claim, block). Never automate Done off an agent's word.
- **Recommendation:** labels are the canonical database agents read/write; the board is a
  derived view kept in sync by automation. Prefer dispatching issues over agents polling.
- **Agent contract:** claim atomically, branch naming, run the mechanical gate, PR with
  `Closes #N` + pasted verify evidence, block with specifics, never self-set Done,
  idempotency, commit identity `Moe Ghashim <mohanadgh@gmail.com>`.

Offered to produce `AGENTS.md` + a `labels.sh` bootstrap.

---

## 2 — Turn the recommendation into a shareable prompt

**User:** "Share your recommendation of the system in a prompt to share it with another
agent."

**Assistant:** Produced a self-contained implementation prompt restating the design so a
receiving agent needs no prior context: principles (GitHub as truth, labels canonical,
board derived, mechanical-over-self-certification), the target state (one Project, the
label set, the automations, the `gh-stage.sh` wrapper), the files to produce, the agent
contract, prereqs/gotchas, and acceptance criteria. Offered a single-repo variant.

---

## 3 — Resolve a blocking contradiction and implement

**User:** Handed back a task doc: a reviewer found a blocking contradiction (agents "only
touch labels" yet must read Status=Ready and set Status=In Progress, which is a field) and
proposed fixes (Option A). Adopt or reject each finding with mechanism-level reasons, then
implement the files. Don't commit until the repo list is confirmed.

**Assistant:** Worked through each finding:

- **A (contradiction):** Adopted the core (agent-label → In Progress automation; claim as
  a label write; never set Status). Refined the lock: the proposed "assignee as lock" only
  works if each agent has a distinct GitHub identity — but all commits are Moe's and a solo
  operator likely runs one token, so assignee can't distinguish agents. The real fix is to
  prevent contention at the source. **Chose READY mechanism (ii): dispatch-only**, deleted
  the "check Status=Ready yourself" clause, and **dropped `status:ready`** entirely.
- **B:** Adopted — dropped `type:review` (collides with Status=Review).
- **C:** Adopted — added board views (Blocked, Ready Queue), no new columns.
- **D:** Adopted — `gh-stage.sh` resolves option IDs by name at runtime, no stale cache.
- **E:** Adopted — PR→Review triggers on `[opened, ready_for_review]` only, never merge.
- Deliberately omitted the optional priority-mirror to stay lean.

Produced and syntax-checked the files: `AGENTS.md`, `scripts/labels.sh`,
`scripts/gh-stage.sh`, `.github/workflows/project-sync.yml`, plus a human-only `SETUP.md`.
Flagged one open question (shared token vs. per-agent identity) and asked for the repo list
before pushing.

---

## 4 — A diagram of how the (initial) system works

**User:** "Create a diagram to explain to me how things work."

**Assistant:** Three diagrams with prose between: (1) the work lifecycle — five stages with
each transition labelled as a human decision or a mechanical/automated move; (2) the agent
run loop inside In progress — claim, execute, the `make verify` gate, pass→PR / fail→block,
with a human-checkpoint pause; (3) Control Center as the operator's window reading the board
and run stream. Throughline: green never comes from an agent's word, only a mechanical
signal.

---

## 5 — What the agent emits while executing

**User:** "What does the agent emit while executing?"

**Assistant:** An append-only NDJSON event stream. Shared envelope (`seq`, `ts`, `run`,
`issue`, `agent`, `type`) plus type-specific payloads, grouped: run lifecycle, progress
(plan/step), actions (tool.call/result), the gate (`gate.result.exit_code` — the only
green-able event), the human gate (checkpoint requested/resolved), outputs (pr.opened,
commit), accounting (usage/cost), and narration/errors. Showed a sample run for issue #42.
Two load-bearing distinctions: only the gate's exit code may render green (the agent's own
"it works" stays unverified); and the stream is observability, not truth — durable state
stays in labels/PR and `STATE.json`. Noted the ACP/acpx mapping. Offered a JSON schema +
`emit()` helper.

---

## 6 — Add a planner/reviewer and a scoring agent

**User:** Proposed always running two agents — a planner-reviewer and an executor — where
the planner-reviewer signs off before a PR is registered, plus a grader that scores the
planner and reviewer so that, over many issues, history shows which agent is best at which
role; routing then picks planner/reviewer vs. executor accordingly.

**Assistant:** The shape is good (wasimo formalized) but four details matter:

- **Sign-off goes after the mechanical gate, never instead of it** — a reviewer verdict is
  an LLM judgment, so verify-green is the floor; the reviewer judges what verify can't.
- **Don't bundle planner and reviewer** — self-certification at the planning layer, and you
  can't attribute a low score. Keep planner, executor, reviewer distinct.
- **Score against downstream ground truth first** (verify-first-pass, review round-trips,
  your pre-merge edits, reverts); the LLM grader calibrates on top of those anchors.
- **Blind the grader and never let it be an agent that worked the issue** (LLM self-
  preference bias would corrupt exactly the comparison you're running).
- Statistical cautions: ten issues proves nothing; confounded by difficulty and partner —
  slice by work-type; route as a bandit (mostly exploit, sometimes explore).

Asked whether the grader runs per-issue or as a nightly batch, and the roster size.

---

## 7 — Hourly self-selecting pollers?

**User:** Proposed an automation where each agent looks at issues assigned to it every hour
and picks them up. "Let me know if this works."

**Assistant:** Works for the overnight case but pulls against deterministic orchestration.
"Assigned to Codex" is ambiguous once roles are sequential; a bare poll only checks
assignment. Problems: handoff latency stacks (3× up-to-an-hour waits), no lock → double-
start, no concurrency cap, cron/Actions unreliability for local CLI agents. The fix is the
same shape as wasimo: **one dispatcher loop** that reads the board, finds each issue's next
due step, invokes the right agent, and enforces the gate, lock, and cap — polling becomes
the dispatcher's heartbeat. Sketched the role state machine and stressed the non-negotiable
ordering: reviewer signs off only after verify is green. Offered to draw it or spec it.

---

## 8 — Draw the flow first

**User:** "Yes."

**Assistant:** Delivered `agent-flow.html` with two diagrams: the per-issue flow with the
two gates (mechanical floor → AI sign-off → human merge, with the executor-only change
loop and the block path), and the measurement & routing loop (triage picks the cast from
the routing table → pipeline → blinded grader → ratings → back to the table). Confirmed the
ordering and asked three questions.

---

## 9 — Decisions, and the planner-bounce tradeoff

**User:** Grader = nightly batch; roster = all four; explain the planner-bounce tradeoff
before deciding.

**Assistant:** Explained executor-only vs. allowing a planner bounce. Recommended starting
**executor-only but requiring the reviewer to tag every rejection `execution` vs `plan`,
with a round-trip cap that escalates to you**. That keeps the simple one-target state
machine, stops unconvergeable bad plans from looping forever, and still lets the nightly
grader attribute plan-tagged round-trips to the planner — so the measurement stays clean
without building the extra edge yet. Instrument first; add the edge only if the data
justifies it.

---

## 10 — Write the dispatcher spec

**User:** "Go ahead."

**Assistant:** Delivered `DISPATCHER.md`: why one dispatcher (one writer → no claim race,
no distributed lock; a local process, not Actions); the label scheme (cast `plan:`/`exec:`/
`review:`, `phase:` states, control labels); handoff artifacts (`PLAN.md`, `verify.json`
written by the dispatcher, `REVIEW.json`); the per-issue state machine with the gate run by
the dispatcher; poll-tick pseudocode with the ledger, `reap` crash recovery, concurrency /
per-agent / per-repo caps; the router (ε-greedy with min-sample force-explore, sliced by
work-type); the nightly blinded grader; the ratings store and routing table; and how it
plugs into the existing repo. Flagged `PER_REPO_CAP=1` as a throughput ceiling (lift with
git worktrees), the cast-as-labels-vs-ledger choice, and the stub rubric. Noted `AGENTS.md`
now needs rewriting into three role contracts.

---

## 11 — Updated full-system diagram

**User:** "Can you present an updated diagram for me to understand the full system."

**Assistant:** Delivered `system-map.html` — one integration map tying together You,
Control Center, GitHub (truth), the dispatcher, the two gates, the four agents in three
roles, the run stream, and the measurement loop. Narrated one issue's full journey through
it; pointed out the three things the map makes obvious (GitHub the only state, the
dispatcher the only hub, two solid gates plus merge as the only ways forward, two dashed
back-edges as the only loops).

---

## 12 — Make it interactive

**User:** "It's showing now. Can you build an interactive diagram?"

**Assistant:** Delivered `system-map-interactive.html` — the same system map with clickable
nodes (each dims the rest, highlights its connections, and shows its role + key rule) and a
guided 13-step "trace an issue" walkthrough with Play / Prev / Next / Show-all controls.

---

## 13 — Package everything

**User:** "Can you provide me with all the files, the transcript in md format and the
prompt to give claude design to build the website?"

**Assistant:** This bundle — the `agent-ops` repo, the three diagrams, this transcript, and
the Claude Design website prompt.

---

## The system in one paragraph

Every unit of work is a GitHub issue; labels are canonical and the Project board is a
derived view. You triage and assign a cast (planner, executor, reviewer) from a routing
table. A single deterministic dispatcher advances each issue through plan → execute →
`make verify` (run by the dispatcher; exit 0 is the only green-able signal) → review
sign-off (reachable only on a green gate; approve, or changes with a required reason that
loops back to the executor under a cap) → PR → your merge → Done. A nightly blinded grader
scores the merged work into ratings keyed by agent × role × work-type, which update the
routing table and shape your next cast. Throughout, the executor emits an NDJSON run stream
that Control Center tails so you supervise by exception. Nothing is ever green on an agent's
word — only on a mechanical signal or your merge.
