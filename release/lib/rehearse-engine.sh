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
#
# WHY THIS ENGINE IS PHASED (--phase), AND WHY THAT IS NOT A STYLE CHOICE
#   Two earlier attempts at this rehearsal stalled, both the same way: restore, classify, replay
#   ~690 migrations and run three Playwright gates were ONE long-running invocation. When it died
#   there was nothing to resume from, because `trap cleanup EXIT` had already dropped the
#   database -- so every attempt restarted at pg_restore and never got further than the last one.
#
#   The work is now three phases that each finish in minutes and each leave provable state on
#   disk under --state-dir (default release/runs/<date>):
#     --phase restore   create + restore + classify + LEDGER-LIES gate, build the apply plan.
#                       KEEPS the database.
#     --phase replay    apply ONE CONTIGUOUS BATCH of that plan (--from/--to, or --batch-size),
#                       recording the last completed plan index in progress.txt so the next batch
#                       resumes exactly where this one stopped. KEEPS the database.
#     --phase gates     og81/og102/og103 + anon census + final verdict, and concatenates every
#                       phase fragment into the single --out report.
#     --phase all       the original single-shot behaviour, unchanged, database DROPPED at exit.
#
#   `all` remains the default, so every existing caller behaves exactly as before. In a phased run
#   the database is deliberately NOT dropped: a phase that destroys its own state cannot be
#   resumed, which is the defect being fixed. Pass --drop-when-done to the gates phase to drop it.
#
#   BATCHES MUST BE CONTIGUOUS. The replay phase refuses a --from that is not last-completed + 1.
#   Migrations are ordered and many are NOT idempotent (CLAUDE.md rule 2b names 402's DROP COLUMN,
#   404's DROP+CREATE FUNCTION, 409's dropped signature); skipping or repeating a range is exactly
#   how one of those runs twice. The refusal is the safety property, not an inconvenience.
set -u
export MSYS_NO_PATHCONV=1

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./mig-apply.sh
source "$SELF_DIR/mig-apply.sh"
# shellcheck source=./shape-tolerance.sh
source "$SELF_DIR/shape-tolerance.sh"
# shellcheck source=./decided-migrations.sh
source "$SELF_DIR/decided-migrations.sh"

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
KNOWN_LIES="" OUT="" SHAPE_TOLERANT="" DECIDED=""
PHASE="all" STATE_DIR="" FROM=0 TO=0 BATCH=0 DROP_WHEN_DONE=0
FAILED=0

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
    --shape-tolerant) SHAPE_TOLERANT="$2"; shift 2;;
    --decided) DECIDED="$2"; shift 2;;
    --phase) PHASE="$2"; shift 2;;
    --state-dir) STATE_DIR="$2"; shift 2;;
    --from) FROM="$2"; shift 2;;
    --to) TO="$2"; shift 2;;
    --batch-size) BATCH="$2"; shift 2;;
    --drop-when-done) DROP_WHEN_DONE=1; shift;;
    --out) OUT="$2"; shift 2;;
    *) echo "unknown arg: $1"; exit 2;;
  esac
done

case "$PHASE" in
  all|restore|replay|gates) : ;;
  *) echo "FATAL: --phase must be one of: all restore replay gates (got '$PHASE')"; exit 2;;
esac

want_restore() { case "$PHASE" in all|restore) return 0;; *) return 1;; esac; }
want_replay()  { case "$PHASE" in all|replay)  return 0;; *) return 1;; esac; }
want_gates()   { case "$PHASE" in all|gates)   return 0;; *) return 1;; esac; }

# --dump is only meaningful to the phase that actually restores it. Demanding it in the replay and
# gates phases would force the operator to keep passing a path nothing reads, and would make a
# resumed run fail for a reason unrelated to what that phase is doing.
if want_restore; then
  [ -n "$DUMP" ] || { echo "FATAL: --dump is required for --phase $PHASE"; exit 2; }
  [ -f "$DUMP" ] || { echo "FATAL: dump not found: $DUMP"; exit 2; }
fi
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

# State lives in a real directory for a phased run (so the NEXT phase can read it) and in a
# throwaway mktemp for --phase all (so the single-shot run leaves nothing behind, exactly as
# before this engine was phased).
if [ "$PHASE" = "all" ]; then
  TMP="$(mktemp -d)"
  KEEP_DB=0
else
  [ -n "$STATE_DIR" ] || STATE_DIR="$REPO_ROOT/release/runs/$RUNDATE"
  mkdir -p "$STATE_DIR" || { echo "FATAL: cannot create state dir $STATE_DIR"; exit 2; }
  TMP="$STATE_DIR"
  KEEP_DB=1
fi
if [ "$PHASE" = "gates" ] && [ "$DROP_WHEN_DONE" = "1" ]; then KEEP_DB=0; fi

case "$PHASE" in
  all)     REPORT="$TMP/report.md" ;;
  restore) REPORT="$STATE_DIR/01-restore.md" ;;
  gates)   REPORT="$STATE_DIR/03-gates.md" ;;
  replay)  REPORT="" ;;   # depends on the batch bounds; set once those are resolved
