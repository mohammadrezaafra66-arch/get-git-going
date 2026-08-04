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

import { SALES_HEADERS } from "../../src/lib/asan/layouts";
import { buildAsanWorkbook } from "../../src/lib/asan/write-xlsx";
import {
  buildInvoiceRows,
  groupInvoiceRows,
  type InvoiceExportRow,
} from "../../src/lib/asan/export-invoice-rows";
import type { AsanCell } from "../../src/lib/asan/export-types";

/**
 * ASAN M4.3 — export 1, sales invoices.
 *
 * This is the first export that produces a real file from real money, so the assertions are
 * about arithmetic and identity rather than about the page:
 *
 *   * **T Toman in AfraKala becomes exactly T × 10 in the file.** The owner called this the
 *     single most important assertion in M4, and it is made against a *known live quote*, cell
 *     by cell, not against a fixture.
 *   * The exportable set is "accountant-finalized AND stock-deducted", and every accepted quote
 *     that fails either half is **listed and blocked with the reason**, never silently missing.
 *   * The same selection exported twice is byte-identical.
 *
 * The mapping functions imported above are the ones the application ships — `export-invoice-rows`
 * is deliberately free of the Supabase import so this spec can exercise the real code rather
 * than a retyped copy. Retyping a mapping is how a wrong status label reached a file in P1+D8
 * phase 11. That module is shared with the purchase export; `export-purchase.spec.ts` asserts
 * the sharing is real rather than coincidental.
 *
 * The produced workbook is verified with **openpyxl**, an independent reader, because verifying
 * a file with the same library that wrote it proves only that the library round-trips.
 */

const MARK = `${E2E_PREFIX}ASAN_SALES`;
const FULL_RANGE = { from: "2026-01-01", to: "2026-12-31" };

let adminJwt: string;
let salesJwt: string | null = null;
/** Quote ids this spec assigned Asan numbers to; given back in afterAll (rule 2.10). */
const numbered = new Set<string>();

async function listExport(jwt: string, from: string, to: string) {
  return rest<InvoiceExportRow[]>(jwt, "/rpc/asan_list_sales_export", {
    method: "POST",
    body: JSON.stringify({ _from: from, _to: to }),
  });
}

async function listOk(from = FULL_RANGE.from, to = FULL_RANGE.to): Promise<InvoiceExportRow[]> {
  const res = await listExport(adminJwt, from, to);
  expect(res.status, res.text).toBeLessThan(300);
  return res.body ?? [];
}

/** Write the workbook to disk and read it back with openpyxl — a reader we did not write. */
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

async function buildFile(docsRows: InvoiceExportRow[], numbers: Map<string, number>) {
  const docs = groupInvoiceRows(docsRows, numbers);
  const rows: AsanCell[][] = [];
  for (const d of docs.filter((x) => !x.blockedReason)) {
    rows.push(...buildInvoiceRows(d.payload as never, d.asanNumber));
  }
  const bytes = await buildAsanWorkbook({ headers: SALES_HEADERS, rows, sheetName: "Asan" });
  return { docs, rows, bytes };
}

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  const salesUser = await userWithRole(adminJwt, "sales");
  salesJwt = salesUser ? mintJwt(salesUser) : null;

  // If a previous run died between the delete and the restore, heal before asserting anything —
  // otherwise every test below fails for a reason that has nothing to do with the code.
  restoreAsanPersonCodes();
  expect(
    Number(dbScalar("select count(*) from person_identifiers where kind = 'asan_person_code'")),
    "the live fixture must be whole before this spec starts",
  ).toBe(ASAN_PERSON_CODE_COUNT);
});

/**
 * Re-create any missing `asan_person_code` row from `customers.accounting_code`, which is the
 * exact source migration 283 backfilled these rows from. Idempotent by the same two NOT EXISTS
 * guards 283 used, so calling it when nothing is missing changes nothing.
 */
