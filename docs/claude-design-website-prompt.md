# Claude Design prompt — the system website

Paste the block below into Claude Design. It is self-contained: it restates the whole
system so the design agent needs nothing from the original conversation.

> Note on scope: this builds a **website that explains and showcases the system** (a
> project / docs / landing page, with the interactive diagram as its hero). It is **not**
> the Control Center operator console — that is a separate product UI.

```
PROJECT: Build a single-page website that explains and showcases "Control Center" — a
system for running multiple coding agents against GitHub as the source of truth.

WHO IT'S FOR
Builders and technical founders evaluating how to orchestrate several coding agents
(Codex, Claude, Pi, Amp) without babysitting them. The site should make a sharp,
opinionated architecture legible in two minutes and explorable in ten. It is a showcase
and explainer, not a marketing brochure and not the operator console itself.

THE ONE IDEA THE SITE MUST LAND
Nothing is ever "done" on an agent's word. Only a mechanical signal — a passing
`make verify` (exit 0) or a merged PR — can turn something green. Every other claim is
shown as unverified until a mechanical fact confirms it. The whole design falls out of
this rule.

THE SYSTEM (the content to present)
- GitHub is the single source of truth. Issues + labels are canonical; the GitHub Project
  board is a derived view kept in sync by automation. Nothing else holds state.
- Every unit of work is an issue. It flows: Inbox → Ready → In progress → Review → Done.
  "Blocked" is an orthogonal flag, not a column.
- Three roles per issue, three distinct agents from the roster of four: planner, executor,
  reviewer. A fourth independent, blinded grader scores work nightly.
- TWO GATES IN SERIES, then you: (1) `make verify` — the mechanical floor, run by the
  dispatcher itself, not the agent; (2) the reviewer sign-off — reachable only on a green
  gate, judging what verify can't (right problem, sound approach); (3) your merge — final.
  The reviewer is structurally unable to approve a red build.
- ONE DISPATCHER, not self-selecting agents. A single deterministic process polls the
  board, finds each issue's next due step, invokes the right agent, runs the gate, and
  advances a labeled state machine. One writer means no claim race and no distributed lock.
  No agent talks to another agent — only to the dispatcher and the repo.
- THE REVIEW LOOP is executor-only: a rejection carries a required reason tag
  (execution | plan); a round-trip cap escalates to the human instead of looping forever.
- THE LEARNING LOOP: after merge, the nightly blinded grader scores planner/executor/
  reviewer from durable signals (verify-first-pass, round-trips by reason, your pre-merge
  edits, reverts) plus rubric judgment, keyed by agent x role x work-type. Ratings update a
  routing table that drives the next triage — mostly best-fit, sometimes exploring.
- THE RUN STREAM: while executing, the agent emits an append-only NDJSON event stream
  (steps, tool calls, the gate result, usage/cost) that the operator console tails.

PRIMARY DELIVERABLE — THE HERO
An interactive system diagram as the centerpiece, at the top of the page:
- Nodes: You, Control Center, GitHub (source of truth), Dispatcher, make verify (gate),
  Planner, Executor, Reviewer, Nightly grader, Ratings, Routing table.
- Edges (solid = work/writes, dashed = observe/feed-back): you->GitHub (triage, cast);
  you->Control Center; Control Center -.-> GitHub (reads board + run stream);
  Dispatcher <-> GitHub; Dispatcher -> Planner/Executor/Reviewer; Dispatcher -> gate;
  gate -> Reviewer (exit 0 first); Executor -.-> Control Center (run stream);
  Reviewer -> GitHub (approve: PR -> Review); Reviewer -.-> Executor (changes: re-execute);
  GitHub -> Grader (merged, nightly); Grader -> Ratings -> Routing table;
  Routing table -.-> you (informs cast).
- Interactions: click a node to dim the rest, highlight its connections, and reveal its
  role + the one rule that matters. A "Trace an issue" control that steps through the full
  lifecycle (triage -> plan -> execute -> gate -> review -> PR -> merge -> Done -> nightly
  grade -> ratings -> routing -> back to triage), one highlighted step at a time, with a
  caption per step and Play / Prev / Next / Reset.

PAGE SECTIONS (below the hero, scrolling)
1. The principle — "mechanical truth, not agent claims," stated boldly, with the green-only
   rule. A small before/after: agent says "it works" (unverified) vs. verify exit 0 (green).
2. The two gates — a compact vertical flow: plan -> execute -> [verify] -> review sign-off
   -> PR -> you merge, with the executor-only change loop and the block path. Make the
   mechanical gate visually the floor the AI sign-off stands on.
3. The dispatcher — why one process beats four pollers (one writer, no race, no lock;
   it runs the gate; it owns every board move). A few config knobs shown as a spec card
   (tick interval, max concurrency, round-trip cap, explore rate).
4. The learning loop — how the roster gets smarter: blinded grader -> ratings
   (agent x role x work-type) -> routing table -> next cast. Emphasize the bandit framing
   (exploit best-fit, explore to stay fresh) and blinding (kills LLM self-preference).
5. The roster — Codex, Claude, Pi, Amp, each able to play any of the three roles; the
   grader is always an agent that did not work the issue.

AESTHETIC DIRECTION
Mission-control / terminal — modern, not skeuomorphic. Dark, high-contrast surface;
monospace for IDs, labels, code, and the run-stream snippets, a clean sans for prose.
Color used sparingly and meaningfully to carry status, not decoration: reserve one warm
accent (amber) for the mechanical gate / "verified" idea since it's the spine of the whole
system; a distinct hue for AI judgment (review/grade); calm neutrals for structure. The
feeling: a precise, trustworthy control system a founder would keep open all day. Avoid
generic SaaS-landing styling — no pastel gradient cards, no hero stock illustration, no
marketing fluff. Fully responsive; the hero diagram must work on a phone (stack/scroll
gracefully, the trace stepper especially).

SEED CONTENT (use real-looking specifics so it doesn't read as a template)
- A sample run stream ticking in the hero or section 1:
  step: edit loop.flow.ts -> tool: run make verify -> gate: verify exit 0 (green) ->
  step: open PR (Closes #42).
- A sample routing-table row: executor=Codex, work_type=feature, n=9, score=7.8.
- A sample review verdict: { verdict: changes, reason: execution, notes: "missing
  null-check on empty cart" }.
- Roster of four (Codex, Claude, Pi, Amp) shown rotating through the three roles.

DELIVERABLE
A high-fidelity, responsive single-page site with the interactive hero diagram working
(clickable nodes + the trace stepper) and all five sections built out with the seed
content. Then I'll iterate on copy and visual detail.
```
