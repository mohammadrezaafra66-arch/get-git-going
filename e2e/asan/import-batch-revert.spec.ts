import { expect, test } from "@playwright/test";

import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

/**
 * A-7 — a committed import batch can be reverted, as far as it is safe to revert it.
 *
 * Before migration 432 the only "undo" was `discard`, which set `status = 'discarded'` and
 * nothing else (`_app.admin.asan-import.tsx:396-398`). On a staged batch that is right —
 * nothing had been written. On a committed batch it was theatre: the persons, the customers
 * mirrors and the identifiers all stayed while the batch claimed to have been thrown away
 * (research `dual-identity-and-import-20260904.md`, F31).
 *
 * The revert is deliberately partial, and this file asserts the boundary as hard as it
 * asserts the behaviour: identifiers the batch wrote onto people who ALREADY existed are
 * revoked, and the persons the batch CREATED are counted and left alone. Deleting them
 * would be a person-delete path under another name, and `persons` has no DELETE policy.
 */

const RUN = String(Date.now()).slice(-6);
const NAME = (s: string) => `E2E-AB-REV-${RUN}-${s}`;
const NAME_LIKE = `E2E-AB-REV-${RUN}-%`;
const CODE = `78${RUN}`;
const MOBILE = `092${RUN}00`;
const LANDLINE = `021${RUN}0`;

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

type StagedRow = {
  row_number: number;
  display_name: string;
  asan_code: string | null;
  mobile_raw: string | null;
  landline_raw?: string | null;
};

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

async function acceptAll(batchId: string): Promise<void> {
  const res = await rest(
    adminJwt,
    `/asan_import_person_rows?batch_id=eq.${batchId}&classification=in.(new,update)`,
    { method: "PATCH", body: JSON.stringify({ decision: "accept" }) },
  );
  expect(res.status, res.text).toBeLessThan(300);
}

const personsNamed = () =>
  Number(dbScalar(`select count(*) from public.persons where display_name like '${NAME_LIKE}'`));

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  expect(personsNamed(), "the synthetic names are already in use — rerun").toBe(0);
});

