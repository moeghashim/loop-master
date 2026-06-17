#!/usr/bin/env bash
# gh-stage.sh — the SINGLE controlled entry point to the GitHub Projects v2 API.
# Moves one issue to a named Status on a Project v2 board. Nothing else writes the
# board's Status: agents, the human, and the CI automations all go through here.
#
# Resolves project node id, Status field id, and the target option id BY NAME at run
# time (no frozen ID cache — survives renames/reorders; finding D).
#
# Usage:
#   gh-stage.sh --owner <login> --project <number> --status "<Status Name>" \
#               ( --url <issue-url> | --issue <number> --repo <owner/repo> )
#
# Env fallbacks (used when the matching flag is omitted):
#   PROJECT_OWNER, PROJECT_NUMBER
#
# Requires: gh + jq, and a token with scope: project,read:project
#   (fix with: gh auth refresh -s project,read:project)

set -euo pipefail

die()  { printf 'gh-stage: %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"; }
need gh; need jq

OWNER="${PROJECT_OWNER:-}"; NUMBER="${PROJECT_NUMBER:-}"
STATUS=""; ISSUE=""; REPO=""; URL=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --owner)   OWNER="$2";  shift 2;;
    --project) NUMBER="$2"; shift 2;;
    --status)  STATUS="$2"; shift 2;;
    --issue)   ISSUE="$2";  shift 2;;
    --repo)    REPO="$2";   shift 2;;
    --url)     URL="$2";    shift 2;;
    -h|--help) grep '^#' "$0" | sed 's/^#\{0,1\} \{0,1\}//'; exit 0;;
    *) die "unknown arg: $1";;
  esac
done

[ -n "$OWNER" ]  || die "missing --owner (or PROJECT_OWNER)"
[ -n "$NUMBER" ] || die "missing --project (or PROJECT_NUMBER)"
[ -n "$STATUS" ] || die "missing --status"
if [ -z "$URL" ]; then
  { [ -n "$ISSUE" ] && [ -n "$REPO" ]; } || die "provide --url, or both --issue and --repo"
  URL="https://github.com/${REPO}/issues/${ISSUE}"
fi

# 1) Project node id
PROJECT_JSON="$(gh project view "$NUMBER" --owner "$OWNER" --format json 2>/dev/null)" \
  || die "cannot read project ${OWNER}/#${NUMBER} — token scope? run: gh auth refresh -s project,read:project"
PROJECT_ID="$(jq -r '.id' <<<"$PROJECT_JSON")"
{ [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ]; } || die "could not resolve project node id"

# 2) Status field id + target option id, BY NAME, at run time
FIELDS_JSON="$(gh project field-list "$NUMBER" --owner "$OWNER" --format json)"
FIELD_ID="$(jq -r '.fields[] | select(.name=="Status") | .id' <<<"$FIELDS_JSON")"
{ [ -n "$FIELD_ID" ] && [ "$FIELD_ID" != "null" ]; } || die "no 'Status' field on this project"
OPTION_ID="$(jq -r --arg s "$STATUS" \
  '.fields[] | select(.name=="Status") | .options[] | select(.name==$s) | .id' <<<"$FIELDS_JSON")"
if [ -z "$OPTION_ID" ] || [ "$OPTION_ID" = "null" ]; then
  valid="$(jq -r '.fields[]|select(.name=="Status")|.options[].name' <<<"$FIELDS_JSON" | paste -sd', ' -)"
  die "Status has no option named '${STATUS}' (valid: ${valid})"
fi

# 3) Item id for this issue (auto-add normally covers this; add if missing)
ITEMS_JSON="$(gh project item-list "$NUMBER" --owner "$OWNER" --format json --limit 1000)"
ITEM_ID="$(jq -r --arg u "$URL" '.items[] | select(.content.url==$u) | .id' <<<"$ITEMS_JSON" | head -n1)"
if [ -z "$ITEM_ID" ] || [ "$ITEM_ID" = "null" ]; then
  ITEM_ID="$(gh project item-add "$NUMBER" --owner "$OWNER" --url "$URL" --format json | jq -r '.id')"
  { [ -n "$ITEM_ID" ] && [ "$ITEM_ID" != "null" ]; } || die "issue not on board and could not be added: ${URL}"
fi

# 4) The one controlled write
gh project item-edit \
  --id "$ITEM_ID" \
  --project-id "$PROJECT_ID" \
  --field-id "$FIELD_ID" \
  --single-select-option-id "$OPTION_ID" >/dev/null

printf 'gh-stage: %s -> Status="%s"\n' "$URL" "$STATUS"
