import { expect, test } from "@playwright/test";
import fs from "node:fs";
import * as XLSX from "xlsx";
import { parseAsanPersons } from "../../src/lib/asan/parse-persons";
import { dbRows, dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

/**
 * ASAN M3.3 — importing persons from Asan, staged and approved rather than
 * written row by row.
 *
 * Driven through PostgREST and the RPCs rather than the browser, for the same
 * reason as the rest of this suite: the rules that matter (a conflict can never
 * be applied; an update never overwrites a non-empty value) live in the database
 * precisely so that no client can dodge them, so the test has to try to dodge
 * them.
 *
 * The real 488-account export is used, not a fixture. A fixture would prove the
 * parser reads a file I wrote; the real file proves it reads the owner's.
 */

/**
 * ⛔ THIS FILE NO LONGER EXISTS.
 *
 * `docs/asan/reference/اشخاص.xlsx` — the owner's real 488-account export — was removed from the
 * repository by owner decision on 2026-08-08. The path is kept here rather than deleted so that
 * restoring a fixture is a one-line change instead of an archaeology exercise.
 *
 * Five tests below are consequently skipped, and this is a KNOWN AND ACCEPTED LOSS OF COVERAGE,
 * not a hidden regression: nothing now proves that the parser reads the owner's real workbook,
 * that header-driven mapping survives a shuffled column order, or that the stage → classify →
 * commit chain works end to end on real data. The database-side guards those tests exercised are
 * still enforced by the triggers and RPCs in migration 285; what is gone is the proof that they
 * hold against the real file.
 *
 * The tests that do NOT need the workbook are deliberately left running: RLS on the staging
 * tables, the role wiring, the permission rows, and the whole /admin/asan-import route suite.
 *
 * To restore coverage: put a persons export back at this path and delete the `test.skip` lines.
 */
const WORKBOOK = "docs/asan/reference/اشخاص.xlsx";

/** Shown in the Playwright report for every test skipped by the removal above. */
const FIXTURE_REMOVED =
  "needs docs/asan/reference/اشخاص.xlsx, removed by owner decision 2026-08-08 — coverage gap is accepted, see the note at the top of this file";

let adminJwt: string;
let batchId: string | null = null;

function readMatrix(path: string): unknown[][] {
  const wb = XLSX.read(fs.readFileSync(path), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null });
}

/**
 * The classify/commit RPCs are SECURITY DEFINER and gate on
 * `has_any_role(auth.uid(), ...)`, so they must be called with a JWT. Running them through
 * psql fails with `forbidden` — which is the guard working, not a bug.
 */
