/**
 * OG-67 / migration 404 — a bank PAYMENT reaches the Asan bank file (layout 4 / "template 1")
 * with a NEGATIVE amount, and no negative ever leaks into the accounting document
 * (layout 3 / "template 2").
 *
 * WHY THIS SPEC EXISTS ALONGSIDE `export-bank-deposits.spec.ts`.
 * That spec already asserts the sign two-sidedly — but on CONSTRUCTED rows, and it says so in
 * its own header: *"a payment row cannot be obtained from live data today"*. That was true. The
 * sign logic was tested and the DATA PATH to it did not exist. Migration 404 built the path, so
 * this asserts the same claim end to end: RPC → mapping → cells, on rows that are really in the
 * database.
 *
 * THE RULE BEING PROTECTED: bank receipts and bank payments are AUTOMATIC through this
 * template; cash and cheque stay MANUAL and must never appear here.
 *
 * The two directions the owner required are genuinely different claims:
 *   1. A bank payment arrives in template 1 with a negative Mablagh.
 *   2. No negative reaches template 2 — where a minus sign in بدهکار/بستانکار would be read as
 *      a real accounting value rather than a direction.
 *
 * Every fixture is COMPUTED from live data (A2.11) and this spec WRITES NOTHING — it only reads
 * the export. RULE 12 does not apply because no document is created.
 */
import { expect, test } from "@playwright/test";
import { buildBankDepositRows, type BankDepositRow } from "@/lib/asan/export-bank-deposit-rows";
import { buildJournalRows, groupJournalRows } from "@/lib/asan/export-journal-rows";
import { dbRows } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

const WIDE_FROM = "2000-01-01";
const WIDE_TO = "2100-01-01";

let jwt: string;

test.beforeAll(() => {
  jwt = mintJwt(ADMIN_USER_ID);
});

async function bankExport(): Promise<BankDepositRow[]> {
  const res = await rest<BankDepositRow[]>(jwt, "/rpc/asan_list_bank_deposit_export", {
    method: "POST",
    body: JSON.stringify({ _from: WIDE_FROM, _to: WIDE_TO }),
  });
  expect(res.status, res.text).toBeLessThan(300);
  return res.body ?? [];
}

test("the export returns BOTH directions from live data", async () => {
  const rows = await bankExport();
  const directions = new Set(rows.map((r) => (r as { direction?: string }).direction));

  // Both halves matter. Only receipts means 404 did nothing; only payments means the receipt
  // branch was lost, which no count of payments would notice.
  expect(
    directions.has("receipt"),
    `no receipt rows in the export; directions seen: ${[...directions].join(", ")}`,
  ).toBe(true);
  expect(
    directions.has("payment"),
    `no payment rows in the export; directions seen: ${[...directions].join(", ")}`,
  ).toBe(true);
});

test("⛔ a bank PAYMENT reaches template 1 with a NEGATIVE Mablagh", async () => {
  const rows = await bankExport();
  const payment = rows.find(
    (r) => (r as { direction?: string }).direction === "payment" && !r.blocked_reason,
  );
  expect(payment, "no unblocked payment row in the live export").toBeTruthy();

  const cells = buildBankDepositRows({ row: payment! })[0];

  // Column E is Mablagh. Rial = Toman × 10, negated for a payment.
  const expected = -Math.round(Number(payment!.amount) * 10);
  expect(cells[4], `payment Mablagh should be ${expected}`).toBe(expected);
  expect(cells[4] as number, "a payment must be negative").toBeLessThan(0);

  // A real number, not a formatted string: a string is not summable in Excel and the minus must
  // be a numeric sign rather than a leading character.
  expect(typeof cells[4]).toBe("number");
  expect(cells.length, "layout 4 is 15 columns wide").toBe(15);
});

test("a bank RECEIPT stays POSITIVE in the same file", async () => {
  // The open half. A change that negated everything would satisfy the test above perfectly.
  const rows = await bankExport();
  const receipt = rows.find(
    (r) => (r as { direction?: string }).direction === "receipt" && !r.blocked_reason,
  );
  expect(receipt, "no unblocked receipt row in the live export").toBeTruthy();

  const cells = buildBankDepositRows({ row: receipt! })[0];
  expect(cells[4] as number, "a receipt must stay positive").toBeGreaterThan(0);
  expect(cells[4]).toBe(Math.round(Number(receipt!.amount) * 10));
});

