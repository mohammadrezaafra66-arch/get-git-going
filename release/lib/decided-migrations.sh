#!/usr/bin/env bash
# release/lib/decided-migrations.sh — the THIRD category of replay outcome.
#
# WHY THIS IS NOT SHAPE TOLERANCE, AND WHY CONFLATING THE TWO WOULD BE A LIE
#   release/lib/shape-tolerance.sh answers: "this migration FAILED on this shape, and the failure
#   is understood — continue." It is reactive. The engine runs the SQL, the SQL raises, the error
#   text is matched against a declaration, and the run carries on. The version stays a finding:
#   release/emit-blocks.ps1 emits "HUMAN REVIEW REQUIRED" for it, because nobody has yet decided
#   what the real target should do.
#
#   This file answers a different question: "this migration is NEVER to be run on this target, and
#   a human already decided that, on the record." It is declarative and it is prior. The SQL is
#   never delivered, never executed, and no error is ever produced — there is nothing to tolerate,
#   because nothing is attempted.
#
#   Reporting those two as one bucket is exactly how a release line starts lying. "This failed and
#   we continued" and "we decided never to run this" have opposite consequences for an operator
#   reading the report: the first is an open question, the second is closed. So they are separate
#   buckets, separately counted, separately rendered.
#
# THE DECISIONS THIS FILE CARRIES (see release/config/decided-migrations.txt for the data)
#   OG-J — migrations 449, 450 and 452 are PERMANENTLY SKIPPED on production and get NO LEDGER ROW,
#          because nothing performed their work there. Recorded in
#          docs/missions/convergence/STATE.md:750 and INTEGRATION-LOG.md:342-352 and 1037-1058.
#          A ledger row would be a false statement about the schema — precisely what
#          e2e/security/og81-migration-ledger-matches-disk.spec.ts exists to catch, and og81 fails
#          in BOTH directions deliberately, so "just record the row to make og81 green" is the one
#          thing that must not happen.
#   OG-C — migration 373 is LEDGER-ROW-ONLY: never re-run, and the row is written only after
#          `anon_default_acl = 0` checks out. Recorded in STATE.md:749 and INTEGRATION-LOG.md:338
#          and 1028-1034.
#
# TWO DISPOSITIONS, AND THE DIFFERENCE MATTERS
#   SKIP         the SQL is not run AND no ledger row is written. The migration is absent from the
#                target's ledger forever, on purpose. This is ACCEPTED DIVERGENCE: the target's
#                schema and the repository's file set will never agree about these versions, and
#                that is the decision, not a gap to be closed later.
#   LEDGER_ONLY  the SQL is not run, but the ledger row IS written — the catalogue already shows
#                the effect, so the row makes the ledger true rather than false. A GUARD_SQL may be
#                declared; if it is, the row is written ONLY when the guard's live value equals
#                GUARD_EXPECT. A guard that does not match is a STOP, never a warning: it means the
#                premise the decision rested on is not true of this target.
#
# FILE FORMAT (one declaration per line; '#' comments and blank lines ignored)
#   VERSION|DISPOSITION|DECISION_ID|GUARD_SQL|GUARD_EXPECT|REASON
#   - VERSION      14-digit migration version (the filename's leading timestamp)
#   - DISPOSITION  SKIP | LEDGER_ONLY
#   - DECISION_ID  the recorded decision's identifier, e.g. OG-J — so a reader can find the
#                  reasoning rather than taking this file's word for it
#   - GUARD_SQL    a single-value SQL expression, or empty. Only meaningful for LEDGER_ONLY.
#   - GUARD_EXPECT the exact string GUARD_SQL must return, or empty when GUARD_SQL is empty.
#   - REASON       free text, everything after the fifth '|' (so it may itself contain '|')
#
# NOTHING IS DECIDED BY DEFAULT. With no file, or an empty one, every version behaves exactly as it
# did before this mechanism existed. A version only enters this category when a human writes the
# line, and the line has to name the decision it came from.
set -u

# _decided_line VERSION FILE -> prints the raw declaration line for VERSION, or nothing.
_decided_line() {
  local ver="$1" file="$2" line
  [ -n "$file" ] && [ -f "$file" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    case "$line" in
      "$ver|"*) printf '%s\n' "$line"; return 0 ;;
    esac
  done < "$file"
  return 1
}

# decided_disposition VERSION FILE -> prints SKIP or LEDGER_ONLY; rc 1 when undeclared.
decided_disposition() {
  local l
  l=$(_decided_line "$1" "$2") || return 1
  printf '%s\n' "$l" | cut -d'|' -f2
  return 0
}

# decided_id / decided_guard_sql / decided_guard_expect / decided_reason VERSION FILE
decided_id()           { local l; l=$(_decided_line "$1" "$2") || return 1; printf '%s\n' "$l" | cut -d'|' -f3; }
decided_guard_sql()    { local l; l=$(_decided_line "$1" "$2") || return 1; printf '%s\n' "$l" | cut -d'|' -f4; }
decided_guard_expect() { local l; l=$(_decided_line "$1" "$2") || return 1; printf '%s\n' "$l" | cut -d'|' -f5; }
decided_reason()       { local l; l=$(_decided_line "$1" "$2") || return 1; printf '%s\n' "$l" | cut -d'|' -f6-; }

# decided_versions FILE -> every declared version, one per line (for the accounting section).
decided_versions() {
  local file="$1" line
  [ -n "$file" ] && [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    printf '%s\n' "${line%%|*}"
  done < "$file"
}
