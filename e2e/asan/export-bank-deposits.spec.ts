import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { dbRows, dbScalar } from "../helpers/db";
import { E2E_PREFIX } from "../helpers/app";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

import { BANK_DEPOSIT_HEADERS } from "../../src/lib/asan/layouts";
import { buildAsanWorkbook } from "../../src/lib/asan/write-xlsx";
import {
  buildBankDepositRows,
  groupBankDepositRows,
  type BankDepositRow,
} from "../../src/lib/asan/export-bank-deposit-rows";
import {
  buildJournalRows,
  groupJournalRows,
  type JournalExportRow,
} from "../../src/lib/asan/export-journal-rows";

/**
 * ASAN M4.7 — the secondary bank-deposit export (`واریزیهای بانکی`).
 *
 * An alternative path for deposits, so the assertions that matter are the ones that tie it back
 * to the default path:
 *
 *   * the Latin transliterations are reproduced **exactly** — `Name_Moshtari`, not
 *     "Name_Moshtary" and not `نام مشتری`;
 *   * only **approved** receipts appear, and only those that landed in one of our bank accounts;
 *   * **the same receipt exported through both paths shows the same amount and the same payer**,
 *     which is the brief's own cross-check and the only thing that proves the two exports agree.
 *
 * This phase creates no test data at all: the live database already has exactly one approved
 * bank-received receipt and five unapproved ones, which is precisely the fixture needed.
 */

const FULL_RANGE = { from: "2026-01-01", to: "2026-12-31" };

let adminJwt: string;
let salesJwt: string | null = null;

async function listDeposits(jwt: string, from = FULL_RANGE.from, to = FULL_RANGE.to) {
  return rest<BankDepositRow[]>(jwt, "/rpc/asan_list_bank_deposit_export", {
    method: "POST",
    body: JSON.stringify({ _from: from, _to: to }),
  });
}

async function listOk(): Promise<BankDepositRow[]> {
  const res = await listDeposits(adminJwt);
  expect(res.status, res.text).toBeLessThan(300);
  return res.body ?? [];
}

// OG-46: captured from the live database at spec start, not written into the file as a literal.
// The old pin was `toBe(6)` — true on the day this spec was written and false from the moment
// anyone added a receipt. What the assertion is FOR is "this spec wrote nothing", and that is a
// statement about a change between two moments, so it needs a reading from the first moment.
let receiptsBaseline = 0;

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  const salesUser = await userWithRole(adminJwt, "sales");
  salesJwt = salesUser ? mintJwt(salesUser) : null;
  receiptsBaseline = Number(dbScalar("select count(*) from payment_receipts"));
});

test.afterAll(() => {
  // This spec writes nothing, so rule 2.10 is satisfied by construction — asserted rather than
  // assumed, because "the test did not write anything" is exactly the kind of claim that rots.
  expect(
    Number(dbScalar("select count(*) from payment_receipts")),
    "rule 2.10 — the receipt table must hold exactly what it held before this spec ran",
  ).toBe(receiptsBaseline);
  expect(
    Number(dbScalar(`select count(*) from payment_receipts where description like '${E2E_PREFIX}%'`)),
  ).toBe(0);
});

test("the Latin header row is reproduced exactly", async () => {
  const rows = await listOk();
  const docs = groupBankDepositRows(rows).filter((d) => !d.blockedReason);
  const built = docs.flatMap((d) => buildBankDepositRows(d.payload as never));
  const bytes = await buildAsanWorkbook({ headers: BANK_DEPOSIT_HEADERS, rows: built });

  const XLSX = await import("xlsx");
  const wb = XLSX.read(Buffer.from(bytes), { type: "buffer" });
  const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    raw: true,
    defval: null,
  });

  // Character for character, as the Asan screen writes them. Not translated, not spell-corrected.
  expect(aoa[0]).toEqual([
    "Date",
    "Code_M",
    "Name_Moshtari",
    "Shomare_Peygiri",
    "Mablagh",
    "Bank_cod",
  ]);
  expect(aoa[0].some((h) => /[؀-ۿ]/.test(String(h))), "no Persian in this header").toBe(
    false,
  );
});

test("only approved receipts that landed in one of our banks appear", async () => {
  const rows = await listOk();
  const listed = new Set(rows.map((r) => r.doc_id));

  const eligible = dbRows(
    "select id::text from payment_receipts where status = 'approved' and destination_bank_account_id is not null and payment_date between '2026-01-01' and '2026-12-31'",
  );
  expect(eligible.length, "the fixture must contain an approved bank receipt").toBeGreaterThan(0);
  expect([...listed].sort()).toEqual([...eligible].sort());

  // The unapproved receipts are absent, and that is the point: a receipt awaiting review is not
  // money received.
  //
  // OG-46: this used to read `toBe(5)`, which was a census of the fixture on the day it was
  // written, not a property of the export. What the assertion is actually guarding is that the
  // exclusion is not VACUOUS — that there is at least one unapproved receipt for it to exclude.
  // Pinning the exact number tested the database's contents; `toBeGreaterThan(0)` tests the
  // export. The loop below is the real assertion and it is unchanged.
  const unapproved = dbRows("select id::text from payment_receipts where status <> 'approved'");
  expect(
    unapproved.length,
    "the exclusion is not vacuous — there really are unapproved receipts to exclude",
  ).toBeGreaterThan(0);
  for (const id of unapproved) expect(listed.has(id)).toBe(false);
});

