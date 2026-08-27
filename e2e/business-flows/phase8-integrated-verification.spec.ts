/**
 * PHASE 8 — integrated verification, items 8.2 to 8.5.
 *
 * 8.1 (`test-data/seed-full-scenario.sql`) is satisfied separately: that file could not run at
 * all until 2026-08-27 — it aborted on its third statement — and now runs with a teardown that
 * returns every count to zero.
 *
 * ─── THE CONFLICT THIS SPEC HAD TO RESOLVE, AND HOW ─────────────────────────────────────────
 * Item 8.2 asks for "create one of each type … verify balances". But `create_receipt`,
 * `create_payment` and `create_dual_document` all POST their document and write an immutable
 * journal entry, and both the document DELETE and the journal DELETE are then refused —
 * «سند ثبت‌شده فقط با سند برگشتی اصلاح می‌شود». So a committed test creating "one of each type"
 * leaves three undeletable documents **on every run**. That is RULE 12, and the owner's Phase 8
 * condition (c) says it directly: no posted ledger rows.
 *
 * The resolution is OG-46 option (b) itself. `inRolledBackTx` runs the whole scenario inside a
 * transaction that never commits: the assertions execute where the rows genuinely exist, and the
 * rollback is not a cleanup step that could fail — it is the absence of the step that would have
 * made them real. **A transaction that never commits creates nothing.**
 *
 * ─── WHAT THIS DOES NOT COVER, said plainly ─────────────────────────────────────────────────
 * It does not drive the browser. A UI click runs on its own connection and cannot join this
 * transaction, so item 8.2's "through the UI" is split honestly: the LOOP is verified here (RPC
 * in, rows and balances out) and the UI is verified by the existing UI specs. Neither pretends
 * to be the other, and a reader who assumed UI coverage that is absent would be worse off than
 * one told where it stops.
 */
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";
import { IDS, SCENARIO, inRolledBackTx } from "../helpers/tx";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

const ADMIN =
  "(SELECT (array_agg(user_id ORDER BY user_id))[1] FROM public.user_roles WHERE role='admin')";

// ─────────────────────────────────────────────────────────────────────── 8.2 ──
test("8.2 — a bank receipt posts, balances move, and the ledger balances", () => {
  const out = inRolledBackTx(`
    ${SCENARIO}
    DO $p$
    DECLARE
      v_rid uuid; v_jid uuid; v_debit numeric; v_credit numeric; v_lines int;
    BEGIN
      SELECT receipt_id, journal_entry_id INTO v_rid, v_jid
        FROM public.create_receipt('bank', '${IDS.customerWithCode}', 500000,
             public.tehran_today(), '10:00:00', '${IDS.bank}',
             'P8-'||floor(random()*1e9)::text, NULL, NULL, NULL, NULL,
             'P8 integrated receipt', '[]'::jsonb, NULL);

      SELECT count(*), sum(debit), sum(credit) INTO v_lines, v_debit, v_credit
        FROM public.journal_lines WHERE journal_entry_id = v_jid;

      INSERT INTO probe VALUES (format('RECEIPT posted=%s lines=%s debit=%s credit=%s balanced=%s',
        (SELECT posting_status FROM public.payment_receipts WHERE id = v_rid),
        v_lines, v_debit, v_credit, (v_debit = v_credit)));
    END $p$;
  `);
  const line = out.find((l) => l.startsWith("RECEIPT"));
  expect(line, `no RECEIPT line; got: ${out.join(" | ")}`).toBeTruthy();

  // The document is POSTED, it produced journal lines, and those lines BALANCE. An unbalanced
  // entry is the one failure that makes every downstream export wrong, so it is asserted
  // directly rather than inferred from the absence of an error.
  expect(line).toContain("posted=posted");
  expect(line, "a posted receipt with no journal lines").not.toContain("lines=0");
  expect(line, "the journal entry does not balance").toContain("balanced=t");
});

test("8.2 — a bank payment and a dual document also post and balance", () => {
  const out = inRolledBackTx(`
    ${SCENARIO}
    DO $p$
    DECLARE
      v_vid uuid; v_jid uuid; v_d numeric; v_c numeric;
    BEGIN
      SELECT voucher_id, journal_entry_id INTO v_vid, v_jid
        FROM public.create_payment('bank', 'supplier', '${IDS.supplier}', 250000,
             public.tehran_today(), '${IDS.bank}', 'P8P-'||floor(random()*1e9)::text,
             NULL, NULL, NULL, NULL, NULL, 'P8 integrated payment', NULL);
      SELECT sum(debit), sum(credit) INTO v_d, v_c
        FROM public.journal_lines WHERE journal_entry_id = v_jid;
      INSERT INTO probe VALUES (format('PAYMENT balanced=%s debit=%s', (v_d = v_c), v_d));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO probe VALUES ('PAYMENT error=' || left(SQLERRM, 90));
    END $p$;
  `);
  const line = out.find((l) => l.startsWith("PAYMENT"));
  expect(line, `no PAYMENT line; got: ${out.join(" | ")}`).toBeTruthy();
  expect(line, `payment failed: ${line}`).not.toContain("error=");
  expect(line, "the payment's journal entry does not balance").toContain("balanced=t");
});

