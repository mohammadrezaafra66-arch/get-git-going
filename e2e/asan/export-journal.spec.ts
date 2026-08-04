import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import { dbRows, dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

import { JOURNAL_HEADERS } from "../../src/lib/asan/layouts";
import { buildAsanWorkbook } from "../../src/lib/asan/write-xlsx";
import {
  buildJournalRows,
  groupJournalRows,
  type JournalExportRow,
} from "../../src/lib/asan/export-journal-rows";

/**
 * ASAN M4.5 — the shared accounting-document row builder.
 *
 * This is the engine exports 3, 4 and 5 all run on. What must hold:
 *
 *   * **every exported document balances**, and an unbalanced one is a hard block naming the
 *     imbalance — an unbalanced document entering Asan is exactly the silent corruption mission
 *     control 5.2 forbids;
 *   * **one unresolvable account code blocks the whole document**, not just its line, because a
 *     partial accounting document would enter Asan unbalanced;
 *   * `invoice_ar`, `clearing` and `other` **never resolve to a code** — the owner still owes two
 *     of them and has said the third does not exist in Asan;
 *   * codes resolve correctly for each kind that *can* resolve, including `external_party`.
 *
 * The database holds exactly one posted entry, so most cases are constructed. Every constructed
 * entry is removed in the same phase (rule 2.10) and the counts are asserted before and after.
 */

const MARK = `${E2E_PREFIX}ASAN_JRN`;
const FULL_RANGE = { from: "2026-01-01", to: "2026-12-31" };
/** Numeric, far outside the owner's real code range, so it can never be mistaken for one. */
const EXT_PARTY_CODE = "99900042";

let adminJwt: string;
let salesJwt: string | null = null;
let entriesBaseline = 0;
let linesBaseline = 0;

async function listExport(jwt: string, filter: string, from = FULL_RANGE.from, to = FULL_RANGE.to) {
  return rest<JournalExportRow[]>(jwt, "/rpc/asan_list_journal_export", {
    method: "POST",
    body: JSON.stringify({ _from: from, _to: to, _filter: filter }),
  });
}

async function listOk(filter = "all"): Promise<JournalExportRow[]> {
  const res = await listExport(adminJwt, filter);
  expect(res.status, res.text).toBeLessThan(300);
  return res.body ?? [];
}

/** Remove every journal entry this spec created. Lines cascade. Safe to call repeatedly. */
function cleanupConstructed(): void {
  dbExecE2e(
    `-- ${MARK} remove constructed journal entries
     delete from journal_entries where description like '${MARK}%';
     delete from external_parties where full_name like '${MARK}%';
     update external_parties set accounting_code = null where accounting_code = '${EXT_PARTY_CODE}';`,
  );
}

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  const salesUser = await userWithRole(adminJwt, "sales");
  salesJwt = salesUser ? mintJwt(salesUser) : null;

  // Heal first, then measure — a run that died mid-test must not redden everything below.
  cleanupConstructed();
  entriesBaseline = Number(dbScalar("select count(*) from journal_entries"));
  linesBaseline = Number(dbScalar("select count(*) from journal_lines"));
  expect(entriesBaseline).toBeGreaterThan(0);
});

test.afterAll(() => {
  cleanupConstructed();
  expect(
    Number(dbScalar("select count(*) from journal_entries")),
    "rule 2.10: no constructed journal entry may survive this phase",
  ).toBe(entriesBaseline);
  expect(Number(dbScalar("select count(*) from journal_lines"))).toBe(linesBaseline);
  expect(
    Number(dbScalar(`select count(*) from external_parties where accounting_code = '${EXT_PARTY_CODE}'`)),
    "the constructed external-party code must not survive either",
  ).toBe(0);
});

// ------------------------------------------------------------- the real entry ----

