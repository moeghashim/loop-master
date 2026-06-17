# DISPATCHER.md — deterministic orchestrator for the planner / executor / reviewer loop

One dispatcher process advances every issue through its role pipeline. Agents never
self-select work and never decide their own stage; the dispatcher reads the board, finds
each issue's next due step, invokes the right agent, runs the mechanical gate itself, and
advances the state machine. This is the programmatic-orchestrator-over-free-form-coordination
principle applied to dispatch.

## Decisions locked

- **Roster:** Codex, Claude, Pi, Amp. Three roles per issue (planner, executor, reviewer),
  all three distinct, plus a fourth independent grader that is none of the three.
- **Two gates, in series:** `make verify` (mechanical floor) must be green *before* the
  reviewer is invoked; the reviewer signs off on what verify can't see; then you merge.
- **Review loop:** executor-only. The reviewer tags every rejection `execution` or `plan`,
  a round-trip counter caps the loop, and exceeding the cap escalates to you. The nightly
  grader uses the tags to charge `plan`-tagged round-trips to the planner, not the executor.
- **Grader:** nightly batch over the day's merged issues, scoring from durable signals.

## The verify gate is run by the dispatcher, not the executor

The executor produces a diff and returns. The dispatcher then runs `make verify` itself and
reads the exit code. The executor's claim that "it works" is never the gate — the only
green-able signal is the dispatcher's own `make verify` exit 0 (or a merged PR). Because the
dispatcher won't set `phase:review` until exit 0, the reviewer *structurally cannot* run on a
red gate. Gate-before-review is enforced by the state machine, not by discipline.

## Labels this spec adds

Canonical, board-visible, queryable. Add to `scripts/labels.sh`.

