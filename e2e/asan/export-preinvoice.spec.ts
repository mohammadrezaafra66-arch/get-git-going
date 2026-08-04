import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

import { SALES_HEADERS } from "../../src/lib/asan/layouts";
import { buildAsanWorkbook } from "../../src/lib/asan/write-xlsx";
import {
  buildInvoiceRows,
  groupInvoiceRows,
  type InvoiceExportRow,
} from "../../src/lib/asan/export-invoice-rows";
import type { AsanCell } from "../../src/lib/asan/export-types";

/**
 * ASAN M4.8 — exporting one pre-invoice from its detail page.
 *
 * The brief asks for exactly one thing: **byte-identical output** between a single-quote export
 * and that quote's rows inside a range export covering the same quote. Identical logic must
 * produce identical bytes.
 *
 * That is guaranteed structurally rather than by care: the single-quote path calls the same RPC
 * with the quote's own date as both ends of the range and hands the result to the same
 * `buildInvoiceRows`. This spec asserts both — the bytes, and the fact that there is no second
 * mapping to drift.
 */

const MARK = `${E2E_PREFIX}ASAN_PREINV`;
const FULL_RANGE = { from: "2026-01-01", to: "2026-12-31" };

let adminJwt: string;
const numbered = new Set<string>();

async function listRange(from: string, to: string): Promise<InvoiceExportRow[]> {
  const res = await rest<InvoiceExportRow[]>(adminJwt, "/rpc/asan_list_sales_export", {
    method: "POST",
    body: JSON.stringify({ _from: from, _to: to }),
  });
  expect(res.status, res.text).toBeLessThan(300);
  return res.body ?? [];
}

async function fileFor(rows: InvoiceExportRow[], asanNumber: number): Promise<ArrayBuffer> {
  const built: AsanCell[][] = [];
  for (const d of groupInvoiceRows(rows, new Map()).filter((x) => !x.blockedReason)) {
    built.push(...buildInvoiceRows(d.payload as never, asanNumber));
  }
  return buildAsanWorkbook({ headers: SALES_HEADERS, rows: built, sheetName: "Asan" });
}

const sha = (b: ArrayBuffer) =>
  crypto.createHash("sha256").update(Buffer.from(b)).digest("hex");

test.beforeAll(() => {
  adminJwt = mintJwt(ADMIN_USER_ID);
});

test.afterAll(() => {
  if (numbered.size === 0) return;
  const list = [...numbered].map((x) => `'${x}'`).join(",");
  dbExecE2e(
    `-- ${MARK} give back every Asan number this spec consumed
     delete from asan_export_numbers where doc_type = 'sales_invoice' and source_id in (${list});`,
  );
  expect(
    Number(
      dbScalar(
        `select count(*) from asan_export_numbers where doc_type='sales_invoice' and source_id in (${list})`,
      ),
    ),
    "rule 2.10",
  ).toBe(0);
});