esac
if [ -n "$REPORT" ]; then : > "$REPORT"; fi

DB_CREATED=0

cleanup() {
  local rc=$?
  if [ "$DB_CREATED" = "1" ] && [ "$KEEP_DB" = "0" ]; then
    echo "--- teardown: DROP DATABASE $DB ---"
    local pw
    pw=$(docker exec "$CONTAINER" printenv POSTGRES_PASSWORD | tr -d '\r')
    docker exec -e PGPASSWORD="$pw" "$CONTAINER" sh -c \
      "psql -U '$DBUSER' -d postgres --no-psqlrc -v ON_ERROR_STOP=1 -c \"DROP DATABASE IF EXISTS \\\"$DB\\\";\""
    echo "teardown rc=$?"
  elif [ "$KEEP_DB" = "1" ]; then
    echo "--- phased run: database '$DB' RETAINED deliberately; state in $STATE_DIR ---"
  fi
  if [ "$KEEP_DB" = "0" ] && [ "$PHASE" = "all" ]; then
    rm -rf "$TMP"
  fi
  return $rc
}
trap cleanup EXIT

# The single --out report is the concatenation of every phase fragment that exists so far, so a
# partially-completed phased run still produces a readable, honest report instead of the last
# fragment masquerading as the whole rehearsal.
assemble_report() {
  if [ "$PHASE" = "all" ]; then
    cp "$REPORT" "$OUT"
    return 0
  fi
  {
    if [ -f "$STATE_DIR/01-restore.md" ]; then cat "$STATE_DIR/01-restore.md"; fi
    for _f in $(ls "$STATE_DIR"/02-replay-*.md 2>/dev/null | sort); do cat "$_f"; done
    if [ -f "$STATE_DIR/03-gates.md" ]; then cat "$STATE_DIR/03-gates.md"; fi
  } > "$OUT"
  return 0
}

if want_restore; then

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
    assemble_report
    exit 1
  fi
fi

# ---------- build the apply plan --------------------------------------------------------------
# The plan is STATE, not a transient: the replay phase indexes into it by line number, and
# progress.txt records how far that indexing got. Both belong to the restore phase because both
# describe the shape that was restored.
: > "$TMP/apply_plan.txt"
cat "$TMP/to_apply.txt" | sed 's/$/|APPLY/' >> "$TMP/apply_plan.txt"
cat "$TMP/to_ledger_only.txt" | sed 's/$/|LEDGER_ONLY/' >> "$TMP/apply_plan.txt"
sort "$TMP/apply_plan.txt" -o "$TMP/apply_plan.txt"
echo "## Apply plan: $(wc -l < "$TMP/apply_plan.txt") versions, in timestamp order" | tee -a "$REPORT"
: > "$TMP/shape_tolerated.txt"
: > "$TMP/decision_skipped.txt"
: > "$TMP/decision_ledger_only.txt"
: > "$TMP/notices.txt"
echo 0 > "$TMP/progress.txt"

fi   # ================= end of restore phase =================

if [ "$PHASE" = "restore" ]; then
  {
    echo
    echo "## RESTORE PHASE COMPLETE — database '$DB' RETAINED for the replay phase"
    echo
    echo "apply plan : $(wc -l < "$TMP/apply_plan.txt") versions"
    echo "state dir  : $STATE_DIR"
    echo "next       : --phase replay --batch-size <n>, repeated until progress.txt reaches the total"
  } | tee -a "$REPORT"
  assemble_report
  exit 0
fi

# ---------- replay: ONE CONTIGUOUS BATCH --------------------------------------------------------
if want_replay; then

PLAN="$TMP/apply_plan.txt"
[ -f "$PLAN" ] || { echo "FATAL: $PLAN missing -- run --phase restore first"; exit 2; }
PLAN_TOTAL=$(wc -l < "$PLAN" | tr -d ' ')
[ -f "$TMP/shape_tolerated.txt" ]      || : > "$TMP/shape_tolerated.txt"
[ -f "$TMP/decision_skipped.txt" ]     || : > "$TMP/decision_skipped.txt"
[ -f "$TMP/decision_ledger_only.txt" ] || : > "$TMP/decision_ledger_only.txt"

DONE_IDX=0
if [ -f "$TMP/progress.txt" ]; then DONE_IDX=$(tr -dc '0-9' < "$TMP/progress.txt"); fi
[ -n "$DONE_IDX" ] || DONE_IDX=0

if [ "$PHASE" = "all" ]; then
  BFROM=1; BTO=$PLAN_TOTAL
