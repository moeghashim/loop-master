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
#  - NO status:ready  (READY is dispatch-only; not an agent-readable gate)
#  - NO type:review   (collides with Status=Review; type:research covers spikes)
#  - NO stage:done    (a closed issue IS done)
LABELS=(
  "agent:codex|1f6feb|Active claim: Codex is working this"
  "agent:claude|8957e5|Active claim: Claude is working this"
  "agent:pi|0969da|Active claim: Pi is working this"
  "agent:amp|bf8700|Active claim: Amp is working this"
  "agent:human|6e7781|Active claim: a human is working this"
  "stage:blocked|d1242f|Orthogonal flag: blocked (see latest comment)"
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
