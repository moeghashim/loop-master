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

# d) Codex self-runner secrets (for the scheduled Codex adapter)
#    OPENAI_API_KEY powers openai/codex-action. CODEX_GITHUB_TOKEN must be a PAT/App
#    token that can write branches, issues, and PRs; use this instead of GITHUB_TOKEN
#    for executor PRs so follow-on pull_request CI runs.
gh secret set OPENAI_API_KEY --repo <owner/repo> --body "<openai-api-key>"
gh secret set CODEX_GITHUB_TOKEN --repo <owner/repo> --body "<repo-write-token>"

# Optional: use a separate review identity. If absent, reviewer submissions use
# github-actions[bot].
gh secret set CODEX_REVIEW_GITHUB_TOKEN --repo <owner/repo> --body "<review-token>"

# e) Ship the automation + contract
#    Commit AGENTS.md, scripts/, and .github/workflows/ into the repo.
```

## 3. Your own CLI scope (once, locally)

```bash
gh auth refresh -s project,read:project   # needed for gh-stage.sh and gh project *
chmod +x scripts/labels.sh scripts/gh-stage.sh
```

## 4. Dispatch model (how work actually flows)

You triage Inbox → Ready (your judgment). The dispatcher assigns `exec:*` and, for reviewed
work, `review:*`. The Codex adapter in `.github/workflows/codex-self-runner.yml` runs every
30 minutes and picks up only Codex-owned work:

- executor: open issues labeled `exec:codex`, with no open PR, not `run:active`, not blocked,
  and not human-owned.
- reviewer: open PRs whose closing issue is labeled `review:codex`, whose `verify` check is
  green, and that the review token has not already reviewed.

The adapter locks each selected issue with `run:active`, lets Codex make the code/review
judgment, then clears the lock after opening the PR or submitting the review. It never reads
or writes Project fields.

Manual board moves (e.g. Inbox→Ready, or pulling something back) go through the one
entry point:

```bash
scripts/gh-stage.sh --owner <PROJECT_OWNER> --project <PROJECT_NUMBER> \
  --issue 42 --repo <owner/repo> --status "Ready"
```