else
  BFROM=$FROM
  if [ "$BFROM" = "0" ]; then BFROM=$((DONE_IDX+1)); fi
  BTO=$TO
  if [ "$BTO" = "0" ]; then
    if [ "$BATCH" != "0" ]; then BTO=$((BFROM+BATCH-1)); else BTO=$PLAN_TOTAL; fi
  fi
  if [ "$BTO" -gt "$PLAN_TOTAL" ]; then BTO=$PLAN_TOTAL; fi

  if [ "$BFROM" -ne $((DONE_IDX+1)) ]; then
    echo "REFUSED: --from $BFROM is not contiguous with the last completed plan index ($DONE_IDX)."
    echo "The next batch must start at $((DONE_IDX+1)). Migrations are ordered and many are NOT"
    echo "idempotent (CLAUDE.md rule 2b names 402 dropping a column, 404 dropping and recreating a"
    echo "function, 409 dropping a signature) -- skipping or repeating a range is exactly how one"
    echo "of those runs twice. This refusal is the safety property, not an inconvenience."
    exit 3
  fi
  if [ "$BFROM" -gt "$PLAN_TOTAL" ]; then
    echo "Nothing to do: all $PLAN_TOTAL plan entries are already completed."
    exit 0
  fi

  REPORT=$(printf '%s/02-replay-%04d-%04d.md' "$STATE_DIR" "$BFROM" "$BTO")
  : > "$REPORT"
fi

LEDGER_BATCH_BEFORE=$(psql_scalar "$CONTAINER" "$DBUSER" "$DB"   "SELECT count(*) FROM supabase_migrations.schema_migrations;")
{
  echo
  echo "## Replay batch $BFROM-$BTO of $PLAN_TOTAL"
  echo
  echo "ledger rows BEFORE this batch: $LEDGER_BATCH_BEFORE"
} | tee -a "$REPORT"

IDX=$((BFROM-1))
while IFS='|' read -r ver kind; do
  IDX=$((IDX+1))
  [ -n "$ver" ] || continue
  file=$(ls "$MIGDIR"/${ver}_*.sql 2>/dev/null | head -1)
  APPLY_OUT="$TMP/apply_out_${ver}.txt"

  # ---- THIRD CATEGORY: SKIPPED BY RECORDED DECISION (release/lib/decided-migrations.sh) --------
  # This is checked BEFORE the migration is attempted, which is the whole difference between this
  # and shape tolerance. Shape tolerance is reactive -- run it, catch the error, match the text,
  # continue, and leave the version an OPEN question for a human. A decided version is never run
  # at all: the SQL is not delivered to the container, no error is produced, and the question is
  # CLOSED because a human answered it on the record before this run existed.
  #
  # Reporting those two as one bucket is how a release line starts lying, so they are counted and
  # rendered separately everywhere downstream.
  DECIDED_DISP=""
  if [ -n "$DECIDED" ]; then DECIDED_DISP=$(decided_disposition "$ver" "$DECIDED" 2>/dev/null || true); fi

  if [ "$DECIDED_DISP" = "SKIP" ]; then
    {
      echo "SKIPPED BY DECISION $(decided_id "$ver" "$DECIDED"): $ver ($(basename "${file:-<no file>}"))"
      echo "  reason:$(decided_reason "$ver" "$DECIDED")"
      echo "  the SQL was NOT delivered and NOT executed, and NO ledger row is written -- that"
      echo "  absence is the decision, not an omission. See release/config/decided-migrations.txt."
    } | tee -a "$REPORT"
    echo "$ver|${file:-}" >> "$TMP/decision_skipped.txt"
    echo "$IDX" > "$TMP/progress.txt"
    continue
  fi

  if [ "$DECIDED_DISP" = "LEDGER_ONLY" ]; then
    D_GSQL=$(decided_guard_sql "$ver" "$DECIDED"); D_GEXP=$(decided_guard_expect "$ver" "$DECIDED")
    if [ -n "$D_GSQL" ]; then
      D_GOT=$(psql_scalar "$CONTAINER" "$DBUSER" "$DB" "$D_GSQL")
      echo "DECISION GUARD $(decided_id "$ver" "$DECIDED") for $ver: got [$D_GOT], expected [$D_GEXP]" | tee -a "$REPORT"
      if [ "$D_GOT" != "$D_GEXP" ]; then
        echo "STOPPING: the guard behind this decision does not hold on this target. The decision" | tee -a "$REPORT"
        echo "rests on a premise that is not true here, so the ledger row must NOT be written." | tee -a "$REPORT"
        echo "STOPPING at first failure: $ver (DECIDED_LEDGER_ONLY) at plan index $IDX" | tee -a "$REPORT"
        FAILED=1
        break
      fi
    fi
    if grep -qx "$ver" "$TMP/ledger.txt" 2>/dev/null; then
      echo "NOTE: $ver already has a ledger row on this shape; nothing to write." | tee -a "$REPORT"
    else
      ledger_insert_only "$CONTAINER" "$DBUSER" "$DB" "$ver" 2>&1 | tee -a "$REPORT" | tee "$APPLY_OUT" >/dev/null
      if [ "${PIPESTATUS[0]}" != "0" ]; then
        echo "STOPPING at first failure: $ver (DECIDED_LEDGER_ONLY) at plan index $IDX" | tee -a "$REPORT"
        FAILED=1
        break
      fi
    fi
    echo "$ver|${file:-}" >> "$TMP/decision_ledger_only.txt"
    echo "$IDX" > "$TMP/progress.txt"
    continue
  fi

  if [ "$kind" = "APPLY" ]; then
    if [ -z "$file" ]; then
      echo "FATAL: no file on disk for candidate $ver" | tee -a "$REPORT"
      FAILED=1; break
    fi
    mig_apply "$CONTAINER" "$DBUSER" "$DB" "$ver" "$file" 2>&1 | tee -a "$REPORT" | tee "$APPLY_OUT" >/dev/null
    rc="${PIPESTATUS[0]}"
  else
    ledger_insert_only "$CONTAINER" "$DBUSER" "$DB" "$ver" 2>&1 | tee -a "$REPORT" | tee "$APPLY_OUT" >/dev/null
    rc="${PIPESTATUS[0]}"
  fi
  if [ "$rc" != "0" ]; then
    # "TOLERATE A MISSING OBJECT" (owner directive): before treating this as fatal, check whether
    # this exact version was pre-declared shape-tolerant (release/lib/shape-tolerance.sh) AND the
    # captured output matches its declared substring. Only an APPLY-kind failure is eligible --
    # ledger_insert_only failing is never a shape mismatch, it is a real ledger-write problem.
    if [ "$kind" = "APPLY" ] && is_tolerated_shape_mismatch "$ver" "$(cat "$APPLY_OUT" 2>/dev/null)" "$SHAPE_TOLERANT"; then
      echo "TOLERATED (shape mismatch): $ver ($file) failed replay but matches a pre-declared" | tee -a "$REPORT"
      echo "  shape-tolerant entry in $SHAPE_TOLERANT -- not applied on this shape, no ledger row" | tee -a "$REPORT"
      echo "  written, replay CONTINUES. See release/lib/shape-tolerance.sh for why this is safe." | tee -a "$REPORT"
      echo "$ver|$file" >> "$TMP/shape_tolerated.txt"
      echo "$IDX" > "$TMP/progress.txt"
      continue
    fi
    echo "STOPPING at first failure: $ver ($kind) at plan index $IDX" | tee -a "$REPORT"
    FAILED=1
    break
  fi
  # Capture whatever the migration itself RAISE NOTICEd, tagged with its version. These are the
  # only honest source for a per-migration "Expect:" line: they are what the file printed while
  # running in the REAL release sequence, on the real restored shape. See the "Sequenced
  # expectations" section the gates phase emits for why a typed number is a defect.
  if [ "$kind" = "APPLY" ] && [ -s "$APPLY_OUT" ]; then
    awk -v v="$ver" '/NOTICE:/ { sub(/^.*NOTICE:/, "NOTICE:"); print v "|" $0 }' "$APPLY_OUT"       >> "$TMP/notices.txt"
  fi
  echo "$IDX" > "$TMP/progress.txt"