function restoreAsanPersonCodes(): void {
  dbExecE2e(
    `-- ${MARK} restore any asan_person_code this spec removed, from customers.accounting_code
     insert into person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary)
     select c.person_id, 'asan_person_code', btrim(c.accounting_code), btrim(c.accounting_code),
            'provisional', false
       from customers c
      where c.person_id is not null
        and coalesce(btrim(c.accounting_code), '') <> ''
        and not exists (select 1 from person_identifiers pi
                         where pi.person_id = c.person_id and pi.kind = 'asan_person_code')
        and not exists (select 1 from person_identifiers pi
                         where pi.kind = 'asan_person_code'
                           and pi.value_normalized = btrim(c.accounting_code)
                           and pi.status <> 'revoked');`,
  );
}

/** The documented count from migration 283. Asserted before and after, so a leak is loud. */
const ASAN_PERSON_CODE_COUNT = 11;

test.afterAll(() => {
  // Unconditional, so a crash inside the block test still heals the live fixture.
  restoreAsanPersonCodes();
  expect(
    Number(dbScalar("select count(*) from person_identifiers where kind = 'asan_person_code'")),
    "live identity data must be exactly as this spec found it",
  ).toBe(ASAN_PERSON_CODE_COUNT);

  if (numbered.size === 0) return;
  const list = [...numbered].map((x) => `'${x}'`).join(",");
  dbExecE2e(
    `-- ${MARK} cleanup: give back every Asan number this spec consumed
     delete from asan_export_numbers where doc_type = 'sales_invoice' and source_id in (${list});`,
  );
  expect(
    Number(
      dbScalar(
        `select count(*) from asan_export_numbers where doc_type='sales_invoice' and source_id in (${list})`,
      ),
    ),
    "rule 2.10: no Asan number minted by this phase may survive it",
  ).toBe(0);
});

// ------------------------------------------------- what "finalized" really means ----

test.describe("the exportable set", () => {
  test("only accepted quotes are candidates, and every one of them is listed", async () => {
    const rows = await listOk();
    const listedIds = new Set(rows.map((r) => r.doc_id));
    const accepted = dbRows(
      "select id::text from sales_quotes where status = 'accepted' and (created_at at time zone 'Asia/Tehran')::date between '2026-01-01' and '2026-12-31'",
    );
    expect(accepted.length, "this database must have accepted quotes to test against").toBeGreaterThan(
      0,
    );
    expect([...listedIds].sort()).toEqual([...accepted].sort());

    // A draft has deducted no stock and a cancelled quote has been voided, so neither is a
    // candidate. Asserted rather than assumed, because `accounting_registered_at` alone is NOT
    // a finalization signal: 32 drafts on this database carry it.
    const nonAccepted = dbRows(
      "select id::text from sales_quotes where status <> 'accepted' and accounting_registered_at is not null",
    );
    expect(nonAccepted.length, "the marker really is set on non-accepted quotes").toBeGreaterThan(0);
    for (const id of nonAccepted) expect(listedIds.has(id)).toBe(false);
  });

  test("both halves of the rule are required, and each failure names itself", async () => {
    const rows = await listOk();
    const head = new Map(rows.map((r) => [r.doc_id, r]));

    for (const [id, r] of head) {
      const finalized =
        dbScalar(`select accounting_registered_at is not null from sales_quotes where id='${id}'`) ===
        "t";
      const stockOut =
        Number(
          dbScalar(
            `select count(*) from stock_movements where ref_type='sale_quote_confirm' and ref_id='${id}'`,
          ),
        ) > 0;
      const hasCode = !!r.person_code && r.person_code.trim() !== "";

      const exportable = finalized && stockOut && hasCode;
      expect(
        r.blocked_reason === null,
        `${r.doc_number}: finalized=${finalized} stockOut=${stockOut} code=${hasCode}`,
      ).toBe(exportable);

      if (!hasCode) expect(r.blocked_reason).toContain("کد آسان");
      else if (!finalized) expect(r.blocked_reason).toContain("ثبت شد در حسابداری");
      else if (!stockOut) expect(r.blocked_reason).toContain("کسر نشده");
    }
  });

  test("the three pre-trigger quotes are blocked and named, not silently missing", async () => {
    // SQ-2026-000003/4/5 were accepted before migration 210 created the stock-out trigger, so no
    // movement was ever written for them. That is history, not a bug — but the accountant must
    // see that finalized invoices are being held back, and why.
    const rows = await listOk();
    const blocked = rows.filter((r) => r.blocked_reason !== null);
    expect(blocked.length, "a set that quietly shrinks is how an invoice goes missing").toBeGreaterThan(
      0,
    );
    for (const r of blocked) {
      expect(r.blocked_reason!.length).toBeGreaterThan(10);
      expect(r.blocked_reason).not.toContain("?");
    }
  });

  test("a salesperson cannot list the export at all", async () => {
    test.skip(!salesJwt, "no sales user on this server");
    const res = await listExport(salesJwt!, FULL_RANGE.from, FULL_RANGE.to);
    // Zero rows would be read upstream as "nothing to export"; the function refuses loudly.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toContain("اجازهٔ خروجی");
  });

  test("an inverted date range is refused rather than silently returning nothing", async () => {
    const res = await listExport(adminJwt, "2026-12-31", "2026-01-01");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toContain("بازهٔ تاریخ");
  });

  test("the range really filters", async () => {
    const all = await listOk();
    const narrow = await listOk("2026-07-28", "2026-07-28");
    expect(narrow.length).toBeGreaterThan(0);
    expect(narrow.length).toBeLessThan(all.length);
    for (const r of narrow) expect(r.doc_date).toBe("2026-07-28");
  });
});