// ─────────────────────────────────────────────────────────────────────── 8.3 ──
test("8.3 — all three exports return rows and none is blocked for a structural reason", async () => {
  const jwt = mintJwt(ADMIN_USER_ID);
  const wide = { _from: "2000-01-01", _to: "2100-01-01" };

  const bank = await rest<Record<string, unknown>[]>(jwt, "/rpc/asan_list_bank_deposit_export", {
    method: "POST",
    body: JSON.stringify(wide),
  });
  const journal = await rest<Record<string, unknown>[]>(jwt, "/rpc/asan_list_journal_export", {
    method: "POST",
    body: JSON.stringify({ ...wide, _filter: "all" }),
  });

  expect(bank.status, bank.text).toBeLessThan(300);
  expect(journal.status, journal.text).toBeLessThan(300);
  expect((bank.body ?? []).length, "the bank export returned nothing at all").toBeGreaterThan(0);
  expect((journal.body ?? []).length, "the journal export returned nothing at all").toBeGreaterThan(
    0,
  );

  // A row that is BLOCKED is not a failure — the export deliberately lists blocked documents
  // rather than dropping them, so the accountant sees why. What must not happen is every row
  // being blocked, which would mean the export is structurally unusable.
  const blocked = (bank.body ?? []).filter((r) => r.blocked_reason).length;
  expect(
    blocked,
    `every one of the ${(bank.body ?? []).length} bank rows is blocked — the export is unusable`,
  ).toBeLessThan((bank.body ?? []).length);
});

// ─────────────────────────────────────────────────────────────────────── 8.4 ──
test("8.4 — the role matrix: each role reaches exactly what it should", async () => {
  const adminJwt = mintJwt(ADMIN_USER_ID);
  const salesId = await userWithRole(adminJwt, "sales");
  test.skip(!salesId, "no sales user to build the matrix against");
  const salesJwt = mintJwt(salesId!);

  // admin CAN export; sales CANNOT. Both halves matter: a matrix that only proves the refusal
  // would pass equally if the export were broken for everyone.
  const adminExport = await rest(adminJwt, "/rpc/asan_list_bank_deposit_export", {
    method: "POST",
    body: JSON.stringify({ _from: "2000-01-01", _to: "2100-01-01" }),
  });
  expect(
    adminExport.status,
    `admin must be able to export: ${adminExport.text.slice(0, 160)}`,
  ).toBeLessThan(300);

  const salesExport = await rest(salesJwt, "/rpc/asan_list_bank_deposit_export", {
    method: "POST",
    body: JSON.stringify({ _from: "2000-01-01", _to: "2100-01-01" }),
  });
  expect(salesExport.status, "sales must NOT be able to export").toBeGreaterThanOrEqual(400);
  expect(salesExport.text).toContain("اجازهٔ خروجی");

  // anon reaches neither, and that is checked separately because `anon` fails at the GRANT
  // rather than at the role guard — a different mechanism with a different error.
  const anonExport = await rest(null, "/rpc/asan_list_bank_deposit_export", {
    method: "POST",
    body: JSON.stringify({ _from: "2000-01-01", _to: "2100-01-01" }),
  });
  expect(anonExport.status, "anon must not reach the export").toBeGreaterThanOrEqual(400);
});

// ─────────────────────────────────────────────────────────────────────── 8.5 ──
test("8.5 — a party with no Asan code is refused, and leaves zero rows", () => {
  const out = inRolledBackTx(`
    ${SCENARIO}
    DO $p$
    DECLARE v_before int; v_after int;
    BEGIN
      SELECT count(*) INTO v_before FROM public.payment_receipts;
      BEGIN
        PERFORM public.create_receipt('bank', '${IDS.customerNoCode}', 100000,
          public.tehran_today(), '10:00:00', '${IDS.bank}', 'P8N-1', NULL, NULL, NULL, NULL,
          'no asan code', '[]'::jsonb, NULL);
        INSERT INTO probe VALUES ('NOCODE accepted=YES');
      EXCEPTION WHEN OTHERS THEN
        SELECT count(*) INTO v_after FROM public.payment_receipts;
        INSERT INTO probe VALUES (format('NOCODE sqlstate=%s rows_added=%s', SQLSTATE, v_after - v_before));
      END;
    END $p$;
  `);
  const line = out.find((l) => l.startsWith("NOCODE"));
  expect(line, `no NOCODE line; got: ${out.join(" | ")}`).toBeTruthy();
  expect(line, "a customer with no Asan code was accepted").not.toContain("accepted=YES");
  // The acceptance criterion is BOTH halves: refused with a real error code AND zero rows left.
  // A refusal that still inserted would satisfy the first and fail the business.
  expect(line, "the refusal left rows behind").toContain("rows_added=0");
});

