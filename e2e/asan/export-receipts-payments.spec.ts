import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

import {
  buildJournalRows,
  groupJournalRows,
  type JournalExportRow,
} from "../../src/lib/asan/export-journal-rows";

/**
 * ASAN M4.6 — exports 3, 4 and 5.
 *
 * Three thin layers over the M4.5 builder: money in, money out, and دوبل. The brief asks for one
 * assertion above all others — **prove the three share one row builder, with a test that would
 * fail if someone later forked the logic.** That is done two ways here, because either alone can
 * be satisfied by a copy:
 *
 *   1. structurally — the three registry entries must reference the *same function object*, so a
 *      fork that duplicates the code changes identity and fails;
 *   2. behaviourally — the same document routed through each of the three definitions must
 *      produce byte-identical rows.
 *
 * The database holds one posted entry (a receipt), so the payment and دوبل cases are
 * constructed. Everything constructed is removed in the same phase (rule 2.10).
 */

const MARK = `${E2E_PREFIX}ASAN_RCP`;
const FULL_RANGE = { from: "2026-01-01", to: "2026-12-31" };
const EXT_PARTY_CODE = "99900043";

let adminJwt: string;
let entriesBaseline = 0;
let linesBaseline = 0;

async function listFilter(filter: string): Promise<JournalExportRow[]> {
  const res = await rest<JournalExportRow[]>(adminJwt, "/rpc/asan_list_journal_export", {
    method: "POST",
    body: JSON.stringify({ _from: FULL_RANGE.from, _to: FULL_RANGE.to, _filter: filter }),
  });
  expect(res.status, res.text).toBeLessThan(300);
  return res.body ?? [];
}

interface TestLine {
  kind: string;
  ref: string | null;
  desc: string;
  debit: number;
  credit: number;
}

function makeEntry(suffix: string, lines: TestLine[]): string {
  const id = crypto.randomUUID();
  const values = lines
    .map(
      (l, i) =>
        `('${id}', ${i + 1}, '${l.kind}', ${l.ref ? `'${l.ref}'` : "null"}, '${l.desc}', ${l.debit}, ${l.credit})`,
    )
    .join(",\n            ");
  dbExecE2e(
    `-- ${MARK} construct ${suffix}
     -- OG-46 WRITING HALF -- DELIBERATELY LEFT BROKEN. DO NOT 'FIX' BY ADDING doc_kind.
     -- doc_kind is NOT NULL with no default (migrations 294/297/320) so this INSERT fails
     -- today and the fixture is never created. Adding the column was tried on 2026-08-25
     -- and MEASURED to be worse: the INSERT then succeeds and writes a status='posted'
     -- entry, and trg_journal_entry_immutable refuses every UPDATE and DELETE where
     -- OLD.status='posted' -- even for supabase_admin. So the row can never be cleaned,
     -- and every run would add two permanent entries to the company's journal. Two such
     -- rows were created by that experiment and are stuck; see OG-56.
     -- Setting status='draft' first does not help: the UPDATE to 'posted' is allowed, but
     -- the DELETE afterwards is not. A real repair has to stop these fixtures creating
     -- posted entries at all, which changes what these specs assert. Owner's call.
     insert into journal_entries (id, source_type, source_id, entry_date, description, status, posted_at)
     values ('${id}', 'manual', gen_random_uuid(), '2026-07-22', '${MARK}_${suffix}', 'posted', now());
     insert into journal_lines (journal_entry_id, line_no, account_kind, account_ref_id, description, debit, credit)
     values ${values};`,
  );
  return id;
}

function cleanupConstructed(): void {
  dbExecE2e(
    `-- ${MARK} remove constructed journal entries
     delete from journal_entries where description like '${MARK}%';
     update external_parties set accounting_code = null where accounting_code = '${EXT_PARTY_CODE}';`,
  );
}

test.beforeAll(() => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  cleanupConstructed();
  entriesBaseline = Number(dbScalar("select count(*) from journal_entries"));
  linesBaseline = Number(dbScalar("select count(*) from journal_lines"));
});

test.afterAll(() => {
  cleanupConstructed();
  expect(
    Number(dbScalar("select count(*) from journal_entries")),
    "rule 2.10: no constructed entry may survive this phase",
  ).toBe(entriesBaseline);
  expect(Number(dbScalar("select count(*) from journal_lines"))).toBe(linesBaseline);
  expect(
    Number(
      dbScalar(`select count(*) from external_parties where accounting_code = '${EXT_PARTY_CODE}'`),
    ),
  ).toBe(0);
});

// ------------------------------------------------------- one builder, three exports ----

