#!/usr/bin/env bash
# release/lib/apply-release-engine.sh — mechanical executor for a RELEASE-<date>.md, called by the
# thin release/apply-release.ps1 wrapper.
#
# SCOPE, ON PURPOSE
#   This engine executes the Preflight block and every Phase 4 (migration) block mechanically,
#   stopping on the FIRST Expect: mismatch, exactly like BLOCKS.md's own repeated rule: "any
#   output that disagrees with what you must see is a full stop." The moment it reaches the
#   "# Phase 5" heading (image transfer) it STOPS CLEANLY and hands off to a human -- this
#   pipeline was built by an agent whose own mandate forbids running any deploy command
#   (docs/research/convergence R-4's own scope note: "this script must stop before any
#   deploy/image-swap step"). A release document's migration phase can be fully mechanical; its
#   deploy phase never is.
set -u
export MSYS_NO_PATHCONV=1

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SELF_DIR/mig-apply.sh"
# The decision file is consulted here as DEFENCE IN DEPTH, not as the primary control. The release
# document already renders a decided version as a non-executable block, so nothing should reach
# this engine for one. If a hand-edited document ever does carry a mig_apply line for a version
# declared SKIP, this engine refuses it rather than trusting the document -- and for a decided
# LEDGER_ONLY it re-checks the guard here, against the REAL target, because a guard that held on
# the rehearsal shape is not evidence about production.
source "$SELF_DIR/decided-migrations.sh"

RELEASE_MD="" CONTAINER="afrakala-lan-db" DBUSER="supabase_admin" TARGET_DB=""
MIGDIR="supabase/migrations" REPO_ROOT="." LOG="" DECIDED=""

while [ $# -gt 0 ]; do
  case "$1" in
    --release-md) RELEASE_MD="$2"; shift 2;;
    --container) CONTAINER="$2"; shift 2;;
    --db-user) DBUSER="$2"; shift 2;;
    --target-db) TARGET_DB="$2"; shift 2;;
    --migdir) MIGDIR="$2"; shift 2;;
    --repo-root) REPO_ROOT="$2"; shift 2;;
    --log) LOG="$2"; shift 2;;
    --decided) DECIDED="$2"; shift 2;;
    *) echo "unknown arg: $1"; exit 2;;
  esac
done

[ -n "$RELEASE_MD" ] && [ -f "$RELEASE_MD" ] || { echo "FATAL: --release-md missing/not found"; exit 2; }
[ -n "$TARGET_DB" ] || { echo "FATAL: --target-db is required (never defaults, never guesses)"; exit 2; }
[ -n "$LOG" ] || { echo "FATAL: --log is required"; exit 2; }
case "$TARGET_DB" in
  postgres|afrakala) echo "REFUSED: '$TARGET_DB' is a real database. apply-release.ps1 targets a named rehearsal or a deliberately-chosen production db only."; exit 2;;
esac

cd "$REPO_ROOT" || exit 2
: > "$LOG"
log() { echo "$1" | tee -a "$LOG"; }

log "=== apply-release: $RELEASE_MD -> $TARGET_DB@$CONTAINER ==="
log "started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---------- Preflight (Block 1) -------------------------------------------------------------
log "--- Preflight ---"
IS_REPLICA=$(psql_scalar "$CONTAINER" "$DBUSER" "$TARGET_DB" "SELECT pg_is_in_recovery();")
log "pg_is_in_recovery() = $IS_REPLICA (Expect: f)"
if [ "$IS_REPLICA" != "f" ]; then
  log "FATAL: target is a replica (or unreadable). STOP."
  exit 1
fi

# ---------- walk the document, block by block -------------------------------------------------
# A block starts at a line matching "### Block N" and runs until the next such line or a "# Phase"
# heading. We stop entirely, cleanly, the moment "# Phase 5" is reached.
STOPPED_BEFORE_DEPLOY=0
BLOCK_FAILED=0
CURRENT_VER="" CURRENT_FILE="" CURRENT_KIND=""