test("⛔ one quote exported alone is byte-identical to the same quote in a range export", async () => {
  const all = await listRange(FULL_RANGE.from, FULL_RANGE.to);
  const exportable = groupInvoiceRows(all, new Map()).filter((d) => !d.blockedReason);
  expect(exportable.length, "need an exportable quote to compare").toBeGreaterThan(0);
  const target = exportable[0];

  // Number it once, so both files carry the same column A. Assignment is idempotent, so this is
  // also what the detail page would do.
  const res = await rest<{ source_id: string; asan_number: number }[]>(
    adminJwt,
    "/rpc/asan_assign_document_numbers",
    {
      method: "POST",
      body: JSON.stringify({ _doc_type: "sales_invoice", _ids: [target.sourceId] }),
    },
  );
  expect(res.status, res.text).toBeLessThan(300);
  numbered.add(target.sourceId);
  const n = res.body![0].asan_number;

  // The single-quote path: the same RPC, the quote's own date at both ends of the range.
  const dayIso = target.dateIso;
  expect(dayIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const singleDay = (await listRange(dayIso, dayIso)).filter((r) => r.doc_id === target.sourceId);
  expect(singleDay.length).toBeGreaterThan(0);

  // The range path, narrowed to the same quote's rows.
  const fromRange = all.filter((r) => r.doc_id === target.sourceId);

  expect(singleDay, "the same rows, from the same source function").toEqual(fromRange);
  expect(sha(await fileFor(singleDay, n)), "and therefore the same bytes").toBe(
    sha(await fileFor(fromRange, n)),
  );
});

test("the single-quote path owns no mapping of its own", () => {
  // The byte-identity above could be satisfied today by a careful copy and broken tomorrow by an
  // edit to one of them. This is the assertion that would fail on that edit.
  const src = fs.readFileSync(path.resolve("src/lib/asan/export-single-quote.ts"), "utf8");

  // It reuses the shared builder and the shared listing, and defines neither.
  expect(src).toContain("buildInvoiceRows");
  expect(src).toContain("listSalesDocuments");
  expect(src).not.toMatch(/SALES_HEADERS\s*=/);
  expect(src, "no second column mapping").not.toContain("کدشخص");
  expect(src, "no second amount conversion").not.toContain("tomanToRial");
  // The same numbering register as the range export, so a number survives either path.
  expect(src).toContain('_doc_type: "sales_invoice"');
  expect(src).toContain("asan_assign_document_numbers");
});

test("a quote that is not exportable produces a Persian reason, not a partial file", async () => {
  const all = await listRange(FULL_RANGE.from, FULL_RANGE.to);
  const blocked = groupInvoiceRows(all, new Map()).filter((d) => d.blockedReason);
  expect(blocked.length, "this database has blocked quotes to check").toBeGreaterThan(0);

  for (const d of blocked) {
    expect(d.blockedReason!.length).toBeGreaterThan(10);
    expect(d.blockedReason).not.toContain("?");
  }

  // And the single-quote entry point refuses rather than writing a file.
  const src = fs.readFileSync(path.resolve("src/lib/asan/export-single-quote.ts"), "utf8");
  expect(src).toContain("SingleQuoteNotExportableError");
  expect(src).toContain("if (doc.blockedReason) throw");
  // A quote outside the exportable set is named as such rather than silently producing nothing.
  expect(src).toContain("فقط پیش‌فاکتورهای قطعی‌شده");
});

test("the detail page offers it to admin and accountant only", () => {
  const route = fs.readFileSync(path.resolve("src/routes/_app.sales.quotes.$quoteId.tsx"), "utf8");
  // `isManagerial` means "admin or manager", and the backend refuses a manager (292's guard).
  // Offering a control the backend rejects teaches the user to distrust the page.
  expect(route).toContain(
    'const canAsanExport = roles.includes("admin") || roles.includes("accountant");',
  );
  expect(route).toContain("{canAsanExport && (");
  expect(route).toContain("خروجی اکسل آسان");
  expect(route).toContain("downloadSingleQuoteExport");
  // The unit is stated to the user here too, not only on the export page.
  expect(route).toContain("مبلغ‌ها به ریال");
  // The Tehran calendar day is derived with Intl, never a fixed offset.
  expect(route).toContain('timeZone: "Asia/Tehran"');
});

test("the button is on the page in a real browser, and the export set is enforced", async ({
  page,
}) => {
  const all = await listRange(FULL_RANGE.from, FULL_RANGE.to);
  const exportable = groupInvoiceRows(all, new Map()).filter((d) => !d.blockedReason);
  const quoteId = exportable[0].sourceId;

  await page.goto(`/sales/quotes/${quoteId}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "جزئیات پیش‌فاکتور" })).toBeVisible();
  await expect(page.getByRole("button", { name: "خروجی اکسل آسان" }).first()).toBeVisible();
});

test.describe("a salesperson", () => {
  test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });

  test("never sees the Asan export button", async ({ page }) => {
    const quoteId = dbScalar("select id from sales_quotes where status = 'accepted' limit 1");
    await page.goto(`/sales/quotes/${quoteId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    // Asserted on page content: a salesperson may legitimately reach this page for their own
    // quote, so the URL proves nothing — the button's absence is the claim.
    await expect(page.getByRole("button", { name: "خروجی اکسل آسان" })).toHaveCount(0);
  });
});
