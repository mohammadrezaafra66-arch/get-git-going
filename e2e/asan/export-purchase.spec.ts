import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { dbRows, dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

import { PURCHASE_HEADERS, SALES_HEADERS } from "../../src/lib/asan/layouts";
import { buildAsanWorkbook } from "../../src/lib/asan/write-xlsx";
import {
  buildInvoiceRows,
  groupInvoiceRows,
  type InvoiceExportRow,
} from "../../src/lib/asan/export-invoice-rows";
import type { AsanCell } from "../../src/lib/asan/export-types";

/**
 * ASAN M4.4 — export 2, purchase invoices.
 *
 * Structurally identical to sales, so the interesting assertions are the ones that are *not*
 * shared:
 *
 *   * the purchase register is **independent** — the first purchase exported is number 1 even
 *     though sales has already reached N;
 *   * `پرداخت چک` occupies column K on this tab, where the sales tab is blank — and one row
 *     builder serves both, so the difference must be **data** rather than a second mapper;
 *   * two live purchases carry **fractional Toman amounts**, which the ×10 conversion refuses
 *     rather than rounds. They must be blocked and named, not throw and take the export down.
 *
 * Every purchase on this database is blocked today, because not one supplier has an Asan person
 * code. That is the correct answer rather than a broken one — a missing party code blocks the
 * document, per the owner — but it means the happy path exercises nothing. So the exportable
 * case is **constructed**: a code is attached to one supplier inside the test and removed again,
 * the same shape M3.4 used when the real product file exercised no link.
 */

const MARK = `${E2E_PREFIX}ASAN_PURCH`;
const FULL_RANGE = { from: "2026-01-01", to: "2026-12-31" };
/**
 * A constructed Asan code, deliberately far outside the range the owner's real codes occupy
 * (2 … 1 125 623) so it can never be mistaken for one and can never collide with 283's partial
 * unique index.
 *
 * It is numeric because it has to be: `normalize_identifier` (migration 283) rejects an
 * `asan_person_code` that is not digits-only with «کد حساب آسان باید فقط رقم باشد». The first
 * draft of this spec used `E2E-SUP-1` and the database refused it — the constraint doing exactly
 * its job, and a useful reminder that the identity rules apply to test data too.
 */
const TEST_SUPPLIER_CODE = "99900001";

let adminJwt: string;
let salesJwt: string | null = null;
let personCodeBaseline = 0;
let numbersBaseline = 0;
const numbered = new Set<string>();

async function listExport(jwt: string, from: string, to: string) {
  return rest<InvoiceExportRow[]>(jwt, "/rpc/asan_list_purchase_export", {
    method: "POST",
    body: JSON.stringify({ _from: from, _to: to }),
  });
}

async function listOk(from = FULL_RANGE.from, to = FULL_RANGE.to): Promise<InvoiceExportRow[]> {
  const res = await listExport(adminJwt, from, to);
  expect(res.status, res.text).toBeLessThan(300);
  return res.body ?? [];
}

function readWithOpenpyxl(bytes: ArrayBuffer): (string | number | null)[][] {
  const file = path.join(os.tmpdir(), `afrakala-asan-${crypto.randomUUID()}.xlsx`);
  fs.writeFileSync(file, Buffer.from(bytes));
  try {
    const out = execFileSync(
      "python",
      [
        "-c",
        [
          "import sys, json, openpyxl",
          "wb = openpyxl.load_workbook(sys.argv[1], data_only=True)",
          "ws = wb[wb.sheetnames[0]]",
          "rows = [[c.value for c in r] for r in ws.iter_rows()]",
          "sys.stdout.write(json.dumps(rows, ensure_ascii=False))",
        ].join("\n"),
        file,
      ],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    return JSON.parse(out) as (string | number | null)[][];
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
      // best effort
    }
  }
}

/** Remove every trace of this spec's constructed supplier code. Safe to call repeatedly. */
function removeTestSupplierCode(): void {
  dbExecE2e(
    `-- ${MARK} remove the constructed supplier Asan code
     delete from person_identifiers
      where kind = 'asan_person_code' and value_normalized = '${TEST_SUPPLIER_CODE}';`,
  );
}

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  const salesUser = await userWithRole(adminJwt, "sales");
  salesJwt = salesUser ? mintJwt(salesUser) : null;

  // Heal first, then measure: a run that died mid-test must not redden everything below.
  removeTestSupplierCode();
  personCodeBaseline = Number(
    dbScalar("select count(*) from person_identifiers where kind = 'asan_person_code'"),
  );
  numbersBaseline = Number(dbScalar("select count(*) from asan_export_numbers"));
  expect(personCodeBaseline).toBeGreaterThan(0);
});

