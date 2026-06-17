#!/usr/bin/env bash
# triage.sh — the dispatcher's triage decision (Stage 1, cold-start, deterministic).
#
# For ONE issue, decides the cast (executor + optional reviewer) and the solo/reviewed
# shape from its type/priority/difficulty labels and routing.json, then either applies the
# cast labels (dispatch:auto) or proposes them (dispatch:confirm), and posts a ready-to-paste
# executor prompt. It DECIDES and LABELS; it never runs an agent.
#
# Usage: triage.sh --repo <owner/repo> --issue <number>
# Requires: gh + jq, a token with issues:write (GITHUB_TOKEN in Actions).

set -euo pipefail
die() { printf 'triage: %s\n' "$1" >&2; exit 1; }
command -v gh >/dev/null 2>&1 || die "missing dependency: gh"
command -v jq >/dev/null 2>&1 || die "missing dependency: jq"

REPO=""; ISSUE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)    REPO="$2";  shift 2 ;;
    --issue)   ISSUE="$2"; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^#\{0,1\} \{0,1\}//'; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done
[ -n "$REPO" ]  || die "missing --repo"
[ -n "$ISSUE" ] || die "missing --issue"

# Cold-start knobs (until routing.json fills).
DEFAULT_EXEC="codex"
DEFAULT_REVIEWER="claude"

issue_json="$(gh issue view "$ISSUE" --repo "$REPO" --json labels,title)"
labels="$(jq -r '.labels[].name' <<<"$issue_json")"
title="$(jq -r '.title' <<<"$issue_json")"
has() { printf '%s\n' "$labels" | grep -qx "$1"; }

# Idempotency: skip if already cast (exec:*) or already proposed (needs:cast).
if printf '%s\n' "$labels" | grep -qE '^exec:|^needs:cast$'; then
  echo "triage: #$ISSUE already triaged — skipping."; exit 0
fi

work_type="feature"
for t in bug feature chore research; do if has "type:$t"; then work_type="$t"; fi; done
priority="p2"
for p in p0 p1 p2 p3; do if has "priority:$p"; then priority="$p"; fi; done
difficulty=""
for d in s m l; do if has "difficulty:$d"; then difficulty="$d"; fi; done

# Routing table (cold start = no routes).
routes_n=0
if [ -f routing.json ]; then routes_n="$(jq '.routes | length' routing.json 2>/dev/null || echo 0)"; fi

# Executor: cold start -> default; (later: argmax_recent over routing.json for this work_type).
executor="$DEFAULT_EXEC"

# Shape: reviewed unless clearly trivial. Cold start biases to reviewed.
if [ "$routes_n" -eq 0 ]; then
  reviewed="yes"
  if [ "$work_type" = "chore" ] && [ "$difficulty" = "s" ]; then reviewed="no"; fi
else
  reviewed="no"
  case "$priority" in p0|p1) reviewed="yes" ;; esac
  if [ "$work_type" = "bug" ]; then reviewed="yes"; fi
  if [ "$difficulty" = "l" ]; then reviewed="yes"; fi
fi

reviewer=""
if [ "$reviewed" = "yes" ]; then
  reviewer="$DEFAULT_REVIEWER"
  if [ "$reviewer" = "$executor" ]; then reviewer="claude"; fi
fi

mode="confirm"
if has "dispatch:auto"; then mode="auto"; fi

shape="solo"; if [ "$reviewed" = "yes" ]; then shape="reviewed"; fi
cast="exec:${executor}"; if [ -n "$reviewer" ]; then cast="${cast} + review:${reviewer}"; fi
slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/--*/-/g; s/^-//; s/-$//' | cut -c1-40)"

read -r -d '' prompt <<PROMPT || true
You are the EXECUTOR for issue #${ISSUE} in ${REPO}. Read AGENTS.md (executor role) and
CONTEXT.md (vocabulary), then implement issue #${ISSUE} end to end.
- Branch agent/${executor}/${ISSUE}-${slug} off main. One issue, one branch.
- Make CI green: run 'make verify' yourself; it must exit 0. You don't claim the gate.
- Open a PR whose body has 'Closes #${ISSUE}' and the make verify output.
- Don't touch the board. Commit identity: Moe Ghashim <mohanadgh@gmail.com>.
- If blocked: add stage:blocked, comment the specific blocker, and stop.
PROMPT

note="_dispatch:confirm — apply the cast labels above to confirm, then launch the executor._"
if [ "$mode" = "auto" ]; then
  note="_dispatch:auto — cast applied. Launch the executor (Codex cloud picks up its assigned issue)._"
fi

body="$(cat <<BODY
**Triage — ${shape}**

- work type \`${work_type}\` · priority \`${priority}\` · difficulty \`${difficulty:-unset}\`
- cast: \`${cast}\`
- dispatch mode: \`${mode}\`

<details><summary>Executor prompt</summary>

\`\`\`text
${prompt}
\`\`\`
</details>

${note}
BODY
)"

if [ "$mode" = "auto" ]; then
  gh issue edit "$ISSUE" --repo "$REPO" --add-label "exec:${executor}"
  if [ -n "$reviewer" ]; then gh issue edit "$ISSUE" --repo "$REPO" --add-label "review:${reviewer}"; fi
else
  # confirm: mark the issue so a repeated poll doesn't re-propose every tick.
  gh issue edit "$ISSUE" --repo "$REPO" --add-label "needs:cast"
fi
gh issue comment "$ISSUE" --repo "$REPO" --body "$body"
echo "triage: #$ISSUE -> ${mode}: ${cast} (${shape})"