test.afterAll(async () => {
  dbExecE2e(`
    -- E2E_AUDIT_20260729_asan_import_revert_teardown
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
  expect(personsNamed(), "test persons were left behind").toBe(0);
});

test.describe("A-7 — reverting a committed Asan person import", () => {
  test("discarding a STAGED batch is unchanged: nothing is written, nothing is reverted", async () => {
    const before = Number(dbScalar("select count(*) from public.persons"));
    const id = await stage(`QA-A7-${RUN}-staged`, [
      {
        row_number: 2,
        display_name: NAME("staged"),
        asan_code: `${CODE}9`,
        mobile_raw: `${MOBILE}9`,
      },
    ]);
    await rpc("asan_classify_person_batch", { p_batch_id: id });

    const res = await rest(adminJwt, `/asan_import_batches?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "discarded" }),
    });
    expect(res.status, res.text).toBeLessThan(300);

    expect(dbScalar(`select status from public.asan_import_batches where id = '${id}'`)).toBe(
      "discarded",
    );
    expect(Number(dbScalar("select count(*) from public.persons")), "discard wrote a person").toBe(
      before,
    );

    // A staged batch was never applied, so there is nothing to revert and the RPC says so
    // rather than pretending.
    const bad = await rest(adminJwt, "/rpc/asan_revert_person_batch", {
      method: "POST",
      body: JSON.stringify({ p_batch_id: id }),
    });
    expect(bad.status, "a non-committed batch was accepted for revert").toBeGreaterThanOrEqual(400);
    expect(bad.text).toContain("ثبت نهایی شده است بازگردانده می‌شود");
  });

  test("a revert undoes what the batch added to an existing person, and says what it cannot undo", async () => {
    // ---- batch 1 creates the person -------------------------------------------------
    const first = await stage(`QA-A7-${RUN}-create`, [
      { row_number: 2, display_name: NAME("person"), asan_code: CODE, mobile_raw: MOBILE },
    ]);
    await rpc("asan_classify_person_batch", { p_batch_id: first });
    await acceptAll(first);
    expect(
      (await rpc<{ created: number }>("asan_commit_person_batch", { p_batch_id: first })).created,
    ).toBe(1);

    const personId = dbScalar(
      `select id from public.persons where display_name = '${NAME("person")}'`,
    );
    expect(personId).toBeTruthy();

    // ---- batch 2 only ADDS to that person -------------------------------------------
    // A different name forces `update` rather than `unchanged`; the commit never rewrites
    // a display name, so the person keeps theirs.
    const second = await stage(`QA-A7-${RUN}-augment`, [
      {
        row_number: 2,
        display_name: NAME("person-asan-spelling"),
        asan_code: CODE,
        mobile_raw: MOBILE,
        landline_raw: LANDLINE,
      },
    ]);
    await rpc("asan_classify_person_batch", { p_batch_id: second });
    expect(
      dbScalar(
        `select classification from public.asan_import_person_rows where batch_id = '${second}'`,
      ),
      "the probe needs batch 2 to be an update of the same person",
    ).toBe("update");
    await acceptAll(second);
    const r2 = await rpc<{ created: number; updated: number }>("asan_commit_person_batch", {
      p_batch_id: second,
    });
    expect(r2.updated).toBe(1);
    expect(r2.created).toBe(0);

    const landlines = () =>
      Number(
        dbScalar(
          `select count(*) from public.person_identifiers
            where person_id = '${personId}' and kind = 'landline' and status <> 'revoked'`,
        ),
      );
    expect(landlines(), "batch 2 did not add the landline it was supposed to add").toBe(1);

    // ---- revert batch 2 --------------------------------------------------------------
    const rev = await rpc<{
      revoked_identifiers: number;
      persons_created_remaining: number;
      customers_created_remaining: number;
    }>("asan_revert_person_batch", { p_batch_id: second });

    expect(rev.revoked_identifiers, "the added landline was not revoked").toBe(1);
    expect(rev.persons_created_remaining, "batch 2 created nobody").toBe(0);
    expect(landlines(), "the landline is still active after a revert").toBe(0);

    // Nothing else was touched: the person, their Asan code and their mobile all survive.
    expect(personsNamed(), "the revert removed a person").toBe(1);
    expect(
      Number(
        dbScalar(
          `select count(*) from public.person_identifiers
            where person_id = '${personId}' and kind in ('asan_person_code','mobile_e164')
              and status <> 'revoked'`,
        ),
      ),
      "the revert stripped identifiers it did not write",
    ).toBe(2);

    expect(
      dbScalar(`select status from public.asan_import_batches where id = '${second}'`),
      "a reverted batch must not be indistinguishable from a discarded one",
    ).toBe("reverted");
    expect(
      Number(
        dbScalar(
          `select count(*) from public.audit_logs
            where action = 'asan_persons_import_reverted' and entity_id = '${second}'`,
        ),
      ),
      "the revert was not audited",
    ).toBe(1);

    // ---- reverting batch 1 reports the boundary instead of crossing it ---------------
    const rev1 = await rpc<{
      revoked_identifiers: number;
      persons_created_remaining: number;
      customers_created_remaining: number;
    }>("asan_revert_person_batch", { p_batch_id: first });

    expect(
      rev1.revoked_identifiers,
      "a revert must not strip the identifiers of a person it cannot delete",
    ).toBe(0);
    expect(rev1.persons_created_remaining, "the created person was not reported").toBe(1);
    expect(rev1.customers_created_remaining, "the created customers mirror was not reported").toBe(
      1,
    );
    expect(personsNamed(), "a revert deleted a person").toBe(1);
    expect(
      Number(
        dbScalar(
          `select count(*) from public.person_identifiers
            where person_id = '${personId}' and status <> 'revoked'`,
        ),
      ),
      "the created person lost identifiers a revert cannot replace",
    ).toBe(2);
  });
});
