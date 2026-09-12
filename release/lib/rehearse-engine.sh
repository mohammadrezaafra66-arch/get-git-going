#!/usr/bin/env bash
# release/lib/rehearse-engine.sh — the bash engine behind release/rehearse.ps1.
#
# WHY BASH AND NOT NATIVE POWERSHELL
#   Every proven, safe primitive for talking to this project's Postgres containers is already
#   bash: `mig_apply` (BLOCKS.md), `ledger-reconcile.sh`, `ledger-evidence.sh`. CLAUDE.md
#   documents, with dated incidents, why a PowerShell pipe into psql is dangerous (Persian text
#   corruption, 2026-07-11) and why `docker cp` cannot be used on this machine at all (mount-layer
#   breakage). Reimplementing the same primitives a third time in PowerShell would be new,
#   untested surface for no benefit. So `release/rehearse.ps1` is a thin argument-and-report
#   wrapper; every docker/psql operation happens here, in a language whose patterns for this exact
#   job are already load-bearing elsewhere in the repo.
#
# WHY CATALOGUE-BASED DETECTION, NOT LEDGER-BASED (owner directive, non-negotiable)
#   docs/research/convergence/R-1-schema-convergence.md proved production's ledger records five
#   migrations (386, 394, 396, 404, 409) whose effects are ABSENT from its catalogue. Migration 477
#   broke on 2026-09-12 for exactly this reason: something assumed the ledger described reality and
#   it did not. Trusting "not in the ledger" as the sole definition of "pending" reproduces that
#   failure. So every candidate migration here is classified by asking the LIVE CATALOGUE whether
#   its effect exists (via docs/missions/prodprep/ledger-evidence.sh, unmodified, called not
#   reimplemented) AND by checking the ledger, and the two answers are compared. Disagreement is
#   the dangerous case and is surfaced, never silently resolved by trusting one side.
#
# CLASSIFICATION (six cells; used again by release/emit-blocks.ps1)
#   ledger row?  catalogue?     verdict                 action
#   ---------------------------------------------------------------------------------------------
#   no           PRESENT        UNRECORDED               ledger-row-only block (insert row, no SQL)
#   no           ABSENT         NOT-APPLIED               mig_apply block (apply SQL + insert row)
#   no           NO-EVIDENCE    NOT-APPLIED (low-conf.)   mig_apply block, flagged low-confidence
#   yes          PRESENT        OK                        nothing — steady state
#   yes          ABSENT         LEDGER-LIES               ABORT unless pre-declared (see below)
#   yes          NO-EVIDENCE    UNVERIFIABLE              WARNING only, ledger trusted, continue
#
# LEDGER-LIES is the case R-1 found and migration 477 fell into. Default behaviour is to ABORT the
# whole rehearsal the moment one is found, before any schema mutation, so it always surprises the
# operator rather than being silently applied or silently skipped. `--known-ledger-lies FILE` lets
# a caller pre-declare specific versions (one 14-digit version per line) as already understood and
# handled by a FORWARD migration (CLAUDE.md rule 6: never edit an old migration) — in that case the
# version is reported, left completely untouched (no SQL run, no ledger write), and the run
# continues.
set -u
export MSYS_NO_PATHCONV=1

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./mig-apply.sh
source "$SELF_DIR/mig-apply.sh"

# ---------- tolerated pg_restore error substrings ----------------------------------------------
# Measured on the real 2026-09-12 production dump against a scratch database
# (docs/research/production-migration-run-20260912.md:453-473): exactly 21 errors, all one of
# these five shapes. `cron`/`pg_cron` fail because that extension only lives in a database
# literally named `postgres`; `decrypted_secrets`/`secrets_encrypt_secret_secret` are vault
# objects already present in the container globally. No `public` table has ever failed to load
# this way. Any OTHER error aborts the restore — this allowlist is intentionally narrow.
TOLERATED_RESTORE_ERRORS=(
  'schema "cron" does not exist'
  'extension "pg_cron" does not exist'
  'can only create extension in database postgres'
  'relation "decrypted_secrets" already exists'
  'function "secrets_encrypt_secret_secret" already exists with same argument types'
)

is_tolerated_error() {
  local line="$1" pat
  for pat in "${TOLERATED_RESTORE_ERRORS[@]}"; do
    case "$line" in
      *"$pat"*) return 0 ;;
    esac
  done
  return 1
}

