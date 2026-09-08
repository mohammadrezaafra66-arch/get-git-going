#!/usr/bin/env bash
# ledger-evidence.sh — classify each ledger-gap migration as PRESENT / ABSENT / NO-EVIDENCE
# by asking the LIVE catalogue whether the objects the file creates actually exist.
#
# This is the honest answer to "what does the SCHEMA say is applied?".  There is no single
# source for that question in this project, so this script derives a per-migration signal
# from the strongest catalogue-checkable artefacts a migration leaves behind:
#
#     CREATE TABLE public.X          -> pg_class relkind r/p      STRONG
#     CREATE TYPE  public.X          -> pg_type                   STRONG
#     ADD COLUMN   c (ALTER TABLE t) -> information_schema.columns STRONG
#     CREATE VIEW  public.X          -> pg_class relkind v/m       MEDIUM (later migs replace)
#     CREATE INDEX X                 -> pg_class relkind i         MEDIUM
#     CREATE POLICY p ON public.t    -> pg_policies                MEDIUM (later migs drop)
#
# WHAT IT CANNOT SEE  (read this before trusting a verdict):
#   * CREATE OR REPLACE FUNCTION  -- the name existing proves nothing about WHICH version;
#     function-only migrations are therefore reported NO-EVIDENCE, never PRESENT.
#   * GRANT / REVOKE, COMMENT, data-only INSERT/UPDATE migrations -- no durable named object.
#   * A migration whose object was later DROPPED by a still-later migration reads ABSENT even
#     though it did run (supersession, not absence).  Migration 410's header documents six real
#     instances of exactly this trap on this project.
#   * ADD COLUMN on a table that itself does not exist reads ABSENT for the column - correct,
#     but the real cause is the missing table.
#
# So: PRESENT is good evidence the migration ran.  ABSENT is a REASON TO INVESTIGATE, not a
# verdict.  NO-EVIDENCE means this tool has nothing to say and a human must decide.
#
# usage: ledger-evidence.sh <database> <migrations-dir> <versions-file>
set -u
DB="${1:?database}"
MIGDIR="${2:?migrations dir}"
VERSIONS="${3:?file with one 14-digit version per line}"
C="${DOCKER_DB_CONTAINER:-afrakala-lan-db}"
export MSYS_NO_PATHCONV=1

probe() {  # kind|name|extra  -> emits one SQL SELECT returning 0/1
  :
}

TMPSQL="$(mktemp)"
{
  echo "\\pset format unaligned"
  echo "\\pset tuples_only on"
} > "$TMPSQL"

while read -r ver; do
  [ -n "$ver" ] || continue
  f=$(ls "$MIGDIR"/${ver}_*.sql 2>/dev/null | head -1)
  if [ -z "$f" ]; then
    echo "$ver|NO-FILE||"
    continue
  fi
  base=$(basename "$f")

  # ---- extract checkable artefacts -------------------------------------------------
  tables=$(grep -oiE "CREATE TABLE (IF NOT EXISTS )?(public\.)?[a-z0-9_]+" "$f" \
           | sed -E 's/.*[[:space:]]//; s/^public\.//' | sort -u)
  types=$(grep -oiE "CREATE TYPE (public\.)?[a-z0-9_]+" "$f" \
           | sed -E 's/.*[[:space:]]//; s/^public\.//' | sort -u)
  views=$(grep -oiE "CREATE (OR REPLACE )?(MATERIALIZED )?VIEW (IF NOT EXISTS )?(public\.)?[a-z0-9_]+" "$f" \
           | sed -E 's/.*[[:space:]]//; s/^public\.//' | sort -u)
  idx=$(grep -oiE "CREATE (UNIQUE )?INDEX (CONCURRENTLY )?(IF NOT EXISTS )?[a-z0-9_]+" "$f" \
           | sed -E 's/.*[[:space:]]//' | sort -u)
  cols=$(awk 'BEGIN{IGNORECASE=1} /ALTER TABLE/{t=$0; sub(/.*ALTER TABLE( ONLY)? +(public\.)?/,"",t); sub(/[^a-zA-Z0-9_].*/,"",t)}
              /ADD COLUMN/{c=$0; sub(/.*ADD COLUMN( IF NOT EXISTS)? +/,"",c); sub(/[^a-zA-Z0-9_].*/,"",c);
                           if (t!="" && c!="") print t"."c}' "$f" | sort -u)

  n=0
  emit() { echo "$1"; }
  for t in $tables; do
    echo "SELECT '$ver|TABLE|$t|' || (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='$t' AND c.relkind IN ('r','p'));" >> "$TMPSQL"; n=1
  done
  for t in $types; do
    echo "SELECT '$ver|TYPE|$t|' || (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='$t');" >> "$TMPSQL"; n=1
  done
  for v in $views; do
    echo "SELECT '$ver|VIEW|$v|' || (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='$v' AND c.relkind IN ('v','m'));" >> "$TMPSQL"; n=1
  done
  for i in $idx; do
    echo "SELECT '$ver|INDEX|$i|' || (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='$i' AND c.relkind='i');" >> "$TMPSQL"; n=1
  done
  for tc in $cols; do
    tbl="${tc%%.*}"; col="${tc##*.}"
    echo "SELECT '$ver|COLUMN|$tc|' || (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='$tbl' AND column_name='$col');" >> "$TMPSQL"; n=1
  done
  if [ "$n" = "0" ]; then
    echo "SELECT '$ver|NO-EVIDENCE|$base|-';" >> "$TMPSQL"
  fi
done < "$VERSIONS"

cat "$TMPSQL" | docker exec -i "$C" sh -c 'cat > /tmp/ledger_evidence.sql'
docker exec -e PGDB="$DB" "$C" sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d "$PGDB" -f /tmp/ledger_evidence.sql'
rm -f "$TMPSQL"
