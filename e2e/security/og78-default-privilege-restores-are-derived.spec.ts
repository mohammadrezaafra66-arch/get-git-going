/**
 * OG-78 / migration 406 — every schema that NEEDS a FUNCTIONS default-privilege restore has one,
 * and the set is DERIVED from the catalogue rather than written down.
 *
 * WHY A DERIVED GATE AND NOT A LONGER LIST. Migration 393 revoked the global FUNCTIONS default
 * privilege from PUBLIC and restored it in six named schemas. That list came from a census of
 * schemas where `supabase_admin` owns functions TODAY — so `graphql_public`, which owns zero,
 * was invisible to the method that produced it. And 393's own gate iterated the SAME array as
 * its restore statements, so it could only ever detect a restore removed from a schema already
 * named. Adding `graphql_public` to both would have fixed one instance and left the trap intact
 * for the next schema.
 *
 * THE CRITERION. A schema needs a restore for grantor `supabase_admin` if and only if:
 *   (a) `supabase_admin` OWNS the schema — so a function created there carries it as grantor;
 *   (b) some request-facing role has USAGE on it; and
 *   (c) it is not `public`, which 393 closes deliberately and scopes per-role.
 *
 * (a) is the part that is easy to get wrong in the other direction. `auth` and `storage` are
 * both reachable and both have no restore row, and both are CORRECT: `ALTER DEFAULT PRIVILEGES`
 * rows are PER-GRANTOR, and their functions belong to `supabase_auth_admin` and
 * `supabase_storage_admin`, so the `supabase_admin` revoke never applies to them. A rule of
 * "every reachable schema needs a restore" would add two pointless grants and look just as green.
 */
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";

/** Schemas meeting the criterion — the query is the specification. No schema is named here. */
const CRITERION = `
  from pg_namespace n
 where pg_get_userbyid(n.nspowner) = 'supabase_admin'
   and n.nspname <> 'public'
   and (has_schema_privilege('anon',          n.oid, 'USAGE')
     or has_schema_privilege('authenticated', n.oid, 'USAGE')
     or has_schema_privilege('service_role',  n.oid, 'USAGE'))
`;

test("⛔ no schema meets the criterion without a FUNCTIONS restore", () => {
  const gaps = dbRows(`
    select n.nspname ${CRITERION}
       and not exists (
         select 1 from pg_default_acl d
          where d.defaclnamespace = n.oid
            and d.defaclobjtype = 'f'
            and d.defaclrole = 'supabase_admin'::regrole)
     order by 1
  `);
  expect(
    gaps,
    `these schemas would have functions created closed to anon/authenticated/service_role: ${gaps.join(", ")}. ` +
      "Add an ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON FUNCTIONS TO PUBLIC for each — and do not " +
      "narrow this criterion to make the failure go away.",
  ).toEqual([]);
});

test("the criterion is not vacuous — it selects a real set", () => {
  // Without this, narrowing the criterion until it matches nothing would make the test above
  // pass permanently. That is the failure mode a derived gate replaces one kind of blindness
  // with if nobody checks the derivation itself.
  const covered = dbRows(`select n.nspname ${CRITERION} order by 1`);
  expect(
    covered.length,
    `the criterion selects only ${covered.length} schema(s): ${covered.join(", ")}`,
  ).toBeGreaterThanOrEqual(4);
  expect(covered, "graphql_public is the schema that motivated this gate").toContain(
    "graphql_public",
  );
});

test("⛔ the global FUNCTIONS revoke is still in place", () => {
  // Restoring every schema would satisfy the gap check perfectly while undoing 393 entirely.
  const global = dbRows(`
    select 'present' from pg_default_acl
     where defaclnamespace = 0 and defaclobjtype = 'f'
       and defaclrole = 'supabase_admin'::regrole
  `);
  expect(global, "the global FUNCTIONS revoke is gone — 393 has been undone").toEqual(["present"]);
});

test("⛔ public is still closed to anon by default — 393's actual purpose", () => {
  const anonHasDefault = dbRows(`
    select 'leaked' from pg_default_acl d, aclexplode(d.defaclacl) a
     where d.defaclnamespace = 'public'::regnamespace
       and d.defaclobjtype = 'f'
       and a.grantee = 'anon'::regrole
       and a.privilege_type = 'EXECUTE'
  `);
  expect(anonHasDefault, "anon regained the default EXECUTE in public").toEqual([]);
});

test("auth and storage are correctly EXCLUDED — per-grantor, not per-schema", () => {
  // The open half, and the one that stops this gate from over-reaching. Both are reachable and
  // neither has a restore, and both are right: their functions carry a different grantor, so the
  // supabase_admin revoke does not apply. If either ever appears in the criterion, the reasoning
  // has drifted and the next fix would add grants that do nothing.
  const covered = dbRows(`select n.nspname ${CRITERION} order by 1`);
  expect(
    covered,
    "auth must not meet the criterion — its functions are supabase_auth_admin's",
  ).not.toContain("auth");
  expect(
    covered,
    "storage must not meet the criterion — its functions are supabase_storage_admin's",
  ).not.toContain("storage");

  // And the reason, asserted rather than left in a comment.
  const owners = dbRows(`
    select n.nspname || '=' || pg_get_userbyid(p.proowner)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('auth','storage')
     group by 1 order by 1
  `);
  expect(owners).toEqual(["auth=supabase_auth_admin", "storage=supabase_storage_admin"]);
});