# ---------- arg parsing ------------------------------------------------------------------------
DUMP="" CONTAINER="afrakala-lan-db" DBUSER="supabase_admin" PREFIX="prod_rehearsal_"
RUNDATE="$(date +%Y%m%d)" MIGDIR="supabase/migrations" REPO_ROOT="." CEILING=""
KNOWN_LIES="" OUT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dump) DUMP="$2"; shift 2;;
    --container) CONTAINER="$2"; shift 2;;
    --db-user) DBUSER="$2"; shift 2;;
    --prefix) PREFIX="$2"; shift 2;;
    --date) RUNDATE="$2"; shift 2;;
    --migdir) MIGDIR="$2"; shift 2;;
    --repo-root) REPO_ROOT="$2"; shift 2;;
    --ceiling) CEILING="$2"; shift 2;;
    --known-ledger-lies) KNOWN_LIES="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    *) echo "unknown arg: $1"; exit 2;;
  esac
done

[ -n "$DUMP" ] || { echo "FATAL: --dump is required"; exit 2; }
[ -f "$DUMP" ] || { echo "FATAL: dump not found: $DUMP"; exit 2; }
[ -n "$OUT" ] || { echo "FATAL: --out is required"; exit 2; }

cd "$REPO_ROOT" || { echo "FATAL: cannot cd to repo root $REPO_ROOT"; exit 2; }
[ -d "$MIGDIR" ] || { echo "FATAL: migrations dir not found: $MIGDIR"; exit 2; }

DB="${PREFIX}${RUNDATE}"
case "$DB" in
  postgres|afrakala) echo "REFUSED: '$DB' is a real database name, not a rehearsal name."; exit 2;;
esac
case "$PREFIX" in
  prod_rehearsal_*|"") : ;; # allow custom prefix as long as caller supplied one explicitly
esac

