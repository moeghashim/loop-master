# SETUP.md — one-time setup (human only)

These steps can't live in a committed file because they configure the Project itself and
per-repo secrets. Do them once per Project, plus the per-repo block for each tracked repo.

## 1. Project (once)

Create one user/org Project (v2). Configure the built-in **Status** field options, in
order, to exactly: `Inbox`, `Ready`, `In Progress`, `Review`, `Done`.
(A fresh Status field starts as Todo / In Progress / Done — rename Todo→Inbox, add Ready
and Review, in the Project UI or via the GraphQL `updateProjectV2Field` mutation.)

Note the **PROJECT_OWNER** (your login/org) and **PROJECT_NUMBER** (the number in the
project URL) — you'll set them as repo variables below.

### Built-in workflows (Project ▸ ⋯ ▸ Workflows)
- **Item added to project → set Status = Inbox.**
- **Item closed → set Status = Done** (default; keep on).
- **Pull request merged → set Status = Done** (default; keep on).
These three cover Inbox, close→Done, and merge→Done with zero code.

### Auto-add (Project ▸ ⋯ ▸ Workflows ▸ Auto-add)
Add one auto-add workflow **per tracked repo** so new issues land on the board (then the
"item added → Inbox" workflow above stages them).

### Board views (additive; finding C)
- **Ready Queue** — Table/Board view filtered to `Status = Ready`, sorted by Priority.
- **Blocked** — view filtered to `label:stage:blocked` (so blocked issues stop hiding
  inside the In Progress column).

## 2. Per tracked repo

```bash
# a) Labels (idempotent)
scripts/labels.sh <owner/repo>

# b) Project pointers (so the workflow knows which board to write)
gh variable set PROJECT_OWNER  --repo <owner/repo> --body "<PROJECT_OWNER>"
gh variable set PROJECT_NUMBER --repo <owner/repo> --body "<PROJECT_NUMBER>"

# c) Token with Projects access (default GITHUB_TOKEN can't write org/user Projects).
#    Use a fine-grained PAT or App token with scopes: project, repo
gh secret set PROJECTS_TOKEN --repo <owner/repo> --body "<token>"

# d) Ship the automation + contract
#    Commit AGENTS.md, scripts/, and .github/workflows/project-sync.yml into the repo.
```

## 3. Your own CLI scope (once, locally)

```bash
gh auth refresh -s project,read:project   # needed for gh-stage.sh and gh project *
chmod +x scripts/labels.sh scripts/gh-stage.sh
```

## 4. Dispatch model (how work actually flows)

You triage Inbox → Ready (your judgment). To start an agent, **invoke that agent on a
specific issue number** (CLI arg / prompt) — that out-of-band invocation is the dispatch
and is what guarantees one agent per issue. The agent then adds `agent:<name>` (→ In
Progress), opens a PR with `Closes #N` (→ Review), and you merge (→ Done).

Manual board moves (e.g. Inbox→Ready, or pulling something back) go through the one
entry point:

```bash
scripts/gh-stage.sh --owner <PROJECT_OWNER> --project <PROJECT_NUMBER> \
  --issue 42 --repo <owner/repo> --status "Ready"
```
