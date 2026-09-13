#!/usr/bin/env bash
# release/lib/mig-apply.sh — the mig_apply contract, made parameterizable.
#
# WHY THIS FILE EXISTS
#   docs/runbooks/production-migration-20260908-BLOCKS.md:624-643 defines `mig_apply`, and
#   docs/research/convergence/R-4-transfer-line.md Task 1.1 documents exactly what it does and
#   does not guarantee. Two gaps, both load-bearing, are fixed here without changing the proven
#   behaviour:
#     (a) BLOCKS.md's version is a shell function that only lives in the Git Bash process that
#         pasted it — this is a real FILE, `source`-able by any script.
#     (b) BLOCKS.md's version hardcodes `-U supabase_admin -d postgres` and container
#         `afrakala-lan-db` — every function here takes container/user/db as arguments, the same
#         way `e2e/helpers/db.ts` and `docs/missions/prodprep/ledger-reconcile.sh` already do.
#
# Every guarantee from the original is preserved:
#   - md5 both sides before applying (never applies on mismatch)
#   - `--single-transaction -v ON_ERROR_STOP=1 --no-psqlrc` on every psql invocation
#   - file delivered by `cat | docker exec -i ... cat >`, never through `docker cp` (broken on
#     this machine's Docker Desktop mount layer, see CLAUDE.md) and never through a PowerShell
#     pipe (the 2026-07-11 Persian-corruption incident)
#   - ledger INSERT with NO `ON CONFLICT` — a collision must raise, never be swallowed
#     (CLAUDE.md rule 2b)
#
# Callers must `export MSYS_NO_PATHCONV=1` before sourcing this on Git Bash for Windows, exactly
# as every other docker/psql script in this repo already requires.
set -u

_mig_pw() { # container -> POSTGRES_PASSWORD, never printed by any caller
  docker exec "$1" printenv POSTGRES_PASSWORD | tr -d '\r'
}

# deliver_and_verify CONTAINER LOCAL_FILE REMOTE_PATH
# Copies LOCAL_FILE into the container at REMOTE_PATH via stdin (never docker cp, never a
# PowerShell pipe) and asserts md5 identity on both sides. Returns 1 and prints the mismatch
# instead of proceeding on any disagreement.
deliver_and_verify() {
  local container="$1" local_file="$2" remote_path="$3"
  [ -f "$local_file" ] || { echo "MISSING FILE: $local_file"; return 1; }
  cat "$local_file" | docker exec -i "$container" sh -c "cat > $remote_path" || return 1
  local h c
  h=$(md5sum "$local_file" | awk '{print $1}')
  c=$(docker exec "$container" md5sum "$remote_path" | awk '{print $1}')
  if [ "$h" != "$c" ]; then
    echo "MD5 MISMATCH $local_file -> $remote_path  host=$h  cont=$c  -- NOT DELIVERED"
    return 1
  fi
  echo "delivered $local_file -> $container:$remote_path (md5 $h, identical both sides)"
  return 0
}

# mig_apply CONTAINER DB_USER DB VERSION FILE_PATH
# Full contract: deliver, verify md5, apply in its own transaction, then INSERT the ledger row
# in a second transaction (matching BLOCKS.md's own two-step shape — the apply and the ledger
# write are deliberately separate psql invocations, so an apply that fails never reaches the
# ledger step, and an apply that succeeds but whose ledger write fails is reported distinctly
# rather than silently merged into one ambiguous exit code).
mig_apply() {
  local container="$1" db_user="$2" db="$3" ver="$4" file_path="$5"
  local base remote pw
  base=$(basename "$file_path")
  remote="/tmp/mig_${ver}.sql"

  deliver_and_verify "$container" "$file_path" "$remote" || return 1

  pw=$(_mig_pw "$container")
  echo "=== apply $base (version $ver) ==="
  docker exec -e PGPASSWORD="$pw" "$container" sh -c \
    "psql -U '$db_user' -d '$db' --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -f '$remote'"
  local apply_rc=$?
  if [ $apply_rc -ne 0 ]; then
    echo "*** APPLY FAILED: $base (exit $apply_rc) -- transaction rolled back, ledger NOT written ***"
    return 1
  fi

  docker exec -e PGPASSWORD="$pw" "$container" sh -c \
    "psql -U '$db_user' -d '$db' --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -c \"INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$ver');\""
  local ledger_rc=$?
  if [ $ledger_rc -ne 0 ]; then
    echo "*** LEDGER RECORD FAILED for $ver (exit $ledger_rc) -- schema change applied, ledger NOT written ***"
    return 1
  fi

  echo "OK $base"
  return 0
}

# ledger_insert_only CONTAINER DB_USER DB VERSION
# The "ledger-row-only" case: the catalogue already shows this migration's effect PRESENT but
# the ledger has no row for it (the 2026-08-27 / og81 failure mode: applied-but-unrecorded).
# NEVER re-runs the migration file — CLAUDE.md rule 2b is explicit that re-running to "fix the
# count" is how a non-idempotent migration (DROP COLUMN, DROP+CREATE FUNCTION) does real damage.
# Plain INSERT, no ON CONFLICT: a collision here means the row was NOT actually missing and this
# function was called on a stale classification -- it must raise, not be swallowed.
ledger_insert_only() {
  local container="$1" db_user="$2" db="$3" ver="$4" pw
  pw=$(_mig_pw "$container")
  docker exec -e PGPASSWORD="$pw" "$container" sh -c \
    "psql -U '$db_user' -d '$db' --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -c \"INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$ver');\""
  local rc=$?
  if [ $rc -ne 0 ]; then
    echo "*** ledger_insert_only FAILED for $ver (exit $rc) ***"
    return 1
  fi
  echo "OK ledger-row-only $ver"
  return 0
}

# psql_scalar CONTAINER DB_USER DB SQL -> prints the -tA result of a single-column query
psql_scalar() {
  local container="$1" db_user="$2" db="$3" sql="$4" pw
  pw=$(_mig_pw "$container")
  docker exec -e PGPASSWORD="$pw" "$container" sh -c \
    "psql -U '$db_user' -d '$db' --no-psqlrc -A -t -c \"$sql\""
}