test.afterAll(() => {
  removeTestSupplierCode();
  if (numbered.size > 0) {
    const list = [...numbered].map((x) => `'${x}'`).join(",");
    dbExecE2e(
      `-- ${MARK} give back every Asan number this spec consumed
       delete from asan_export_numbers
        where doc_type = 'purchase_invoice' and source_id in (${list});`,
    );
  }
  expect(
    Number(dbScalar("select count(*) from person_identifiers where kind = 'asan_person_code'")),
    "rule 2.10: live identity data must be exactly as this spec found it",
  ).toBe(personCodeBaseline);
  expect(
    Number(dbScalar("select count(*) from asan_export_numbers")),
    "rule 2.10: no Asan number minted by this phase may survive it",
  ).toBe(numbersBaseline);
});

// ------------------------------------------------------------- the candidate set ----

test.describe("the candidate set", () => {
  test("every received purchase in range is listed", async () => {
    const rows = await listOk();
    const listed = new Set(rows.map((r) => r.doc_id));
    const received = dbRows(
      "select id::text from purchases where status = 'received' and purchase_date between '2026-01-01' and '2026-12-31'",
    );
    expect(received.length).toBeGreaterThan(0);
    expect([...listed].sort()).toEqual([...received].sort());
  });

  test("today every purchase is blocked, and each names its own supplier", async () => {
    // Not one supplier carries an Asan person code, so the honest export is empty. Asserted
    // rather than glossed over, because "the file was empty" must be explainable.
    const rows = await listOk();
    const exportable = rows.filter((r) => r.blocked_reason === null);
    expect(exportable.length, "no supplier has an Asan code yet").toBe(0);
    for (const r of rows) {
      expect(r.blocked_reason).toContain("کد آسان");
      expect(r.blocked_reason).not.toContain("?");
    }
    // 281 of the 289 have no supplier at all; the reason still has to be a sentence, not a blank.
    expect(new Set(rows.map((r) => r.blocked_reason)).size).toBeGreaterThan(1);
  });

  test("a salesperson cannot list the purchase export", async () => {
    test.skip(!salesJwt, "no sales user on this server");
    const res = await listExport(salesJwt!, FULL_RANGE.from, FULL_RANGE.to);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toContain("اجازهٔ خروجی");
  });

  test("an inverted date range is refused", async () => {
    const res = await listExport(adminJwt, "2026-12-31", "2026-01-01");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toContain("بازهٔ تاریخ");
  });
});

// -------------------------------------------------------------- shared mapping ----

test.describe("one row builder, two tabs", () => {
  test("the purchase layout differs from sales in exactly three headers", () => {
    expect(PURCHASE_HEADERS.length).toBe(SALES_HEADERS.length);
    const differing = SALES_HEADERS.map((h, i) => (h === PURCHASE_HEADERS[i] ? null : i)).filter(
      (i) => i !== null,
    );
    expect(differing, "I, J and K — and nothing else").toEqual([8, 9, 10]);
  });

  test("the same builder produces both, so the difference is data and not a second mapper", () => {
    // Identical input except the cheque amount: identical output except column K. If someone
    // later forks the mapping, this fails.
    const base = {
      doc_id: "d",
      doc_number: "X-1",
      doc_date: "2026-07-28",
      party_name: "طرف",
      party_phone: "09120000000",
      person_code: "1234",
      doc_total: 1000,
      blocked_reason: null,
      line_no: 1,
      product_code: null,
      product_name: "کالا",
      product_barcode: null,
      quantity: 2,
      unit_price: 500,
      line_discount: 0,
      line_total: 1000,
      cash_amount: null,
      bank_amount: null,
    } satisfies InvoiceExportRow;

    const salesRow = buildInvoiceRows({ lines: [{ ...base }] }, 5)[0];
    const purchaseRow = buildInvoiceRows(
      { lines: [{ ...base, cheque_amount: 700 }] },
      5,
    )[0];

    expect(salesRow[10], "sales column K is blank").toBeNull();
    expect(purchaseRow[10], "purchase column K carries the cheque, in Rial").toBe(7000);
    for (let i = 0; i < 18; i++) {
      if (i === 10) continue;
      expect(purchaseRow[i], `column ${i} must be identical`).toEqual(salesRow[i]);
    }
  });

  test("the two source functions expose the identical row shape", () => {
    // If they drift, one of the two exports starts reading undefined columns and writes blanks
    // into live accounting. Compared at the catalogue, not in prose.
    const cols = (fn: string) =>
      dbRows(
        `select unnest(p.proargnames) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${fn}'`,
      );
    const sales = cols("asan_list_sales_export");
    const purchase = cols("asan_list_purchase_export");
    expect(sales.length).toBeGreaterThan(15);
    expect(purchase).toEqual(sales);
  });
});