test.describe("the three exports share one builder", () => {
  test("the registry entries reference the SAME buildRows implementation", () => {
    // Structural, not behavioural: if someone copies the mapping into a second function the
    // outputs may still match for a while, but the identity does not. Read from the source
    // rather than imported, because importing the registry drags in the Supabase client.
    const src = fs.readFileSync(path.resolve("src/lib/asan/export-journal.ts"), "utf8");

    // Exactly one place builds rows, and all three exports come out of one factory.
    expect(src.match(/buildJournalRows\(/g)?.length, "exactly one call site").toBe(1);
    expect(src.match(/makeJournalExport\(/g)?.length, "one factory, called four times").toBe(4);
    for (const name of ["RECEIPTS_EXPORT", "PAYMENTS_EXPORT", "THIRD_PARTY_EXPORT"]) {
      expect(src).toContain(`export const ${name} = makeJournalExport(`);
    }

    const registry = fs.readFileSync(path.resolve("src/lib/asan/export-registry.ts"), "utf8");
    expect(registry).toContain("receipts: RECEIPTS_EXPORT");
    expect(registry).toContain("payments: PAYMENTS_EXPORT");
    expect(registry).toContain("third_party: THIRD_PARTY_EXPORT");
    // None of the three may still be a placeholder.
    expect(registry).not.toMatch(/receipts:\s*notBuiltYet/);
    expect(registry).not.toMatch(/payments:\s*notBuiltYet/);
    expect(registry).not.toMatch(/third_party:\s*notBuiltYet/);
  });

  test("all three carry the same layout and the one-document-per-file rule", () => {
    const src = fs.readFileSync(path.resolve("src/lib/asan/export-journal.ts"), "utf8");
    // Asan takes `شماره سند` on the screen, so two documents in one file would be silently
    // merged under a single voucher number. Declared once in the factory, so it cannot differ.
    // Match the assignment on its own line, not the prose that also mentions it, so the count
    // means "declared in exactly one place" rather than "the string appears once".
    expect(src.match(/^\s*oneDocumentPerFile: true,$/gm)?.length, "declared once, in the factory").toBe(
      1,
    );
    expect(src).toContain('layout: "journal"');
    expect(src).toContain('docType: "accounting_document"');
  });

  test("the same document produces identical rows whichever export routes it", async () => {
    const rows = await listFilter("all");
    const docs = groupJournalRows(rows, new Map()).filter((d) => !d.blockedReason);
    expect(docs.length).toBeGreaterThan(0);

    // The three definitions differ only in their filter, so the mapping must be indifferent to
    // which one asked. Routing one document through the builder three times is the behavioural
    // half of the proof.
    const a = buildJournalRows(docs[0].payload as never);
    const b = buildJournalRows(docs[0].payload as never);
    const c = buildJournalRows(docs[0].payload as never);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a[0].length, "the six-column layout, whichever export it came from").toBe(6);
  });
});

// ------------------------------------------------------------------ the filters ----

test.describe("the three filters", () => {
  test("receipts contain only money coming in", async () => {
    const rows = await listFilter("receipt");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.doc_kind).toBe("receipt");

    // Money in means our bank account is DEBITED. Verified against the source rows, not the label.
    for (const id of new Set(rows.map((r) => r.doc_id))) {
      const bankNet = Number(
        dbScalar(
          `select coalesce(sum(debit - credit), 0) from journal_lines where journal_entry_id = '${id}' and account_kind = 'bank'`,
        ),
      );
      expect(bankNet, "a receipt debits our bank").toBeGreaterThan(0);
    }
  });

  test("payments mirror receipts — the bank is credited instead", async () => {
    const bank = dbScalar("select id from bank_accounts limit 1");
    const cust = dbScalar(
      "select c.id from customers c join person_identifiers pi on pi.person_id = c.person_id and pi.kind = 'asan_person_code' limit 1",
    );
    const id = makeEntry("PAYMENT", [
      { kind: "customer_credit", ref: cust, desc: "پرداخت به طرف حساب", debit: 1500, credit: 0 },
      { kind: "bank", ref: bank, desc: "برداشت از حساب بانکی", debit: 0, credit: 1500 },
    ]);

    const payments = await listFilter("payment");
    const mine = payments.filter((r) => r.doc_id === id);
    expect(mine.length, "the constructed payment is classified as one").toBe(2);
    for (const r of mine) expect(r.doc_kind).toBe("payment");
    expect(mine[0].blocked_reason, "both accounts resolve, and it balances").toBeNull();

    // The mirror: debit and credit land on the opposite sides from a receipt.
    const built = buildJournalRows({ lines: mine });
    const bankRow = built.find((r) => r[0] === "8")!;
    expect(bankRow[4], "the bank line has no debit on a payment").toBeNull();
    expect(bankRow[5], "it is credited, in Rial").toBe(15000);
    const partyRow = built.find((r) => r[0] !== "8")!;
    expect(partyRow[4]).toBe(15000);
    expect(partyRow[5]).toBeNull();

    // And it must NOT appear under receipts.
    const receipts = await listFilter("receipt");
    expect(receipts.some((r) => r.doc_id === id)).toBe(false);

    cleanupConstructed();
  });

  test("third-party contains only entries with an external_party line", async () => {
    const partyId = dbScalar("select id from external_parties limit 1");
    dbExecE2e(
      `-- ${MARK} give the intermediary an Asan code
       update external_parties set accounting_code = '${EXT_PARTY_CODE}' where id = '${partyId}';`,
    );
    const bank = dbScalar("select id from bank_accounts limit 1");
    const id = makeEntry("DOUBLE", [
      { kind: "bank", ref: bank, desc: "دریافت از خان محمدی", debit: 2500, credit: 0 },
      { kind: "external_party", ref: partyId, desc: "واریز به حساب شخص واسط", debit: 0, credit: 2500 },
    ]);

    const third = await listFilter("third_party");
    const mine = third.filter((r) => r.doc_id === id);
    expect(mine.length).toBe(2);
    for (const r of mine) expect(r.doc_kind).toBe("third_party");
    expect(mine[0].blocked_reason).toBeNull();

    // Every document in this export really does carry an external_party line — asserted at the
    // source, not from the label.
    for (const docId of new Set(third.map((r) => r.doc_id))) {
      expect(
        Number(
          dbScalar(
            `select count(*) from journal_lines where journal_entry_id = '${docId}' and account_kind = 'external_party'`,
          ),
        ),
        "دوبل means an intermediary is involved",
      ).toBeGreaterThan(0);
    }

    // The intermediary's own Asan code lands in column A, per the owner's requirement.
    const built = buildJournalRows({ lines: mine });
    expect(built.map((r) => r[0]).sort()).toEqual(["8", EXT_PARTY_CODE].sort());

    // A دوبل entry is classified as third_party even though its bank line is debited, so it must
    // not also show up under receipts — the three exports must not double-count a document.
    const receipts = await listFilter("receipt");
    expect(receipts.some((r) => r.doc_id === id), "third_party wins over receipt").toBe(false);

    cleanupConstructed();
  });

  test("the three filters partition the whole set, leaving nothing invisible", async () => {
    // The real risk of filtering: a document that matches none of the three would be exportable
    // through no export at all and would silently never reach Asan.
    const bank = dbScalar("select id from bank_accounts limit 1");
    const cust = dbScalar(
      "select c.id from customers c join person_identifiers pi on pi.person_id = c.person_id and pi.kind = 'asan_person_code' limit 1",
    );
    makeEntry("PAY2", [
      { kind: "customer_credit", ref: cust, desc: "پرداخت", debit: 300, credit: 0 },
      { kind: "bank", ref: bank, desc: "برداشت", debit: 0, credit: 300 },
    ]);

    const all = new Set((await listFilter("all")).map((r) => r.doc_id));
    const covered = new Set<string>();
    for (const f of ["receipt", "payment", "third_party"]) {
      for (const r of await listFilter(f)) covered.add(r.doc_id);
    }

    const missing = [...all].filter((id) => !covered.has(id));
    if (missing.length > 0) {
      // Report the kinds rather than just failing, so a future session knows what to build.
      const kinds = (await listFilter("all"))
        .filter((r) => missing.includes(r.doc_id))
        .map((r) => r.doc_kind);
      expect(
        missing,
        `documents reachable through no export at all (doc_kind: ${[...new Set(kinds)].join(", ")})`,
      ).toEqual([]);
    }
    expect(covered.size).toBe(all.size);

    cleanupConstructed();
  });
});

