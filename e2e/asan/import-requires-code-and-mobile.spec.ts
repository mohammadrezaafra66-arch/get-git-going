import { expect, test } from "@playwright/test";

import { dbRows, dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

/**
 * A-1 / A-2 / A-3 — a person imported from Asan always arrives with an Asan code
 * and a mobile number, and importing the same file twice never creates a second
 * copy of anybody.
 *
 * Driven through PostgREST and the RPCs rather than the browser, deliberately.
 * The import page's own docstring says "every rule that matters lives in the
 * database, not here" (`_app.admin.asan-import.tsx:40-46`), so the honest test is
 * the one that bypasses the page entirely and tries to make the database accept
 * what the page would not offer.
 *
 * Measured before the fix existed (research `dual-identity-and-import-20260904.md`):
 *   * F13 — the Asan code is required at ZERO of three layers; a blank cell yields
 *     NULL, `IF _code IS NOT NULL` is false, and the identifier is silently not
 *     written while the person and the `customers` mirror are created anyway.
 *   * F14 — the mobile is required at ZERO of three layers, by the identical path.
 *   * F21 — idempotency is keyed on identifiers, and classification is a snapshot
 *     taken before the commit loop runs. Two batches staged from the same file and
 *     classified before either is committed both say `new`, so committing both
 *     creates the person twice; two rows of ONE batch carrying the same code do the
 *     same thing, and the second person then gets no identifier at all because the
 *     `WHERE NOT EXISTS` guard suppresses the duplicate insert.
 */

/** Unique per run: an Asan code and a mobile are globally unique in this schema. */
const RUN = String(Date.now()).slice(-6);
const NAME = (s: string) => `E2E-AB-IMP-${RUN}-${s}`;
/** Digits only, no leading zero — `normalize_identifier` strips those. */
const CODE = (n: number) => `77${RUN}${n}`;
/** `^09\d{9}$`, the only shape `normalize_identifier('mobile_e164', …)` accepts. */
const MOBILE = (n: number) => `091${RUN}0${n}`;

const NAME_LIKE = `E2E-AB-IMP-${RUN}-%`;

/** The exact strings the contract fixes for this feature. */
const MSG_CODE = (row: number) => `ردیف ${row}: کد حساب آسان الزامی است؛ این ردیف وارد نشد.`;
const MSG_MOBILE = (row: number) => `ردیف ${row}: شماره موبایل الزامی است؛ این ردیف وارد نشد.`;
const MSG_BOTH = (row: number) =>
  `ردیف ${row}: کد حساب آسان و شماره موبایل هر دو الزامی‌اند؛ این ردیف وارد نشد.`;
const MSG_SUMMARY = (n: number) => `${n} ردیف به دلیل نداشتن کد آسان یا شماره موبایل وارد نشد.`;

type StagedRow = {
  row_number: number;
  display_name: string;
  asan_code: string | null;
  mobile_raw: string | null;
};

type CommitResult = {
  created: number;
  updated: number;
  skipped: number;
  rejected?: number;
  rejections?: string[];
  summary?: string | null;
};

let adminJwt: string;
const batchIds: string[] = [];

async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await rest<T>(adminJwt, `/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  expect(res.status, `${name}: ${res.text}`).toBeLessThan(300);
  return res.body;
}

async function stage(fileName: string, rows: StagedRow[]): Promise<string> {
  const batch = await rest<{ id: string }[]>(adminJwt, "/asan_import_batches", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      kind: "persons",
      file_name: fileName,
      row_count: rows.length,
      created_by: ADMIN_USER_ID,
    }),
  });
  expect(batch.status, batch.text).toBe(201);
  const id = batch.body[0].id;
  batchIds.push(id);

  const res = await rest(adminJwt, "/asan_import_person_rows", {
    method: "POST",
    body: JSON.stringify(rows.map((r) => ({ ...r, batch_id: id }))),
  });
  expect(res.status, res.text).toBeLessThan(300);
  return id;
}

/** Accept everything the guard trigger permits — `conflict` is never offered. */
async function acceptAll(batchId: string): Promise<void> {
  const res = await rest(
    adminJwt,
    `/asan_import_person_rows?batch_id=eq.${batchId}&classification=in.(new,update)`,
    { method: "PATCH", body: JSON.stringify({ decision: "accept" }) },
  );
  expect(res.status, res.text).toBeLessThan(300);
}

const personsNamed = (like: string) =>
  Number(dbScalar(`select count(*) from public.persons where display_name like '${like}'`));

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  // A collision with real data would make every assertion below meaningless.
  expect(
    Number(
      dbScalar(
        `select count(*) from public.person_identifiers
          where kind = 'asan_person_code' and value_normalized like '77${RUN}%'`,
      ),
    ),
    "the synthetic Asan codes are already in use — rerun",
  ).toBe(0);
  expect(personsNamed(NAME_LIKE), "the synthetic names are already in use — rerun").toBe(0);
});

test.afterAll(async () => {
  // Create, assert, remove. `persons` has no DELETE policy, so teardown goes through
  // the sanctioned write helper; the role tables are cleared first because
  // `customers_person_id_fkey` is RESTRICT and a throwing teardown strands the fixture.
  dbExecE2e(`
    -- E2E_AUDIT_20260729_asan_import_enforcement_teardown
    delete from public.suppliers
     where person_id in (select id from public.persons where display_name like '${NAME_LIKE}');
    delete from public.customers
     where person_id in (select id from public.persons where display_name like '${NAME_LIKE}');
    delete from public.person_identifiers
     where person_id in (select id from public.persons where display_name like '${NAME_LIKE}');
    delete from public.persons where display_name like '${NAME_LIKE}';
  `);
  for (const id of batchIds) {
    await rest(adminJwt, `/asan_import_batches?id=eq.${id}`, { method: "DELETE" });
  }
  expect(personsNamed(NAME_LIKE), "test persons were left behind").toBe(0);
});

test.describe("A-1/A-2 — the commit RPC refuses a row without an Asan code or a mobile", () => {
  test("a row missing either identifier is rejected, counted, and named", async () => {
    const rows: StagedRow[] = [
      { row_number: 2, display_name: NAME("ok"), asan_code: CODE(1), mobile_raw: MOBILE(1) },
      { row_number: 3, display_name: NAME("no-mobile"), asan_code: CODE(2), mobile_raw: null },
      { row_number: 4, display_name: NAME("no-code"), asan_code: null, mobile_raw: MOBILE(3) },
      { row_number: 5, display_name: NAME("neither"), asan_code: null, mobile_raw: null },
    ];
    const id = await stage(`QA-A1A2-${RUN}-enforce`, rows);
    await rpc("asan_classify_person_batch", { p_batch_id: id });
    await acceptAll(id);

    const result = await rpc<CommitResult>("asan_commit_person_batch", { p_batch_id: id });

    expect(result.created, "only the complete row may be imported").toBe(1);
    expect(result.rejected, "the incomplete rows were not counted as rejected").toBe(3);
    expect(result.rejections, "the RPC returned no per-row reasons").toEqual(
      expect.arrayContaining([MSG_MOBILE(3), MSG_CODE(4), MSG_BOTH(5)]),
    );
    expect(result.summary, "the batch summary string is missing").toBe(MSG_SUMMARY(3));

    // The counter the contract names must move too, not only the new one.
    expect(result.skipped, "a rejected row must not be silently skipped").toBeGreaterThanOrEqual(3);

    // The batch header carries the same numbers, so a reload still shows them.
    expect(
      dbScalar(`select stats->>'rejected' from public.asan_import_batches where id = '${id}'`),
      "stats did not record the rejections",
    ).toBe("3");

    // The rule, not the message: no person, and no customers mirror, for the bad rows.
    expect(personsNamed(`E2E-AB-IMP-${RUN}-no-%`), "an incomplete row created a person").toBe(0);
    expect(personsNamed(`E2E-AB-IMP-${RUN}-neither`), "an incomplete row created a person").toBe(0);
    expect(personsNamed(NAME_LIKE), "exactly one person should exist").toBe(1);
    expect(
      Number(
        dbScalar(
          `select count(*) from public.customers c
             join public.persons p on p.id = c.person_id
            where p.display_name like '${NAME_LIKE}'`,
        ),
      ),
      "an incomplete row created a customers mirror",
    ).toBe(1);

    // The reason is stored on the row, so the page can show it after a reload.
    expect(
      dbRows(
        `select apply_note from public.asan_import_person_rows
          where batch_id = '${id}' and apply_note is not null order by row_number`,
      ).length,
      "the rejection reason was not written back to the staged row",
    ).toBe(3);

    // And the complete row really did arrive with both identifiers.
    expect(
      Number(
        dbScalar(
          `select count(*) from public.person_identifiers pi
             join public.persons p on p.id = pi.person_id
            where p.display_name = '${NAME("ok")}'
              and pi.kind in ('asan_person_code','mobile_e164') and pi.status <> 'revoked'`,
        ),
      ),
      "the imported person is missing an identifier",
    ).toBe(2);
  });
});

test.describe("A-3 — a second import never creates a second copy", () => {
  test("two batches staged from the same file, both classified before either commits", async () => {
    const row: StagedRow = {
      row_number: 2,
      display_name: NAME("twice"),
      asan_code: CODE(7),
      mobile_raw: MOBILE(7),
    };

    const first = await stage(`QA-A3-${RUN}-first`, [row]);
    await rpc("asan_classify_person_batch", { p_batch_id: first });

    // Classified BEFORE the first batch is committed — this is the leak. Both batches
    // hold `classification = 'new'` and neither knows about the other.
    const second = await stage(`QA-A3-${RUN}-second`, [row]);
    await rpc("asan_classify_person_batch", { p_batch_id: second });
    expect(
      dbScalar(
        `select classification from public.asan_import_person_rows where batch_id = '${second}'`,
      ),
      "the second batch was expected to be classified as new — the probe is not set up",
    ).toBe("new");

    await acceptAll(first);
    const r1 = await rpc<CommitResult>("asan_commit_person_batch", { p_batch_id: first });
    expect(r1.created).toBe(1);

    await acceptAll(second);
    const r2 = await rpc<CommitResult>("asan_commit_person_batch", { p_batch_id: second });

    expect(r2.created, "the re-import created a second person").toBe(0);
    expect(personsNamed(`E2E-AB-IMP-${RUN}-twice`), "the person exists twice").toBe(1);
    expect(
      Number(
        dbScalar(
          `select count(*) from public.customers c
             join public.persons p on p.id = c.person_id
            where p.display_name = '${NAME("twice")}'`,
        ),
      ),
      "a second customers mirror was created",
    ).toBe(1);
  });

  test("two rows of ONE batch carrying the same Asan code produce one person", async () => {
    const rows: StagedRow[] = [
      { row_number: 2, display_name: NAME("same-a"), asan_code: CODE(8), mobile_raw: MOBILE(8) },
      { row_number: 3, display_name: NAME("same-b"), asan_code: CODE(8), mobile_raw: MOBILE(8) },
    ];
    const id = await stage(`QA-A3-${RUN}-intra`, rows);
    await rpc("asan_classify_person_batch", { p_batch_id: id });
    await acceptAll(id);

    const result = await rpc<CommitResult>("asan_commit_person_batch", { p_batch_id: id });

    expect(result.created, "one Asan code produced two persons").toBe(1);
    expect(personsNamed(`E2E-AB-IMP-${RUN}-same-%`), "one Asan code produced two persons").toBe(1);
    // The second row must not leave behind a person with no Asan code — that is exactly
    // the invariant A-1 exists to protect, defeated from inside a single file.
    expect(
      Number(
        dbScalar(
          `select count(*) from public.persons p
            where p.display_name like 'E2E-AB-IMP-${RUN}-same-%'
              and not exists (select 1 from public.person_identifiers pi
                               where pi.person_id = p.id and pi.kind = 'asan_person_code'
                                 and pi.status <> 'revoked')`,
        ),
      ),
      "a person was imported without an Asan code",
    ).toBe(0);
  });
});