Cast (assigned at triage, one per role):
```
plan:codex   plan:claude   plan:pi   plan:amp
exec:codex   exec:claude   exec:pi   exec:amp
review:codex review:claude review:pi review:amp
```
Phase (the dispatcher's cheap next-step read, within Status=In Progress):
```
phase:plan   phase:exec   phase:review
```
Control:
```
run:active     # a run is in flight on this issue (the visible lock mirror)
needs:cast     # dispatcher refuses to start: missing a full cast
needs:human    # escalated to you (loop cap hit, repeated gate failure)
```
> Sprawl note: 12 cast labels buy you a board you can filter ("everything Codex is planning"),
> which the measurement view wants. If you'd rather keep the board lean, move the cast into the
> per-issue run-ledger (below) and drop the 12 labels — the dispatcher reads the ledger either
> way. Default here is labels, for visibility.

## Per-issue state machine

The cast lives in labels; the phase advances inside Status=In Progress. The dispatcher owns
every Status transition (via `scripts/gh-stage.sh`); agents touch only their own work.

```
Ready (cast assigned: plan:* exec:* review:* present)
  |  dispatcher picks up -> Status=In Progress, set phase:plan
  v
phase:plan    -> invoke planner -> plan recorded
  |  ok        -> set phase:exec
  |  fail x N  -> escalate (needs:human)
  v
phase:exec    -> invoke executor -> executor returns a diff/branch
  |  dispatcher runs `make verify`   (MECHANICAL — the only green-able signal)
  |  exit 0    -> set phase:review
  |  non-zero  -> if exec_attempts < EXEC_RETRY: stay phase:exec (executor fixes)
  |              else: block (stage:blocked, comment) — terminal until you act
  v
phase:review  -> invoke reviewer -> verdict + required reason
  |  approve            -> open PR (Closes #N) -> project-sync moves board to Review
  |  changes, reason=.. -> append {reason, ts} to loop history; round_trips++
  |       if round_trips > LOOP_CAP -> escalate (needs:human, comment the thrash)
  |       else -> set phase:exec
  v
Review        -> YOU merge -> default workflow moves board to Done
  v
(nightly)     -> grader scores the merged issue -> ratings recorded
```

Invariants the machine enforces by construction:
- The reviewer is unreachable until `make verify` is green.
- Done is only ever a merge; no agent and not even the dispatcher sets Done.
- Every review rejection carries a reason; a malformed/empty reason is rejected and the
  reviewer is re-invoked (or escalated after RETRY), so the grader never sees an untagged loop.

## The dispatcher (poll-tick pseudocode)

A single long-running process (or local cron/launchd tick — not GitHub Actions, since these
CLI agents need your checkout, auth, and subscription). Pseudocode, language-agnostic:

```python
TICK            = 120     # seconds between ticks
MAX_CONCURRENT  = 3       # global in-flight runs
PER_AGENT_CAP   = 1       # an agent runs one issue at a time (single CLI session)
PER_REPO_CAP    = 1       # one active run per repo, unless you use git worktrees/sandboxes
RUN_TIMEOUT     = 1800    # kill+reap a run exceeding this (seconds)
EXEC_RETRY      = 2       # executor self-fix attempts on a red gate before block
LOOP_CAP        = 3       # exec<->review round-trips before escalating to you

def tick():
    ledger = load_ledger()                 # durable: runs/RUNS.json  {issue: {role, run_id, agent, pid, started_at, status}}
    reap(ledger)                           # mark finished; kill+fail runs older than RUN_TIMEOUT, clear their run:active
    inflight = [r for r in ledger if r.status == "active"]
    if len(inflight) >= MAX_CONCURRENT:
        return

    # Candidates: Ready issues with a full cast, plus In-Progress issues mid-pipeline.
    # Exclude anything already locked or escalated.
    cands = list_issues(status in {Ready, "In Progress"},
                        not has_label("run:active"),
                        not has_label("needs:human"))
    cands = [c for c in cands if has_full_cast(c) or mark_needs_cast(c)]
    cands.sort(key=lambda c: (priority_rank(c), age(c)))   # P0 first, then oldest

    for c in cands:
        if len(inflight) >= MAX_CONCURRENT: break
        phase = next_phase(c)                              # from phase:* label
        agent = cast_for(c, phase)                         # plan:/exec:/review: label
        if busy(agent, ledger, PER_AGENT_CAP):      continue
        if repo_busy(c.repo, ledger, PER_REPO_CAP): continue
        start_run(c, phase, agent, ledger)
        inflight.append(c)

def start_run(issue, phase, agent, ledger):
    if first_phase(issue):                  # entering phase:plan from Ready
        gh_stage(issue, "In Progress")      # dispatcher owns Status, via gh-stage.sh
    add_label(issue, "run:active")
    ledger.add(issue, role=phase, agent=agent, run_id=new_id(), pid=spawn(
        invoke_agent(agent, role=phase, issue=issue, context=gather(issue))
    ), started_at=now(), status="active")

def on_run_complete(issue, phase, agent, result, ledger):
    remove_label(issue, "run:active"); ledger.close(issue)
    if phase == "plan":
        if result.ok: set_phase(issue, "exec")
        else: retry_or_escalate(issue, "plan", EXEC_RETRY)

    elif phase == "exec":
        exit_code = run("make verify", cwd=issue.repo)     # MECHANICAL GATE — dispatcher runs it
        emit_event(issue, "gate.result", exit_code=exit_code)   # only exit 0 is green-able
        if exit_code == 0:
            set_phase(issue, "review")
        elif attempts(issue, "exec") < EXEC_RETRY:
            set_phase(issue, "exec")                       # executor fixes and re-runs
        else:
            block(issue, f"verify red after {EXEC_RETRY} attempts")

    elif phase == "review":
        verdict, reason = result.verdict, result.reason
        if verdict == "changes" and reason not in {"execution", "plan"}:
            return retry_or_escalate(issue, "review", EXEC_RETRY)   # malformed -> re-review
        if verdict == "approve":
            open_pr(issue)                                 # "Closes #N" -> project-sync -> Review
        else:
            append_loop(issue, reason)                     # to loop history (for the grader)
            if round_trips(issue) > LOOP_CAP:
                escalate(issue, "exec/review thrash")      # needs:human + comment, stop
            else:
                set_phase(issue, "exec")
```

`block`, `escalate`, and the gate write go through `gh-stage.sh` for Status and labels for the
rest, so the board stays a derived view. Crash safety lives in `reap`: a run whose pid is gone
or whose `started_at` exceeds `RUN_TIMEOUT` is failed, its `run:active` cleared, and the phase
either retried or escalated — no issue gets stuck behind a dead run.

## Parallelism inside one repo

`PER_REPO_CAP = 1` exists because two runs in the same working tree clobber each other. To run
several agents on one repo at once, give each run its own `git worktree` (or microVM sandbox)
and raise the cap — the lock becomes per-worktree, not per-repo. Until then, one repo runs one
issue at a time; different repos run in parallel up to `MAX_CONCURRENT`.

## Nightly grader

Separate scheduled job. Scores from durable, mostly-objective signals; the LLM judgment sits
on top of anchors it can't fabricate.

```python
def nightly():
    for issue in merged_since(watermark):
        grader = pick_grader(issue.cast)        # any roster agent NOT in this issue's cast
        evidence = {
            plan, diffs, review_notes,
            verify_history,                      # first-pass pass? attempts?
            loop_history,                        # round-trips with reason tags
            human_edit_lines,                    # your pre-merge edits to the PR
            reverted_within=window(issue),       # did a later commit revert it?
        }
        blinded = strip_identities(evidence)     # "plan A", "review B" — never "Codex planned"
        llm = grader.grade(blinded, RUBRIC)      # plan_score, review_score, exec_score
        objective = {
            "executor": {"verify_first_pass", "rt_execution", "human_edit_lines", "reverted"},
            "reviewer": {"false_approval": (changes_by_you or reverted) after sign_off,
                         "good_catch":     flagged_something_that_mattered},
            "planner":  {"rt_plan", "plan_targeted_right_thing"},
        }
        write_rating(issue, llm, objective, key=(agent, role, work_type))
    recompute_routing_table()
```

Blinding matters because LLM judges self-prefer by model family — and the thing you're
measuring *is* "Claude-reviewer vs Codex-reviewer," so an unblinded grader would quietly
corrupt the comparison. Calibrate: grade 1-in-10 yourself; if the grader diverges
systematically, recalibrate the rubric or swap the grader model. You are the grader's grader.

## Ratings store and routing table

Per-issue, per-role rating record:
```json
{ "issue": "owner/repo#42", "work_type": "feature", "difficulty": "M",
  "role": "executor", "agent": "codex", "partners": {"plan":"claude","review":"claude"},
  "graded_by": "amp", "llm_score": 7.5,
  "objective": {"verify_first_pass": true, "rt_execution": 0, "rt_plan": 0,
                "human_edit_lines": 12, "reverted": false},
  "merged_at": "..." }
```

Routing table — aggregate keyed by `(agent, role, work_type)`:
```json
{ "agent":"codex", "role":"executor", "work_type":"feature",
  "n": 9, "score_recent": 7.8, "score_all": 7.1, "updated": "..." }
```

Triage routing policy (run when you move Inbox -> Ready):
```python
def pick_cast(work_type):
    for role in ("planner", "executor", "reviewer"):
        eligible = agents_with(role, work_type, n >= MIN_SAMPLE)
        if random() < explore_epsilon(role, work_type):   # epsilon higher when cells are thin
            choice[role] = random_eligible(role)            # explore — keeps the table fresh
        else:
            choice[role] = argmax_recent(eligible)          # exploit best-known
    enforce_distinct(choice)        # planner != executor != reviewer
    return choice                   # -> writes plan:* exec:* review:* labels (or proposes; you confirm)
```
Three cautions baked in: slice by `work_type` (best planner for a refactor != for API design);
`MIN_SAMPLE` gates exploitation so two noisy data points don't decide a routing; and the
explore term keeps you collecting on the other agents (and notices when a new model version
improves) instead of locking onto one pairing forever.

## How this fits the existing repo

- `scripts/gh-stage.sh` — unchanged; the dispatcher is now its main caller for Status moves.
- `.github/workflows/project-sync.yml` — keep PR-opened -> Review and the default merge -> Done.
  The old `agent:* -> In Progress` automation is now redundant (the dispatcher sets In Progress
  when it starts `phase:plan`); remove it or leave it as a harmless no-op.
- `scripts/labels.sh` — add the cast / phase / control labels above.
- `AGENTS.md` — the per-role contracts plug in here: planner produces the plan, executor
  produces a diff and never claims the gate, reviewer outputs `approve | changes + reason`.
  Dispatch is no longer "you invoke an agent out of band" — the dispatcher invokes; the contract
  is what each role does when invoked.

## Knobs left for you

- The tunables block (`TICK`, caps, `RUN_TIMEOUT`, `EXEC_RETRY`, `LOOP_CAP`, `MIN_SAMPLE`, epsilon).
- The grader rubric (what `plan_score` / `review_score` actually reward).
- Cast as labels vs. ledger-only (sprawl vs. board visibility).
- Worktrees/sandboxes if you want in-repo parallelism above `PER_REPO_CAP = 1`.
