import { expect, test } from "@playwright/test";
import fs from "node:fs";
import * as XLSX from "xlsx";
import { parseAsanProducts } from "../../src/lib/asan/parse-products";
import { dbRows, dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

/**
 * ASAN M3.4 — importing products from Asan.
 *
 * Driven through PostgREST and the RPCs rather than the browser: the rule this phase
 * exists to guarantee — **no product is ever created** — lives in
 * `asan_commit_product_batch`, which measures the catalogue before and after and
 * raises if it moved. The honest test is the one that tries to make it move.
 *
 * The real 7 256-row export is used, not a fixture.
 *
 * Expected classification against this database, from R1.5's measurements rather than
 * from the brief (which calls barcode "the strongest match key" — barcode is 0 %
 * populated on both sides, so it is not a strategy that can be tried at all):
 *   3 rows match by Asan code, because migration 283 already backfilled those three
 *   codes from exactly these three normalized-name matches; everything else is
 *   `unmatched`. That means the real file exercises no `update` row at all, so the
 *   update path is constructed below rather than hoped for.
 */

/**
 * ⛔ THIS FILE NO LONGER EXISTS.
 *
 * `docs/asan/reference/کالا.xlsx` — the owner's real 7 256-item export — was removed from the
 * repository by owner decision on 2026-08-08. The path is kept here rather than deleted so that
 * restoring a fixture is a one-line change instead of an archaeology exercise.
 *
 * Six tests below are consequently skipped, plus the staged-data half of the normalizer test,
 * and this is a KNOWN AND ACCEPTED LOSS OF COVERAGE, not a hidden regression. What is no longer
 * proven: that the parser reads the owner's real workbook into 7 256 rows, that header-driven
 * mapping survives a shuffled column order, that stage → classify → link → commit works on real
 * data, that committing never creates a product, that re-importing is inert, and that
 * normalized-name matching still finds exactly R1.5's three products.
 *
 * The rules those tests exercised still live in the database — migration 286 counts products
 * before and after a commit and rolls back if the number moves — so the guards are intact; what
 * is gone is the proof that they hold against the real file.
 *
 * Left running on purpose: RLS on the staging table, and the normalizer's folding rules, which
 * are asserted on constructed input and never needed the workbook.
 *
 * To restore coverage: put a products export back at this path and delete the `test.skip` lines.
 */
const WORKBOOK = "docs/asan/reference/کالا.xlsx";

/** Shown in the Playwright report for every test skipped by the removal above. */
const FIXTURE_REMOVED =
  "needs docs/asan/reference/کالا.xlsx, removed by owner decision 2026-08-08 — coverage gap is accepted, see the note at the top of this file";
const EXPECTED_ROWS = 7256;
/** The three pairs R1.5 named, re-measured in this phase's dry run. */
const LINKED_SKU = "AFK-2026-00039";
const LINKED_CODE = "7009";

let adminJwt: string;
let batchId: string | null = null;
let productsBaseline = 0;

function readMatrix(path: string): unknown[][] {
  const wb = XLSX.read(fs.readFileSync(path), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null });
}