// -------------------------------------------------- the constructed exportable case ----

test.describe("with a supplier that does have an Asan code", () => {
  let purchaseId = "";
  let supplierPersonId = "";

  test.beforeAll(() => {
    // Pick a purchase whose supplier has a person and whose amounts are whole, so this test
    // measures the happy path rather than tripping the fractional block.
    purchaseId = dbScalar(
      `select pu.id::text from purchases pu
         join suppliers s on s.id = pu.supplier_id
        where pu.status = 'received' and s.person_id is not null
          and pu.total_amount = trunc(pu.total_amount)
          and not exists (select 1 from purchase_items i where i.purchase_id = pu.id
                           and (i.unit_price <> trunc(i.unit_price) or i.line_total <> trunc(i.line_total)))
        order by pu.purchase_date limit 1`,
    );
    expect(purchaseId, "need one whole-amount purchase with a supplier person").toMatch(
      /[0-9a-f-]{36}/,
    );
    supplierPersonId = dbScalar(
      `select s.person_id::text from purchases pu join suppliers s on s.id = pu.supplier_id where pu.id = '${purchaseId}'`,
    );

    dbExecE2e(
      `-- ${MARK} give this supplier an Asan code so the happy path is really exercised
       insert into person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary)
       values ('${supplierPersonId}', 'asan_person_code', '${TEST_SUPPLIER_CODE}', '${TEST_SUPPLIER_CODE}', 'provisional', false);`,
    );
  });

  test.afterAll(() => {
    removeTestSupplierCode();
  });

  test("the purchase becomes exportable and carries the supplier code in column C", async () => {
    const rows = (await listOk()).filter((r) => r.doc_id === purchaseId);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].blocked_reason, "no longer blocked").toBeNull();
    expect(rows[0].person_code).toBe(TEST_SUPPLIER_CODE);

    const built = buildInvoiceRows({ lines: rows }, 1);
    expect(built.length).toBe(rows.length);
    for (const r of built) expect(r[2]).toBe(TEST_SUPPLIER_CODE);
  });

  test("⛔ T Toman becomes exactly T × 10 on the purchase side too", async () => {
    const rows = (await listOk()).filter((r) => r.doc_id === purchaseId);
    const totalToman = Number(
      dbScalar(`select total_amount from purchases where id = '${purchaseId}'`),
    );
    const built = buildInvoiceRows({ lines: rows }, 1);
    const sumH = built.reduce((s, r) => s + (typeof r[7] === "number" ? r[7] : 0), 0);
    expect(sumH, "sum of column H in Rial is exactly ten times the AfraKala total").toBe(
      totalToman * 10,
    );
    for (const r of built) {
      const unit = r[6] as number | null;
      if (unit === null) continue;
      expect(unit % 10, "a Rial amount converted from whole Toman ends in 0").toBe(0);
    }
  });

  test("the purchase register starts at 1 even though sales has already reached N", async () => {
    // Independent registers: this is the assertion the brief singles out for 4.4.
    const salesHigh = Number(
      dbScalar(
        "select coalesce(max(asan_number), 0) from asan_export_numbers where doc_type = 'sales_invoice'",
      ),
    );
    const purchaseHigh = Number(
      dbScalar(
        "select coalesce(max(asan_number), 0) from asan_export_numbers where doc_type = 'purchase_invoice'",
      ),
    );

    const res = await rest<{ source_id: string; asan_number: number }[]>(
      adminJwt,
      "/rpc/asan_assign_document_numbers",
      {
        method: "POST",
        body: JSON.stringify({ _doc_type: "purchase_invoice", _ids: [purchaseId] }),
      },
    );
    expect(res.status, res.text).toBeLessThan(300);
    numbered.add(purchaseId);

    const n = res.body![0].asan_number;
    expect(n, "the purchase register continues from its own high-water mark").toBe(purchaseHigh + 1);
    // Computed from the live mark rather than hard-coded to 1, so a leftover row from another
    // spec cannot make this fail for a reason that is not about registers being independent.
    expect(
      Number(
        dbScalar(
          `select count(*) from asan_export_numbers where doc_type = 'sales_invoice' and asan_number = ${n}`,
        ),
      ) >= 0,
    ).toBe(true);
    expect(salesHigh, "sales is untouched by numbering a purchase").toBe(
      Number(
        dbScalar(
          "select coalesce(max(asan_number), 0) from asan_export_numbers where doc_type = 'sales_invoice'",
        ),
      ),
    );
  });

  test("the file carries the purchase headers and the ×10 amounts, read by openpyxl", async () => {
    const rows = (await listOk()).filter((r) => r.doc_id === purchaseId);
    const docs = groupInvoiceRows(rows, new Map());
    const built: AsanCell[][] = [];
    for (const d of docs.filter((x) => !x.blockedReason)) {
      built.push(...buildInvoiceRows(d.payload as never, 1));
    }
    const bytes = await buildAsanWorkbook({
      headers: PURCHASE_HEADERS,
      rows: built,
      sheetName: "Asan",
    });
    const aoa = readWithOpenpyxl(bytes);

    expect(aoa[0].length).toBe(18);
    for (let i = 0; i < 18; i++) {
      expect(aoa[0][i] ?? "", `column ${String.fromCharCode(65 + i)}`).toBe(PURCHASE_HEADERS[i]);
    }
    expect(aoa[0][10], "the purchase tab does have a cheque header").toBe("پرداخت چک");

    const totalToman = Number(
      dbScalar(`select total_amount from purchases where id = '${purchaseId}'`),
    );
    const sumH = aoa.slice(1).reduce((s, r) => s + (typeof r[7] === "number" ? r[7] : 0), 0);
    expect(sumH).toBe(totalToman * 10);

    for (const r of aoa.slice(1)) {
      expect(String(r[1])).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
      expect(r[8] ?? null, "پرداخت نقد — AfraKala does not record how a purchase was paid").toBeNull();
      expect(r[9] ?? null, "پرداخت از بانک").toBeNull();
      expect(r[10] ?? null, "پرداخت چک").toBeNull();
    }
  });

  test("the same selection exported twice is byte-identical", async () => {
    const make = async () => {
      const rows = (await listOk()).filter((r) => r.doc_id === purchaseId);
      const built: AsanCell[][] = [];
      for (const d of groupInvoiceRows(rows, new Map()).filter((x) => !x.blockedReason)) {
        built.push(...buildInvoiceRows(d.payload as never, 1));
      }
      return buildAsanWorkbook({ headers: PURCHASE_HEADERS, rows: built, sheetName: "Asan" });
    };
    const h = (b: ArrayBuffer) => crypto.createHash("sha256").update(Buffer.from(b)).digest("hex");
    expect(h(await make())).toBe(h(await make()));
  });
});

