#!/usr/bin/env bash
# labels.sh — create/update the canonical label set on one or more repos.
# Idempotent: `gh label create --force` updates if present, creates if absent,
# so running it twice is a no-op (same values re-applied, exit 0).
#
# Usage:
#   scripts/labels.sh <owner/repo> [<owner/repo> ...]
#
# Requires: gh (authenticated with repo scope).

set -euo pipefail
command -v gh >/dev/null 2>&1 || { echo "labels: missing dependency: gh" >&2; exit 1; }
[ "$#" -ge 1 ] || { echo "usage: labels.sh <owner/repo> [<owner/repo> ...]" >&2; exit 1; }

# name|hex color|description
# Converged model — see CONTEXT.md (vocabulary) and DISPATCHER.md (coordinator):
#   - cast = exec:* / review:*  (assignment-based; the label is the per-issue lock)
#   - presence of a review:* label IS the solo-vs-reviewed shape (no separate flag)
#   - NO phase:* labels — pipeline state is derived from GitHub (PR / CI / board)
#   - NO status:ready / type:review / stage:done (READY is dispatch; review collides
#     with Status=Review; a closed issue IS done)
#   - depth:N bounds sub-loop recursion (MAX_DEPTH)
LABELS=(
  "exec:codex|1f6feb|Executor assignment: Codex (active claim + lock)"
  "exec:claude|8957e5|Executor assignment: Claude Code (active claim + lock)"
  "exec:cursor|00b8d9|Executor assignment: Cursor (active claim + lock)"
  "exec:pi|0969da|Executor assignment: Pi (active claim + lock)"
  "exec:factory|ff7452|Executor assignment: Factory (active claim + lock)"
  "exec:amp|bf8700|Executor assignment: Amp (active claim + lock)"
  "review:codex|1f6feb|Reviewer assignment: Codex (reviewed shape)"
  "review:claude|8957e5|Reviewer assignment: Claude Code (reviewed shape)"
  "review:cursor|00b8d9|Reviewer assignment: Cursor (reviewed shape)"
  "review:pi|0969da|Reviewer assignment: Pi (reviewed shape)"
  "review:factory|ff7452|Reviewer assignment: Factory (reviewed shape)"
  "review:amp|bf8700|Reviewer assignment: Amp (reviewed shape)"
  "agent:human|6e7781|A human is working this"
  "run:active|1d76db|A run is in flight (lock mirror)"
  "needs:cast|fbca04|Dispatcher refused: no executor assigned"
  "needs:human|d93f0b|Escalated to a human (loop cap / repeated red CI)"
  "dispatch:auto|2da44e|Interview chose auto-assign: dispatcher assigns + triggers"
  "dispatch:confirm|db6d28|Interview chose confirm: dispatcher proposes, you confirm"
  "stage:blocked|d1242f|Blocked (see latest comment); may carry blocked-by:#N"
  "depth:1|c5def5|Sub-loop depth 1"
  "depth:2|c5def5|Sub-loop depth 2"
  "depth:3|c5def5|Sub-loop depth 3"
  "type:bug|d73a4a|Defect to fix"
  "type:feature|0e8a16|New capability"
  "type:chore|c5def5|Maintenance / ops / housekeeping"
  "type:research|fbca04|Investigation or spike"
  "priority:p0|b60205|P0 — drop everything"
  "priority:p1|d93f0b|P1 — high"
  "priority:p2|fef2c0|P2 — normal"
  "priority:p3|c2e0c6|P3 — low / someday"
)

for repo in "$@"; do
  echo "== ${repo} =="
  for spec in "${LABELS[@]}"; do
    IFS='|' read -r name color desc <<<"${spec}"
    gh label create "${name}" --repo "${repo}" --color "${color}" \
      --description "${desc}" --force
  done
done
echo "labels: done."