process_block() {
  local kind="$1" ver="$2" file="$3"
  case "$kind" in
    APPLY)
      local path="$MIGDIR/$file"
      if [ -n "$DECIDED" ] && [ "$(decided_disposition "$ver" "$DECIDED" 2>/dev/null || true)" = "SKIP" ]; then
        log "REFUSED: this document carries a mig_apply line for $ver, which decision"
        log "$(decided_id "$ver" "$DECIDED") declares PERMANENTLY SKIPPED on this target. The document and the"
        log "decision file disagree; running it would perform work a human decided must not happen."
        return 1
      fi
      log "Block: mig_apply $ver $file"
      mig_apply "$CONTAINER" "$DBUSER" "$TARGET_DB" "$ver" "$path" 2>&1 | tee -a "$LOG"
      return "${PIPESTATUS[0]}"
      ;;
    LEDGER_ONLY)
      if [ -n "$DECIDED" ] && [ "$(decided_disposition "$ver" "$DECIDED" 2>/dev/null || true)" = "LEDGER_ONLY" ]; then
        local gsql gexp got
        gsql=$(decided_guard_sql "$ver" "$DECIDED"); gexp=$(decided_guard_expect "$ver" "$DECIDED")
        if [ -n "$gsql" ]; then
          got=$(psql_scalar "$CONTAINER" "$DBUSER" "$TARGET_DB" "$gsql")
          log "DECISION GUARD $(decided_id "$ver" "$DECIDED") for $ver: got [$got], expected [$gexp]"
          if [ "$got" != "$gexp" ]; then
            log "REFUSED: the guard behind this decision does not hold on $TARGET_DB. The premise the"
            log "decision rested on is not true here, so the ledger row must NOT be written."
            return 1
          fi
        fi
      fi
      log "Block: ledger_insert_only $ver"
      ledger_insert_only "$CONTAINER" "$DBUSER" "$TARGET_DB" "$ver" 2>&1 | tee -a "$LOG"
      return "${PIPESTATUS[0]}"
      ;;
  esac
  return 0
}

# ---------- how many directives does the document actually contain? -----------------------------
# COUNTED FIRST, BEFORE ANYTHING RUNS, and compared against what was executed at the end.
#
# WHY: on 2026-09-13 this engine's FIRST real run reported "VERDICT: PASSED" having executed 2 of
# 17 blocks. The mig_apply pattern used `\S+\.sql`; `\S` is a GNU regex extension that this
# bash's ERE does not honour, so `[[ =~ ]]` returned "no match" for EVERY mig_apply line in the
# document and the loop simply walked past all fifteen of them. Nothing failed, so nothing was
# reported -- the run log said PASSED because no block had failed, not because every block had run.
#
# Fixing the pattern is the small half. The large half is this counter: a mechanical executor that
# can silently do nothing and still say PASSED is worse than no executor, because a human reads the
# word PASSED and stops checking. The counts must agree or the verdict is STOP.
DOC_APPLY_COUNT=$(awk '/^# Phase 5/{exit} /^ *mig_apply +[0-9]{14} +[^ ]+\.sql/{n++} END{print n+0}' "$RELEASE_MD")
DOC_LEDGER_COUNT=$(awk '/^# Phase 5/{exit} /^ *ledger_insert_only +[0-9]{14}/{n++} END{print n+0}' "$RELEASE_MD")
RAN_APPLY=0
RAN_LEDGER=0
log "document declares: $DOC_APPLY_COUNT mig_apply block(s), $DOC_LEDGER_COUNT ledger-row-only block(s) before Phase 5"