if [ -z "$CEILING" ]; then
  CEILING=$(ls "$MIGDIR"/*.sql | xargs -n1 basename | sed 's/_.*//' | sort -u | tail -1)
fi

TMP="$(mktemp -d)"
REPORT="$TMP/report.md"
DB_CREATED=0

cleanup() {
  if [ "$DB_CREATED" = "1" ]; then
    echo "--- teardown: DROP DATABASE $DB ---"
    local pw
    pw=$(docker exec "$CONTAINER" printenv POSTGRES_PASSWORD | tr -d '\r')
    docker exec -e PGPASSWORD="$pw" "$CONTAINER" sh -c \
      "psql -U '$DBUSER' -d postgres --no-psqlrc -v ON_ERROR_STOP=1 -c \"DROP DATABASE IF EXISTS \\\"$DB\\\";\""
    echo "teardown rc=$?"
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

{
echo "# Rehearsal report — $DB"
echo
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo
echo "## Restore source (falsification rule 1: identity printed before anything else)"
echo
echo '```'
echo "dump file : $DUMP"
echo "size bytes: $(stat -c %s "$DUMP" 2>/dev/null || wc -c < "$DUMP")"
echo "md5 (host): $(md5sum "$DUMP" | awk '{print $1}')"
echo '```'
} | tee "$REPORT"

DUMP_MD5_HOST=$(md5sum "$DUMP" | awk '{print $1}')

# ---------- refuse to reuse an existing rehearsal database (idempotency by refusal) -------------
PW=$(docker exec "$CONTAINER" printenv POSTGRES_PASSWORD | tr -d '\r')
EXISTS=$(docker exec -e PGPASSWORD="$PW" "$CONTAINER" sh -c \
  "psql -U '$DBUSER' -d postgres --no-psqlrc -A -t -c \"SELECT 1 FROM pg_database WHERE datname='$DB';\"")
if [ "$EXISTS" = "1" ]; then
  echo "REFUSED: database '$DB' already exists. A rehearsal never reuses/drops a database it did" | tee -a "$REPORT"
  echo "not itself create -- it might be mid-inspection by a human. Drop it yourself first, or" | tee -a "$REPORT"
  echo "pass --date with a different value." | tee -a "$REPORT"
  exit 3
fi

echo "--- CREATE DATABASE $DB ---" | tee -a "$REPORT"
docker exec -e PGPASSWORD="$PW" "$CONTAINER" sh -c \
  "psql -U '$DBUSER' -d postgres --no-psqlrc -v ON_ERROR_STOP=1 -c \"CREATE DATABASE \\\"$DB\\\";\"" | tee -a "$REPORT"
[ "${PIPESTATUS[0]}" = "0" ] || { echo "FATAL: CREATE DATABASE failed" | tee -a "$REPORT"; exit 1; }
DB_CREATED=1

# ---------- deliver + verify the dump inside the container --------------------------------------
REMOTE_DUMP="/tmp/rehearsal_${RUNDATE}.dump"
echo "--- delivering dump into $CONTAINER ---" | tee -a "$REPORT"
deliver_and_verify "$CONTAINER" "$DUMP" "$REMOTE_DUMP" 2>&1 | tee -a "$REPORT"
[ "${PIPESTATUS[0]}" = "0" ] || { echo "FATAL: dump delivery/md5 mismatch" | tee -a "$REPORT"; exit 1; }

# ---------- restore ------------------------------------------------------------------------------
echo "--- pg_restore --no-owner --disable-triggers ---" | tee -a "$REPORT"
RESTORE_LOG="$TMP/restore.log"
docker exec -e PGPASSWORD="$PW" "$CONTAINER" sh -c \
  "pg_restore -U '$DBUSER' -d '$DB' --no-owner --disable-triggers '$REMOTE_DUMP'" >"$RESTORE_LOG" 2>&1
RESTORE_RC=$?
echo "pg_restore exit code = $RESTORE_RC" | tee -a "$REPORT"

UNTOLERATED=0
TOLERATED=0
while IFS= read -r line; do
  case "$line" in
    *ERROR:*|*error:*)
      if is_tolerated_error "$line"; then
        TOLERATED=$((TOLERATED+1))
      else
        UNTOLERATED=$((UNTOLERATED+1))
        echo "UNTOLERATED RESTORE ERROR: $line" | tee -a "$REPORT"
      fi
      ;;
  esac
done < "$RESTORE_LOG"
echo "restore errors: tolerated=$TOLERATED untolerated=$UNTOLERATED" | tee -a "$REPORT"
if [ "$UNTOLERATED" -gt 0 ]; then
  echo "FATAL: pg_restore produced $UNTOLERATED error(s) outside the known-tolerated allowlist." | tee -a "$REPORT"
  echo "--- full restore log ---" | tee -a "$REPORT"
  cat "$RESTORE_LOG" | tee -a "$REPORT"
  exit 1
fi

# ---------- sanity counts (the dump actually has data) -------------------------------------------
echo "--- post-restore sanity counts ---" | tee -a "$REPORT"
COUNTS=$(psql_scalar "$CONTAINER" "$DBUSER" "$DB" "
SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public')
  || '|' || (SELECT count(*) FROM information_schema.views WHERE table_schema='public')
  || '|' || (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
  || '|' || (SELECT count(*) FROM pg_policies WHERE schemaname='public')
  || '|' || (SELECT count(*) FROM public.persons)
  || '|' || (SELECT count(*) FROM public.audit_logs);
")
echo "tables|views|functions|policies|persons|audit_logs = $COUNTS" | tee -a "$REPORT"
PERSONS_COUNT=$(echo "$COUNTS" | cut -d'|' -f5)
if [ -z "$PERSONS_COUNT" ] || [ "$PERSONS_COUNT" -lt 1 ] 2>/dev/null; then
  echo "FATAL: persons count is 0 or unreadable -- this dump has no business data. Stop." | tee -a "$REPORT"
  exit 1
fi

# ---------- ledger top BEFORE replay (falsification rule 1, second half) -------------------------
echo "## Ledger state BEFORE replay" | tee -a "$REPORT"
LEDGER_BEFORE=$(psql_scalar "$CONTAINER" "$DBUSER" "$DB" \
  "SELECT count(*) || '|' || min(version) || '|' || max(version) FROM supabase_migrations.schema_migrations;")
echo "ledger_rows|ledger_min|ledger_max = $LEDGER_BEFORE" | tee -a "$REPORT"

# Generic preflight facts release/emit-blocks.ps1 can lift into RELEASE-<date>.md's Preflight
# block, the same shape BLOCKS.md Block 1 reads by hand (docs/runbooks/production-migration-
# 20260908-BLOCKS.md:291-334). Deliberately generic (not any one migration's own precondition,
# e.g. migration 475's ai_providers.base_url check) -- those belong in that migration's own
# Expect: line, authored when the migration is written, not invented generically here.
PREFLIGHT=$(psql_scalar "$CONTAINER" "$DBUSER" "$DB" "
SELECT pg_is_in_recovery()
  || '|' || pg_size_pretty(pg_database_size(current_database()))
  || '|' || (SELECT count(*) FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%');
")
echo "## Preflight snapshot (from the restored dump, BEFORE replay)" | tee -a "$REPORT"
echo "is_replica|db_size|anon_default_acl_count = $PREFLIGHT" | tee -a "$REPORT"

# ---------- candidate set: every file with version <= ceiling ------------------------------------
ls "$MIGDIR"/*.sql | xargs -n1 basename | sed 's/_.*//' | awk -v c="$CEILING" '$1 <= c' | sort -u > "$TMP/candidates.txt"
CAND_COUNT=$(wc -l < "$TMP/candidates.txt")
echo "## Candidates: $CAND_COUNT files at or below ceiling $CEILING" | tee -a "$REPORT"

# ---------- ledger rows currently in the rehearsal DB ---------------------------------------------
psql_scalar "$CONTAINER" "$DBUSER" "$DB" "SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1;" \
  | sort -u > "$TMP/ledger.txt"

# ---------- catalogue evidence for EVERY candidate, not just the ledger gap ----------------------
# Owner directive: pending work is derived from the catalogue, not the ledger. So evidence is
# gathered for every candidate, whether or not the ledger already has a row for it.
echo "--- running docs/missions/prodprep/ledger-evidence.sh against all $CAND_COUNT candidates ---" | tee -a "$REPORT"
EVIDENCE_RAW="$TMP/evidence.raw"
DOCKER_DB_CONTAINER="$CONTAINER" bash "$REPO_ROOT/docs/missions/prodprep/ledger-evidence.sh" "$DB" "$MIGDIR" "$TMP/candidates.txt" > "$EVIDENCE_RAW" 2>&1
# ledger-evidence.sh's own psql call is run with the default db user (not parameterized in that
# script -- it hardcodes supabase_admin, see its own source), which matches $DBUSER here in every
# call site of this pipeline; if a caller ever passes --db-user other than supabase_admin this
# step would need ledger-evidence.sh itself extended to take a user argument (documented gap, see
# release proof UNKNOWN section).

# aggregate PRESENT/ABSENT/NO-EVIDENCE per version: any explicit 0 -> ABSENT; else if only
# NO-EVIDENCE lines -> NO-EVIDENCE; else PRESENT.
awk -F'|' '
  $2=="NO-EVIDENCE" { noev[$1]=1; next }
  $2=="NO-FILE"     { nofile[$1]=1; next }
  {
    val=$0; sub(/^[^|]*\|[^|]*\|[^|]*\|/,"",val);
    if (val=="0") absent[$1]=1; else present[$1]=1;
  }
  END {
    for (v in absent) { print v"|ABSENT"; delete present[v]; delete noev[v] }
    for (v in present) print v"|PRESENT"
    for (v in noev) print v"|NO-EVIDENCE"
    for (v in nofile) print v"|NO-FILE"
  }
' "$EVIDENCE_RAW" | sort -u > "$TMP/evidence.txt"

# ---------- classify ------------------------------------------------------------------------------
: > "$TMP/to_apply.txt"        # NOT-APPLIED -> full mig_apply
: > "$TMP/to_ledger_only.txt"  # UNRECORDED  -> ledger row only
: > "$TMP/ledger_lies.txt"     # LEDGER-LIES -> abort unless pre-declared
: > "$TMP/unverifiable.txt"    # ledger=yes, evidence=NO-EVIDENCE
: > "$TMP/ok.txt"

while read -r ver; do
  [ -n "$ver" ] || continue
  has_ledger="no"; grep -qx "$ver" "$TMP/ledger.txt" 2>/dev/null && has_ledger="yes"
  ev=$(grep "^$ver|" "$TMP/evidence.txt" | head -1 | cut -d'|' -f2)
  [ -n "$ev" ] || ev="NO-EVIDENCE"
  case "$has_ledger:$ev" in
    no:PRESENT)      echo "$ver" >> "$TMP/to_ledger_only.txt" ;;
    no:ABSENT)       echo "$ver" >> "$TMP/to_apply.txt" ;;
    no:NO-EVIDENCE)  echo "$ver" >> "$TMP/to_apply.txt" ;;
    no:NO-FILE)      echo "$ver" >> "$TMP/to_apply.txt" ;;
    yes:PRESENT)     echo "$ver" >> "$TMP/ok.txt" ;;
    yes:ABSENT)      echo "$ver" >> "$TMP/ledger_lies.txt" ;;
    yes:NO-EVIDENCE) echo "$ver" >> "$TMP/unverifiable.txt" ;;
    yes:NO-FILE)     echo "$ver" >> "$TMP/unverifiable.txt" ;;
  esac
