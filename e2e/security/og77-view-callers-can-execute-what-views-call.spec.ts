/**
 * OG-77 / migration 405 — if a role can SELECT a view, it must be able to EXECUTE every function
 * that view calls. Otherwise the view is readable and unusable at the same time.
 *
 * THIS EXISTS BECAUSE IT ALREADY HAPPENED. Migration 395 revoked EXECUTE from PUBLIC on 28
 * functions. One of them, `get_product_price_bounds`, was reachable by `products_api_readonly`
 * ONLY through that PUBLIC grant. That role's whole purpose is to SELECT two views, and the
 * primary one calls the function in a LATERAL join — so the revoke took a live, credentialed,
 * request-facing API offline while every catalogue check in 395 passed.
 *
 * WHY A VIEW DOES NOT SHIELD THE CALLER. `api_products_pricing` is not `security_invoker`, so
 * RELATION access inside it is checked against the view's owner. **Function EXECUTE is not.**
 * A rewritten view query carries `checkAsUser` on its range-table entries, which is what
 * substitutes the owner for table reads; function calls have no equivalent and are checked
 * against the CURRENT user. "The role can read the view" and "the role can run what the view
 * calls" are therefore two different facts, and asserting only the first passes while the API
 * is down.
 *
 * WHY THE ORIGINAL GATE MISSED IT. 395 asserted that "legitimate roles keep access" and named
 * `authenticated` and `service_role`. `products_api_readonly` is neither: it is NOINHERIT and
 * PostgREST `SET ROLE`s into it from a JWT claim, so no inheritance-based check ever sees it.
 * The repository had recorded that exact blind spot two days earlier, in migration 385's repair
 * of 384 — and 395 still enumerated two roles by hand.
 *
 * So this gate does not enumerate roles at all. It asks the catalogue which roles can read which
 * views, and derives the rest.
 */
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";

/**
 * The DELIBERATE exceptions, and there is exactly one role in this list.
 *
 * `supabase_read_only_user` is blocked from several such views ON PURPOSE — that is OG-45's pin,
 * asserted by migration 393. Eleven view/function pairs are blocked for it today, and two of
 * those come from `_capital_alloc_used` rather than `is_viewer_only`, so the pin is broader than
 * a single function.
 *
 * It is listed here as an EXCEPTION rather than filtered out silently, because the distinction
 * between "deliberately blocked" and "accidentally broken" is the entire content of this gate.
 * A repair that widened the class would have dismantled OG-45 without anyone noticing.
 */
const INTENTIONALLY_BLOCKED_ROLES = ["supabase_read_only_user"];

/** Roles that exist to serve requests and are reached by SET ROLE, not by inheritance. */
const REQUEST_FACING = ["anon", "authenticated", "service_role", "products_api_readonly"];

function readableViewsCallingUnexecutableFns(excludeRoles: string[]): string[] {
  const excluded = excludeRoles.map((r) => `'${r}'`).join(",") || "''";
  return dbRows(`
    select r.rolname || ' | ' || c.relname || ' | ' || p.proname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_rewrite rw on rw.ev_class = c.oid
      join pg_depend d on d.objid = rw.oid and d.classid = 'pg_rewrite'::regclass
      join pg_proc p on p.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass
      cross join (select rolname from pg_roles
                   where rolname not like 'pg\\_%' and rolname <> 'postgres'
                     and rolname not in (${excluded})) r
     where c.relkind = 'v'
       and has_table_privilege(r.rolname, c.oid, 'SELECT')
       and not has_function_privilege(r.rolname, p.oid, 'EXECUTE')
     order by 1
  `);
}

test("⛔ no role can read a view whose functions it cannot execute", () => {
  const broken = readableViewsCallingUnexecutableFns(INTENTIONALLY_BLOCKED_ROLES);
  expect(
    broken,
    `these roles can SELECT a view but not EXECUTE what it calls, so the view raises 42501 for them: ${broken.join(" ; ")}. ` +
      "If a block is deliberate, add the ROLE to INTENTIONALLY_BLOCKED_ROLES with the gate row that requires it — never silence a single pair.",
  ).toEqual([]);
});

test("the products API actually serves rows to its own credentialed role", () => {
  // The behavioural half. A grant can be present and still insufficient, and the catalogue
  // cannot tell the difference — only executing the query can.
  //
  // `set_config` MUST be its own statement. A first draft put it in a scalar subquery beside the
  // scan and the role never took effect: the query ran as `postgres`, returned rows, and stayed
  // GREEN through a disturbance that had removed the grant — a behavioural test that measured
  // nothing. psql runs multiple statements in one transaction, so the role set by the first
  // still applies to the second.
  const rows = dbRows(
    "select set_config('role','products_api_readonly',true) is not null; " +
      "select count(*)::text from public.api_products_pricing",
  );
  const n = Number(rows[rows.length - 1] ?? "0");
  expect(n, "api_products_pricing returned nothing for products_api_readonly").toBeGreaterThan(0);
});

test("⛔ the repair did NOT give the function back to anon", () => {
  // 395 was right about `anon`; 405 repaired a different role. A fix that restored the PUBLIC
  // grant would have looked identical from the API's side and undone a real security change.
  const anonCan = dbRows(`
    select has_function_privilege('anon','public.get_product_price_bounds(uuid,uuid)','EXECUTE')::text
  `);
  expect(anonCan[0], "anon regained EXECUTE — 395's closure was undone").toBe("false");
});

test("OG-45's pin is still in place — supabase_read_only_user is still blocked", () => {
  // The other direction, and the reason the exception list names a ROLE rather than a pair. If
  // this drops, a later repair has widened the class and dismantled a security pin while
  // appearing to fix a bug.
  const blocked = readableViewsCallingUnexecutableFns(
    REQUEST_FACING.concat([
      "authenticator",
      "supabase_admin",
      "supabase_auth_admin",
      "supabase_storage_admin",
    ]),
  ).filter((l) => l.startsWith("supabase_read_only_user"));
  expect(
    blocked.length,
    `supabase_read_only_user should still be blocked on the OG-45 views; found ${blocked.length}`,
  ).toBeGreaterThanOrEqual(11);
});

test("every request-facing role is covered by this gate, not just the two 395 named", () => {
  // The meta-assertion, and the actual lesson. 395's gate enumerated `authenticated` and
  // `service_role` by hand and was therefore blind to `products_api_readonly`, which is
  // NOINHERIT and reached by SET ROLE. This asserts the roles exist so that the derived query
  // above genuinely spans them — a gate that silently covers two roles looks identical to one
  // that covers four.
  const present = dbRows(`
    select rolname from pg_roles
     where rolname in (${REQUEST_FACING.map((r) => `'${r}'`).join(",")})
     order by 1
  `);
  expect(present.sort()).toEqual([...REQUEST_FACING].sort());

  // And each must be NOINHERIT-or-not as the catalogue says — recorded so the next reader knows
  // why an inheritance-based check would not have found this.
  const noinherit = dbRows(`
    select rolname from pg_roles
     where rolname in ('products_api_readonly','authenticator') and not rolinherit
     order by 1
  `);
  expect(
    noinherit,
    "products_api_readonly and authenticator are the NOINHERIT roles a USAGE check cannot see",
  ).toEqual(["authenticator", "products_api_readonly"]);
});
