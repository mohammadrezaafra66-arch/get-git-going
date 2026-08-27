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
import { execFileSync } from "node:child_process";
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

/**
 * THE THREE OPEN HALVES, REWRITTEN 2026-08-27 AFTER AN ADVERSARIAL REVIEW FOUND THEM VACUOUS.
 *
 * They used to PATCH each column back to the value it already held — `{status: <current>}`,
 * `{amount: Number(before)}`. The trigger compares with `IS DISTINCT FROM`, so a same-value
 * write is NEVER a change and can never be refused. The reviewer added `status` and
 * `reversal_journal_entry_id` to the locked column list, which genuinely broke approve/reject
 * on every posted receipt, and **all three tests stayed green.**
 *
 * They now write a genuinely DIFFERENT value, inside a transaction that never commits — so the
 * write is real enough for the trigger to judge, and nothing survives it. Same reasoning as
 * RULE 12: a transaction that never commits changes nothing.
 */
function openHalf(column: string, newValueSql: string, where: string): string {
  const sql = `
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT (array_agg(user_id ORDER BY user_id))[1]
                              FROM public.user_roles WHERE role='admin'),
                    'role','authenticated')::text, true);
CREATE TEMP TABLE r(line text) ON COMMIT DROP;
DO $o$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.payment_receipts WHERE ${where} ORDER BY id LIMIT 1;
  IF v_id IS NULL THEN INSERT INTO r VALUES ('SKIP'); RETURN; END IF;
  BEGIN
    UPDATE public.payment_receipts SET ${column} = ${newValueSql} WHERE id = v_id;
    INSERT INTO r VALUES ('ALLOWED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r VALUES ('REFUSED ' || SQLSTATE);
  END;
END $o$;
SELECT line FROM r;
ROLLBACK;
`;
  const out = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "afrakala-lan-db",
      "psql",
      "-U",
      "postgres",
      "-d",
      "afrakala",
      "-A",
      "-t",
      "-f",
      "-",
    ],
    { input: sql, encoding: "utf8" },
  );
  return (out.split(/[\r\n]+/).find((l) => /^(ALLOWED|REFUSED|SKIP)/.test(l.trim())) ?? "").trim();
}

test("status still CHANGES on a POSTED receipt — approve/reject must keep working", () => {
  // A genuinely different value: 'approved' <-> 'rejected', both legal per the CHECK constraint.
  const r = openHalf(
    "status",
    "CASE WHEN status = 'approved' THEN 'rejected' ELSE 'approved' END",
    "posting_status = 'posted'",
  );
  test.skip(r === "SKIP", "no posted receipt");
  expect(r, "status is locked on a posted receipt, which breaks approve/reject").toBe("ALLOWED");
});

test("reversal metadata still CHANGES on a POSTED receipt — reverse_document keeps working", () => {
  const r = openHalf("reversal_journal_entry_id", "gen_random_uuid()", "posting_status = 'posted'");
  test.skip(r === "SKIP", "no posted receipt");
  expect(r, "reversal metadata is locked, which breaks reverse_document").toBe("ALLOWED");
});

test("an UNPOSTED receipt still accepts a DIFFERENT amount — the OCR auto-apply path", () => {
  const r = openHalf("amount", "amount + 1", "posting_status <> 'posted'");
  test.skip(r === "SKIP", "no unposted receipt");
  expect(r, "an unposted receipt refuses an amount change, which breaks OCR auto-apply").toBe(
    "ALLOWED",
  );
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
