#!/usr/bin/env bash
# dispatch-poll.sh — the dispatcher's scheduled tick.
#
# Lists issues at Status=Ready on the Project board and triages each via triage.sh
# (which is idempotent, so already-cast / already-proposed issues are skipped). Reads the
# board with a token that has the project scope; the default GITHUB_TOKEN cannot.
#
# Usage: dispatch-poll.sh --owner <login> --project <number> --repo <owner/repo>
# Env:   GH_TOKEN must hold a token with project + repo scope (PROJECTS_TOKEN).

set -euo pipefail
die() { printf 'poll: %s\n' "$1" >&2; exit 1; }
command -v gh >/dev/null 2>&1 || die "missing dependency: gh"
command -v jq >/dev/null 2>&1 || die "missing dependency: jq"

OWNER="${PROJECT_OWNER:-}"; NUMBER="${PROJECT_NUMBER:-}"; REPO=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --owner)   OWNER="$2";  shift 2 ;;
    --project) NUMBER="$2"; shift 2 ;;
    --repo)    REPO="$2";   shift 2 ;;
    *) die "unknown arg: $1" ;;
  esac
done
[ -n "$OWNER" ]  || die "missing --owner (or PROJECT_OWNER)"
[ -n "$NUMBER" ] || die "missing --project (or PROJECT_NUMBER)"
[ -n "$REPO" ]   || die "missing --repo"

here="$(cd "$(dirname "$0")" && pwd)"

items="$(gh project item-list "$NUMBER" --owner "$OWNER" --format json --limit 500)"
total="$(printf '%s' "$items" | jq '.items | length')"

# Open issues in this repo at Status=Ready. Match the repo via content.url (reliable).
ready="$(printf '%s' "$items" | jq -r --arg base "https://github.com/${REPO}/issues/" '
  .items[]
  | select((.content.type // "") == "Issue")
  | select((.status // "") == "Ready")
  | select((.content.url // "") | startswith($base))
  | (.content.number | tostring)
')"

n="$(printf '%s' "$ready" | grep -c . || true)"
echo "poll: ${total} board items; ${n} at Status=Ready for ${REPO}."
[ "$n" -eq 0 ] && { echo "poll: nothing to triage."; exit 0; }

printf '%s\n' "$ready" | while IFS= read -r num; do
  [ -n "$num" ] || continue
  echo "poll: triaging #${num}"
  bash "${here}/triage.sh" --repo "$REPO" --issue "$num" || echo "poll: triage of #${num} failed (continuing)"
done
