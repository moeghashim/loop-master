#!/usr/bin/env bash
# codex-self-runner.sh - deterministic wrapper for the Codex vendor adapter.
#
# The scheduled workflow lets Codex make code/review judgments. This script owns the
# mechanical GitHub bookkeeping: discovery, run:active locks, duplicate PR checks,
# verify capture, PR creation, and review submission.

set -euo pipefail

die() { printf 'codex-self-runner: %s\n' "$1" >&2; exit 1; }
log() { printf 'codex-self-runner: %s\n' "$1" >&2; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"; }

need gh
need jq

cmd="${1:-}"
[ -n "$cmd" ] || die "missing command"
shift

REPO=""
ISSUE=""
PR=""
BRANCH=""
TITLE=""
DECISION_FILE=""
CODEX_OUTCOME="success"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --issue) ISSUE="$2"; shift 2 ;;
    --pr) PR="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --decision-file) DECISION_FILE="$2"; shift 2 ;;
    --codex-outcome) CODEX_OUTCOME="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^#\{0,1\} \{0,1\}//'
      exit 0
      ;;
    *) die "unknown arg: $1" ;;
  esac
done

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | tr -c 'a-z0-9' '-' \
    | sed 's/--*/-/g; s/^-//; s/-$//' \
    | cut -c1-48
}

issue_is_blocked_or_active() {
  jq -e 'any(.labels[].name; . == "run:active" or . == "stage:blocked" or . == "needs:human" or . == "agent:human")' \
    >/dev/null
}

lock_issue() {
  local issue="$1"
  log "locking issue #${issue} with run:active"
  gh issue edit "$issue" --repo "$REPO" --add-label "run:active" >/dev/null
}

clear_run_active() {
  local issue="$1"
  [ -n "$issue" ] || return 0
  gh issue edit "$issue" --repo "$REPO" --remove-label "run:active" >/dev/null 2>&1 || true
}

comment_blocked() {
  local issue="$1"
  local reason="$2"
  local detail="$3"

  gh issue edit "$issue" --repo "$REPO" --add-label "stage:blocked" >/dev/null || true
  {
    printf 'Codex self-runner blocked on this issue.\n\n'
    printf '**Blocker:** %s\n\n' "$reason"
    printf '%s\n' "$detail"
  } | gh issue comment "$issue" --repo "$REPO" --body-file - >/dev/null || true
}

