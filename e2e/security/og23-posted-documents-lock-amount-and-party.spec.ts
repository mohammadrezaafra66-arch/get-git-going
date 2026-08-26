/**
 * OG-23 / migration 400 — once a document is POSTED, its amount and counterparty are locked.
 * Its status is not.
 *
 * M7 measured the gap this closes: all three `*_block_delete_when_posted` triggers fire on
 * DELETE only, so a posted document could not be erased and could be freely ALTERED. The ledger
 * it fed is frozen — `journal_entries` carries an immutability trigger that blocks deletion even
 * for a superuser — so the guarantee was exactly half present.
 *
 * WHY THIS GATE GOES THROUGH PostgREST AND NOT THROUGH SQL.
 * The lock lives in a BEFORE UPDATE trigger rather than in an RPC, precisely because PostgREST
 * exposes these tables directly: `PATCH /payment_receipts?id=eq.<uuid>` reaches the row without
 * passing through any function, and a rule living inside an RPC is bypassed by the first client
 * that talks to the table instead. Testing it in SQL would prove the trigger fires; testing it
 * here proves the ROUTE that would bypass an RPC is closed.
 *
 * Four assertions, and the three OPEN ones are what stop this from being a lock that simply
 * refuses everything:
 *   CLOSED — the amount of a POSTED receipt cannot be changed.
 *   OPEN   — status still moves on a posted receipt (approve/reject must keep working).
 *   OPEN   — reversal metadata is still writable (reverse_document must keep working).
 *   OPEN   — an UNPOSTED receipt still accepts an amount change (the OCR auto-apply path).
 *
 * RULE 8 compliance — this gate must stay harmless in the DISTURBED state. The closed half is
 * the only one that attempts a real change, and it restores the original value unconditionally
 * afterwards rather than assuming the refusal held. A gate that relies on a guard to avoid
 * damage becomes an attack the moment that guard is removed to test it, which is exactly how
 * the OG-61 gate stripped the harness account's admin role.
 */
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

interface Receipt {
  id: string;
  amount: number | string | null;
  status: string | null;
}

let jwt: string;

test.beforeAll(() => {
  jwt = mintJwt(ADMIN_USER_ID);
});

function onePosted(): string | null {
  return (
    dbRows(
      "select id::text from public.payment_receipts where posting_status = 'posted' order by id limit 1",
    )[0] ?? null
  );
}

function oneUnposted(): string | null {
  return (
    dbRows(
      "select id::text from public.payment_receipts where posting_status <> 'posted' order by id limit 1",
    )[0] ?? null
  );
}

function amountOf(id: string): string {
  return dbRows(`select amount::text from public.payment_receipts where id = '${id}'`)[0] ?? "";
}

test("⛔ the amount of a POSTED receipt cannot be changed through PostgREST", async () => {
  const id = onePosted();
  test.skip(!id, "no posted receipt exists to lock");
  const before = amountOf(id!);

  const res = await rest<Receipt[]>(jwt, `/payment_receipts?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ amount: Number(before) + 1 }),
    headers: { Prefer: "return=representation" },
  });

  // Restore FIRST, unconditionally — before any assertion can throw and skip it. If the lock is
  // present this is a no-op write of the same value; if the lock is gone, it undoes the damage
  // this test just caused. RULE 8: never leave the repair behind an assertion.
  const afterWrite = amountOf(id!);
  if (afterWrite !== before) {
    dbRows(`select 1`); // touch, then repair via a privileged path
    const { execFileSync } = await import("node:child_process");
    execFileSync("docker", [
      "exec",
      "afrakala-lan-db",
      "psql",
      "-U",
      "postgres",
      "-d",
      "afrakala",
      "-c",
      `UPDATE public.payment_receipts SET amount = ${before} WHERE id = '${id}'`,
    ]);
  }

  expect(
    res.status,
    `a posted receipt's amount was accepted for change (status ${res.status}): ${res.text.slice(0, 200)}`,
  ).toBeGreaterThanOrEqual(400);
  expect(afterWrite, "the amount of a posted receipt actually changed").toBe(before);
});

test("status still moves on a POSTED receipt — approve/reject must keep working", async () => {
  const id = onePosted();
  test.skip(!id, "no posted receipt exists");
  const status = dbRows(`select status from public.payment_receipts where id = '${id}'`)[0];

  // Written back as-is: what is under test is that the column is ACCEPTED, not that it changes.
  const res = await rest(jwt, `/payment_receipts?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
    headers: { Prefer: "return=representation" },
  });
  expect(
    res.status,
    `status is locked on a posted receipt, which breaks approve/reject: ${res.text.slice(0, 200)}`,
  ).toBeLessThan(300);
});

test("reversal metadata is still writable on a POSTED receipt — reverse_document keeps working", async () => {
  const id = onePosted();
  test.skip(!id, "no posted receipt exists");
  const cur = dbRows(
    `select coalesce(reversal_journal_entry_id::text,'') from public.payment_receipts where id = '${id}'`,
  )[0];

  const res = await rest(jwt, `/payment_receipts?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ reversal_journal_entry_id: cur === "" ? null : cur }),
    headers: { Prefer: "return=representation" },
  });
  expect(
    res.status,
    `reversal metadata is locked, which breaks reverse_document: ${res.text.slice(0, 200)}`,
  ).toBeLessThan(300);
});

test("an UNPOSTED receipt still accepts an amount change — the OCR auto-apply path", async () => {
  const id = oneUnposted();
  test.skip(!id, "no unposted receipt exists to prove the OCR path still works");
  const before = amountOf(id!);

  // Same value: proves the write is ACCEPTED without altering the owner's data. The lock keys
  // on the posted state, not on the value, so this exercises the same code path.
  const res = await rest(jwt, `/payment_receipts?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ amount: Number(before) }),
    headers: { Prefer: "return=representation" },
  });
  expect(
    res.status,
    `an unposted receipt refuses an amount write, which breaks OCR auto-apply: ${res.text.slice(0, 200)}`,
  ).toBeLessThan(300);
  expect(amountOf(id!), "the open half must not alter the value").toBe(before);
});

test("all three document tables carry the lock — not just the one that was tested", () => {
  // payment_vouchers and dual_documents have no posted rows to exercise today, so their
  // protection is asserted structurally. Stated rather than left as a silent gap: this half
  // proves the trigger EXISTS, not that it fires.
  const trg = dbRows(`
    select c.relname
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and t.tgname like '%lock_when_posted%'
     order by 1
  `);
  expect(trg).toEqual(["dual_documents", "payment_receipts", "payment_vouchers"]);
});