while IFS= read -r line; do
  line=$(printf %s "$line" | tr -d '\r')   # generated on Windows: a trailing CR must never reach the regex
  if [[ "$line" == "# Phase 5"* ]]; then
    STOPPED_BEFORE_DEPLOY=1
    log "--- reached Phase 5 (image transfer). Stopping cleanly -- deploy is a human step. ---"
    break
  fi
  if [[ "$line" =~ ^[[:space:]]*mig_apply[[:space:]]+([0-9]{14})[[:space:]]+([^[:space:]]+\.sql) ]]; then
    CURRENT_VER="${BASH_REMATCH[1]}"; CURRENT_FILE="${BASH_REMATCH[2]}"; CURRENT_KIND="APPLY"
    RAN_APPLY=$((RAN_APPLY+1))
    process_block "$CURRENT_KIND" "$CURRENT_VER" "$CURRENT_FILE"
    if [ $? -ne 0 ]; then
      log "FATAL: block for $CURRENT_VER ($CURRENT_FILE) did not match its Expect: line. STOP."
      BLOCK_FAILED=1
      break
    fi
  elif [[ "$line" =~ ^[[:space:]]*ledger_insert_only[[:space:]]+([0-9]{14}) ]]; then
    CURRENT_VER="${BASH_REMATCH[1]}"; CURRENT_KIND="LEDGER_ONLY"
    RAN_LEDGER=$((RAN_LEDGER+1))
    process_block "$CURRENT_KIND" "$CURRENT_VER" ""
    if [ $? -ne 0 ]; then
      log "FATAL: ledger-row-only block for $CURRENT_VER failed. STOP."
      BLOCK_FAILED=1
      break
    fi
  fi
done < "$RELEASE_MD"

log ""
log "executed: $RAN_APPLY of $DOC_APPLY_COUNT mig_apply block(s), $RAN_LEDGER of $DOC_LEDGER_COUNT ledger-row-only block(s)"
if [ "$BLOCK_FAILED" = "1" ]; then
  log "=== VERDICT: STOP (a migration block failed its Expect:) ==="
  exit 1
fi

# A run that walked past blocks it was told to execute must NEVER report PASSED. See the counter's
# own comment above for the 2-of-17 false pass this check exists to make impossible.
if [ "$RAN_APPLY" != "$DOC_APPLY_COUNT" ] || [ "$RAN_LEDGER" != "$DOC_LEDGER_COUNT" ]; then
  log "=== VERDICT: STOP (the document declares $DOC_APPLY_COUNT mig_apply + $DOC_LEDGER_COUNT"
  log "    ledger-row-only blocks, but only $RAN_APPLY + $RAN_LEDGER were executed. Blocks were"
  log "    silently skipped -- this is never a pass, whatever the individual results were.) ==="
  exit 1
fi

# C3, 2026-09-14. This verdict used to read "VERDICT: PASSED". REVIEW-2 ran this engine on a
# zero-migration document whose Block 0 gate FAILED and whose probe image did not exist, and it
# printed PASSED, exit 0 -- because this engine never runs Block 0 or any GATE block. A release
# with no migrations (this one) therefore got a PASSED with no gate behind it. The verdict now says,
# in its own words, what was NOT run, naming every gate the document contains.
DOC_GATES=$(grep -oE 'GATE [A-Za-z0-9]+ PASS' "$RELEASE_MD" | awk '{print $2}' | awk '!seen[$0]++' | tr '\n' ' ' | sed 's/ *$//')
[ -n "$DOC_GATES" ] || DOC_GATES="(this document names no GATE block)"
not_run_report() {
  log "    This script ran ONLY pg_is_in_recovery() and the $RAN_APPLY mig_apply + $RAN_LEDGER ledger-row-only"
  log "    line(s) before '# Phase 5'. It did NOT run Block 0 (D1a checkout = build sha, D1b migration"
  log "    files on disk) and it did NOT run ANY GATE block. NOT EXECUTED, NOT MEASURED: $DOC_GATES"
  log "    A human must run each of those blocks and see 'GATE <id> PASS' for every one of them."
  log "    Until then this release is NOT verified, whatever this line says about migrations."
}

if [ "$STOPPED_BEFORE_DEPLOY" = "1" ]; then
  log "=== VERDICT: MIGRATION PHASE PASSED -- RELEASE NOT VERIFIED: BLOCK 0 AND ALL GATES NOT RUN ==="
  not_run_report
  log "    Deploy was NOT executed -- run it by hand; this script never touches afrakala-lan-web."
  exit 0
fi

log "=== VERDICT: MIGRATION PHASE PASSED -- RELEASE NOT VERIFIED: BLOCK 0 AND ALL GATES NOT RUN ==="
log "    (no Phase 5 heading found -- the whole document was walked for migration lines only)"
not_run_report
exit 0
