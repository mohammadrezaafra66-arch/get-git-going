#!/usr/bin/env bash
#
# schema-snapshot.sh — a structural snapshot of one database, for proving that a migration set is
# idempotent (or that two shapes are identical).
#
#   usage:  bash scripts/schema-snapshot.sh <database> <output-file> [container]
#
#   typical: restore -> snapshot S1 -> apply migrations -> snapshot S2 -> `diff S1 S2`
#            An idempotency proof is the DIFF. "It applied twice without an error" is not a proof:
#            a migration can re-apply cleanly and still change something on the second pass.
#
# ---------------------------------------------------------------------------------------------
# WHY THIS FILE EXISTS, AND WHY THE DIMENSION LIST IS EXHAUSTIVE RATHER THAN CONVENIENT
# ---------------------------------------------------------------------------------------------
# An ad-hoc version of this tool was written twice during the 2026-09 convergence release and was
# too narrow BOTH times. Each gap produced a confident "identical across N lines" that was silent
# about the very thing being changed:
#
#   miss 1 — it compared views only by `reloptions`, so it reported "identical" while migration 526
#            was rewriting two view BODIES. Caught because 526's own output said it had redefined a
#            view while the diff showed nothing.
#   miss 2 — it captured EXECUTE only for `anon` and `authenticated`, and `pg_default_acl` not at
#            all. Those are exactly the two dimensions migrations 537 and 538 write. Caught by an
#            adversarial reviewer noticing that the claim outran the evidence.
#
# Neither gap was caught by the tool. Both were caught by a person asking "does this evidence
# actually cover the claim?" — so the list below is written out in full, in the file, on purpose:
# the next person inherits the coverage instead of rediscovering the gap.
#
# THE DIMENSIONS. Add to this list, never quietly remove from it.
#
#    1. relations          kind, name, RLS enabled, RLS forced, owner, reloptions
#    2. view definitions   md5(pg_get_viewdef) — bodies, not just options
#    3. columns            name, type, nullability, default
#    4. constraints        full definition
#    5. indexes            full definition
#    6. triggers           IN public AND OUTSIDE it (auth.users is where signup triggers live —
#                          a public-only snapshot silently misses them)
#    7. functions          body md5, prosecdef, provolatile, owner, proconfig
#    8. policies           cmd, permissive, roles, qual, with_check
#    9. privileges         relation ACLs, column ACLs, sequence ACLs, and FULL function ACLs for
#                          EVERY role — not a chosen few
#   10. default privileges pg_default_acl, all schemas, all object types, all grantors
#
# ---------------------------------------------------------------------------------------------
set -u
export MSYS_NO_PATHCONV=1

DB="${1:?usage: schema-snapshot.sh <database> <output-file> [container]}"
OUT="${2:?usage: schema-snapshot.sh <database> <output-file> [container]}"
CONTAINER="${3:-afrakala-lan-db}"
PSQL_USER="${SNAPSHOT_DB_USER:-postgres}"

q() { docker exec "$CONTAINER" psql -U "$PSQL_USER" -d "$DB" -At -F'|' -c "$1"; }

{
echo "## 1 relations"
q "select c.relkind, c.relname, c.relrowsecurity, c.relforcerowsecurity,
          pg_get_userbyid(c.relowner), coalesce(array_to_string(c.reloptions,','),'')
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','v','m','p','S') order by 2,1;"

echo "## 2 view_definitions"
q "select c.relname, md5(pg_get_viewdef(c.oid))
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('v','m') order by 1;"

echo "## 3 columns"
q "select table_name, column_name, data_type, is_nullable, coalesce(column_default,'')
     from information_schema.columns where table_schema='public' order by 1,2;"

echo "## 4 constraints"
q "select conrelid::regclass::text, conname, pg_get_constraintdef(oid)
     from pg_constraint where connamespace='public'::regnamespace order by 1,2;"

echo "## 5 indexes"
q "select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 1,2;"

echo "## 6 triggers_all_schemas"
q "select n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid)
     from pg_trigger t join pg_class c on c.oid=t.tgrelid
     join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname not in ('pg_catalog','information_schema')
    order by 1,2,3;"

echo "## 7 functions"
q "select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, p.provolatile,
          pg_get_userbyid(p.proowner), coalesce(array_to_string(p.proconfig,','),''),
          md5(pg_get_functiondef(p.oid))
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind in ('f','p') order by 1,2;"

echo "## 8 policies"
q "select pol.polrelid::regclass::text, pol.polname, pol.polcmd, pol.polpermissive,
          coalesce((select string_agg(r.rolname,',' order by r.rolname)
                      from pg_roles r where r.oid = any(pol.polroles)),'PUBLIC'),
          coalesce(pg_get_expr(pol.polqual, pol.polrelid),''),
          coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),'')
     from pg_policy pol join pg_class c on c.oid=pol.polrelid
     join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' order by 1,2;"

echo "## 9a relation_acls_every_grantee"
q "select c.relname, coalesce(r.rolname,'PUBLIC'), a.privilege_type
     from pg_class c join pg_namespace n on n.oid=c.relnamespace,
          aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     left join pg_roles r on r.oid=a.grantee
    where n.nspname='public' and c.relkind in ('r','v','m','p','S') order by 1,2,3;"

echo "## 9b column_acls"
q "select table_name, column_name, grantee, privilege_type
     from information_schema.column_privileges where table_schema='public' order by 1,2,3,4;"

echo "## 9c function_acls_every_grantee"
q "select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
          coalesce(r.rolname,'PUBLIC'), a.privilege_type
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
          aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     left join pg_roles r on r.oid=a.grantee
    where n.nspname='public' order by 1,2,3;"

echo "## 10 default_privileges_all_schemas"
q "select pg_get_userbyid(d.defaclrole), coalesce(n.nspname,'(global)'), d.defaclobjtype,
          array_to_string(d.defaclacl,' ')
     from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace order by 1,2,3;"
} > "$OUT" 2>&1

echo "$(wc -l < "$OUT") lines -> $OUT"