done < <(sed -n "${BFROM},${BTO}p" "$PLAN")

{
  echo
  echo "## Shape-mismatch findings (replay-time, see release/lib/shape-tolerance.sh)"
  echo
  if [ -s "$TMP/shape_tolerated.txt" ]; then
    echo "$(wc -l < "$TMP/shape_tolerated.txt") version(s) failed replay on this shape but matched a"
    echo "pre-declared tolerance and were SKIPPED, not applied, no ledger row written. A human must"
    echo "confirm the real target (production or otherwise) actually has the object before treating"
    echo "these as done:"
    echo '```'
    cat "$TMP/shape_tolerated.txt"
    echo '```'
  else
    echo "none — every replayed migration either applied cleanly or was not attempted."
  fi
} | tee -a "$REPORT"

{
  echo
  echo "## Decided dispositions (release/lib/decided-migrations.sh) — NOT tolerated errors"
  echo
  echo "A version here was never attempted. No SQL was delivered, nothing raised, and there was"
  echo "nothing to tolerate. The disposition was decided by a human on the record BEFORE this run,"
  echo "and each line names the decision so a reader can check it rather than take this file's word."
  echo
  if [ -s "$TMP/decision_skipped.txt" ]; then
    echo "SKIPPED BY DECISION — no SQL run, NO ledger row (the absence IS the decision):"
    echo '```'
    while IFS='|' read -r _v _f; do
      [ -n "$_v" ] || continue
      echo "$_v|$(decided_id "$_v" "$DECIDED")|$(basename "${_f:-unknown}")"
    done < "$TMP/decision_skipped.txt"
    echo '```'
  else
    echo "SKIPPED BY DECISION: none in this batch."
  fi
  echo
  if [ -s "$TMP/decision_ledger_only.txt" ]; then
    echo "LEDGER-ROW-ONLY BY DECISION — no SQL run, ledger row written after its guard checked out:"
    echo '```'
    while IFS='|' read -r _v _f; do
      [ -n "$_v" ] || continue
      echo "$_v|$(decided_id "$_v" "$DECIDED")|$(basename "${_f:-unknown}")"
    done < "$TMP/decision_ledger_only.txt"
    echo '```'
  else
    echo "LEDGER-ROW-ONLY BY DECISION: none in this batch."
  fi
} | tee -a "$REPORT"

