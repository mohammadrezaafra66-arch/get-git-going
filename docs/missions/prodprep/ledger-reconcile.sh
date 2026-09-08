#!/usr/bin/env bash
# ledger-reconcile.sh — make supabase_migrations.schema_migrations describe reality.
# IT RE-RUNS NO MIGRATION. It writes rows to the ledger and touches nothing else.
#
#   usage: ledger-reconcile.sh <database> <migrations-dir> <ceiling> <not-applied-file> [--record]
#
#     <database>          e.g. prod_rehearsal_20260908   (NEVER a production database)
#     <migrations-dir>    supabase/migrations of the checkout being deployed
#     <ceiling>           14-digit timestamp; the highest migration the SCHEMA is at
#     <not-applied-file>  one 14-digit version per line: candidates below the ceiling that are
#                         NOT applied, and must therefore NOT be recorded.  See "STEP 1" below.
#     --record            actually write.  Without it the script only reports (read-only).
#
# ─── STEP 1 — WHAT THE *SCHEMA* SAYS IS APPLIED, AND HOW MUCH TO TRUST IT ────────────────────
# There is no single source for this.  The ledger is the thing being fixed, so it cannot be its
# own witness, and no migration in this project stamps the schema.  What this script uses is:
#
#     candidates  =  (every migration file whose timestamp <= <ceiling>)  MINUS  <not-applied-file>
#
# The first half is DERIVED (a directory listing).  The second half is a HAND-MAINTAINED LIST.
# That is the honest description: the script cannot decide on its own which sub-ceiling
# migrations really ran, so a human must supply the exceptions and the script records exactly
# what it is told, no more.
#
# `ledger-evidence.sh` (same directory) exists to BUILD that hand-maintained list: it asks the
# live catalogue whether each candidate's tables / columns / types / views / indexes exist.  Its
# limits are documented in its own header — chiefly that CREATE OR REPLACE FUNCTION, GRANT,
# COMMENT and data-only migrations leave no checkable artefact, and that an object dropped by a
# LATER migration reads absent although its migration did run.  So the evidence report is input
# to a human decision, not the decision.
#
# ─── STEP 5 — WHY THE INSERT HAS NO `ON CONFLICT` ───────────────────────────────────────────
# `INSERT ... ON CONFLICT (version) DO NOTHING` exits 0 and prints `INSERT 0 0` when the version
# is already there.  A reconciliation that used it could not tell "already recorded" from
# "someone else owns this version", which is how migration 517 nearly went unrecorded on this
# project on 2026-09-07.  So: the gap is computed FIRST, a plain INSERT writes exactly that gap,
# and the script asserts inserted-rows == gap-rows.  A collision raises unique_violation and
# aborts the transaction instead of passing silently.
set -u
DB="${1:?database}"
MIGDIR="${2:?migrations dir}"
CEILING="${3:?ceiling, 14-digit timestamp}"
NOTAPPLIED="${4:?file of versions that are NOT applied (may be empty, but must exist)}"
MODE="${5:---report}"
C="${DOCKER_DB_CONTAINER:-afrakala-lan-db}"
export MSYS_NO_PATHCONV=1

case "$DB" in
  postgres) echo "REFUSED: '$DB' is production's database name. Wrong machine."; exit 2;;
esac
[ -f "$NOTAPPLIED" ] || { echo "missing not-applied file: $NOTAPPLIED"; exit 2; }

TMP="$(mktemp -d)"
ls "$MIGDIR"/*.sql | xargs -n1 basename | sed 's/_.*//' \
  | awk -v c="$CEILING" '$1 <= c' | sort -u > "$TMP/all.txt"
grep -oE '^[0-9]{14}' "$NOTAPPLIED" | sort -u > "$TMP/skip.txt"
comm -23 "$TMP/all.txt" "$TMP/skip.txt" > "$TMP/candidates.txt"

echo "database ............... $DB"
echo "migrations dir ......... $MIGDIR"
echo "ceiling ................ $CEILING"
echo "files at/below ceiling . $(wc -l < "$TMP/all.txt")"
echo "declared NOT applied ... $(wc -l < "$TMP/skip.txt")   (from $NOTAPPLIED)"
echo "candidates ............. $(wc -l < "$TMP/candidates.txt")"
echo