test("⛔ cash and cheque appear in NEITHER direction — they stay manual", () => {
  // The rule the owner restated: only the BANK channel is automatic. Asserted against the
  // database rather than the export, so it catches a row that should have been excluded even if
  // the export currently happens to contain none.
  const leaked = dbRows(`
    select 'receipt ' || pr.id::text
      from public.payment_receipts pr
     where pr.status = 'approved' and pr.reversed_at is null
       and pr.destination_bank_account_id is not null
       and pr.document_channel in ('cash','cheque')
    union all
    select 'voucher ' || pv.id::text
      from public.payment_vouchers pv
     where pv.status = 'approved' and pv.reversed_at is null
       and pv.document_channel in ('cash','cheque')
     order by 1
  `);
  // These rows exist in the database; what matters is that the RPC's own filters exclude them.
  // The source text is checked because a row that SHOULD be excluded may simply not exist today.
  // Counted as OCCURRENCES, not as matching rows: there is one function, so a row-returning
  // query can only ever answer 1 and could never distinguish "one branch excludes them" from
  // "both do". An earlier draft asserted ["ok","ok"] and failed for exactly that reason.
  const exclusions = Number(
    dbRows(`
      select (length(pg_get_functiondef(p.oid))
              - length(replace(pg_get_functiondef(p.oid), 'NOT IN (''cash'', ''cheque'')', '')))
             / length('NOT IN (''cash'', ''cheque'')')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'asan_list_bank_deposit_export'
    `)[0] ?? "0",
  );
  expect(
    exclusions,
    `both the receipt and the voucher branch must exclude cash and cheque; found ${exclusions} exclusion(s). ` +
      `${leaked.length} cash/cheque rows exist in the database and would leak.`,
  ).toBe(2);
});

test("⛔ NO negative value reaches template 2 — the accounting document", async () => {
  // The leak this gate exists to prevent. In layout 3 a minus in بدهکار/بستانکار is read as a
  // real accounting value, not as a direction; a sign that escapes from layout 4 into it would
  // be silently wrong money rather than a visible error.
  const res = await rest<Record<string, unknown>[]>(jwt, "/rpc/asan_list_journal_export", {
    method: "POST",
    body: JSON.stringify({ _from: WIDE_FROM, _to: WIDE_TO, _filter: "all" }),
  });
  expect(res.status, res.text).toBeLessThan(300);
  // The RPC returns FLAT line rows, one per journal line — not documents. `groupJournalRows`
  // is what turns them into the payload `buildJournalRows` consumes; calling the builder on a
  // raw row throws "Cannot read properties of undefined (reading 'filter')", which is how the
  // first draft of this test failed.
  const flat = res.body ?? [];
  expect(flat.length, "no journal lines to check — this half would be vacuous").toBeGreaterThan(0);
  const docs = groupJournalRows(flat as never, new Map());

  const negatives: string[] = [];
  for (const doc of docs) {
    for (const row of buildJournalRows(doc.payload as never)) {
      for (const [i, cell] of row.entries()) {
        if (typeof cell === "number" && cell < 0) {
          negatives.push(`${String(doc.sourceId)} col ${i} = ${cell}`);
        }
      }
    }
  }
  expect(negatives, `a negative reached template 2: ${negatives.join(" | ")}`).toEqual([]);
});

test("the payment amount is POSITIVE in SQL — the sign belongs to the mapping", async () => {
  // If the RPC returned a negative, `mablaghFor` would negate it again and a payment would
  // arrive in the file as a POSITIVE number — the exact opposite of the requirement, produced
  // by two correct-looking pieces of code.
  const rows = await bankExport();
  const negativeInSql = rows.filter((r) => Number(r.amount) < 0);
  expect(
    negativeInSql.map((r) => `${r.doc_id}=${r.amount}`),
    "the RPC must never return a negative amount",
  ).toEqual([]);
});