done < "$TMP/candidates.txt"

{
echo
echo "## Classification"
echo
echo "| bucket | count |"
echo "|---|---|"
echo "| OK (ledger + catalogue agree: applied) | $(wc -l < "$TMP/ok.txt") |"
echo "| NOT-APPLIED (mig_apply queued) | $(wc -l < "$TMP/to_apply.txt") |"
echo "| UNRECORDED (ledger-row-only queued) | $(wc -l < "$TMP/to_ledger_only.txt") |"
echo "| LEDGER-LIES (ledger says applied, catalogue disagrees) | $(wc -l < "$TMP/ledger_lies.txt") |"
echo "| UNVERIFIABLE (ledger row exists, no catalogue signal) | $(wc -l < "$TMP/unverifiable.txt") |"
} | tee -a "$REPORT"

if [ -s "$TMP/unverifiable.txt" ]; then
  echo "UNVERIFIABLE versions (trusted to the ledger, not mechanically confirmed): $(tr '\n' ' ' < "$TMP/unverifiable.txt")" | tee -a "$REPORT"
fi

# Machine-readable classification, one line per candidate, for release/emit-blocks.ps1 to parse.
# Format: VERSION|BUCKET|FILE   where BUCKET in {APPLY, LEDGER_ONLY, OK, LEDGER_LIES, UNVERIFIABLE}
{
  echo
  echo "## Machine-readable classification (for release/emit-blocks.ps1)"
  echo
  echo '```'
  while read -r ver; do
    [ -n "$ver" ] || continue
    f=$(ls "$MIGDIR"/${ver}_*.sql 2>/dev/null | head -1); f=$(basename "${f:-unknown}")
    echo "$ver|APPLY|$f"
  done < "$TMP/to_apply.txt"
  while read -r ver; do
    [ -n "$ver" ] || continue
    f=$(ls "$MIGDIR"/${ver}_*.sql 2>/dev/null | head -1); f=$(basename "${f:-unknown}")
    echo "$ver|LEDGER_ONLY|$f"
  done < "$TMP/to_ledger_only.txt"
  while read -r ver; do
    [ -n "$ver" ] || continue
    echo "$ver|OK|"
  done < "$TMP/ok.txt"
  while read -r ver; do
    [ -n "$ver" ] || continue
    echo "$ver|LEDGER_LIES|"
  done < "$TMP/ledger_lies.txt"
  while read -r ver; do
    [ -n "$ver" ] || continue
    echo "$ver|UNVERIFIABLE|"
  done < "$TMP/unverifiable.txt"
  echo '```'
} | tee -a "$REPORT"