async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await rest<T>(adminJwt, `/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  expect(res.status, `${name}: ${res.text}`).toBeLessThan(300);
  return res.body;
}

async function stage(fileName: string) {
  const parsed = parseAsanPersons(readMatrix(WORKBOOK));
  const batch = await rest<{ id: string }[]>(adminJwt, "/asan_import_batches", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      kind: "persons",
      file_name: fileName,
      row_count: parsed.rows.length,
      created_by: ADMIN_USER_ID,
    }),
  });
  expect(batch.status, batch.text).toBe(201);
  const id = batch.body[0].id;

  // batched insert: 488 rows in one request per chunk, not 488 requests
  for (let i = 0; i < parsed.rows.length; i += 200) {
    const chunk = parsed.rows.slice(i, i + 200).map((r) => ({ ...r, batch_id: id }));
    const res = await rest(adminJwt, "/asan_import_person_rows", {
      method: "POST",
      body: JSON.stringify(chunk),
    });
    expect(res.status, res.text).toBeLessThan(300);
  }
  return { id, parsed };
}

test.beforeAll(() => {
  adminJwt = mintJwt(ADMIN_USER_ID);
});

test.afterAll(async () => {
  // create, assert, remove — rows cascade with the batch (rule 2.10)
  const ids = dbRows(
    `select id::text from public.asan_import_batches where file_name like 'QA-M33-%'`,
  );
  for (const id of ids) {
    await rest(adminJwt, `/asan_import_batches?id=eq.${id}`, { method: "DELETE" });
  }
});

test.describe("M3.3 — Asan person import", () => {
  test("the workbook parses by header text into 488 rows", async () => {
    test.skip(true, FIXTURE_REMOVED);
    const parsed = parseAsanPersons(readMatrix(WORKBOOK));
    expect(parsed.rows.length, "the owner's export has 488 accounts").toBe(488);
    // every mapping resolved by NAME, so column order is irrelevant
    expect(parsed.mapping.asan_code).toBeTruthy();
    expect(parsed.mapping.display_name).toBeTruthy();
    expect(parsed.mapping.mobile).toBeTruthy();
    expect(parsed.rows[0].asan_code).toMatch(/^\d+$/);
    expect(
      parsed.rows.every((r) => r.asan_code),
      "every row carries an Asan code",
    ).toBe(true);
  });

  test("a shuffled column order parses identically — proving header-driven mapping", async () => {
    test.skip(true, FIXTURE_REMOVED);
    const matrix = readMatrix(WORKBOOK);
    const straight = parseAsanPersons(matrix);
    // reverse every row, header included: positions change, names do not
    const shuffled = parseAsanPersons(matrix.map((row) => [...row].reverse()));
    expect(shuffled.rows.length).toBe(straight.rows.length);
    expect(shuffled.rows[0].asan_code).toBe(straight.rows[0].asan_code);
    expect(shuffled.rows[0].display_name).toBe(straight.rows[0].display_name);
    expect(shuffled.rows[10].mobile_raw).toBe(straight.rows[10].mobile_raw);
  });

  test("staging then classifying matches what the research measured", async () => {
    test.skip(true, FIXTURE_REMOVED);
    const { id } = await stage("QA-M33-first");
    batchId = id;

    expect(
      dbScalar(`select count(*) from public.asan_import_person_rows where batch_id='${id}'`),
    ).toBe("488");

    const stats = await rpc<Record<string, number>>("asan_classify_person_batch", {
      p_batch_id: id,
    });
    expect(stats, "classification returned nothing").toBeTruthy();

    // R2.6 measured 5 matches by Asan code. Those are the rows that must classify as
    // update/unchanged rather than new.
    const byCode = dbScalar(`
      select count(*) from public.asan_import_person_rows
       where batch_id = '${id}' and match_reason = 'asan_code'
    `);
    expect(byCode, "expected the 5 code matches research measured").toBe("5");

    const newRows = Number(
      dbScalar(
        `select count(*) from public.asan_import_person_rows where batch_id='${id}' and classification='new'`,
      ),
    );
    const conflicts = Number(
      dbScalar(
        `select count(*) from public.asan_import_person_rows where batch_id='${id}' and classification='conflict'`,
      ),
    );
    // 488 accounts against 70 persons: the overwhelming majority are genuinely new
    expect(newRows).toBeGreaterThan(400);
    expect(newRows + conflicts).toBeLessThanOrEqual(488);
  });

  test("a conflict row cannot be accepted, even by a direct PostgREST PATCH", async () => {
    // Skipped only because it needs a staged batch, which needs the removed workbook. The guard
    // itself is a trigger from migration 285 and is still enforced in the database.
    test.skip(true, FIXTURE_REMOVED);
    expect(batchId, "the staging test must run first").toBeTruthy();

    // The conflict is constructed rather than looked up. Whether the real workbook happens to
    // produce a conflict depends on what is already in the database, and a guard that is only
    // exercised when the data cooperates is a guard that is not tested.
    const made = await rest<{ id: string }[]>(adminJwt, "/asan_import_person_rows", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        batch_id: batchId,
        row_number: 99999,
        asan_code: "999999999",
        display_name: "QA-M33-conflict",
        classification: "conflict",
        conflict_reason: "constructed by the test",
      }),
    });
    expect(made.status, made.text).toBe(201);
    const id = made.body[0].id;

    const res = await rest(adminJwt, `/asan_import_person_rows?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ decision: "accept" }),
    });
    expect(
      res.status,
      "the guard trigger did not refuse accepting a conflict",
    ).toBeGreaterThanOrEqual(400);

    // count, never trust the status — the row must still be pending
    expect(
      dbScalar(`select decision from public.asan_import_person_rows where id='${id}'`),
      "the decision was stored anyway",
    ).toBe("pending");

    await rest(adminJwt, `/asan_import_person_rows?id=eq.${id}`, { method: "DELETE" });
  });

  test("committing applies only accepted rows, and re-importing changes nothing", async () => {
    test.skip(true, FIXTURE_REMOVED);
    expect(batchId, "the staging test must run first").toBeTruthy();

    const personsBefore = Number(dbScalar("select count(*) from public.persons"));

    // accept a small, explicit slice: three `new` rows
    const toAccept = dbRows(`
      select id::text from public.asan_import_person_rows
       where batch_id = '${batchId}' and classification = 'new' order by row_number limit 3
    `);
    expect(toAccept.length).toBe(3);
    for (const id of toAccept) {
      const res = await rest(adminJwt, `/asan_import_person_rows?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision: "accept" }),
      });
      expect(res.status, res.text).toBeLessThan(300);
    }

    const result = await rpc<{ created: number; updated: number }>("asan_commit_person_batch", {
      p_batch_id: batchId,
    });
    expect(result.created, "exactly the three accepted rows should be created").toBe(3);

    const personsAfter = Number(dbScalar("select count(*) from public.persons"));
    expect(personsAfter, "exactly the accepted rows were created").toBe(personsBefore + 3);

    // ---- idempotency: stage the same file again, accept nothing new ----
    const second = await stage("QA-M33-second");
    await rpc("asan_classify_person_batch", { p_batch_id: second.id });

    // the three just-created accounts must now match by Asan code, not read as new
    const nowMatched = Number(
      dbScalar(`
        select count(*) from public.asan_import_person_rows
         where batch_id = '${second.id}' and match_reason = 'asan_code'
      `),
    );
    expect(nowMatched, "a re-import did not recognise what it had just created").toBe(5 + 3);

    // committing the second batch with no acceptances must change nothing at all
    const before2 = Number(dbScalar("select count(*) from public.persons"));
    const result2 = await rpc<{ created: number; updated: number }>("asan_commit_person_batch", {
      p_batch_id: second.id,
    });
    expect(result2.created, "a re-import created rows").toBe(0);
    expect(result2.updated, "a re-import updated rows").toBe(0);
    expect(
      Number(dbScalar("select count(*) from public.persons")),
      "a re-import created rows",
    ).toBe(before2);

    // ---- clean up the persons this test created ----
    // `persons` deliberately has NO DELETE policy, so an API delete returns 204 and removes
    // nothing (rule 2.5). Teardown therefore goes through the sanctioned e2e write helper,
    // which is the only path in this suite allowed to write, and which refuses any SQL
    // without an E2E marker.
    const createdIds = dbRows(`
      select matched_person_id::text from public.asan_import_person_rows
       where batch_id = '${batchId}' and applied_at is not null and matched_person_id is not null
    `);
    expect(createdIds.length, "the commit did not record which persons it created").toBe(3);
    // OG-46's writing half, completed 2026-08-26. This teardown used to delete
    // `person_identifiers` and then `persons`, and on 2026-08-26 it died with
    //
    //   ERROR: update or delete on table "persons" violates foreign key constraint
    //          "suppliers_person_id_fkey" on table "suppliers"
    //
    // A teardown that throws leaves its whole fixture behind, and the residue then moves other
    // specs' baselines — that one FK is the traceable head of seven failures in that run,
    // including two that read `asan_export_numbers`' high-water mark and got a number lower
    // than the mark they had just captured.
    //
    // The role tables are cleared FIRST, and scoped to exactly the person ids this test created
    // — never by marker or name. A broader predicate here would delete another spec's data, or
    // the owner's, which is the opposite of the problem being fixed.
    const idList = createdIds.map((i) => `'${i}'`).join(",");
    dbExecE2e(`
      -- E2E_AUDIT_20260729_asan_m33_teardown
      delete from public.suppliers where person_id in (${idList});
      delete from public.customers where person_id in (${idList});
      delete from public.person_identifiers where person_id in (${idList});
      delete from public.persons where id in (${idList});
    `);
    expect(
      Number(dbScalar("select count(*) from public.persons")),
      "test persons were left behind",
    ).toBe(personsBefore);
  });

  test("a viewer-only account cannot read the staging tables", async () => {
    const viewer = dbRows(`
      select ur.user_id::text from public.user_roles ur
       where ur.role = 'viewer'
         and not exists (select 1 from public.user_roles o
                          where o.user_id = ur.user_id and o.role <> 'viewer')
       limit 1
    `);
    expect(viewer.length).toBeGreaterThan(0);
    const jwt = mintJwt(viewer[0]);
    for (const table of ["asan_import_batches", "asan_import_person_rows"]) {
      const res = await rest<unknown[]>(jwt, `/${table}?select=*`);
      expect(Array.isArray(res.body) ? res.body.length : 0, `${table} leaked to a viewer`).toBe(0);
    }
  });

  test("the route and the registry are wired to the same two roles", () => {
    // Source-level tripwires, in the style of `emergency-admin-dormant.spec.ts`: the
    // browser cases below prove the guard *works*, these prove nobody quietly widened
    // it later. `adminOnly` is called out because it is the obvious-looking flag and
    // the wrong one — it means "admin or manager", which would hide the page from the
    // accountant it is built for and show it to a manager the backend refuses.
    const route = fs.readFileSync("src/routes/_app.admin.asan-import.tsx", "utf8");
    expect(route, "the route guard no longer names admin+accountant").toContain(
      'requireAnyRole(["admin", "accountant"])',
    );

    const registry = fs.readFileSync("src/lib/navigation/registry.ts", "utf8");
    expect(registry, "the navigation entry lost its role allowlist").toContain(
      '"/admin/asan-import": ["admin", "accountant"]',
    );
    expect(registry, "the navigation entry is not keyed on the asan-import module").toContain(
      'module: "asan-import"',
    );

    // The static PERMISSIONS matrix is only the fallback for when the dynamic cache
    // has not loaded, but a fallback that disagrees with `role_permissions` is how a
    // menu ends up offering something the backend refuses.
    const roles = fs.readFileSync("src/lib/rbac/roles.ts", "utf8");
    expect(roles, "asan-import is missing from the static permission matrix").toMatch(
      /"asan-import":\s*\{\s*view:\s*\["admin",\s*"accountant"\]/,
    );
  });

  test("every role has an explicit asan-import permission row", async () => {
    // rule 2.5: a module with no row is open to everyone via the fallback
    const roles = Number(dbScalar("select count(distinct role_name) from public.role_permissions"));
    const seeded = Number(
      dbScalar("select count(*) from public.role_permissions where module = 'asan-import'"),
    );
    expect(seeded, "asan-import is not seeded for every role").toBe(roles);
    expect(
      dbRows(`
        select role_name from public.role_permissions
         where module = 'asan-import' and can_view order by role_name
      `),
    ).toEqual(["accountant", "admin"]);
  });
});

/**
 * The admin route itself, in a real browser.
 *
 * These four cases are the only part of this suite that needs the deployed build,
 * because the page is the thing under test. They assert what the *page* does; the
 * rules it depends on are asserted above at the layer that enforces them.
 */
const PAGE_TITLE = "ورود اطلاعات از آسان";
const ROUTE = "/admin/asan-import";

test.describe("M3.3 — the /admin/asan-import route", () => {
  test("an admin reaches the page, and merely opening it writes nothing", async ({ page }) => {
    const before = Number(dbScalar("select count(*) from public.persons"));
    const batchesBefore = Number(dbScalar("select count(*) from public.asan_import_batches"));

    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: PAGE_TITLE })).toBeVisible();
    // The promise the page makes to the user, asserted rather than assumed.
    await expect(page.getByText("هیچ چیزی تا لحظهٔ «ثبت نهایی»")).toBeVisible();
    await expect(page.getByLabel("فایل xlsx خروجی «اشخاص» از آسان")).toBeVisible();

    // Opening a page that can create persons must not create any.
    expect(Number(dbScalar("select count(*) from public.persons"))).toBe(before);
    expect(Number(dbScalar("select count(*) from public.asan_import_batches"))).toBe(batchesBefore);
  });

  test.describe("accountant", () => {
    test.use({ storageState: "e2e/auth/accountant.storage.json" });

    test("an accountant reaches it too — this page is built for that role", async ({ page }) => {
      await page.goto(ROUTE);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: PAGE_TITLE })).toBeVisible();
    });
  });

  test.describe("sales", () => {
    test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });

    test("a salesperson never sees the page", async ({ page }) => {
      await page.goto(ROUTE);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      // The shell can render before the guard resolves, so the assertion is on the
      // page's own content, never on the URL.
      await expect(page.getByRole("heading", { name: PAGE_TITLE })).toHaveCount(0);
      await expect(page.getByLabel("فایل xlsx خروجی «اشخاص» از آسان")).toHaveCount(0);
    });
  });

  test.describe("anonymous", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("an anonymous visitor never sees the page", async ({ page }) => {
      await page.goto(ROUTE);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      await expect(page.getByRole("heading", { name: PAGE_TITLE })).toHaveCount(0);
    });
  });
});