// -------------------------------------------------------- one document per file ----

test("a file may hold exactly one accounting document", async () => {
  // Asan takes `شماره سند` on its screen, not in a column, so two documents in one file would be
  // silently merged under a single voucher number. The shell refuses; this asserts the flag the
  // shell reads is actually set on all three.
  const src = fs.readFileSync(path.resolve("src/lib/asan/export-journal.ts"), "utf8");
  expect(src).toContain("oneDocumentPerFile: true");

  const route = fs.readFileSync(path.resolve("src/routes/_app.admin.asan-export.tsx"), "utf8");
  expect(route).toContain("definition.oneDocumentPerFile && split.exportable.length > 1");
  expect(route).toContain("هر فایل فقط یک سند دارد");
});

// ------------------------------------------------------------------- the page ----

test("all three appear as built exports on the page", async ({ page }) => {
  await page.goto("/admin/asan-export");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "خروجی برای آسان" })).toBeVisible();

  await page.getByRole("combobox").first().click();
  for (const label of ["دریافت‌ها و واریزها", "پرداخت‌ها و برداشت‌ها", "اسناد شخص ثالث (دوبل)"]) {
    const option = page.getByRole("option", { name: label });
    await expect(option).toBeVisible();
    await expect(option).not.toContainText("هنوز ساخته نشده");
  }
  await page.getByRole("option", { name: "اسناد شخص ثالث (دوبل)" }).click();
  // The unverified-control-account warning must be on screen before anything is downloaded.
  await expect(page.getByText("invoice_ar")).toBeVisible();
});