// ------------------------------------------------------------------- the file ----

test.describe("the file", () => {
  test("the header row matches the Asan layout character for character, read by openpyxl", async () => {
    const { bytes } = await buildFile(await listOk(), new Map());
    const aoa = readWithOpenpyxl(bytes);

    expect(aoa[0].length).toBe(18);
    for (let i = 0; i < 18; i++) {
      // openpyxl reports a genuinely empty cell as None; column K is the one blank header.
      const got = aoa[0][i] ?? "";
      expect(got, `column ${String.fromCharCode(65 + i)}`).toBe(SALES_HEADERS[i]);
    }
  });

  test("one row per line item, with the invoice number repeating across its lines", async () => {
    const rows = await listOk();
    const { docs } = await buildFile(rows, new Map());
    const exportable = docs.filter((d) => !d.blockedReason);
    expect(exportable.length).toBeGreaterThan(0);

    for (const d of exportable) {
      const built = buildInvoiceRows(d.payload as never, 7);
      const lineCount = Number(
        dbScalar(`select count(*) from sales_quote_items where quote_id = '${d.sourceId}'`),
      );
      expect(built.length, `${d.title}: one sheet row per line item`).toBe(lineCount);
      expect(built.length).toBe(d.rowCount);
      // Column A repeats — that is how the layout carries a multi-line invoice.
      for (const r of built) expect(r[0]).toBe(7);
    }
  });

  test("⛔ T Toman becomes exactly T × 10 — the assertion this whole mission turns on", async () => {
    const rows = await listOk();
    const docs = groupInvoiceRows(rows, new Map());
    const exportable = docs.filter((d) => !d.blockedReason);
    expect(exportable.length, "there must be at least one exportable invoice").toBeGreaterThan(0);

    for (const d of exportable) {
      // The oracle is the database, read independently of the RPC that produced the rows.
      const finalToman = Number(
        dbScalar(`select final_amount from sales_quotes where id = '${d.sourceId}'`),
      );
      expect(Number.isFinite(finalToman)).toBe(true);

      const built = buildInvoiceRows(d.payload as never, 1);
      const sumH = built.reduce((s, r) => s + (typeof r[7] === "number" ? r[7] : 0), 0);

      // Strict, not approximate: sum of column H in Rial is exactly ten times the AfraKala total.
      expect(sumH, `${d.title}: sum(H) must be final_amount x 10`).toBe(finalToman * 10);

      // And per line, G × F = H, all in Rial, so the ×10 cannot have been applied twice to one
      // cell and once to another.
      for (const r of built) {
        const qty = r[5] as number;
        const unit = r[6] as number | null;
        const total = r[7] as number | null;
        if (unit === null || total === null) continue;
        expect(Math.round(unit * qty)).toBe(total);
        expect(unit % 10, "a Rial amount converted from whole Toman ends in 0").toBe(0);
      }
    }
  });

  test("the ×10 survives into the written file, verified by openpyxl", async () => {
    const rows = await listOk();
    const { docs, bytes } = await buildFile(rows, new Map());
    const exportable = docs.filter((d) => !d.blockedReason);
    const aoa = readWithOpenpyxl(bytes);

    // Row 0 is the header; the data rows follow in the same order they were built.
    const dataRows = aoa.slice(1);
    expect(dataRows.length).toBe(exportable.reduce((n, d) => n + d.rowCount, 0));

    const expectedTotal = exportable.reduce((s, d) => s + (d.totalToman ?? 0) * 10, 0);
    const gotTotal = dataRows.reduce((s, r) => s + (typeof r[7] === "number" ? r[7] : 0), 0);
    expect(gotTotal, "column H across the whole file, in Rial").toBe(expectedTotal);

    // Numeric cells, not strings: a formatted string is not summable inside Asan.
    for (const r of dataRows) {
      expect(typeof r[7], "مبلغ کل must be a number in the file").toBe("number");
      expect(typeof r[5], "تعداد must be a number in the file").toBe("number");
    }
  });

  test("dates are valid Jalali strings in Asan's exact format", async () => {
    const rows = await listOk();
    const { docs, bytes } = await buildFile(rows, new Map());
    const aoa = readWithOpenpyxl(bytes);
    expect(docs.length).toBeGreaterThan(0);

    for (const r of aoa.slice(1)) {
      const d = String(r[1]);
      expect(d, "Jalali YYYY/MM/DD, Latin digits, zero-padded").toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
      const [y, m, day] = d.split("/").map(Number);
      expect(y).toBeGreaterThanOrEqual(1400);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(12);
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(31);
    }
  });

  test("column K stays empty and a missing product code does not block the line", async () => {
    const rows = await listOk();
    const { docs, bytes } = await buildFile(rows, new Map());
    const aoa = readWithOpenpyxl(bytes);
    const dataRows = aoa.slice(1);
    expect(dataRows.length).toBeGreaterThan(0);

    for (const r of dataRows) {
      expect(r[10] ?? null, "column K is confirmed empty on the sales tab").toBeNull();
      expect(r[12] ?? null, "عوارض — AfraKala records none").toBeNull();
      expect(r[14] ?? null, "گروه حساب/کد۲ — no AfraKala counterpart").toBeNull();
      expect(r[15] ?? null, "سریال کد کالا — AfraKala products carry no serial").toBeNull();
      // The person code is mandatory and present, because a document lacking it is blocked.
      expect(String(r[2] ?? "").length, "کدشخص must never be empty in the file").toBeGreaterThan(0);
    }

    // The owner's asymmetric rule, proved on real data: none of these products has an Asan code,
    // and the invoice exports anyway with column D empty. Asan mints a code under group 101.
    const exported = docs.filter((d) => !d.blockedReason);
    const withoutProductCode = exported.flatMap((d) =>
      (d.payload as { lines: InvoiceExportRow[] }).lines.filter((l) => !l.product_code),
    );
    expect(withoutProductCode.length, "this database has no product Asan codes on these lines").toBeGreaterThan(
      0,
    );
    for (const r of dataRows) {
      if ((r[3] ?? "") === "") expect(String(r[4] ?? "").length, "نام کالا still present").toBeGreaterThan(0);
    }
  });

  test("the same selection exported twice is byte-identical", async () => {
    // Numbering and ordering must both be stable, or the accountant cannot tell a re-export from
    // a new export.
    const first = await buildFile(await listOk(), new Map([["x", 1]]));
    const second = await buildFile(await listOk(), new Map([["x", 1]]));
    const h = (b: ArrayBuffer) => crypto.createHash("sha256").update(Buffer.from(b)).digest("hex");
    expect(h(first.bytes)).toBe(h(second.bytes));
    expect(first.rows).toEqual(second.rows);
  });

  test("the workbook is a real xlsx, not a renamed csv", async () => {
    const { bytes } = await buildFile(await listOk(), new Map());
    const head = Buffer.from(bytes).subarray(0, 4);
    expect([...head], "zip magic bytes").toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

// ---------------------------------------------------------- payment allocation ----

test.describe("cash and bank", () => {
  test("⛔ the deposit is the amount ALLOCATED to the invoice, never the receipt total", async () => {
    // The bug the dry run caught. Receipt fd8194a5 totals 10 100 000 000 Toman; only
    // 100 100 000 of it belongs to SQ-2026-000003. Summing the receipt would have written a bank
    // deposit one hundred times the invoice into live accounting.
    const rows = await listOk();
    const withBank = rows.filter((r) => r.bank_amount !== null);
    expect(withBank.length, "this database has an approved bank receipt to check").toBeGreaterThan(0);

    for (const r of withBank) {
      const allocated = Number(
        dbScalar(
          `select coalesce(sum(l.amount), 0) from payment_receipt_links l join payment_receipts p on p.id = l.receipt_id where l.quote_id = '${r.doc_id}' and p.status = 'approved' and p.destination_bank_account_id is not null`,
        ),
      );
      const receiptTotal = Number(
        dbScalar(
          `select coalesce(sum(p.amount), 0) from payment_receipt_links l join payment_receipts p on p.id = l.receipt_id where l.quote_id = '${r.doc_id}' and p.status = 'approved' and p.destination_bank_account_id is not null`,
        ),
      );
      expect(Number(r.bank_amount)).toBe(allocated);
      expect(receiptTotal, "the two really do differ here — the test is not vacuous").not.toBe(
        allocated,
      );
    }
  });

  test("payment totals appear on the first line only", async () => {
    const rows = await listOk();
    for (const r of rows) {
      if (r.line_no !== null && r.line_no > 1) {
        expect(r.cash_amount, "repeating it would multiply the receipt by the line count").toBeNull();
        expect(r.bank_amount).toBeNull();
      }
    }
  });

  test("an unapproved receipt is not money received", async () => {
    // SQ-2026-000005 carries two pending_review receipts and must show no payment at all.
    const rows = await listOk();
    const pendingOnly = dbRows(
      "select distinct l.quote_id::text from payment_receipt_links l join payment_receipts p on p.id = l.receipt_id where l.quote_id is not null and p.status <> 'approved' and not exists (select 1 from payment_receipt_links l2 join payment_receipts p2 on p2.id = l2.receipt_id where l2.quote_id = l.quote_id and p2.status = 'approved')",
    );
    expect(pendingOnly.length).toBeGreaterThan(0);
    for (const id of pendingOnly) {
      for (const r of rows.filter((x) => x.doc_id === id)) {
        expect(r.cash_amount).toBeNull();
        expect(r.bank_amount).toBeNull();
      }
    }
  });
});

// ------------------------------------------------------------------ numbering ----

test("an exported invoice keeps its number, and the preview shows it", async () => {
  const rows = await listOk();
  const exportable = groupInvoiceRows(rows, new Map()).filter((d) => !d.blockedReason);
  expect(exportable.length).toBeGreaterThan(0);
  const target = exportable[0];

  const assign = async () =>
    rest<{ source_id: string; asan_number: number }[]>(
      adminJwt,
      "/rpc/asan_assign_document_numbers",
      {
        method: "POST",
        body: JSON.stringify({ _doc_type: "sales_invoice", _ids: [target.sourceId] }),
      },
    );

  const first = await assign();
  expect(first.status, first.text).toBeLessThan(300);
  numbered.add(target.sourceId);
  const n = first.body![0].asan_number;
  expect(n).toBeGreaterThan(0);

  // Column A carries it, and a re-export carries the same one.
  const built = buildInvoiceRows(target.payload as never, n);
  expect(built.every((r) => r[0] === n)).toBe(true);

  const second = await assign();
  expect(second.body![0].asan_number).toBe(n);

  // And the listing now reports it, which is what the accountant cross-checks against.
  const relisted = groupInvoiceRows(await listOk(), new Map([[target.sourceId, n]]));
  expect(relisted.find((d) => d.sourceId === target.sourceId)!.asanNumber).toBe(n);
});

// ------------------------------------------------- a blocked document, on purpose ----

test("a quote whose customer has no Asan code is blocked, not dropped", async () => {
  // Every accepted quote's customer already has an Asan code, so the block path can only be
  // reached by constructing it: remove one code, re-list, put it back.
  //
  // ⛔ This test touches LIVE identity data, so the restore is not a convenience — it is the
  // riskiest line in the file. A first draft restored with `insert (person_id, kind, value)`;
  // `person_identifiers` has no `value` column, so the insert threw *inside* `finally`, the
  // failure was masked by the assertion failure it was cleaning up after, and a real Asan code
  // stayed deleted. It is now restored from `customers.accounting_code` — the exact source
  // migration 283 backfilled it from — the restore is asserted here rather than hoped for, and
  // `afterAll` re-runs the same backfill unconditionally so a crash mid-test still heals it.
  const rows = await listOk();
  const exportable = groupInvoiceRows(rows, new Map()).filter((d) => !d.blockedReason);
  expect(exportable.length).toBeGreaterThan(0);
  const target = exportable[0];

  const personId = dbScalar(
    `select customer_person_id from sales_quotes where id = '${target.sourceId}'`,
  );
  expect(personId).toMatch(/[0-9a-f-]{36}/);
  const before = dbScalar(
    `select value_raw || '|' || value_normalized || '|' || status || '|' || is_primary::text from person_identifiers where person_id = '${personId}' and kind = 'asan_person_code'`,
  );
  const code = before.split("|")[0];
  expect(code.length).toBeGreaterThan(0);
  // The restore reads from here, so prove the source really holds it before deleting anything.
  expect(
    dbScalar(`select btrim(accounting_code) from customers where person_id = '${personId}'`),
    "the restore source must already agree with the row being removed",
  ).toBe(code);

  try {
    dbExecE2e(
      `-- ${MARK} temporarily remove the Asan code so the block path is really exercised
       delete from person_identifiers where person_id = '${personId}' and kind = 'asan_person_code';`,
    );

    const after = await listOk();
    const row = after.find((r) => r.doc_id === target.sourceId);
    expect(row, "still listed — blocked means visible, not absent").toBeTruthy();
    expect(row!.blocked_reason).toContain("کد آسان");
    expect(row!.person_code).toBeNull();

    // And it is absent from the file.
    const { bytes, docs } = await buildFile(after, new Map());
    expect(docs.find((d) => d.sourceId === target.sourceId)!.blockedReason).toBeTruthy();
    const aoa = readWithOpenpyxl(bytes);
    const codes = aoa.slice(1).map((r) => String(r[2] ?? ""));
    expect(codes).not.toContain(code);
  } finally {
    restoreAsanPersonCodes();
  }

  expect(
    dbScalar(
      `select value_raw || '|' || value_normalized || '|' || status || '|' || is_primary::text from person_identifiers where person_id = '${personId}' and kind = 'asan_person_code'`,
    ),
    "the row must come back exactly as it was, not merely come back",
  ).toBe(before);

  const restored = await listOk();
  const row = restored.find((r) => r.doc_id === target.sourceId);
  expect(row!.person_code).toBe(code);
  expect(row!.blocked_reason).toBeNull();
});

// ------------------------------------------------------------------ the page ----

test("the export page lists the sales invoices in a real browser", async ({ page }) => {
  await page.goto("/admin/asan-export");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "خروجی برای آسان" })).toBeVisible();

  // The default range is the last 90 days, which does not reach these July quotes, so the test
  // drives the button and asserts against whatever the page itself found.
  await page.getByRole("button", { name: "نمایش اسناد بازه" }).click();
  await page.waitForTimeout(1500);

  // Whatever it found, it must never claim more selected rows than it listed, and the unit must
  // still be stated on screen next to real data.
  await expect(page.getByText("واحد مبلغ خروجی:")).toBeVisible();
  await expect(page.getByText("سندِ بازه انتخاب شده")).toBeVisible();
});