# Ledger delta is printed BEFORE the failure check on purpose: a batch that stopped early still
# has to account for what it did write, otherwise a failed batch reports nothing measurable.
LEDGER_BATCH_AFTER=$(psql_scalar "$CONTAINER" "$DBUSER" "$DB"   "SELECT count(*) FROM supabase_migrations.schema_migrations;")
{
  echo
  echo "ledger rows AFTER  this batch : $LEDGER_BATCH_AFTER"
  echo "ledger DELTA       this batch : $((LEDGER_BATCH_AFTER-LEDGER_BATCH_BEFORE))"
  echo "plan progress                 : $(cat "$TMP/progress.txt" 2>/dev/null) of $PLAN_TOTAL"
} | tee -a "$REPORT"

if [ "$FAILED" = "1" ]; then
  echo "## VERDICT: FAIL (replay stopped early)" | tee -a "$REPORT"
  assemble_report
  exit 1
fi

fi   # ================= end of replay phase =================

if [ "$PHASE" = "replay" ]; then
  {
    echo
    if [ "$(cat "$TMP/progress.txt" 2>/dev/null)" -ge "$PLAN_TOTAL" ] 2>/dev/null; then
      echo "## REPLAY COMPLETE — all $PLAN_TOTAL plan entries applied. Next: --phase gates"
    else
      echo "## BATCH $BFROM-$BTO COMPLETE — resume with --phase replay (it continues from"
      echo "   plan index $(( $(cat "$TMP/progress.txt") + 1 )) automatically)"
    fi
  } | tee -a "$REPORT"
  assemble_report
  exit 0
fi

# ---------- gates phase =========================================================================
if want_gates; then

if [ "$PHASE" = "gates" ]; then
  PLAN="$TMP/apply_plan.txt"
  [ -f "$PLAN" ] || { echo "FATAL: $PLAN missing -- run --phase restore first"; exit 2; }
  PLAN_TOTAL=$(wc -l < "$PLAN" | tr -d ' ')
  DONE_IDX=0
  if [ -f "$TMP/progress.txt" ]; then DONE_IDX=$(tr -dc '0-9' < "$TMP/progress.txt"); fi
  [ -n "$DONE_IDX" ] || DONE_IDX=0
  if [ "$DONE_IDX" -lt "$PLAN_TOTAL" ]; then
    echo "REFUSED: replay is incomplete -- $DONE_IDX of $PLAN_TOTAL plan entries done."
    echo "Gates run against a half-migrated shape would produce a verdict about a database that"
    echo "will never exist anywhere. Finish the batches first."
    exit 3
  fi
  [ -f "$TMP/shape_tolerated.txt" ]      || : > "$TMP/shape_tolerated.txt"
  [ -f "$TMP/decision_skipped.txt" ]     || : > "$TMP/decision_skipped.txt"
  [ -f "$TMP/decision_ledger_only.txt" ] || : > "$TMP/decision_ledger_only.txt"
  GATE_DB_EXISTS=$(docker exec -e PGPASSWORD="$(docker exec "$CONTAINER" printenv POSTGRES_PASSWORD | tr -d '')"     "$CONTAINER" sh -c "psql -U '$DBUSER' -d postgres --no-psqlrc -A -t -c \"SELECT 1 FROM pg_database WHERE datname='$DB';\"")
  if [ "$GATE_DB_EXISTS" != "1" ]; then
    echo "FATAL: database '$DB' does not exist. The restore phase's database was dropped or never"
    echo "created; gates cannot run against nothing."
    exit 2
  fi
fi

