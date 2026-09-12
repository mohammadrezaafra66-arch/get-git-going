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

RELEASE_MD="" CONTAINER="afrakala-lan-db" DBUSER="supabase_admin" TARGET_DB=""
MIGDIR="supabase/migrations" REPO_ROOT="." LOG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --release-md) RELEASE_MD="$2"; shift 2;;
    --container) CONTAINER="$2"; shift 2;;
    --db-user) DBUSER="$2"; shift 2;;
    --target-db) TARGET_DB="$2"; shift 2;;
    --migdir) MIGDIR="$2"; shift 2;;
    --repo-root) REPO_ROOT="$2"; shift 2;;
    --log) LOG="$2"; shift 2;;
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
      log "Block: mig_apply $ver $file"
      mig_apply "$CONTAINER" "$DBUSER" "$TARGET_DB" "$ver" "$path" 2>&1 | tee -a "$LOG"
      return "${PIPESTATUS[0]}"
      ;;
    LEDGER_ONLY)
      log "Block: ledger_insert_only $ver"
      ledger_insert_only "$CONTAINER" "$DBUSER" "$TARGET_DB" "$ver" 2>&1 | tee -a "$LOG"
      return "${PIPESTATUS[0]}"
      ;;
  esac
  return 0
}

while IFS= read -r line; do
  if [[ "$line" == "# Phase 5"* ]]; then
    STOPPED_BEFORE_DEPLOY=1
    log "--- reached Phase 5 (image transfer). Stopping cleanly -- deploy is a human step. ---"
    break
  fi
  if [[ "$line" =~ ^\ *mig_apply\ +([0-9]{14})\ +(\S+\.sql) ]]; then
    CURRENT_VER="${BASH_REMATCH[1]}"; CURRENT_FILE="${BASH_REMATCH[2]}"; CURRENT_KIND="APPLY"
    process_block "$CURRENT_KIND" "$CURRENT_VER" "$CURRENT_FILE"
    if [ $? -ne 0 ]; then
      log "FATAL: block for $CURRENT_VER ($CURRENT_FILE) did not match its Expect: line. STOP."
      BLOCK_FAILED=1
      break
    fi
  elif [[ "$line" =~ ^\ *ledger_insert_only\ +([0-9]{14}) ]]; then
    CURRENT_VER="${BASH_REMATCH[1]}"; CURRENT_KIND="LEDGER_ONLY"
    process_block "$CURRENT_KIND" "$CURRENT_VER" ""
    if [ $? -ne 0 ]; then
      log "FATAL: ledger-row-only block for $CURRENT_VER failed. STOP."
      BLOCK_FAILED=1
      break
    fi
  fi
done < "$RELEASE_MD"

log ""
if [ "$BLOCK_FAILED" = "1" ]; then
  log "=== VERDICT: STOP (a migration block failed its Expect:) ==="
  exit 1
fi

if [ "$STOPPED_BEFORE_DEPLOY" = "1" ]; then
  log "=== VERDICT: PASSED (all preflight + migration blocks matched their Expect: lines;"
  log "    deploy phase was NOT executed -- run it by hand, this script never touches"
  log "    the running afrakala-lan-web container) ==="
  exit 0
fi

log "=== VERDICT: PASSED (no Phase 5 heading found -- entire document processed) ==="
exit 0
