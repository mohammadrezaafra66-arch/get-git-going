/**
 * H-9 / F-1 — only a reviewer may move `customers.manual_credit_floor`, on EVERY write verb.
 *
 * WHY THIS EXISTS. The column is directly writable: `authenticated` holds INSERT and UPDATE on
 * it, the policy "manage customers by role" is an ALL-command policy that lets a `sales` user
 * write to their own customers and to any unassigned one, and the CHECK has no upper bound. So
 * a sales user could set an arbitrary ceiling with a plain PostgREST call, bypassing
 * `review_credit_request`'s admin|manager|accountant gate. Migration 510 made that column
 * override the credit-limit cap, so the bypass moves real credit ceilings.
 *
 * Migration 511 added the guard for UPDATE; 518 extended it to INSERT, because an UPDATE-only
 * trigger is the same hole reached through a different verb.
 *
 * THREE ASSERTIONS, and the third is not optional. A guard that also blocks ordinary customer
 * creation is a worse bug than the hole it closes, so "sales creates a customer with no ceiling"
 * must keep working and is asserted here alongside the two refusals.
 *
 * WHY THE REFUSAL MESSAGE IS MATCHED AND NOT JUST `42501`. That SQLSTATE is raised by RLS, by a
 * missing grant, and by this guard alike. A probe that asserted only the code once scored green
 * while actually hitting "permission denied for table probe" and never reaching the guard at
 * all. Matching the Persian message is what tells those apart.
 *
 * WHY THERE IS A DISABLE-TRIGGER TEST. The migrations are already applied to the shared test
 * database, so "sales is refused" would pass on any checkout — the trigger simply exists. A test
 * that cannot go red proves nothing. The last test switches the trigger off inside a rolled-back
 * transaction and shows the writes succeed, which is what makes the assertions above meaningful:
 * they are sensitive to the guard, not to some unrelated refusal.
 *
 * Every write here is inside `BEGIN … ROLLBACK` (rule 12) and nothing is committed.
 */
import { expect, test } from "@playwright/test";
import { inRolledBackTx, say } from "../helpers/tx";

const MESSAGE = "تغییر سقف دستی فقط با نقش مدیر یا حسابدار ممکن است";

const P1 = "00000000-0000-4000-8000-00000000f901";
const P2 = "00000000-0000-4000-8000-00000000f902";
const P3 = "00000000-0000-4000-8000-00000000f903";

/**
 * Exercises the four cases as a real sales-only actor under the real `authenticated` role.
 * `disableGuard` drops the trigger for the duration of the (rolled back) transaction.
 *
 * NOTE the RESET ROLE before every write into `probe`: that temp table belongs to the
 * connection's own role, and writing to it while switched to `authenticated` fails with 42501 —
 * the same code the guard raises. That confusion is the trap this file is built to avoid.
 */
function outcomes(disableGuard: boolean): Record<string, string> {
  const lines = inRolledBackTx(
    `
${disableGuard ? "ALTER TABLE public.customers DISABLE TRIGGER trg_customers_guard_manual_credit_floor;" : ""}

INSERT INTO public.persons (id, display_name) VALUES
  ('${P1}', 'H9 spec person 1'),
  ('${P2}', 'H9 spec person 2'),
  ('${P3}', 'H9 spec person 3');

DO $probe$
DECLARE
  _sales uuid;
  _msg   text;
  _res   text;
BEGIN
  SELECT ur.user_id INTO _sales
    FROM public.user_roles ur
   WHERE ur.role = 'sales'
     AND NOT public.has_any_role(ur.user_id, ARRAY['admin','manager','accountant']::text[])
   ORDER BY ur.user_id
   LIMIT 1;
  IF _sales IS NULL THEN
    INSERT INTO probe VALUES ('FATAL=no sales-only user exists to test with');
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _sales, 'role', 'authenticated')::text, true);

  ---------------------------------------------------------------- INSERT with a ceiling
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.customers (name, person_id, responsible_id, manual_credit_floor)
    VALUES ('H9 spec with floor', '${P1}', NULL, 777777777777);
    _res := 'ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    _res := 'REFUSED:' || _msg;
  END;
  EXECUTE 'RESET ROLE';
  ${say("'insert_with_floor=' || _res")}

  ---------------------------------------------------------------- INSERT with no ceiling
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.customers (name, person_id, responsible_id)
    VALUES ('H9 spec no floor', '${P2}', NULL);
    _res := 'ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    _res := 'REFUSED:' || _msg;
  END;
  EXECUTE 'RESET ROLE';
  ${say("'insert_no_floor=' || _res")}

  ---------------------------------------------------------------- UPDATE the ceiling
  INSERT INTO public.customers (id, name, person_id, responsible_id)
  VALUES ('00000000-0000-4000-8000-00000000f9c1', 'H9 spec target', '${P3}', NULL);

  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.customers SET manual_credit_floor = 777777777777
     WHERE id = '00000000-0000-4000-8000-00000000f9c1';
    _res := 'ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    _res := 'REFUSED:' || _msg;
  END;
  EXECUTE 'RESET ROLE';
  ${say("'update_floor=' || _res")}

  ---------------------------------------------------------------- UPDATE an unrelated column
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.customers SET notes = 'h9 spec note'
     WHERE id = '00000000-0000-4000-8000-00000000f9c1';
    _res := 'ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    _res := 'REFUSED:' || _msg;
  END;
  EXECUTE 'RESET ROLE';
  ${say("'update_notes=' || _res")}
END
$probe$;
`,
    { asAdmin: false },
  );

  const out: Record<string, string> = {};
  for (const l of lines) {
    const i = l.indexOf("=");
    if (i > 0) out[l.slice(0, i)] = l.slice(i + 1);
  }
  return out;
}

test("sales cannot CREATE a customer that already carries a credit ceiling", () => {
  const r = outcomes(false);
  expect(r["insert_with_floor"], `probe returned: ${JSON.stringify(r)}`).toBe(`REFUSED:${MESSAGE}`);
});

test("sales cannot RAISE the ceiling on an existing customer", () => {
  const r = outcomes(false);
  expect(r["update_floor"], `probe returned: ${JSON.stringify(r)}`).toBe(`REFUSED:${MESSAGE}`);
});

test("⛔ sales can still create an ordinary customer and edit ordinary fields", () => {
  // The regression half. A guard that blocks normal customer creation is worse than the hole.
  const r = outcomes(false);
  expect(r["insert_no_floor"], `probe returned: ${JSON.stringify(r)}`).toBe("ALLOWED");
  expect(r["update_notes"], `probe returned: ${JSON.stringify(r)}`).toBe("ALLOWED");
});

test("the refusals come from the guard — with the trigger off, both writes succeed", () => {
  // Without this, the three tests above would pass on any checkout, because the trigger is
  // already in the shared database. This is the red half, made reproducible.
  const r = outcomes(true);
  expect(
    r["insert_with_floor"],
    "with the guard disabled the INSERT should succeed; if it still fails, the tests above are " +
      `passing for some OTHER reason and prove nothing. Probe: ${JSON.stringify(r)}`,
  ).toBe("ALLOWED");
  expect(r["update_floor"], `probe returned: ${JSON.stringify(r)}`).toBe("ALLOWED");
});