cat "$TMP/candidates.txt" | docker exec -i "$C" sh -c 'cat > /tmp/reconcile_candidates.txt'
lm=$(md5sum "$TMP/candidates.txt" | awk '{print $1}')
rmm=$(docker exec "$C" md5sum /tmp/reconcile_candidates.txt | awk '{print $1}')
[ "$lm" = "$rmm" ] || { echo "candidate list corrupted in transit ($lm != $rmm)"; exit 9; }
echo "candidate list md5 ..... $lm (identical both sides)"
echo

{
cat <<'SQL'
\set ON_ERROR_STOP on
-- NOTE: run with `psql --single-transaction -v ON_ERROR_STOP=1`; that supplies the
-- transaction, so this file deliberately carries no BEGIN/COMMIT of its own.
CREATE TEMP TABLE _candidates(version text PRIMARY KEY);
\copy _candidates FROM '/tmp/reconcile_candidates.txt'

-- 1+2+3 · what the schema says, what the ledger claims, and the difference (both directions)
CREATE TEMP TABLE _gap AS
  SELECT version FROM _candidates
  EXCEPT SELECT version FROM supabase_migrations.schema_migrations;
CREATE TEMP TABLE _orphan AS
  SELECT version FROM supabase_migrations.schema_migrations
  EXCEPT SELECT version FROM _candidates;

\echo '--- ledger claims -------------------------------------------------'
SELECT count(*) AS ledger_rows, min(version) AS ledger_min, max(version) AS ledger_max
  FROM supabase_migrations.schema_migrations;
\echo '--- schema says applied (candidates) ------------------------------'
SELECT count(*) AS candidate_rows, max(version) AS candidate_max FROM _candidates;
\echo '--- 3a · APPLIED BUT UNRECORDED (this is what gets inserted) ------'
SELECT count(*) AS gap_rows FROM _gap;
SELECT version FROM _gap ORDER BY 1;
\echo '--- 3b · RECORDED BUT NOT A CANDIDATE (never inserted; investigate)'
SELECT count(*) AS orphan_rows FROM _orphan;
SELECT version FROM _orphan ORDER BY 1;
SQL

if [ "$MODE" = "--record" ]; then
cat <<'SQL'
\echo '--- 4+5 · insert exactly the gap, then assert the count -----------'
DO $reconcile$
DECLARE
  v_gap bigint; v_ins bigint; v_before bigint; v_after bigint;
BEGIN
  SELECT count(*) INTO v_gap    FROM _gap;
  SELECT count(*) INTO v_before FROM supabase_migrations.schema_migrations;

  -- NO `ON CONFLICT`: a collision must raise, not be swallowed.
  INSERT INTO supabase_migrations.schema_migrations (version)
  SELECT version FROM _gap;
  GET DIAGNOSTICS v_ins = ROW_COUNT;

  IF v_ins <> v_gap THEN
    RAISE EXCEPTION 'ledger-reconcile: inserted % rows but the gap was % -- refusing to commit',
      v_ins, v_gap;
  END IF;

  SELECT count(*) INTO v_after FROM supabase_migrations.schema_migrations;
  IF v_after <> v_before + v_gap THEN
    RAISE EXCEPTION 'ledger-reconcile: ledger went % -> %, expected % -- refusing to commit',
      v_before, v_after, v_before + v_gap;
  END IF;

  RAISE NOTICE 'ledger-reconcile: gap=% inserted=% ledger %->% (asserted)',
    v_gap, v_ins, v_before, v_after;
END
$reconcile$;
SQL
else
cat <<'SQL'
\echo '--- REPORT ONLY. Nothing was written. Re-run with --record to fix.'
SQL
fi
} > "$TMP/reconcile.sql"

cat "$TMP/reconcile.sql" | docker exec -i "$C" sh -c 'cat > /tmp/ledger_reconcile.sql'
docker exec -e PGDB="$DB" "$C" sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d "$PGDB" -v ON_ERROR_STOP=1 --single-transaction -f /tmp/ledger_reconcile.sql'
rc=$?
echo "psql exit code = $rc"
rm -rf "$TMP"
exit $rc