refs_filter='
def refnums:
  [(.closingIssuesReferences // [])[].number]
  + [((.title // "") + "\n" + (.body // "") | scan("(?i)(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)[[:space:]:]+#([0-9]+)")[] | tonumber)]
  + [(try (.headRefName | capture("^agent/codex/(?<n>[0-9]+)-").n | tonumber) catch empty)];
refnums | unique | .[]?
'

issue_has_open_pr() {
  local issue="$1"
  gh pr list --repo "$REPO" --state open \
    --json number,title,body,headRefName,closingIssuesReferences --limit 200 \
    | jq -e --arg issue "$issue" '
      def refnums:
        [(.closingIssuesReferences // [])[].number]
        + [((.title // "") + "\n" + (.body // "") | scan("(?i)(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)[[:space:]:]+#([0-9]+)")[] | tonumber)]
        + [(try (.headRefName | capture("^agent/codex/(?<n>[0-9]+)-").n | tonumber) catch empty)];
      any(.[]; any((refnums)[]?; tostring == $issue))
    ' >/dev/null
}

pr_verify_green_json() {
  jq -e '
    [(.statusCheckRollup // [])[] | select((.name // "") == "verify" or (.workflowName // "") == "verify")] as $checks
    | ($checks | length) > 0
    and all($checks[]; (.status // "") == "COMPLETED" and (.conclusion // "") == "SUCCESS")
  ' >/dev/null
}

pr_already_reviewed_json() {
  local viewer="$1"
  jq -e --arg viewer "$viewer" '
    any(.reviews[]?;
      ((.author.login // "") == $viewer)
      or ((.body // "") | contains("<!-- codex-self-runner-review -->"))
    )
  ' >/dev/null
}

append_matrix_item() {
  local matrix="$1"
  local item="$2"
  jq -c --argjson item "$item" '. + [$item]' <<<"$matrix"
}

discover_exec() {
  [ -n "$REPO" ] || die "discover-exec requires --repo"

  local issues_json matrix item issue title url slug branch
  issues_json="$(gh issue list --repo "$REPO" --state open --label "exec:codex" \
    --json number,title,labels,url --limit 100)"
  matrix="[]"

  while IFS= read -r item; do
    [ -n "$item" ] || continue
    issue="$(jq -r '.number' <<<"$item")"
    title="$(jq -r '.title' <<<"$item")"
    url="$(jq -r '.url' <<<"$item")"

    if issue_is_blocked_or_active <<<"$item"; then
      log "executor skip #${issue}: active, blocked, human-owned, or escalated"
      continue
    fi
    if issue_has_open_pr "$issue"; then
      log "executor skip #${issue}: open PR already exists"
      continue
    fi

    lock_issue "$issue"
    if issue_has_open_pr "$issue"; then
      clear_run_active "$issue"
      log "executor skip #${issue}: PR appeared after lock"
      continue
    fi

    slug="$(slugify "$title")"
    [ -n "$slug" ] || slug="issue"
    branch="agent/codex/${issue}-${slug}"
    item="$(jq -n \
      --arg issue "$issue" \
      --arg title "$title" \
      --arg url "$url" \
      --arg branch "$branch" \
      '{issue:$issue,title:$title,url:$url,branch:$branch}')"
    matrix="$(append_matrix_item "$matrix" "$item")"
  done < <(jq -c '.[]' <<<"$issues_json")

  jq -cn --argjson include "$matrix" '{include:$include}'
}

discover_review() {
  [ -n "$REPO" ] || die "discover-review requires --repo"

  local viewer prs_json matrix pr_json pr issue issue_json labels title url current_pr
  local issue_title issue_url item
  viewer="$(gh api user --jq '.login')"
  prs_json="$(gh pr list --repo "$REPO" --state open \
    --json number,title,body,headRefName,closingIssuesReferences,statusCheckRollup,reviews,url \
    --limit 100)"
  matrix="[]"

  while IFS= read -r pr_json; do
    [ -n "$pr_json" ] || continue
    pr="$(jq -r '.number' <<<"$pr_json")"
    title="$(jq -r '.title' <<<"$pr_json")"
    url="$(jq -r '.url' <<<"$pr_json")"

    if ! pr_verify_green_json <<<"$pr_json"; then
      log "review skip PR #${pr}: verify is not green"
      continue
    fi
    if pr_already_reviewed_json "$viewer" <<<"$pr_json"; then
      log "review skip PR #${pr}: ${viewer} already reviewed"
      continue
    fi

    while IFS= read -r issue; do
      [ -n "$issue" ] || continue
      issue_json="$(gh issue view "$issue" --repo "$REPO" --json number,title,state,labels,url 2>/dev/null || true)"
      [ -n "$issue_json" ] || continue
      [ "$(jq -r '.state' <<<"$issue_json")" = "OPEN" ] || continue

      labels="$(jq -r '.labels[].name' <<<"$issue_json")"
      if ! grep -qx 'review:codex' <<<"$labels"; then
        continue
      fi
      if issue_is_blocked_or_active <<<"$issue_json"; then
        log "review skip PR #${pr}: closing issue #${issue} is active, blocked, human-owned, or escalated"
        continue
      fi

      lock_issue "$issue"
      current_pr="$(gh pr view "$pr" --repo "$REPO" \
        --json number,title,body,headRefName,closingIssuesReferences,statusCheckRollup,reviews,url,state)"
      if [ "$(jq -r '.state' <<<"$current_pr")" != "OPEN" ]; then
        clear_run_active "$issue"
        continue
      fi
      if ! pr_verify_green_json <<<"$current_pr"; then
        clear_run_active "$issue"
        log "review skip PR #${pr}: verify changed after lock"
        continue
      fi
      if pr_already_reviewed_json "$viewer" <<<"$current_pr"; then
        clear_run_active "$issue"
        log "review skip PR #${pr}: review appeared after lock"
        continue
      fi

      issue_title="$(jq -r '.title' <<<"$issue_json")"
      issue_url="$(jq -r '.url' <<<"$issue_json")"
      item="$(jq -n \
        --arg pr "$pr" \
        --arg issue "$issue" \
        --arg title "$title" \
        --arg url "$url" \
        --arg issue_title "$issue_title" \
        --arg issue_url "$issue_url" \
        '{pr:$pr,issue:$issue,title:$title,url:$url,issue_title:$issue_title,issue_url:$issue_url}')"
      matrix="$(append_matrix_item "$matrix" "$item")"
      break
    done < <(jq -r "$refs_filter" <<<"$pr_json")
  done < <(jq -c '.[]' <<<"$prs_json")

  jq -cn --argjson include "$matrix" '{include:$include}'
}

prepare_branch() {
  [ -n "$BRANCH" ] || die "prepare-branch requires --branch"
  git fetch --no-tags origin main
  if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
    git fetch --no-tags origin "$BRANCH"
    git switch -C "$BRANCH" "origin/$BRANCH"
  else
    git switch -c "$BRANCH" origin/main
  fi
}

write_exec_context() {
  [ -n "$REPO" ] || die "write-exec-context requires --repo"
  [ -n "$ISSUE" ] || die "write-exec-context requires --issue"
  mkdir -p .codex-run
  gh issue view "$ISSUE" --repo "$REPO" \
    --json number,title,body,labels,comments,url \
    > .codex-run/issue.json
}

write_review_context() {
  [ -n "$REPO" ] || die "write-review-context requires --repo"
  [ -n "$PR" ] || die "write-review-context requires --pr"
  [ -n "$ISSUE" ] || die "write-review-context requires --issue"
  mkdir -p .codex-run
  gh issue view "$ISSUE" --repo "$REPO" \
    --json number,title,body,labels,comments,url \
    > .codex-run/issue.json
  gh pr view "$PR" --repo "$REPO" \
    --json number,title,body,comments,reviews,files,headRefName,baseRefName,closingIssuesReferences,statusCheckRollup,url \
    > .codex-run/pr.json
  gh pr diff "$PR" --repo "$REPO" --patch > .codex-run/pr.diff
}

truncate_file_for_body() {
  local file="$1"
  local max_bytes="${2:-50000}"
  local bytes

  bytes="$(wc -c <"$file" | tr -d ' ')"
  if [ "$bytes" -gt "$max_bytes" ]; then
    printf '[truncated to last %s bytes]\n' "$max_bytes"
    tail -c "$max_bytes" "$file"
  else
    cat "$file"
  fi
}

finalize_exec() {
  [ -n "$REPO" ] || die "finalize-exec requires --repo"
  [ -n "$ISSUE" ] || die "finalize-exec requires --issue"
  [ -n "$BRANCH" ] || die "finalize-exec requires --branch"
  trap 'clear_run_active "$ISSUE"' EXIT

  mkdir -p .codex-run
  if [ "$CODEX_OUTCOME" != "success" ]; then
    comment_blocked "$ISSUE" "Codex action failed" "The Codex executor step ended with outcome \`${CODEX_OUTCOME}\`. No PR was opened."
    die "Codex action failed for issue #${ISSUE}"
  fi

  local verify_log=".codex-run/verify.log"
  set +e
  make verify >"$verify_log" 2>&1
  local verify_status=$?
  set -e
  if [ "$verify_status" -ne 0 ]; then
    comment_blocked "$ISSUE" "make verify failed" "$(tail -n 160 "$verify_log")"
    die "make verify failed for issue #${ISSUE}"
  fi

  git add -A
  if git diff --cached --quiet; then
    comment_blocked "$ISSUE" "no diff produced" "Codex completed and \`make verify\` passed, but the working tree had no changes to open as a PR."
    die "no changes to commit for issue #${ISSUE}"
  fi

  local short_title pr_title existing_pr body_file summary_file
  short_title="$(printf '%s' "${TITLE:-issue}" | tr '\n' ' ' | cut -c1-100)"
  pr_title="Implement #${ISSUE}: ${short_title}"

  git commit -m "$pr_title"
  gh auth setup-git >/dev/null
  git push origin "HEAD:${BRANCH}"

  existing_pr="$(gh pr list --repo "$REPO" --state open --head "$BRANCH" --json number --jq '.[0].number // empty')"
  if [ -n "$existing_pr" ]; then
    log "PR #${existing_pr} already exists for ${BRANCH}; not creating another"
    return 0
  fi

  body_file=".codex-run/pr-body.md"
  summary_file=".codex-run/codex-final.md"
  {
    printf 'Closes #%s\n\n' "$ISSUE"
    printf '## Summary\n'
    if [ -s "$summary_file" ]; then
      sed -n '1,80p' "$summary_file"
      printf '\n'
    else
      printf -- '- Automated Codex executor run for issue #%s.\n' "$ISSUE"
    fi
    printf '\n## Verify\n\n```text\n'
    truncate_file_for_body "$verify_log" 50000
    printf '\n```\n'
  } >"$body_file"

  gh pr create --repo "$REPO" --base main --head "$BRANCH" --title "$pr_title" --body-file "$body_file" >/dev/null
}

submit_review() {
  [ -n "$REPO" ] || die "submit-review requires --repo"
  [ -n "$PR" ] || die "submit-review requires --pr"
  [ -n "$ISSUE" ] || die "submit-review requires --issue"
  [ -n "$DECISION_FILE" ] || die "submit-review requires --decision-file"
  trap 'clear_run_active "$ISSUE"' EXIT

  if [ "$CODEX_OUTCOME" != "success" ]; then
    die "Codex review action failed for PR #${PR}"
  fi
  [ -s "$DECISION_FILE" ] || die "missing review decision file: $DECISION_FILE"

  local decision reason_tag body pr_json viewer body_file
  decision="$(jq -r '.decision // empty' "$DECISION_FILE")"
  reason_tag="$(jq -r '.reason_tag // "none"' "$DECISION_FILE")"
  body="$(jq -r '.body // empty' "$DECISION_FILE")"
  [ "$decision" = "approve" ] || [ "$decision" = "request_changes" ] || die "invalid review decision: ${decision:-empty}"
  if [ "$decision" = "request_changes" ] && { [ "$reason_tag" != "execution" ] && [ "$reason_tag" != "plan" ]; }; then
    die "request_changes requires reason_tag execution or plan"
  fi
  [ -n "$body" ] || die "review body is empty"

  pr_json="$(gh pr view "$PR" --repo "$REPO" --json statusCheckRollup,reviews,state)"
  [ "$(jq -r '.state' <<<"$pr_json")" = "OPEN" ] || die "PR #${PR} is not open"
  if ! pr_verify_green_json <<<"$pr_json"; then
    die "refusing to review PR #${PR}: verify is not green"
  fi
  viewer="$(gh api user --jq '.login')"
  if pr_already_reviewed_json "$viewer" <<<"$pr_json"; then
    log "review already exists for PR #${PR}; not submitting another"
    return 0
  fi

  body_file=".codex-run/review-body.md"
  mkdir -p .codex-run
  {
    printf '<!-- codex-self-runner-review -->\n'
    if [ "$decision" = "request_changes" ]; then
      printf 'Reason tag: %s\n\n' "$reason_tag"
    fi
    printf '%s\n' "$body"
  } >"$body_file"

  if [ "$decision" = "approve" ]; then
    gh pr review "$PR" --repo "$REPO" --approve --body-file "$body_file"
  else
    gh pr review "$PR" --repo "$REPO" --request-changes --body-file "$body_file"
  fi
}

case "$cmd" in
  discover-exec) discover_exec ;;
  discover-review) discover_review ;;
  prepare-branch) prepare_branch ;;
  write-exec-context) write_exec_context ;;
  write-review-context) write_review_context ;;
  finalize-exec) finalize_exec ;;
  submit-review) submit_review ;;
  clear-run-active)
    [ -n "$REPO" ] || die "clear-run-active requires --repo"
    [ -n "$ISSUE" ] || die "clear-run-active requires --issue"
    clear_run_active "$ISSUE"
    ;;
  *) die "unknown command: $cmd" ;;
esac