test.describe("the one posted entry on this database", () => {
  test("row count equals its line count, and both account codes resolve", async () => {
    const rows = await listOk();
    const byDoc = new Map<string, JournalExportRow[]>();
    for (const r of rows) byDoc.set(r.doc_id, [...(byDoc.get(r.doc_id) ?? []), r]);
    expect(byDoc.size).toBeGreaterThan(0);

    for (const [docId, lines] of byDoc) {
      const dbLines = Number(
        dbScalar(`select count(*) from journal_lines where journal_entry_id = '${docId}'`),
      );
      expect(lines.length, "one sheet row per journal line").toBe(dbLines);
    }

    // bank -> '8' (the owner's Mellat code, migration 288); customer_credit -> the person's code.
    const codes = rows.map((r) => r.account_code).sort();
    expect(codes).toContain("8");
    expect(rows.every((r) => (r.account_code ?? "") !== "")).toBe(true);
  });

  test("only posted entries are candidates", async () => {
    const rows = await listOk();
    const listed = new Set(rows.map((r) => r.doc_id));
    const posted = dbRows(
      "select id::text from journal_entries where status = 'posted' and entry_date between '2026-01-01' and '2026-12-31'",
    );
    expect([...listed].sort()).toEqual([...posted].sort());
  });

  test("the line's own description is used, not the entry's corrupted one", async () => {
    // The single posted entry is the bucket-C row migration 279 deliberately left corrupted.
    // Using the entry text would write that corruption straight into Asan.
    const rows = await listOk();
    const entryDesc = dbScalar(
      `select description from journal_entries where id = '${rows[0].doc_id}'`,
    );
    expect(entryDesc, "the fixture for this test is the corrupted entry").toContain("?");
    for (const r of rows) {
      expect(r.line_description, "column C must not carry the corruption").not.toContain("?");
      expect((r.line_description ?? "").length).toBeGreaterThan(0);
    }
  });

  test("a salesperson cannot list accounting documents", async () => {
    test.skip(!salesJwt, "no sales user on this server");
    const res = await listExport(salesJwt!, "all");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toContain("اجازهٔ خروجی");
  });

  test("an unknown filter and an inverted range are both refused", async () => {
    const bad = await listExport(adminJwt, "everything");
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.text).toContain("نوع سند");

    const inverted = await listExport(adminJwt, "all", "2026-12-31", "2026-01-01");
    expect(inverted.status).toBeGreaterThanOrEqual(400);
    expect(inverted.text).toContain("بازهٔ تاریخ");
  });
});

// ---------------------------------------------------------------- the layout ----

test.describe("the six-column layout", () => {
  test("headers are exact, and a financial line leaves B and D empty", async () => {
    const rows = await listOk();
    const docs = groupJournalRows(rows, new Map()).filter((d) => !d.blockedReason);
    expect(docs.length).toBeGreaterThan(0);

    const built = buildJournalRows(docs[0].payload as never);
    expect(built.length).toBe(docs[0].rowCount);
    for (const r of built) {
      expect(r.length).toBe(6);
      expect(r[1], "B کد کالا — a financial line carries no product").toBe("");
      expect(r[3], "D تعداد — a financial line has no quantity").toBeNull();
      expect(String(r[0]).length, "A کد حساب must never be blank in the file").toBeGreaterThan(0);
      // Exactly one of debit/credit is written; the other is an empty cell, never a zero.
      const hasDebit = r[4] !== null;
      const hasCredit = r[5] !== null;
      expect(hasDebit !== hasCredit, "exactly one side per line").toBe(true);
    }

    const bytes = await buildAsanWorkbook({ headers: JOURNAL_HEADERS, rows: built });
    const XLSX = await import("xlsx");
    const wb = XLSX.read(Buffer.from(bytes), { type: "buffer" });
    const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      raw: true,
      defval: null,
    });
    expect(aoa[0]).toEqual([...JOURNAL_HEADERS]);
  });

  test("⛔ amounts are Toman × 10, and every exported document balances", async () => {
    const rows = await listOk();
    const docs = groupJournalRows(rows, new Map()).filter((d) => !d.blockedReason);
    expect(docs.length).toBeGreaterThan(0);

    for (const d of docs) {
      const built = buildJournalRows(d.payload as never);
      const sumE = built.reduce((s, r) => s + (typeof r[4] === "number" ? r[4] : 0), 0);
      const sumF = built.reduce((s, r) => s + (typeof r[5] === "number" ? r[5] : 0), 0);
      expect(sumE, "sum(E) must equal sum(F) in the file").toBe(sumF);

      // The database is the oracle, read independently of the RPC that produced the rows.
      const debitToman = Number(
        dbScalar(
          `select coalesce(sum(debit), 0) from journal_lines where journal_entry_id = '${d.sourceId}'`,
        ),
      );
      expect(sumE, "and it is exactly ten times the AfraKala figure").toBe(debitToman * 10);
      expect(sumE % 10, "a Rial amount converted from whole Toman ends in 0").toBe(0);
    }
  });

  test("the same document exported twice is byte-identical", async () => {
    const make = async () => {
      const docs = groupJournalRows(await listOk(), new Map()).filter((d) => !d.blockedReason);
      return buildAsanWorkbook({
        headers: JOURNAL_HEADERS,
        rows: buildJournalRows(docs[0].payload as never),
      });
    };
    const h = (b: ArrayBuffer) => crypto.createHash("sha256").update(Buffer.from(b)).digest("hex");
    expect(h(await make())).toBe(h(await make()));
  });
});

