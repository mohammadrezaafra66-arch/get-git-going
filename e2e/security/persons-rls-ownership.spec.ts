import { expect, test } from "@playwright/test";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

/**
 * Phase 12 (a) — P1.1 / migrations 264+265.
 *
 * The critical finding of the audit: `customers` was ownership-scoped but
 * `persons` and its children were only role-scoped, so any salesperson could
 * read the mobile/email/national-id of every customer — including customers
 * the `customers` table itself withheld from them.
 *
 * Direct PostgREST with a real salesperson JWT, deliberately not through the
 * UI: the UI could hide a row that the API still returns.
 */

let adminJwt: string;
let salesJwt: string;
let salesId: string;

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  const s = await userWithRole(adminJwt, "sales");
  expect(s, "a sales user must exist").toBeTruthy();
  salesId = s!;
  salesJwt = mintJwt(salesId);
});

test.describe("persons RLS is ownership-aware", () => {
  test("a salesperson sees strictly fewer persons than an admin", async () => {
    const asAdmin = await rest<{ id: string }[]>(adminJwt, "/persons?select=id");
    const asSales = await rest<{ id: string }[]>(salesJwt, "/persons?select=id");

    expect(asAdmin.status).toBe(200);
    expect(asSales.status).toBe(200);
    expect(asAdmin.body.length).toBeGreaterThan(0);
    // The leak this closed was "salesperson sees everything".
    expect(asSales.body.length).toBeLessThan(asAdmin.body.length);
  });

  test("identifiers of an unowned customer's person are not readable", async () => {
    // Find a customer this salesperson does NOT own and that is not unassigned
    // (the policy deliberately mirrors `customers` and allows unassigned rows).
    const unowned = await rest<{ id: string; person_id: string | null }[]>(
      adminJwt,
      `/customers?select=id,person_id,responsible_id&responsible_id=not.is.null&responsible_id=neq.${salesId}&person_id=not.is.null&limit=1`,
    );
    test.skip(
      unowned.body.length === 0,
      "no customer owned by a different salesperson exists on this server",
    );

    const personId = unowned.body[0].person_id!;

    // Control: the admin can see it, so a zero below means "refused", not "absent".
    const control = await rest<unknown[]>(adminJwt, `/persons?id=eq.${personId}&select=id`);
    expect(control.body, "control: admin must see the target person").toHaveLength(1);

    const person = await rest<unknown[]>(salesJwt, `/persons?id=eq.${personId}&select=id`);
    expect(person.body, "salesperson must not read an unowned person").toHaveLength(0);

    const ids = await rest<unknown[]>(
      salesJwt,
      `/person_identifiers?person_id=eq.${personId}&select=id,kind,value_normalized`,
    );
    expect(ids.body, "salesperson must not read an unowned person's identifiers").toHaveLength(0);
  });

  test("the salesperson is not blinded: owned/unassigned persons stay visible", async () => {
    const visible = await rest<{ id: string }[]>(salesJwt, "/persons?select=id");
    // A fix that returns zero rows would also pass the leak test above; this is
    // the half of the gate that stops "secure by blindness".
    expect(visible.body.length).toBeGreaterThan(0);
  });

  test("an anonymous caller reads no persons at all", async () => {
    const anon = await rest<unknown[]>(null, "/persons?select=id");
    if (anon.status === 200) expect(anon.body).toHaveLength(0);
    else expect(anon.status).toBeGreaterThanOrEqual(400);
  });

  test("INSERT ... RETURNING still works (the 265 regression)", async () => {
    // Migration 264 broke every person-creation path: RETURNING applies the
    // SELECT policy to the new row, and can_read_person re-read `persons`,
    // which cannot see the row being inserted. 265 split the rule so the
    // policy evaluates the row's own columns.
    // Column names measured, not assumed: persons has display_name, not full_name.
    //
    // A FIXED id with merge-duplicates rather than a fresh row each run:
    // `persons` has RLS policies for SELECT/INSERT/UPDATE but NO DELETE policy,
    // so an API delete affects zero rows and still answers 204. A spec that
    // created a new person per run would therefore leak one row every run while
    // appearing to clean up. Upserting one fixed row keeps the total at one
    // forever and still exercises the RETURNING path this test is about.
    const FIXED_ID = "eeeeeeee-0000-4000-8000-0000000e2e64";
    const created = await rest<{ id: string }[]>(adminJwt, "/persons", {
      method: "POST",
      headers: { Prefer: "return=representation,resolution=merge-duplicates" },
      body: JSON.stringify({
        id: FIXED_ID,
        display_name: "E2E264 تست بازگشت (رکورد ثابت آزمون)",
        kind: "individual",
      }),
    });
    // The 264 regression made this fail with "new row violates row-level
    // security policy" — for admins too, because RETURNING re-evaluates SELECT.
    expect(created.status, created.text).toBeLessThan(300);
    expect(created.body[0]?.id).toBe(FIXED_ID);
  });
});