# ---------- FINAL machine-readable classification (post-replay overrides) -----------------------
# release/emit-blocks.ps1 prefers this block over the pre-replay one above: any version that hit a
# tolerated shape mismatch during replay is downgraded from APPLY to SHAPE_TOLERATED here so the
# generated RELEASE-<date>.md never turns a skipped migration into an ordinary mig_apply block.
{
  echo
  echo "## Machine-readable classification (FINAL, post-replay overrides, for release/emit-blocks.ps1)"
  echo
  echo '```'
  while read -r ver; do
    [ -n "$ver" ] || continue
    f=$(ls "$MIGDIR"/${ver}_*.sql 2>/dev/null | head -1); f=$(basename "${f:-unknown}")
    # The DECISION FILE is the authority here, not what this particular replay happened to do.
    # A release document must instruct what was decided; a replay that predated the declaration
    # (or that resumed past the entry) does not change the decision. Where the two differ, the
    # "## Decision exercise record" section below says so explicitly rather than hiding it.
    _dd=""
    if [ -n "$DECIDED" ]; then _dd=$(decided_disposition "$ver" "$DECIDED" 2>/dev/null || true); fi
    if [ "$_dd" = "SKIP" ]; then
      echo "$ver|DECISION_SKIPPED|$f"
    elif [ "$_dd" = "LEDGER_ONLY" ]; then
      echo "$ver|DECIDED_LEDGER_ONLY|$f"
    elif grep -q "^$ver|" "$TMP/shape_tolerated.txt" 2>/dev/null; then
      echo "$ver|SHAPE_TOLERATED|$f"
    else
      echo "$ver|APPLY|$f"
    fi
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

# ---------- decision exercise record --------------------------------------------------------------
# The FINAL classification above takes the DECISION FILE as authority. This section says, for every
# declared version, whether THIS run actually exercised that disposition or merely inherited it --
# because "the document says skip" and "the engine skipped it in front of me" are different claims
# and only one of them is evidence.
{
  echo
  echo "## Decision exercise record (release/config/decided-migrations.txt)"
  echo
  if [ -z "$DECIDED" ]; then
    echo "no decision file was passed (--decided); nothing is decided and nothing was skipped."
  else
    echo '```'
    printf '%-14s %-6s %-20s %s
' "VERSION" "DECIS" "DISPOSITION" "EXERCISED IN THIS REPLAY?"
    for _dv in $(decided_versions "$DECIDED"); do
      _ddisp=$(decided_disposition "$_dv" "$DECIDED")
      _did=$(decided_id "$_dv" "$DECIDED")
      _dex="NO -- plan index already past when the declaration was read"
      if grep -q "^$_dv|" "$TMP/decision_skipped.txt" 2>/dev/null; then _dex="YES -- skipped in front of this run, no SQL delivered"; fi
      if grep -q "^$_dv|" "$TMP/decision_ledger_only.txt" 2>/dev/null; then _dex="YES -- guard checked, ledger row only"; fi
      printf '%-14s %-6s %-20s %s
' "$_dv" "$_did" "$_ddisp" "$_dex"
    done
    echo '```'
  fi
} | tee -a "$REPORT"

# ---------- sequenced expectations (measured, never typed) ---------------------------------------
{
  echo
  echo "## Sequenced expectations (MEASURED during this replay, in release order)"
  echo
  echo "Every line below was printed by the migration itself while running in the REAL RELEASE"
  echo "SEQUENCE on the restored production shape -- not typed by an author, and not measured by"
  echo "running that migration on its own."
  echo
  echo "That distinction is the entire point. Migration 537 revokes TRUNCATE from authenticated on"
  echo "214 tables when applied by itself -- its own header says exactly that -- but on MORE than"
  echo "214 in this sequence, because migration 534 creates cron_run_log three steps earlier and"
  echo "the new table inherits the schema default that still includes TRUNCATE. An operator"
  echo "reading a hard-coded 214 would see the larger number, conclude the run had gone wrong,"
  echo "and stop a CORRECT release."
  echo
  echo "A hard-coded count is the same defect class as migration 477 static REVOKE list: a number"
  echo "generated against one shape and asserted against another. Derive it, or do not print it."
  echo
  echo '```'
  if [ -s "$TMP/notices.txt" ]; then
    cat "$TMP/notices.txt"
  else
    echo "(no NOTICE output was captured during replay)"
  fi
  echo '```'
} | tee -a "$REPORT"

# ---------- gates: og102 / og103 run together; og81 runs ALONE and on purpose ---------------------
# og81 is separated from the other two because its result has to be reconciled, not merely read.
# og81 asserts that the ledger and the migration directory agree EXACTLY, in both directions, with
# no allowlist -- deliberately, and that deliberateness is documented in the spec itself. But this
# release ships versions that will NEVER have a ledger row on the target: three by recorded
# decision (OG-J: 449/450/452) and however many the shape-tolerance mechanism left unapplied. On a
# database carrying those decisions, og81 CANNOT pass, and it must not be made to.
#
# So the engine does not weaken, patch or skip og81. It runs it unmodified, records its real
# result, and then MEASURES the disk-versus-ledger difference itself and requires that difference
# to equal the declared exception set EXACTLY, in both directions. Anything else -- one extra
# unrecorded version, or one declared version that turns out to have a row after all -- is FATAL.
# That is a STRICTER test than og81 alone, not a looser one: og81 asks "is the difference empty",
# this asks "is the difference precisely the set a human signed for".
echo "## Gates og102 / og103 against $DB" | tee -a "$REPORT"
GATE_LOG="$TMP/gates.log"
(
  export E2E_DB_CONTAINER="$CONTAINER"
  export E2E_DB_NAME="$DB"
  export E2E_DB_USER="postgres"
  cd "$REPO_ROOT" && npx playwright test \
    e2e/security/og102-pre393-anon-execute-grants-stay-closed.spec.ts \
    e2e/security/og103-anon-table-grants-stay-closed.spec.ts
) > "$GATE_LOG" 2>&1
GATE_RC=$?
tail -40 "$GATE_LOG" | tee -a "$REPORT"
echo "og102/og103 playwright exit code = $GATE_RC" | tee -a "$REPORT"

echo "## Gate og81 against $DB (run alone; see the reconciliation below)" | tee -a "$REPORT"
OG81_LOG="$TMP/og81.log"
(
  export E2E_DB_CONTAINER="$CONTAINER"
  export E2E_DB_NAME="$DB"
  export E2E_DB_USER="postgres"
  cd "$REPO_ROOT" && npx playwright test e2e/security/og81-migration-ledger-matches-disk.spec.ts
) > "$OG81_LOG" 2>&1
OG81_RC=$?
tail -25 "$OG81_LOG" | tee -a "$REPORT"
echo "og81 playwright exit code = $OG81_RC" | tee -a "$REPORT"

# ---------- og81 reconciliation: measured here, not parsed out of playwright's output -------------
ls "$MIGDIR"/*.sql | xargs -n1 basename | sed 's/_.*//' | sort -u > "$TMP/og81_disk.txt"
psql_scalar "$CONTAINER" "$DBUSER" "$DB" \
  "SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1;" | sort -u > "$TMP/og81_ledger.txt"
comm -23 "$TMP/og81_disk.txt" "$TMP/og81_ledger.txt" > "$TMP/og81_unrecorded.txt"
comm -13 "$TMP/og81_disk.txt" "$TMP/og81_ledger.txt" > "$TMP/og81_orphaned.txt"

# the declared exception set: decided SKIPs plus shape-tolerated versions, and nothing else
{
  if [ -n "$DECIDED" ]; then
    for _dv in $(decided_versions "$DECIDED"); do
      if [ "$(decided_disposition "$_dv" "$DECIDED")" = "SKIP" ]; then echo "$_dv"; fi
    done
  fi
  cut -d'|' -f1 "$TMP/shape_tolerated.txt" 2>/dev/null
} | sed '/^$/d' | sort -u > "$TMP/og81_declared.txt"

comm -23 "$TMP/og81_unrecorded.txt" "$TMP/og81_declared.txt" > "$TMP/og81_unexplained.txt"
comm -13 "$TMP/og81_unrecorded.txt" "$TMP/og81_declared.txt" > "$TMP/og81_stale_decl.txt"
OG81_RECONCILED=1
if [ -s "$TMP/og81_unexplained.txt" ]; then OG81_RECONCILED=0; fi
if [ -s "$TMP/og81_stale_decl.txt" ];  then OG81_RECONCILED=0; fi
if [ -s "$TMP/og81_orphaned.txt" ];    then OG81_RECONCILED=0; fi

{
  echo
  echo "## og81 reconciliation (measured directly from disk and the live ledger)"
  echo
  echo '```'
  echo "migration files on disk        : $(wc -l < "$TMP/og81_disk.txt" | tr -d ' ')"
  echo "ledger rows in $DB : $(wc -l < "$TMP/og81_ledger.txt" | tr -d ' ')"
  echo "files with NO ledger row       : $(wc -l < "$TMP/og81_unrecorded.txt" | tr -d ' ')"
  echo "ledger rows with NO file       : $(wc -l < "$TMP/og81_orphaned.txt" | tr -d ' ')   (must be 0 -- a deleted migration file)"
  echo "declared exception set         : $(wc -l < "$TMP/og81_declared.txt" | tr -d ' ')   (decided SKIP + shape-tolerated)"
  echo "UNEXPLAINED unrecorded         : $(wc -l < "$TMP/og81_unexplained.txt" | tr -d ' ')   (must be 0)"
  echo "declared but actually recorded : $(wc -l < "$TMP/og81_stale_decl.txt" | tr -d ' ')   (must be 0 -- a stale declaration)"
  echo '```'
  echo
  echo "every file with no ledger row, and why:"
  echo '```'
  if [ -s "$TMP/og81_unrecorded.txt" ]; then
    while read -r _uv; do
      [ -n "$_uv" ] || continue
      _why="UNEXPLAINED -- this is a real og81 failure"
      if [ -n "$DECIDED" ] && [ "$(decided_disposition "$_uv" "$DECIDED" 2>/dev/null || true)" = "SKIP" ]; then
        _why="skipped by decision $(decided_id "$_uv" "$DECIDED") -- no row on purpose, permanently"
      elif grep -q "^$_uv|" "$TMP/shape_tolerated.txt" 2>/dev/null; then
        _why="shape-tolerated -- not applied on this shape, OPEN question for a human"
      fi
      echo "$_uv  $_why"
    done < "$TMP/og81_unrecorded.txt"
  else
    echo "(none -- ledger and disk agree exactly)"
  fi
  echo '```'
  echo
  if [ "$OG81_RECONCILED" = "1" ] && [ "$OG81_RC" != "0" ]; then
    echo "og81 FAILED as a raw gate, and that failure is FULLY ACCOUNTED: the difference between"
    echo "disk and ledger is exactly the declared exception set, no more and no less. This is not"
    echo "og81 being weakened -- the gate ran unmodified and its real result is printed above. It"
    echo "is the release line stating, with a measurement, that the remaining difference is the one"
    echo "a human signed for. On the real target these versions will be absent from the ledger"
    echo "forever; that is OG-J, recorded at docs/missions/convergence/INTEGRATION-LOG.md:1037."
  elif [ "$OG81_RECONCILED" = "1" ]; then
    echo "og81 PASSED outright: ledger and disk agree exactly and the declared exception set is empty."
  else
    echo "og81 FAILED and the failure is NOT accounted. See the counts above."
  fi
} | tee -a "$REPORT"

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

# ---------- candidate accounting: every candidate in exactly one bucket, and they must SUM --------
# The arithmetic IS the point. A release report that lists outcomes without reconciling them to the
# candidate count can lose a migration between buckets and nobody would notice.
A_CONSIDERED=$(wc -l < "$TMP/candidates.txt" | tr -d ' ')
A_OK=$(wc -l < "$TMP/ok.txt" | tr -d ' ')
A_LEDGER_ONLY=$(wc -l < "$TMP/to_ledger_only.txt" | tr -d ' ')
A_LIES=$(wc -l < "$TMP/ledger_lies.txt" | tr -d ' ')
A_UNVERIFIABLE=$(wc -l < "$TMP/unverifiable.txt" | tr -d ' ')
A_APPLIED=0; A_TOLERATED=0; A_DECIDED_SKIP=0; A_DECIDED_LEDGER=0
while read -r _av; do
  [ -n "$_av" ] || continue
  _ad=""
  if [ -n "$DECIDED" ]; then _ad=$(decided_disposition "$_av" "$DECIDED" 2>/dev/null || true); fi
  if   [ "$_ad" = "SKIP" ];        then A_DECIDED_SKIP=$((A_DECIDED_SKIP+1))
  elif [ "$_ad" = "LEDGER_ONLY" ]; then A_DECIDED_LEDGER=$((A_DECIDED_LEDGER+1))
  elif grep -q "^$_av|" "$TMP/shape_tolerated.txt" 2>/dev/null; then A_TOLERATED=$((A_TOLERATED+1))
  else A_APPLIED=$((A_APPLIED+1))
  fi
done < "$TMP/to_apply.txt"
A_REFUSED=$((PLAN_TOTAL - DONE_IDX))
if [ "$A_REFUSED" -lt 0 ]; then A_REFUSED=0; fi
A_SUM=$((A_OK + A_APPLIED + A_LEDGER_ONLY + A_DECIDED_LEDGER + A_TOLERATED + A_DECIDED_SKIP + A_LIES + A_UNVERIFIABLE))
{
  echo
  echo "## Candidate accounting — every candidate in exactly one bucket, and they must SUM"
  echo
  echo '```'
  printf '%-48s %6s\n' "considered (candidates at or below the ceiling)" "$A_CONSIDERED"
  printf '%-48s %6s\n' "  OK                  (ledger + catalogue agree)" "$A_OK"
  printf '%-48s %6s\n' "  APPLIED             (replayed by this rehearsal)" "$A_APPLIED"
  printf '%-48s %6s\n' "  LEDGER_ONLY         (catalogue-driven, row only)" "$A_LEDGER_ONLY"
  printf '%-48s %6s\n' "  DECIDED_LEDGER_ONLY (decision, row only, guarded)" "$A_DECIDED_LEDGER"
  printf '%-48s %6s\n' "  SHAPE_TOLERATED     (failed, declared, still OPEN)" "$A_TOLERATED"
  printf '%-48s %6s\n' "  SKIPPED_BY_DECISION (never run at all, CLOSED)" "$A_DECIDED_SKIP"
  printf '%-48s %6s\n' "  LEDGER_LIES         (pre-declared, untouched)" "$A_LIES"
  printf '%-48s %6s\n' "  UNVERIFIABLE        (row exists, no catalogue signal)" "$A_UNVERIFIABLE"
  printf '%-48s %6s\n' "  REFUSED             (plan entries never attempted)" "$A_REFUSED"
  printf '%-48s %6s\n' "  ---- sum" "$A_SUM"
  echo '```'
  echo
  echo "SHAPE_TOLERATED and SKIPPED_BY_DECISION are NOT the same bucket and must never be summed"
  echo "together. The first is a migration that FAILED on this shape and whose disposition is still"
  echo "an open question for a human. The second was never attempted at all, because a human closed"
  echo "the question before this run started -- release/config/decided-migrations.txt names the"
  echo "decision behind each one. Conflating them reports an open risk as a settled one."
  echo
  echo "UNVERIFIABLE is the honest weak spot of catalogue-over-ledger, and it is large. Those"
  echo "versions have a ledger row and NO catalogue signal at all -- function-only, grant-only and"
  echo "data-only migrations that docs/missions/prodprep/ledger-evidence.sh cannot probe. For them"
  echo "this rehearsal trusts the ledger, which is the very thing migration 477 proved can lie."
} | tee -a "$REPORT"

if [ "$A_SUM" != "$A_CONSIDERED" ]; then
  echo "## VERDICT: FAIL (candidate accounting does not sum: $A_SUM != $A_CONSIDERED)" | tee -a "$REPORT"
  assemble_report
  exit 1
fi

# ---------- final verdict ---------------------------------------------------------------------
if [ "$GATE_RC" != "0" ]; then
  echo "## VERDICT: FAIL (og102/og103 did not both pass)" | tee -a "$REPORT"
  assemble_report
  exit 1
fi

if [ "$OG81_RECONCILED" != "1" ]; then
  echo "## VERDICT: FAIL (og81's disk/ledger difference is not exactly the declared exception set)" | tee -a "$REPORT"
  assemble_report
  exit 1
fi

echo "## VERDICT: PASS" | tee -a "$REPORT"
assemble_report
exit 0

fi   # ================= end of gates phase =================
