#!/usr/bin/env bash
# release/lib/shape-tolerance.sh — lets release/lib/rehearse-engine.sh survive replaying a
# migration onto a restored shape that lacks an object the migration alters, WITHOUT hiding a
# real bug.
#
# WHY THIS EXISTS (owner directive, "TOLERATE A MISSING OBJECT")
#   rehearse.ps1 replays migrations onto arbitrary restored shapes -- a dump taken at a different
#   point than the migration author tested against. Worked example: migration 531's original form
#   did `ALTER TABLE ... DROP CONSTRAINT audit_logs_actor_id_fkey;` with no `IF EXISTS`. That is
#   correct and re-runnable on production's actual shape, but raises
#   `ERROR: constraint "audit_logs_actor_id_fkey" of relation "audit_logs" does not exist` on a
#   shape that never had it (see docs/research/convergence/E-2-proof.md, "HARDENING", for the
#   proof and the fix on branch feature/conv-db-fixes commit b77622f6).
#
#   The RIGHT fix is always in the migration file itself -- a catalogue-driven DO block that reads
#   pg_constraint (or the equivalent object catalog) before acting, exactly the pattern E-2's
#   hardened 531 and migrations 523/524/525 already use. That is out of this partition's scope
#   (CLAUDE.md: this mission writes NO migration). Until every migration this engine might ever
#   replay is written that way, a naive migration hitting exactly this error class must not kill
#   the whole rehearsal -- it must be surfaced as a finding for a human, the same way
#   TOLERATED_RESTORE_ERRORS in rehearse-engine.sh already does for pg_restore.
#
# WHY THIS IS AN ALLOWLIST, NOT A BLANKET CATCH
#   Blindly swallowing "does not exist" errors would also swallow a real bug (wrong table name, a
#   typo, a migration that depends on an earlier one that silently failed). So nothing is tolerated
#   unless BOTH (a) the specific 14-digit version is pre-declared in the shape-tolerant file, AND
#   (b) the actual captured error output contains the exact substring declared for that version.
#   An undeclared version, or a declared version whose error text does not match, is NOT tolerated
#   and the engine stops exactly as before. Default (empty file, or no file passed) is: nothing is
#   ever tolerated -- the pre-existing hard-stop behaviour is unchanged unless a human opted a
#   specific version in.
#
# FILE FORMAT (one per line, '#' comments and blank lines ignored):
#   <14-digit-version>|<substring to find in the captured mig_apply output>
#
# WHAT HAPPENS WHEN A VERSION IS TOLERATED
#   The migration is NOT retried, NOT forced, NOT partially applied -- mig_apply's own
#   --single-transaction guarantee already rolled back whatever it started. The rehearsal engine
#   records the version in a "SHAPE_TOLERATED" bucket (distinct from APPLY/LEDGER_ONLY/OK), writes
#   NO ledger row for it, continues the replay loop, and the final report carries a
#   "## Shape-mismatch findings" section so a human decides -- release/emit-blocks.ps1 must never
#   silently turn a SHAPE_TOLERATED version into an ordinary mig_apply block in RELEASE-<date>.md.
set -u

# is_tolerated_shape_mismatch VERSION OUTPUT_TEXT SHAPE_TOLERANT_FILE
# Returns 0 (tolerated) only if SHAPE_TOLERANT_FILE has a line "VERSION|substring" AND
# OUTPUT_TEXT contains that substring. Returns 1 (not tolerated) in every other case, including
# an empty/missing SHAPE_TOLERANT_FILE -- that is the safe default.
is_tolerated_shape_mismatch() {
  local ver="$1" output_text="$2" file="$3"
  [ -n "$file" ] && [ -f "$file" ] || return 1
  local line lver lsub
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    lver="${line%%|*}"
    lsub="${line#*|}"
    [ "$lver" = "$ver" ] || continue
    case "$output_text" in
      *"$lsub"*) return 0 ;;
    esac
  done < "$file"
  return 1
}