// ------------------------------------------------------ constructed edge cases ----

interface TestLine {
  kind: string;
  ref: string | null;
  desc: string;
  debit: number;
  credit: number;
}

test.describe("documents that must be blocked", () => {
  /**
   * Create a posted entry with the given lines and return its id.
   *
   * Every line satisfies `journal_lines_one_side` individually — exactly one non-zero side — so
   * the cases below test the export's rules rather than the table's constraints.
   */
  function makeEntry(suffix: string, lines: TestLine[]): string {
    const id = crypto.randomUUID();
    const values = lines
      .map(
        (l, i) =>
          `('${id}', ${i + 1}, '${l.kind}', ${l.ref ? `'${l.ref}'` : "null"}, '${l.desc}', ${l.debit}, ${l.credit})`,
      )
      .join(",\n              ");
    dbExecE2e(
      `-- ${MARK} construct an entry: ${suffix}
       insert into journal_entries (id, source_type, source_id, entry_date, description, status, posted_at)
       values ('${id}', 'manual', gen_random_uuid(), '2026-07-20', '${MARK}_${suffix}', 'posted', now());
       insert into journal_lines (journal_entry_id, line_no, account_kind, account_ref_id, description, debit, credit)
       values ${values};`,
    );
    return id;
  }

  test("an unbalanced document is blocked, and the imbalance is named", async () => {
    const bank = dbScalar("select id from bank_accounts limit 1");
    const cust = dbScalar(
      "select c.id from customers c join person_identifiers pi on pi.person_id = c.person_id and pi.kind = 'asan_person_code' limit 1",
    );
    // Each line individually satisfies `journal_lines_one_side`; only the TOTALS disagree, which
    // is precisely the case the balance invariant exists for.
    const id = makeEntry("UNBALANCED", [
      { kind: "bank", ref: bank, desc: "تست تراز", debit: 1000, credit: 0 },
      { kind: "customer_credit", ref: cust, desc: "تست تراز", debit: 0, credit: 400 },
    ]);

    const row = (await listOk()).find((r) => r.doc_id === id);
    expect(row, "still listed — blocked means visible, not absent").toBeTruthy();
    expect(row!.blocked_reason).toContain("تراز نیست");
    expect(row!.blocked_reason).toContain("1000");
    expect(row!.blocked_reason).toContain("400");

    // And it is absent from the file.
    const docs = groupJournalRows(await listOk(), new Map());
    expect(docs.find((d) => d.sourceId === id)!.blockedReason).toBeTruthy();
    expect(docs.filter((d) => !d.blockedReason).some((d) => d.sourceId === id)).toBe(false);

    cleanupConstructed();
  });

  test("one unresolvable line blocks the WHOLE document, not just that line", async () => {
    const bank = dbScalar("select id from bank_accounts limit 1");
    const id = makeEntry("INVOICE_AR", [
      { kind: "bank", ref: bank, desc: "ردیف قابل حل", debit: 500, credit: 0 },
      { kind: "invoice_ar", ref: null, desc: "حساب کنترلی دریافتنی", debit: 0, credit: 500 },
    ]);

    const rows = (await listOk()).filter((r) => r.doc_id === id);
    expect(rows.length, "both lines are still listed").toBe(2);
    // The resolvable line resolves — and the document is blocked anyway. That is the point: a
    // partial accounting document would enter Asan unbalanced.
    expect(rows.find((r) => r.line_no === 1)!.account_code).toBeTruthy();
    for (const r of rows) {
      expect(r.blocked_reason, "the block is on the document, so every row carries it").toContain(
        "invoice_ar",
      );
    }
    expect(rows[0].blocked_reason).toContain("اعلام نشده");

    cleanupConstructed();
  });

  test("clearing and other are blocked with their own reasons, and never emit a code", async () => {
    const bank = dbScalar("select id from bank_accounts limit 1");

    for (const [kind, needle] of [
      ["clearing", "حساب واسط در آسان وجود ندارد"],
      ["other", "«other» هنوز تعریف نشده"],
    ] as const) {
      const id = makeEntry(`KIND_${kind}`, [
        { kind: "bank", ref: bank, desc: "یک طرف", debit: 700, credit: 0 },
        { kind, ref: null, desc: "طرف دیگر", debit: 0, credit: 700 },
      ]);

      const rows = (await listOk()).filter((r) => r.doc_id === id);
      expect(rows.length).toBe(2);
      expect(rows[0].blocked_reason, kind).toContain(needle);
      // The unresolvable line must carry NO code at all — not a blank string standing in for one.
      const bad = rows.find((r) => r.line_no === 2)!;
      expect(bad.account_code, `${kind} must never resolve to a code`).toBeNull();

      cleanupConstructed();
    }
  });

  test("an external_party line resolves once the party has a code, and blocks until it does", async () => {
    // The دوبل case. `external_parties` holds one row and it has no Asan code, which is exactly
    // the state the owner described: an intermediary he knows only by name and account number.
    const partyId = dbScalar("select id from external_parties limit 1");
    expect(partyId).toMatch(/[0-9a-f-]{36}/);
    const partyName = dbScalar(`select full_name from external_parties where id = '${partyId}'`);
    expect(
      dbScalar(`select coalesce(accounting_code, '<null>') from external_parties where id = '${partyId}'`),
      "the fixture is a party with no code",
    ).toBe("<null>");

    const bank = dbScalar("select id from bank_accounts limit 1");
    const id = makeEntry("EXT_PARTY", [
      { kind: "bank", ref: bank, desc: "واریز", debit: 900, credit: 0 },
      { kind: "external_party", ref: partyId, desc: "شخص واسط", debit: 0, credit: 900 },
    ]);

    // Blocked, and the party is NAMED — the owner asked for exactly that rather than a blank code.
    let rows = (await listOk()).filter((r) => r.doc_id === id);
    expect(rows[0].blocked_reason).toContain("کد حساب آسان");
    expect(rows[0].blocked_reason, "name the party so the owner knows whose code to supply").toContain(
      partyName,
    );
    expect(rows.find((r) => r.line_no === 2)!.account_code).toBeNull();

    // Give it a code: the same document becomes exportable and carries that code in column A.
    dbExecE2e(
      `-- ${MARK} supply an Asan code for the intermediary
       update external_parties set accounting_code = '${EXT_PARTY_CODE}' where id = '${partyId}';`,
    );
    rows = (await listOk()).filter((r) => r.doc_id === id);
    expect(rows[0].blocked_reason, "now balanced and fully resolvable").toBeNull();
    expect(rows.find((r) => r.line_no === 2)!.account_code).toBe(EXT_PARTY_CODE);
    expect(rows.find((r) => r.line_no === 1)!.account_code).toBe("8");

    const built = buildJournalRows({ lines: rows });
    expect(built.map((r) => r[0])).toEqual(["8", EXT_PARTY_CODE]);
    expect(built[1][5], "credit in Rial").toBe(9000);
    expect(
      built.reduce((s, r) => s + (typeof r[4] === "number" ? r[4] : 0), 0),
      "balanced in the file too",
    ).toBe(built.reduce((s, r) => s + (typeof r[5] === "number" ? r[5] : 0), 0));

    cleanupConstructed();
    expect(
      dbScalar(`select coalesce(accounting_code, '<null>') from external_parties where id = '${partyId}'`),
      "the party's code must be back to what it was",
    ).toBe("<null>");
  });

  test("a posted entry with no lines at all is listed and blocked", async () => {
    const id = crypto.randomUUID();
    dbExecE2e(
      `-- ${MARK} an entry with no lines
       insert into journal_entries (id, source_type, source_id, entry_date, description, status, posted_at)
       values ('${id}', 'manual', gen_random_uuid(), '2026-07-20', '${MARK}_NOLINES', 'posted', now());`,
    );
    const row = (await listOk()).find((r) => r.doc_id === id);
    expect(row, "an INNER JOIN would have made it vanish").toBeTruthy();
    expect(row!.blocked_reason).toContain("هیچ ردیفی ندارد");
    expect(row!.line_no).toBeNull();
    cleanupConstructed();
  });
});
