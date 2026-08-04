import { expect, test } from "@playwright/test";
import { dbRows, dbScalar } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

/**
 * ASAN M3.2 / migration 284 — phones are stored canonically, and a collision is
 * queued rather than merged.
 *
 * Everything here goes through PostgREST with a real JWT. The point of putting
 * normalization in a trigger rather than an RPC is that a direct `PATCH` cannot
 * dodge it (rule 2.5), so the test has to be the thing that tries to dodge it.
 *
 * Canonical mobile form is `09XXXXXXXXX`. Note the deliberate exception:
 * `person_identifiers.value_normalized` for `kind='mobile_e164'` stays `+989…`,
 * because the identity model's contract is E.164 and the kind is named after it.
 */

const TAG = `QA-M32-${Date.now().toString(36)}`;
let adminJwt: string;
const created: string[] = [];

test.beforeAll(() => {
  adminJwt = mintJwt(ADMIN_USER_ID);
});

test.afterAll(async () => {
  // create, assert, remove — within one phase (rule 2.10). Deletes go through PostgREST
  // because e2e/helpers/db.ts refuses anything that is not a SELECT.
  for (const id of created) {
    await rest(adminJwt, `/visitors?id=eq.${id}`, { method: "DELETE" });
  }
});

test.describe("M3.2 — phone normalization is enforced at the database", () => {
  test("every format from the research frequency table normalizes to 09XXXXXXXXX", async () => {
    const cases: [string, string][] = [
      ["09123740712", "09123740712"], // already canonical
      ["9123740712", "09123740712"], // missing leading zero
      ["+989123740712", "09123740712"], // E.164
      ["00989123740712", "09123740712"], // international 00
      ["0912 374 0712", "09123740712"], // spaces
      ["0912-374-0712", "09123740712"], // dashes
      ["(0912)3740712", "09123740712"], // parentheses
      ["۰۹۱۲۳۷۴۰۷۱۲", "09123740712"], // Persian digits
      ["٠٩١٢٣٧٤٠٧١٢", "09123740712"], // Arabic-Indic digits
    ];
    for (const [input, want] of cases) {
      const got = dbScalar(
        `select public.normalize_phone_local(${JSON.stringify(input).replace(/"/g, "'")})`,
      );
      expect(got, `${input} should normalize to ${want}`).toBe(want);
    }
  });

  test("a landline keeps its area code and is not forced into the mobile shape", async () => {
    expect(dbScalar(`select public.normalize_phone_local('021 3344 5566')`)).toBe("02133445566");
    expect(dbScalar(`select public.normalize_phone_local('۰۲۱۳۳۴۴۵۵۶۶')`)).toBe("02133445566");
  });

  test("an unparseable value is returned untouched rather than rejected", async () => {
    // A phone column must never abort a sales quote or a payment receipt.
    expect(dbScalar(`select public.normalize_phone_local('not a phone')`)).toBe("not a phone");
  });

  test("a direct PostgREST INSERT is normalized by the trigger", async () => {
    const res = await rest<{ id: string; phone: string }[]>(adminJwt, "/visitors", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ full_name: `${TAG}-a`, phone: " ۰۹۱۲۳۳۳۴۴۵۵ " }),
    });
    expect(res.status, res.text).toBe(201);
    created.push(res.body[0].id);
    expect(res.body[0].phone).toBe("09123334455");
  });

  test("a direct PostgREST PATCH is normalized too", async () => {
    const id = created[0];
    expect(id, "the INSERT test must run first").toBeTruthy();
    const res = await rest<{ phone: string }[]>(adminJwt, `/visitors?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ phone: "+989127778899" }),
    });
    expect(res.status, res.text).toBeLessThan(300);
    expect(res.body[0].phone).toBe("09127778899");
  });

  test("a collision is queued, both rows survive, and nothing is merged", async () => {
    const before = Number(dbScalar("select count(*) from public.visitors"));

    const res = await rest<{ id: string; phone: string }[]>(adminJwt, "/visitors", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ full_name: `${TAG}-b`, phone: "0912-777-8899" }),
    });
    expect(res.status, "a colliding write must be accepted, not refused").toBe(201);
    created.push(res.body[0].id);
    expect(res.body[0].phone).toBe("09127778899");

    const after = Number(dbScalar("select count(*) from public.visitors"));
    expect(after, "a row was merged away").toBe(before + 1);

    dbScalar("select public.detect_phone_collisions()");
    expect(
      dbScalar(
        `select count(*) from public.phone_collisions
          where normalized_phone = '09127778899' and status = 'pending'`,
      ),
      "the collision was not queued",
    ).toBe("1");

    // Clean up this test's own data. It has to go through PostgREST: e2e/helpers/db.ts is
    // deliberately read-only, so a DELETE handed to dbScalar is silently refused and the
    // row survives to poison the next test.
    await rest(adminJwt, "/phone_collisions?normalized_phone=eq.09127778899", {
      method: "DELETE",
    });
    for (const id of created) {
      await rest(adminJwt, `/visitors?id=eq.${id}`, { method: "DELETE" });
    }
    created.length = 0;

    // count rows, never trust the 204 — API DELETE no-ops silently without a policy (rule 2.5)
    expect(
      dbScalar(`select count(*) from public.visitors where full_name like '${TAG}%'`),
      "test visitors were left behind",
    ).toBe("0");
    expect(
      dbScalar(
        `select count(*) from public.phone_collisions where normalized_phone = '09127778899'`,
      ),
      "the test's collision row was left behind",
    ).toBe("0");
  });

  test("the three collisions the research predicted are queued", async () => {
    // R2.4 measured exactly these three, and nothing was merged to make them go away.
    const rows = dbRows(`
      select normalized_phone from public.phone_collisions
       where status = 'pending' order by normalized_phone
    `);
    expect(rows).toEqual(["09026009898", "09122270261", "09903858654"]);
  });

  test("person_identifiers keeps its E.164 contract — this phase did not touch it", async () => {
    const bad = dbScalar(`
      select count(*) from public.person_identifiers
       where kind = 'mobile_e164' and value_normalized !~ '^\\+989[0-9]{9}$'
    `);
    expect(bad, "a mobile identifier lost its E.164 form").toBe("0");
  });

  test("a viewer-only account cannot read the collision queue", async () => {
    const viewer = dbRows(`
      select ur.user_id::text from public.user_roles ur
       where ur.role = 'viewer'
         and not exists (select 1 from public.user_roles o
                          where o.user_id = ur.user_id and o.role <> 'viewer')
       limit 1
    `);
    expect(viewer.length, "no viewer-only account on this server").toBeGreaterThan(0);
    const res = await rest<unknown[]>(mintJwt(viewer[0]), "/phone_collisions?select=*");
    expect(Array.isArray(res.body) ? res.body.length : 0, "the queue leaked to a viewer").toBe(0);
  });
});
