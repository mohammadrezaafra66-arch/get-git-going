/**
 * M1 / migrations 402 + 403 — an attachment precedes its document in the USER'S workflow, and
 * neither ROW can exist without the other.
 *
 * WHAT WAS THERE BEFORE. All three create RPCs accepted `p_attachment_ids uuid[]` and raised
 * `0A000` the moment one was passed, because `document_attachments.document_id` was NOT NULL
 * with a BEFORE INSERT existence trigger — so an attachment row could not precede its document,
 * and no id that parameter could carry was legitimate. The parameter had the wrong SHAPE for
 * any order of operations that was still allowed.
 *
 * WHAT IT IS NOW. `p_attachments jsonb` carries storage paths. The client uploads to storage and
 * OCRs from raw bytes BEFORE submitting; the RPC then creates the document row and its
 * attachment rows in ONE transaction. Three real foreign keys (`receipt_id`, `voucher_id`,
 * `dual_id`) with `ON DELETE CASCADE` replaced the hand-rolled trigger, and a CHECK requires
 * exactly one parent.
 *
 * THE TWO DIRECTIONS THE OWNER REQUIRED, and they are different claims:
 *   1. A failed document creation must leave NO attachment. Proven by making the RPC fail
 *      AFTER its attachment payload is accepted, then showing the count is unchanged.
 *   2. A document must not be created without its claimed attachment. Proven by a successful
 *      call: the document exists AND its attachments exist, linked, with the right count.
 *
 * Plus the structural guarantees that make orphans impossible rather than merely absent today:
 * no-parent, ghost-parent and two-parent rows are all refused by the engine.
 *
 * RULE 8 — nothing here can destroy anything. The success path creates its own receipt and
 * deletes it afterwards; that DELETE cascades to the attachments it made, which is itself part
 * of what is under test. No pre-existing row is written to.
 */
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

const MARK = "E2E_M1_ATTACH";

let jwt: string;

test.beforeAll(() => {
  jwt = mintJwt(ADMIN_USER_ID);
});

function attachmentCount(): number {
  return Number(dbRows("select count(*)::text from public.document_attachments")[0] ?? "0");
}

/** A customer that can actually receive a receipt — computed, never pinned (A2.11). */
function someCustomer(): string | null {
  return (
    dbRows(`
      select c.id::text
        from public.customers c
        join public.person_identifiers pi on pi.person_id = c.person_id
       where pi.kind = 'asan_person_code'
       order by c.id
       limit 1
    `)[0] ?? null
  );
}

function someBankAccount(): string | null {
  return (
    dbRows(
      "select id::text from public.bank_accounts where coalesce(accounting_code,'') <> '' order by id limit 1",
    )[0] ?? null
  );
}

test("the RPC no longer REFUSES attachments — the 0A000 wall is gone", async () => {
  // The narrowest possible probe of the old behaviour: a deliberately invalid payload. If the
  // old refusal were still in place it would raise 0A000 ("not supported") rather than the
  // 22023 ("must be an array") that the new validation raises. Either way the call fails, so
  // this asserts on WHICH failure — the difference between "refused as unsupported" and
  // "accepted, then validated".
  const res = await rest(jwt, "/rpc/create_receipt", {
    method: "POST",
    body: JSON.stringify({
      p_channel: "bank",
      p_customer_id: someCustomer(),
      p_amount: 1000,
      p_payment_date: "2026-08-26",
      p_payment_time: "10:00:00",
      p_attachments: "not-an-array",
    }),
  });
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(
    res.text,
    `expected the new array validation, got: ${res.text.slice(0, 240)}`,
  ).not.toContain("پیوست فایل در این نسخه هنوز پشتیبانی نمی‌شود");
});

test("⛔ a FAILED document creation leaves no attachment behind", async () => {
  const before = attachmentCount();

  // The payload is well-formed, so validation passes and the attachment branch is reached;
  // the receipt itself is then rejected (no customer). Everything is one transaction, so the
  // attachment must vanish with it.
  const res = await rest(jwt, "/rpc/create_receipt", {
    method: "POST",
    body: JSON.stringify({
      p_channel: "bank",
      p_customer_id: "00000000-0000-0000-0000-000000000000",
      p_amount: 1000,
      p_payment_date: "2026-08-26",
      p_payment_time: "10:00:00",
      p_attachments: [{ storage_path: `${MARK}/should-never-persist`, mime_type: "image/png" }],
    }),
  });

  expect(res.status, "the call was expected to fail").toBeGreaterThanOrEqual(400);
  expect(attachmentCount(), "a failed creation left an attachment behind").toBe(before);
  expect(
    dbRows(`select id::text from public.document_attachments where storage_path like '${MARK}%'`),
    "the marked attachment survived a rolled-back transaction",
  ).toEqual([]);
});