# ---------- LEDGER-LIES gate ------------------------------------------------------------------
if [ -s "$TMP/ledger_lies.txt" ]; then
  : > "$TMP/lies_unresolved.txt"
  while read -r ver; do
    [ -n "$ver" ] || continue
    if [ -n "$KNOWN_LIES" ] && [ -f "$KNOWN_LIES" ] && grep -qx "$ver" "$KNOWN_LIES"; then
      echo "LEDGER-LIES (pre-declared, left untouched): $ver" | tee -a "$REPORT"
    else
      echo "$ver" >> "$TMP/lies_unresolved.txt"
    fi
  done < "$TMP/ledger_lies.txt"
  if [ -s "$TMP/lies_unresolved.txt" ]; then
    {
      echo
      echo "## FATAL — undeclared ledger/catalogue disagreement"
      echo
      echo "The ledger claims these versions are applied; the live catalogue disagrees. This is"
      echo "exactly the R-1 finding and the migration-477 failure mode. Nothing has been mutated."
      echo "Investigate each one (does it need a NEW forward migration, per CLAUDE.md rule 6?),"
      echo "then either fix it or pass --known-ledger-lies naming it explicitly to proceed anyway."
      echo
      echo '```'
      cat "$TMP/lies_unresolved.txt"
      echo '```'
      echo
      echo "## VERDICT: FAIL"
    } | tee -a "$REPORT"
    cp "$REPORT" "$OUT"
    exit 1
  fi