async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await rest<T>(adminJwt, `/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  expect(res.status, `${name}: ${res.text}`).toBeLessThan(300);
  return res.body;
}

async function stage(fileName: string) {
  const parsed = parseAsanProducts(readMatrix(WORKBOOK));
  const batch = await rest<{ id: string }[]>(adminJwt, "/asan_import_batches", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      kind: "products",
      file_name: fileName,
      row_count: parsed.rows.length,
      created_by: ADMIN_USER_ID,
    }),
  });
  expect(batch.status, batch.text).toBe(201);
  const id = batch.body[0].id;

  // 7 256 rows in chunks of 500 — 15 requests, not 7 256.
  const startedAt = Date.now();
  for (let i = 0; i < parsed.rows.length; i += 500) {
    const chunk = parsed.rows.slice(i, i + 500).map((r) => ({ ...r, batch_id: id }));
    const res = await rest(adminJwt, "/asan_import_product_rows", {
      method: "POST",
      body: JSON.stringify(chunk),
    });
    expect(res.status, res.text).toBeLessThan(300);
  }
  const ms = Date.now() - startedAt;
  return { id, parsed, ms };
}

test.beforeAll(() => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  productsBaseline = Number(dbScalar("select count(*) from public.products"));
});

test.afterAll(async () => {
  // Rule 2.10 — create, assert, remove. Rows cascade with the batch.
  const ids = dbRows(
    `select id::text from public.asan_import_batches where file_name like 'QA-M34-%'`,
  );
  for (const id of ids) {
    await rest(adminJwt, `/asan_import_batches?id=eq.${id}`, { method: "DELETE" });
  }
  // The update-path test borrows a real product's code and the commit puts it back. If that
  // test failed part-way the code would be missing, so it is restored unconditionally here
  // rather than trusting the happy path.
  dbExecE2e(`
    -- E2E_AUDIT_20260729_asan_m34_restore_code
    update public.products set accounting_code = '${LINKED_CODE}'
     where sku = '${LINKED_SKU}' and accounting_code is null;
  `);
});

test.describe("M3.4 — Asan product import", () => {
  test("the workbook parses by header text into 7 256 rows", () => {
    test.skip(true, FIXTURE_REMOVED);
    const parsed = parseAsanProducts(readMatrix(WORKBOOK));
    expect(parsed.rows.length, "the owner's export has 7 256 products").toBe(EXPECTED_ROWS);
    expect(parsed.mapping.asan_code, "کد کالا was not resolved by header text").toBeTruthy();
    expect(parsed.mapping.name).toBeTruthy();
    // `بارکدکـالا` and `سریال کـالا` carry a tatweel inside the word. The constants are
    // written the ordinary way, so resolving them proves the normalizer folds it.
    expect(parsed.mapping.barcode, "the tatweel in بارکدکـالا defeated the header match").toBeTruthy();
    expect(parsed.mapping.serial).toBeTruthy();

    expect(
      parsed.rows.every((r) => r.asan_code),
      "every row carries a product code",
    ).toBe(true);
    expect(new Set(parsed.rows.map((r) => r.asan_code)).size, "codes are not distinct").toBe(
      EXPECTED_ROWS,
    );

    // R1.5 measured this as 0/7 256 on both sides. Asserted so that "0 barcode matches" can
    // never be misread as a strategy that was tried and found nothing.
    expect(parsed.rows.filter((r) => r.barcode_raw).length, "barcode is no longer empty").toBe(0);
    expect(
      parsed.warnings.some((w) => w.includes("بارکد")),
      "the empty barcode column was not reported",
    ).toBe(true);
  });

  test("a shuffled column order parses identically — proving header-driven mapping", () => {
    test.skip(true, FIXTURE_REMOVED);
    const matrix = readMatrix(WORKBOOK);
    const straight = parseAsanProducts(matrix);
    const shuffled = parseAsanProducts(matrix.map((row) => [...row].reverse()));
    expect(shuffled.rows.length).toBe(straight.rows.length);
    expect(shuffled.rows[0].asan_code).toBe(straight.rows[0].asan_code);
    expect(shuffled.rows[0].name).toBe(straight.rows[0].name);
    expect(shuffled.rows[100].unit_raw).toBe(straight.rows[100].unit_raw);
  });

  test("staging and classifying reproduces what the research measured", async () => {
    test.skip(true, FIXTURE_REMOVED);
    const { id, ms } = await stage("QA-M34-first");
    batchId = id;
    console.log(`M34 staging ${EXPECTED_ROWS} rows took ${ms} ms`);

    expect(
      dbScalar(`select count(*) from public.asan_import_product_rows where batch_id='${id}'`),
    ).toBe(String(EXPECTED_ROWS));

    const classifyStart = Date.now();
    await rpc("asan_classify_product_batch", { p_batch_id: id });
    console.log(`M34 classify took ${Date.now() - classifyStart} ms`);

    const counts = Object.fromEntries(
      dbRows(`
        select classification || '=' || count(*)
          from public.asan_import_product_rows where batch_id='${id}'
         group by classification
      `).map((s) => s.split("=")),
    );

    // The three products migration 283 linked are recognised by code, not re-matched.
    expect(Number(counts.unchanged ?? 0), "expected the 3 already-linked products").toBe(3);
    expect(
      dbScalar(`select count(*) from public.asan_import_product_rows
                 where batch_id='${id}' and match_reason='asan_code'`),
    ).toBe("3");
    // Everything else is genuinely absent from AfraKala's 355-item catalogue.
    expect(Number(counts.unmatched ?? 0)).toBe(EXPECTED_ROWS - 3);
    expect(Number(counts.conflict ?? 0)).toBe(0);
    expect(Number(counts.update ?? 0)).toBe(0);
  });

  test("an unmatched row cannot be accepted, even by a direct PostgREST PATCH", async () => {
    // Skipped only because it needs a staged batch. The guard itself is a trigger from migration
    // 286 and is still enforced in the database.
    test.skip(true, FIXTURE_REMOVED);
    expect(batchId, "the staging test must run first").toBeTruthy();

    const row = dbRows(`
      select id::text from public.asan_import_product_rows
       where batch_id='${batchId}' and classification='unmatched' order by row_number limit 1
    `);
    expect(row.length).toBe(1);

    const res = await rest(adminJwt, `/asan_import_product_rows?id=eq.${row[0]}`, {
      method: "PATCH",
      body: JSON.stringify({ decision: "accept" }),
    });
    expect(res.status, "the guard trigger allowed an unmatched row to be accepted").toBeGreaterThanOrEqual(
      400,
    );
    // Count, never trust the status.
    expect(
      dbScalar(`select decision from public.asan_import_product_rows where id='${row[0]}'`),
    ).toBe("pending");
  });

  test("the link path works, and committing never creates a product", async () => {
    test.skip(true, FIXTURE_REMOVED);
    expect(batchId, "the staging test must run first").toBeTruthy();

    const before = Number(dbScalar("select count(*) from public.products"));
    const originalCode = dbScalar(
      `select accounting_code from public.products where sku='${LINKED_SKU}'`,
    );
    expect(originalCode, "the fixture product lost its Asan code").toBe(LINKED_CODE);

    // Constructed, not hoped for: against this database the real file produces no `update`
    // row at all, because all three name matches are already linked. Unlinking one puts the
    // system in exactly the state a first-ever import would have been in.
    dbExecE2e(`
      -- E2E_AUDIT_20260729_asan_m34_unlink
      update public.products set accounting_code = null where sku = '${LINKED_SKU}';
    `);
    expect(
      dbScalar(`select coalesce(accounting_code,'NULL') from public.products where sku='${LINKED_SKU}'`),
    ).toBe("NULL");

    await rpc("asan_classify_product_batch", { p_batch_id: batchId });

    const target = dbRows(`
      select r.id::text from public.asan_import_product_rows r
       join public.products p on p.id = r.matched_product_id
       where r.batch_id='${batchId}' and p.sku='${LINKED_SKU}'
    `);
    expect(target.length, "the unlinked product was not matched by normalized name").toBe(1);
    expect(
      dbScalar(`select classification from public.asan_import_product_rows where id='${target[0]}'`),
      "a product with no code and one name match must be linkable",
    ).toBe("update");
    expect(
      dbScalar(`select match_reason from public.asan_import_product_rows where id='${target[0]}'`),
    ).toBe("normalized_name");

    const accept = await rest(adminJwt, `/asan_import_product_rows?id=eq.${target[0]}`, {
      method: "PATCH",
      body: JSON.stringify({ decision: "accept" }),
    });
    expect(accept.status, accept.text).toBeLessThan(300);

    const result = await rpc<{ linked: number; created: number; products_after: number }>(
      "asan_commit_product_batch",
      { p_batch_id: batchId },
    );
    expect(result.linked, "the accepted row did not link").toBe(1);
    expect(result.created, "the product importer must never create").toBe(0);

    // The guarantee, measured at the table rather than taken from the RPC's own report.
    const after = Number(dbScalar("select count(*) from public.products"));
    expect(after, "committing a product batch created products").toBe(before);
    expect(after, "the catalogue moved during this suite").toBe(productsBaseline);

    // The commit wrote back exactly the code that was there before — the fixture is restored
    // by the operation under test, not by a cleanup step.
    expect(
      dbScalar(`select accounting_code from public.products where sku='${LINKED_SKU}'`),
      "the Asan code was not written back",
    ).toBe(LINKED_CODE);
  });

  test("re-importing the same file changes nothing", async () => {
    test.skip(true, FIXTURE_REMOVED);
    const before = Number(dbScalar("select count(*) from public.products"));
    const codesBefore = dbScalar(
      "select count(*) from public.products where accounting_code is not null",
    );

    const second = await stage("QA-M34-second");
    await rpc("asan_classify_product_batch", { p_batch_id: second.id });

    // Everything that could be linked already is, so nothing is linkable a second time.
    //
    // The counts are read through a GROUP BY rather than `where classification='update'`
    // because `e2e/helpers/db.ts` refuses any statement containing the word `update`
    // anywhere — including inside a string literal. That guard is right to be blunt; this
    // is simply the shape that satisfies it.
    const counts = Object.fromEntries(
      dbRows(`
        select classification || '=' || count(*)
          from public.asan_import_product_rows where batch_id='${second.id}'
         group by classification
      `).map((s) => s.split("=")),
    );
    expect(Number(counts.update ?? 0), "a re-import found work to do").toBe(0);
    expect(Number(counts.unchanged ?? 0)).toBe(3);

    const result = await rpc<{ linked: number }>("asan_commit_product_batch", {
      p_batch_id: second.id,
    });
    expect(result.linked, "a re-import linked something").toBe(0);
    expect(Number(dbScalar("select count(*) from public.products"))).toBe(before);
    expect(
      dbScalar("select count(*) from public.products where accounting_code is not null"),
    ).toBe(codesBefore);
  });

  test("a viewer-only account cannot read the product staging table", async () => {
    const viewer = dbRows(`
      select ur.user_id::text from public.user_roles ur
       where ur.role = 'viewer'
         and not exists (select 1 from public.user_roles o
                          where o.user_id = ur.user_id and o.role <> 'viewer')
       limit 1
    `);
    expect(viewer.length).toBeGreaterThan(0);
    const jwt = mintJwt(viewer[0]);
    const res = await rest<unknown[]>(jwt, "/asan_import_product_rows?select=*");
    expect(
      Array.isArray(res.body) ? res.body.length : 0,
      "the product staging table leaked to a viewer",
    ).toBe(0);
  });

  test("the normalizer reproduces R1.5's measurement, not just some measurement", () => {
    test.skip(true, FIXTURE_REMOVED);
    // The whole matching design rests on this number. If the normalizer drifts, every count
    // above still passes while meaning something different.
    console.log(
      "M34 diag staged=",
      dbScalar("select count(*) from public.asan_import_product_rows"),
      "sampleNorm=",
      dbScalar(
        "select coalesce(public.asan_normalize_name(name),'NULL') from public.asan_import_product_rows order by row_number limit 1",
      ),
      "afk39norm=",
      dbScalar(
        "select public.asan_normalize_name(name) from public.products where sku='AFK-2026-00039'",
      ),
      "hit7009=",
      dbScalar(
        "select count(*) from public.asan_import_product_rows where asan_code='7009'",
      ),
      "norm7009=",
      dbScalar(
        "select coalesce(public.asan_normalize_name(name),'NULL') from public.asan_import_product_rows where asan_code='7009' limit 1",
      ),
    );

    expect(
      dbScalar(`
        select count(distinct p.id) from public.products p
         join public.asan_import_product_rows r on r.batch_id is not null
          and public.asan_normalize_name(r.name) = public.asan_normalize_name(p.name)
      `),
      "normalized-name matching no longer finds R1.5's three products",
    ).toBe("3");
  });

  /**
   * Split out of the test above when the workbook was removed. These two assertions run on
   * constructed input and never needed a staged batch, so the folding rules keep their coverage
   * even though the measurement against R1.5's three products cannot run.
   *
   * That matters more than it looks: a silent change to the folding table does not raise an
   * error, it silently changes which products match — which is exactly why migration 286 wrote
   * the table with ASCII escapes in the first place.
   */
  test("the normalizer's folding rules still hold, on constructed input", () => {
    expect(dbScalar(`select public.asan_normalize_name('  Yakh-Chal  (A) ')`)).toBe("yakhchala");
    expect(dbScalar(`select public.asan_normalize_code('AFK-12')`)).toBe("AFK-12");
  });
});