test("⛔ the amount is Toman × 10 and the bank code is the owner's real one", async () => {
  const rows = await listOk();
  const docs = groupBankDepositRows(rows).filter((d) => !d.blockedReason);
  expect(docs.length).toBeGreaterThan(0);

  for (const d of docs) {
    const toman = Number(dbScalar(`select amount from payment_receipts where id = '${d.sourceId}'`));
    const built = buildBankDepositRows(d.payload as never);
    expect(built.length, "one row per deposit — a deposit has no line items").toBe(1);
    expect(built[0][4], "Mablagh in Rial").toBe(toman * 10);
    expect(typeof built[0][4], "a number, not a formatted string").toBe("number");

    // Bank Mellat is 8 (migration 288, the owner's number rather than the researched guess).
    const bankCode = dbScalar(
      `select ba.accounting_code from payment_receipts r join bank_accounts ba on ba.id = r.destination_bank_account_id where r.id = '${d.sourceId}'`,
    );
    expect(built[0][5]).toBe(bankCode);
    expect(String(built[0][0])).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  }
});

test("the same receipt through both paths shows the same amount and payer", async () => {
  // The brief's own cross-check, and the only assertion that proves the alternative path agrees
  // with the default one rather than merely working on its own terms.
  const deposits = await listOk();
  expect(deposits.length).toBeGreaterThan(0);
  const dep = deposits[0];

  // The journal entry produced by that same receipt.
  const entryId = dbScalar(
    `select id from journal_entries where source_type = 'payment_receipt' and source_id = '${dep.doc_id}'`,
  );
  test.skip(!/[0-9a-f-]{36}/.test(entryId), "this receipt produced no journal entry");

  const res = await rest<JournalExportRow[]>(adminJwt, "/rpc/asan_list_journal_export", {
    method: "POST",
    body: JSON.stringify({ _from: FULL_RANGE.from, _to: FULL_RANGE.to, _filter: "all" }),
  });
  expect(res.status, res.text).toBeLessThan(300);
  const journalRows = (res.body ?? []).filter((r) => r.doc_id === entryId);
  expect(journalRows.length).toBeGreaterThan(0);

  const journalDoc = groupJournalRows(journalRows, new Map())[0];
  const journalBuilt = buildJournalRows(journalDoc.payload as never);
  const depositBuilt = buildBankDepositRows(
    (groupBankDepositRows([dep])[0].payload as never),
  );

  // Same money: the accounting document's debit total equals the deposit's Mablagh.
  const journalDebit = journalBuilt.reduce((s, r) => s + (typeof r[4] === "number" ? r[4] : 0), 0);
  expect(journalDebit, "both paths must state the same amount, in the same unit").toBe(
    depositBuilt[0][4],
  );

  // Same payer: the deposit's Code_M is one of the account codes on the accounting document.
  expect(journalBuilt.map((r) => r[0])).toContain(depositBuilt[0][1]);
});

test("a deposit whose payer has no Asan code is blocked, not silently dropped", async () => {
  // Constructed only in memory — nothing is written to the database. The rule under test is the
  // mapping's, and the source function's block reason is asserted separately below.
  const invented: BankDepositRow = {
    doc_id: "00000000-0000-4000-8000-000000000001",
    doc_label: "واریز آزمایشی",
    doc_date: "2026-07-25",
    party_name: "بدون کد",
    person_code: null,
    tracking_number: "1",
    amount: 1000,
    bank_code: "8",
    bank_title: "ملت",
    blocked_reason: "کد آسان برای «بدون کد» ثبت نشده است",
  };
  const docs = groupBankDepositRows([invented]);
  expect(docs[0].blockedReason).toContain("کد آسان");

  // And the source function really produces that reason — proved by reading its definition, since
  // every live receipt happens to have a payer code.
  const def = dbScalar(
    "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'asan_list_bank_deposit_export'",
  );
  expect(def).toContain("کد آسان برای");
  expect(def).toContain("کد آسان حساب بانکی مقصد ثبت نشده است");
  // The receipt's own free-text payer code must never become the identity source.
  expect(def, "payer_accounting_code is free text, not the identity store").not.toContain(
    "payer_accounting_code",
  );
});

test("this layout consumes no Asan number", () => {
  // Layout 4 has no document-number column, so there is nothing for numbering to keep stable.
  // The shell only skips assignment when `docType` is null, so that is the thing to pin down.
  // Read from source rather than imported: the definition module pulls in the Supabase client.
  const src = fs.readFileSync(path.resolve("src/lib/asan/export-bank-deposit.ts"), "utf8");
  expect(src).toContain("docType: null");
  expect(src).toContain('layout: "bank_deposit"');
  expect(src).toContain("available: true");

  const route = fs.readFileSync(path.resolve("src/routes/_app.admin.asan-export.tsx"), "utf8");
  expect(route, "assignment is skipped when the definition names no register").toContain(
    "if (definition.docType)",
  );
});

test("a salesperson cannot list bank deposits", async () => {
  test.skip(!salesJwt, "no sales user on this server");
  const res = await listDeposits(salesJwt!);
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(res.text).toContain("اجازهٔ خروجی");
});

test("the alternative deposit path is offered on the page, clearly labelled", async ({ page }) => {
  await page.goto("/admin/asan-export");
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox").first().click();

  const option = page.getByRole("option", { name: /واریزیهای بانکی/ });
  await expect(option).toBeVisible();
  await expect(option).not.toContainText("هنوز ساخته نشده");
  await option.click();

  // The accountant must be able to see which Asan screen this one targets, and that it is the
  // alternative rather than the default.
  await expect(page.getByText("واریزیهای بانکی", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("مسیر پیش‌فرض برای دریافت‌ها", { exact: false })).toBeVisible();
});