fi

# ---------- apply NOT-APPLIED + UNRECORDED, in timestamp order -----------------------------------
: > "$TMP/apply_plan.txt"
cat "$TMP/to_apply.txt" | sed 's/$/|APPLY/' >> "$TMP/apply_plan.txt"
cat "$TMP/to_ledger_only.txt" | sed 's/$/|LEDGER_ONLY/' >> "$TMP/apply_plan.txt"
sort "$TMP/apply_plan.txt" -o "$TMP/apply_plan.txt"

echo "## Replay ($(wc -l < "$TMP/apply_plan.txt") versions)" | tee -a "$REPORT"
FAILED=0
while IFS='|' read -r ver kind; do
  [ -n "$ver" ] || continue
  file=$(ls "$MIGDIR"/${ver}_*.sql 2>/dev/null | head -1)
  if [ "$kind" = "APPLY" ]; then
    if [ -z "$file" ]; then
      echo "FATAL: no file on disk for candidate $ver" | tee -a "$REPORT"
      FAILED=1; break
    fi
    mig_apply "$CONTAINER" "$DBUSER" "$DB" "$ver" "$file" 2>&1 | tee -a "$REPORT"
    rc="${PIPESTATUS[0]}"
  else
    ledger_insert_only "$CONTAINER" "$DBUSER" "$DB" "$ver" 2>&1 | tee -a "$REPORT"
    rc="${PIPESTATUS[0]}"
  fi
  if [ "$rc" != "0" ]; then
    echo "STOPPING at first failure: $ver ($kind)" | tee -a "$REPORT"
    FAILED=1
    break
  fi
done < "$TMP/apply_plan.txt"

if [ "$FAILED" = "1" ]; then
  echo "## VERDICT: FAIL (replay stopped early)" | tee -a "$REPORT"
  cp "$REPORT" "$OUT"
  exit 1
fi

# ---------- gates: og81 / og102 / og103 -----------------------------------------------------------
echo "## Gates og81 / og102 / og103 against $DB" | tee -a "$REPORT"
GATE_LOG="$TMP/gates.log"
(
  export E2E_DB_CONTAINER="$CONTAINER"
  export E2E_DB_NAME="$DB"
  export E2E_DB_USER="postgres"
  cd "$REPO_ROOT" && npx playwright test \
    e2e/security/og81-migration-ledger-matches-disk.spec.ts \
    e2e/security/og102-pre393-anon-execute-grants-stay-closed.spec.ts \
    e2e/security/og103-anon-table-grants-stay-closed.spec.ts
) > "$GATE_LOG" 2>&1
GATE_RC=$?
tail -60 "$GATE_LOG" | tee -a "$REPORT"
echo "playwright exit code = $GATE_RC" | tee -a "$REPORT"

# ---------- anon view/matview census (og103's documented blind spot, R-4 Task 3 step 8) ----------
echo "## Anon census over relkind IN ('v','m') — views and materialized views" | tee -a "$REPORT"
echo "Not a pass/fail gate: no allowlist for views exists anywhere in this repo today (confirmed" | tee -a "$REPORT"
echo "by the same grep R-4 ran for og103's KEEP_OPEN). Reported for a human to triage." | tee -a "$REPORT"
CENSUS=$(psql_scalar "$CONTAINER" "$DBUSER" "$DB" "
SELECT c.relname || '|' || c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
 WHERE c.relkind IN ('v','m') AND has_table_privilege('anon', c.oid, 'SELECT')
 ORDER BY 1;
")
CENSUS_COUNT=0
if [ -n "$CENSUS" ]; then CENSUS_COUNT=$(echo "$CENSUS" | wc -l); fi
echo "anon-readable views/matviews: $CENSUS_COUNT" | tee -a "$REPORT"
if [ -n "$CENSUS" ]; then
  echo '```' | tee -a "$REPORT"
  echo "$CENSUS" | tee -a "$REPORT"
  echo '```' | tee -a "$REPORT"
fi

# ---------- final verdict ---------------------------------------------------------------------
if [ "$GATE_RC" != "0" ]; then
  echo "## VERDICT: FAIL (og81/og102/og103 did not all pass)" | tee -a "$REPORT"
  cp "$REPORT" "$OUT"
  exit 1
fi

echo "## VERDICT: PASS" | tee -a "$REPORT"
cp "$REPORT" "$OUT"
exit 0
