/**
 * RULE 12 — no gate may leave a POSTED financial document behind.
 *
 * `create_receipt`, `create_payment` and `create_dual_document` all POST their document and
 * write a journal entry. Both deletions are then refused with the same sentence —
 * «سند ثبت‌شده فقط با سند برگشتی اصلاح می‌شود», a posted document is corrected only by a
 * reversing entry. So a gate that calls one of them through PostgREST leaves permanent residue
 * **on every run**, and no teardown can undo it. That is how OG-56's pair came to exist, and it
 * is how M1's first gate draft added a third before being rewritten.
 *
 * The rule: a gate that creates a financial document does it inside `BEGIN … ROLLBACK`, or it
 * does not create one. This spec is what makes the rule self-enforcing rather than advisory.
 *
 * WHY IT PINS IDs AND NOT MARKERS. This is OG-56's own lesson. A predicate like
 * `description NOT LIKE 'E2E%'` would forgive every future leak that happens to share the
 * prefix — the exemption would grow silently to fit whatever appeared. A pinned id forgives
 * exactly one row, so the fourth is caught the run it appears.
 *
 * WHEN IT FAILS, the fix is never to add the new id here. It is to find the gate that created
 * the row, move its writes inside a transaction that rolls back, and then reverse the row with
 * `reverse_document` — the system's own sanctioned correction, not a forced delete.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";

/**
 * The residue that already exists and cannot be removed. Every entry is a MISTAKE that has been
 * neutralised, not a fixture — nothing should ever be added to these lists.
 */
const KNOWN_STUCK_JOURNAL_IDS = [
  // OG-56: two posted manual entries from an early harness. Excluded by id in the specs that
  // count E2E_AUDIT_% rows, for exactly this reason.
  "81903a4c-a8f9-4d8c-869e-dad1595ae897",
  "db8a628c-d560-45f6-8083-be6804f4c345",
  // OG-76: M1's first gate draft. The original entry and its reversal — net zero in the ledger.
  "4e8e7a66-dffa-4944-8d05-d84d09d5213a",
  "da882553-7fb2-4dff-8cab-9c9034f3ec63",
];

/** OG-76's receipt. Reversed, ledger-neutral, and undeletable. */
const KNOWN_STUCK_RECEIPT_IDS = ["2e08a5ab-36f8-4faf-ae31-63b96fc7fc25"];

const quoted = (ids: string[]) => ids.map((i) => `'${i}'`).join(",");

test("⛔ no NEW test-marked posted receipt has appeared", () => {
  const rogue = dbRows(`
    select id::text || ' :: ' || coalesce(left(description, 60), '(no description)')
      from public.payment_receipts
     where posting_status = 'posted'
       and (description ilike 'E2E%' or tracking_number ilike 'E2E%'
            or description ilike '%M1PROBE%' or description ilike '%PROBE%')
       and id not in (${quoted(KNOWN_STUCK_RECEIPT_IDS)})
     order by 1
  `);
  expect(
    rogue,
    `a gate created a POSTED receipt that cannot be deleted: ${rogue.join(" | ")}. ` +
      "Do not add it to the known list — move that gate's writes inside BEGIN…ROLLBACK and reverse the row.",
  ).toEqual([]);
});

test("⛔ no NEW test-marked posted journal entry has appeared", () => {
  const rogue = dbRows(`
    select id::text || ' :: ' || coalesce(left(description, 60), '(no description)')
      from public.journal_entries
     where status = 'posted'
       and (description ilike 'E2E%' or description ilike '%PROBE%')
       and id not in (${quoted(KNOWN_STUCK_JOURNAL_IDS)})
     order by 1
  `);
  expect(
    rogue,
    `a gate created a POSTED journal entry that cannot be deleted: ${rogue.join(" | ")}`,
  ).toEqual([]);
});

test("the known residue is still exactly what it was — no more, and no fewer", () => {
  // Both directions. If a row VANISHED, either someone forced a delete past the immutability
  // trigger or the trigger stopped working; both are worth knowing about immediately, and both
  // would otherwise be invisible because the closed halves above only look for additions.
  const receipts = dbRows(
    `select id::text from public.payment_receipts where id in (${quoted(KNOWN_STUCK_RECEIPT_IDS)}) order by 1`,
  );
  expect(
    receipts.length,
    "a known-stuck receipt disappeared — the immutability guarantee moved",
  ).toBe(KNOWN_STUCK_RECEIPT_IDS.length);

  const entries = dbRows(
    `select id::text from public.journal_entries where id in (${quoted(KNOWN_STUCK_JOURNAL_IDS)}) order by 1`,
  );
  expect(entries.length, "a known-stuck journal entry disappeared").toBe(
    KNOWN_STUCK_JOURNAL_IDS.length,
  );
});

test("OG-76's receipt is REVERSED, so it is ledger-neutral rather than merely present", () => {
  // Being undeletable is not the same as being harmless. What makes this row acceptable is that
  // it was corrected the way the system prescribes: a compensating entry, not a forced delete.
  const row = dbRows(`
    select (reversed_at is not null)::text || '|' || (reversal_journal_entry_id is not null)::text
      from public.payment_receipts where id = '${KNOWN_STUCK_RECEIPT_IDS[0]}'
  `);
  expect(row[0], "OG-76's receipt is no longer marked reversed").toBe("true|true");
});

test("no spec calls a document-creating RPC outside a rolled-back transaction", () => {
  // The static half. The runtime halves above catch a leak after it happens; this catches the
  // code that would cause one, which is cheaper and names the file.
  //
  // `node:fs` is imported at module scope, not `require`d: this project is ESM and `require`
  // throws ReferenceError. That is the third ESM surface in one session, after `__dirname` and
  // a `require` in the M1 gate — cheap each time only because a test actually ran.
  //
  // Kept deliberately simple: any spec mentioning a create RPC must also mention ROLLBACK.

  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".spec.ts")) {
        const src = readFileSync(full, "utf8");
        const creates =
          /rpc\/create_(receipt|payment|dual_document)|create_(receipt|payment|dual_document)\s*\(/.test(
            src,
          );
        if (creates && !src.includes("ROLLBACK")) offenders.push(full);
      }
    }
  };
  walk("e2e");

  expect(
    offenders,
    `these specs create a financial document with no rolled-back transaction: ${offenders.join(", ")}`,
  ).toEqual([]);
});
