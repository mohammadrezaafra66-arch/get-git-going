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
KNOWN_LIES="" OUT="" SHAPE_TOLERANT=""
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
[ -f "$TMP/shape_tolerated.txt" ] || : > "$TMP/shape_tolerated.txt"

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
  [ -f "$TMP/shape_tolerated.txt" ] || : > "$TMP/shape_tolerated.txt"
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
    if grep -qx "$ver|$f" "$TMP/shape_tolerated.txt" 2>/dev/null || grep -q "^$ver|" "$TMP/shape_tolerated.txt" 2>/dev/null; then
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
  assemble_report
  exit 1
fi

echo "## VERDICT: PASS" | tee -a "$REPORT"
assemble_report
exit 0

fi   # ================= end of gates phase =================