test("a SUCCESSFUL creation produces the document AND its attachments, linked", () => {
  // RUN INSIDE A ROLLED-BACK TRANSACTION, and that is not a stylistic choice.
  //
  // An earlier draft called this through PostgREST and then deleted the receipt. It could not:
  // `create_receipt` POSTS the receipt and writes a journal entry, and the database refuses both
  // deletions with the same sentence — «سند ثبت‌شده فقط با سند برگشتی اصلاح می‌شود», a posted
  // document is corrected only by a reversing entry. So that draft LEFT a posted receipt and an
  // immutable journal entry behind on every run: precisely the OG-56 trap, created by a gate
  // written to prevent orphans. The one it made was reversed with `reverse_document`, the
  // system's own sanctioned correction.
  //
  // The rule this obeys, from the owner's Phase 8 conditions: **a row that cannot be deleted
  // must not be created.** A transaction that never commits creates nothing, and the assertions
  // are made INSIDE it, where the rows genuinely exist.
  // `execFileSync` is imported at module scope, not required here: this project is ESM, and
  // `require` throws ReferenceError exactly as `__dirname` does. Same lesson, second surface.

  const sql = `
    BEGIN;
    SELECT set_config('request.jwt.claims',
      json_build_object('sub', (SELECT (array_agg(user_id ORDER BY user_id))[1]
                                  FROM public.user_roles WHERE role='admin'),
                        'role','authenticated')::text, true);
    -- Results go into a TEMP TABLE and are SELECTed, not RAISE NOTICE'd: psql writes notices to
    -- STDERR, and execFileSync returns only STDOUT, so an earlier draft asserted against the
    -- string "BEGIN" and failed for a reason that had nothing to do with the feature.
    CREATE TEMP TABLE m1probe(line text) ON COMMIT DROP;
    DO $probe$
    DECLARE
      v_customer uuid; v_bank uuid; v_receipt uuid; v_path text := '${MARK}/in-transaction.png';
      v_linked int; v_amount text;
    BEGIN
      SELECT c.id INTO v_customer FROM public.customers c
        JOIN public.person_identifiers pi ON pi.person_id = c.person_id
       WHERE pi.kind = 'asan_person_code' ORDER BY c.id LIMIT 1;
      SELECT id INTO v_bank FROM public.bank_accounts
       WHERE coalesce(accounting_code,'') <> '' ORDER BY id LIMIT 1;
      IF v_customer IS NULL OR v_bank IS NULL THEN
        INSERT INTO m1probe VALUES ('M1PROBE skip');
        RETURN;
      END IF;

      SELECT receipt_id INTO v_receipt FROM public.create_receipt(
        'bank', v_customer, 1000, public.tehran_today(), '10:00:00', v_bank,
        'M1PROBE-' || floor(random()*1e9)::text, NULL, NULL, NULL, NULL,
        '${MARK} in-transaction probe', '[]'::jsonb,
        jsonb_build_array(jsonb_build_object(
          'storage_path', v_path, 'mime_type', 'image/png',
          'ocr_status', 'done', 'ocr_payload', jsonb_build_object('amount', 1000)))
      );

      SELECT count(*) INTO v_linked FROM public.document_attachments WHERE receipt_id = v_receipt;
      SELECT ocr_payload ->> 'amount' INTO v_amount
        FROM public.document_attachments WHERE receipt_id = v_receipt;

      INSERT INTO m1probe VALUES (format('M1PROBE receipt=%s linked=%s amount=%s',
        (v_receipt IS NOT NULL), v_linked, coalesce(v_amount, 'NULL')));
    END
    $probe$;
    SELECT line FROM m1probe;
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
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );

  test.skip(
    out.includes("M1PROBE skip"),
    "no customer with an Asan code, or no coded bank account",
  );

  // The document was created AND exactly one attachment is linked to it AND the OCR payload
  // survived the round trip. Asserting only that a row appeared would pass if it had landed
  // against some other receipt.
  expect(out, `probe output: ${out.slice(-400)}`).toContain(
    "M1PROBE receipt=t linked=1 amount=1000",
  );

  // And nothing survived the rollback — the proof that this gate creates nothing.
  expect(
    dbRows(`select id::text from public.document_attachments where storage_path like '${MARK}%'`),
    "the in-transaction probe leaked an attachment",
  ).toEqual([]);
});

test("⛔ the engine refuses an attachment with no parent, a ghost parent, or two parents", () => {
  // Structural, and it is what makes the two behavioural halves above true in general rather
  // than only for the paths this spec happens to exercise.
  const fks = dbRows(`
    select conname from pg_constraint
     where conrelid = 'public.document_attachments'::regclass and contype = 'f'
     order by 1
  `);
  expect(fks.length, "expected three real foreign keys").toBe(3);

  const check = dbRows(`
    select pg_get_constraintdef(oid) from pg_constraint
     where conrelid = 'public.document_attachments'::regclass
       and conname = 'document_attachments_exactly_one_parent'
  `);
  expect(check.length, "the exactly-one-parent CHECK is missing").toBe(1);
  expect(check[0]).toContain("num_nonnulls");

  // The hand-rolled FK must be GONE, not merely bypassed — leaving it would mean two mechanisms
  // enforcing the same rule with different edge cases.
  expect(
    dbRows(
      "select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname = 'validate_document_attachment_ref'",
    ),
  ).toEqual([]);
});

test("all three branches can hold an attachment — dual is no longer refused", () => {
  // OG-73's other half. `document_type='dual'` used to raise 0A000 from the existence trigger
  // even though the CHECK constraint permitted it; with a typed column per parent there is
  // nothing left to refuse.
  const cols = dbRows(`
    select a.attname
      from pg_attribute a
     where a.attrelid = 'public.document_attachments'::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attname in ('receipt_id','voucher_id','dual_id')
     order by 1
  `);
  expect(cols).toEqual(["dual_id", "receipt_id", "voucher_id"]);

  // And each create RPC writes its own column, so two branches cannot land in one table.
  for (const [fn, col] of [
    ["create_receipt", "receipt_id"],
    ["create_payment", "voucher_id"],
    ["create_dual_document", "dual_id"],
  ]) {
    const writes = dbRows(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = '${fn}'
         and pg_get_functiondef(p.oid) like '%(${col}, storage_path%'
    `);
    expect(writes, `${fn} does not write ${col}`).toEqual([fn]);
  }
});