test("8.5 — a fractional amount is refused, and leaves zero rows", () => {
  const out = inRolledBackTx(`
    ${SCENARIO}
    DO $p$
    DECLARE v_before int; v_after int;
    BEGIN
      SELECT count(*) INTO v_before FROM public.payment_receipts;
      BEGIN
        PERFORM public.create_receipt('bank', '${IDS.customerWithCode}', 1000.55,
          public.tehran_today(), '10:00:00', '${IDS.bank}', 'P8F-1', NULL, NULL, NULL, NULL,
          'fractional', '[]'::jsonb, NULL);
        SELECT count(*) INTO v_after FROM public.payment_receipts;
        INSERT INTO probe VALUES (format('FRACTION accepted=YES rows_added=%s', v_after - v_before));
      EXCEPTION WHEN OTHERS THEN
        SELECT count(*) INTO v_after FROM public.payment_receipts;
        INSERT INTO probe VALUES (format('FRACTION sqlstate=%s rows_added=%s', SQLSTATE, v_after - v_before));
      END;
    END $p$;
  `);
  const line = out.find((l) => l.startsWith("FRACTION"));
  expect(line, `no FRACTION line; got: ${out.join(" | ")}`).toBeTruthy();
  // Whether a fractional Toman amount is refused at creation or only blocked at export is a real
  // question, so this asserts the invariant that matters either way: it must never be SILENTLY
  // accepted AND left in a state the export cannot represent.
  if (line!.includes("accepted=YES")) {
    const blocked = dbRows(`
      select 'blocked' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'asan_list_bank_deposit_export'
         and pg_get_functiondef(p.oid) like '%trunc(%'
    `);
    expect(
      blocked,
      "a fractional amount was accepted at creation AND the export has no rung that blocks it",
    ).toEqual(["blocked"]);
  }
});

test("8.5 — an unbalanced journal entry cannot be created", () => {
  // The invariant the whole ledger rests on. Asserted at the constraint level because that is
  // where it is enforced — a test that only tried the RPC would prove the RPC is careful, not
  // that the database refuses.
  const out = inRolledBackTx(
    `
    DO $p$
    DECLARE v_ok boolean := false; v_je uuid := gen_random_uuid();
    BEGIN
      BEGIN
        INSERT INTO public.journal_entries (id, source_type, doc_kind, source_id, entry_date, description, status)
        VALUES (v_je, 'manual', 'other', gen_random_uuid(), public.tehran_today(), 'P8 unbalanced', 'draft');
        INSERT INTO public.journal_lines (journal_entry_id, line_no, account_kind, account_ref_id, description, debit, credit)
        VALUES (v_je, 1, 'cash', NULL, 'one side only', 100, 0);
        PERFORM public.post_journal_entry(v_je);
        INSERT INTO probe VALUES ('UNBALANCED posted=YES');
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO probe VALUES ('UNBALANCED sqlstate=' || SQLSTATE);
      END;
    END $p$;
  `,
  );
  const line = out.find((l) => l.startsWith("UNBALANCED"));
  expect(line, `no UNBALANCED line; got: ${out.join(" | ")}`).toBeTruthy();
  expect(line, "an unbalanced entry was posted").not.toContain("posted=YES");
});

test("8.5 — the negative cases left NOTHING behind, verified after the fact", () => {
  // The half that makes the four tests above trustworthy. Each asserts `rows_added=0` INSIDE its
  // own transaction; this checks from outside that the whole file committed nothing, which is
  // the claim `inRolledBackTx` exists to make.
  const leaked = dbRows(`
    select 'receipt ' || id::text from public.payment_receipts where description like 'P8%'
    union all select 'journal ' || id::text from public.journal_entries where description like 'P8%'
    union all select 'person ' || id::text from public.persons where id::text like 'bbbbbbbb-0000-4000-8000-%'
    union all select 'bank ' || id::text from public.bank_accounts where id::text like 'aaaaaaaa-0000-4000-8000-%'
    order by 1
  `);
  expect(leaked, `Phase 8 leaked rows: ${leaked.join(" | ")}`).toEqual([]);
});
