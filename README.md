# loop-master — a GitHub-native multi-agent coding system

Run several coding agents (Codex, Claude Code, Cursor, Pi, Factory, Amp) against your backlog
without babysitting them. **GitHub is the single source of truth**: issues + labels are
canonical, and the Project board is a derived view kept in sync by automation.

## The system

```mermaid
flowchart TD
  YOU["You — triage · review · merge"]:::human
  GH[("GitHub — issues · labels · board")]:::data
  DISP["Dispatcher · Action — decides cast + solo/reviewed, writes labels"]:::orch
  EXEC["Executor — vendor app, you can jump in"]:::agent
  GATE{"CI · make verify — required"}:::mech
  REV["Reviewer — vendor app, reviewed shape"]:::ai
  GRADER["Nightly grader — blinded Action"]:::ai
  RATINGS[("Ratings")]:::data
  ROUTE[("routing.json")]:::data
  YOU -->|triage → Ready| GH
  GH -->|issue Ready| DISP
  ROUTE -.->|confidence| DISP
  DISP -->|writes cast labels| GH
  DISP -->|assign| EXEC
  EXEC -->|opens PR| GH
  GH -->|PR| GATE
  GATE -->|exit 0 first| REV
  REV -->|approve| GH
  REV -.->|changes| EXEC
  YOU -.->|jump in| EXEC
  YOU -->|merge → Done| GH
  GH -->|merged, nightly| GRADER
  GRADER --> RATINGS --> ROUTE
  classDef human fill:#E1F5EE,stroke:#1D9E75,color:#085041;
  classDef data fill:#E6F1FB,stroke:#378ADD,color:#0C447C;
  classDef orch fill:#FBEAF0,stroke:#D4537E,color:#72243E;
  classDef mech fill:#FAEEDA,stroke:#BA7517,color:#633806;
  classDef agent fill:#F1EFE8,stroke:#888780,color:#2C2C2A;
  classDef ai fill:#FAECE7,stroke:#D85A30,color:#712B13;
```

GitHub is the source of truth; a dispatcher Action decides the cast and writes labels (it never executes); the assigned vendor app runs the work; CI is the gate; you merge. After merge, a nightly blinded grader turns outcomes into the routing that shapes the next cast.

## The one rule

Nothing is ever "done" on an agent's word. Only a **mechanical signal** — a passing
`make verify` (exit 0, enforced as a required CI check) or a merged PR — turns work green.
Every other claim is treated as unverified until a mechanical fact confirms it. The whole
design falls out of this.

## How work flows

Each unit of work is an issue — a **loop**: `Inbox → Ready → In Progress → Review → Done`
(`stage:blocked` is an orthogonal flag, not a column). The pipeline:

1. **Interview** *(optional)* — the planning front-door (the grill-with-docs method): grills a
   fuzzy issue into a plan, resolves terms against [CONTEXT.md](CONTEXT.md), and tags
   `difficulty`. A well-specified issue skips it and starts Ready.
2. **Dispatcher** *(a GitHub Action)* — at triage, decides the **cast** and the pipeline
   **shape** and writes labels. It *decides and labels; it never executes.*
3. **Executor** *(a vendor app)* — turns the plan into a diff and opens a PR. Runs in its own
   app, so you can jump into the live session.
4. **Gate** — `make verify` as a **required CI check**: exit 0 is the only green-able signal.
5. **Reviewer** *(a different vendor app, reviewed shape only)* — signs off on what the gate
   can't see. Reachable only on a green gate.
6. **Your merge** — the final gate; only a merge sets Done.

Two pipeline shapes, chosen per issue by the dispatcher: **solo** (one tool end-to-end) or
**reviewed** (executor + an independent reviewer). The presence of a `review:` label *is* the
shape.

```mermaid
flowchart TD
  T["Triage · dispatcher — writes cast + shape"]:::orch --> X["Execute — vendor app"]:::agent
  X --> V{"CI · make verify"}:::mech
  V -->|non-zero| FB["Fix or block"]:::fail
  FB -.->|after fix| X
  V -->|exit 0| Q{"review: label?"}:::orch
  Q -->|reviewed| R["Reviewer — vendor app"]:::ai
  Q -->|solo| M["You merge → Done"]:::human
  R -->|changes| X
  R -->|approve| M
  classDef orch fill:#FBEAF0,stroke:#D4537E,color:#72243E;
  classDef agent fill:#F1EFE8,stroke:#888780,color:#2C2C2A;
  classDef mech fill:#FAEEDA,stroke:#BA7517,color:#633806;
  classDef ai fill:#FAECE7,stroke:#D85A30,color:#712B13;
  classDef human fill:#E1F5EE,stroke:#1D9E75,color:#085041;
  classDef fail fill:#FCEBEB,stroke:#E24B4A,color:#791F1F;
```

### Sub-loops

An agent can spawn a **sub-loop** mid-loop — a child issue (GitHub sub-issue). The default
relationship is **block**: the parent pauses (`stage:blocked`, `blocked-by:#child`) until the
child merges, then resumes. Guardrails (depth cap, parent-merge gate, unblock-on-merge,
fan-out budget) keep recursion safe.

### The learning loop

After merge, a nightly **blinded grader** scores the work into ratings (agent × role ×
work-type) that feed a **routing table** (`routing.json`) — which drives the
dispatcher's next cast and solo/reviewed call. Mostly exploit best-fit, sometimes explore.

See the diagrams in [docs/diagrams/](docs/diagrams/).

## Repo layout

| Path | What it is |
|---|---|
| [AGENTS.md](AGENTS.md) (≡ [CLAUDE.md](CLAUDE.md)) | The agent contract — role contracts for interview / executor / reviewer. |
| [CONTEXT.md](CONTEXT.md) | Canonical vocabulary (one name, one meaning) — the glossary the interview maintains. |
| [DISPATCHER.md](DISPATCHER.md) | The coordinator spec — the triage decision, the Actions, sub-loops, the learning loop. |
| [SETUP.md](SETUP.md) | One-time human setup — Project board, repo variables/secrets, branch protection. |
| [scripts/labels.sh](scripts/labels.sh) | Idempotent label bootstrap. |
| [scripts/gh-stage.sh](scripts/gh-stage.sh) | The single controlled entry point to the Projects API. |
| [Makefile](Makefile) | `make verify` — the mechanical gate. |
| [.github/workflows/verify.yml](.github/workflows/verify.yml) | Runs `make verify` on PRs (the required check). |
| [.github/workflows/project-sync.yml](.github/workflows/project-sync.yml) | PR → board Status automation. |
| `routing.json` | The routing table (cold-start: empty). |
| [docs/diagrams/](docs/diagrams/) | `system-map.html`, `agent-flow.html` — open in a browser. |

## Getting started

Follow [SETUP.md](SETUP.md): create the Project (Status options
`Inbox / Ready / In Progress / Review / Done`), wire its built-in workflows, then per repo run
`scripts/labels.sh <owner/repo>`, set `PROJECT_OWNER` / `PROJECT_NUMBER` (variables) and
`PROJECTS_TOKEN` (secret), and make `verify` a required check on the default branch.

## Status

Built: the contract + vocabulary, the converged dispatcher spec, the label set, the
`make verify` gate (required on `main`), board automation, and the routing scaffold. The first
loop has been driven end-to-end by hand (Codex executing, Claude reviewing). **Next:** Stage 1
— automating the triage Action and the per-vendor execution adapters.

---

Commit identity for everything: `Moe Ghashim <mohanadgh@gmail.com>`.