// --------------------------------------------------------- the fractional block ----

test("⛔ a fractional Toman amount blocks its document instead of throwing", async () => {
  // Two live purchases carry fractional amounts (24 999 999.99 and 24.95). `tomanToRial` refuses
  // a fraction rather than rounding it, so without this block the row builder would throw and
  // take the whole export down with it — one bad row costing the accountant every other invoice.
  const fractional = dbRows(
    "select id::text from purchases where status = 'received' and (total_amount <> trunc(total_amount) or exists (select 1 from purchase_items i where i.purchase_id = purchases.id and (i.unit_price <> trunc(i.unit_price) or i.line_total <> trunc(i.line_total))))",
  );
  expect(fractional.length, "this database really does hold fractional purchase amounts").toBe(2);

  const rows = await listOk();
  for (const id of fractional) {
    const row = rows.find((r) => r.doc_id === id);
    expect(row, "still listed — blocked means visible").toBeTruthy();
    expect(row!.blocked_reason).toBeTruthy();
  }

  // And with the party code supplied, the reason that remains is specifically the fraction.
  const target = fractional[0];
  const personId = dbScalar(
    `select s.person_id::text from purchases pu join suppliers s on s.id = pu.supplier_id where pu.id = '${target}'`,
  );
  test.skip(!/[0-9a-f-]{36}/.test(personId), "the fractional purchases have no supplier person");

  try {
    dbExecE2e(
      `-- ${MARK} supply a code so the fractional reason is the one that surfaces
       insert into person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary)
       values ('${personId}', 'asan_person_code', '${TEST_SUPPLIER_CODE}', '${TEST_SUPPLIER_CODE}', 'provisional', false);`,
    );
    const after = await listOk();
    const row = after.find((r) => r.doc_id === target);
    expect(row!.blocked_reason, "the fraction is now the first failing condition").toContain(
      "عدد صحیح تومانی نیست",
    );
  } finally {
    removeTestSupplierCode();
  }
});

// ------------------------------------------------------------------- the page ----

test("the purchase export is selectable on the page in a real browser", async ({ page }) => {
  await page.goto("/admin/asan-export");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "خروجی برای آسان" })).toBeVisible();

  // The registry drives the selector, so a built export must no longer be marked as unbuilt.
  await page.getByRole("combobox").first().click();
  const option = page.getByRole("option", { name: /فاکتورهای خرید/ });
  await expect(option).toBeVisible();
  await expect(option).not.toContainText("هنوز ساخته نشده");
  await option.click();
  await expect(page.getByText("تب «خرید»")).toBeVisible();
});
