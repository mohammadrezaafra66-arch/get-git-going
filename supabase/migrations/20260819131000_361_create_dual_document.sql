-- 361 — create_dual_document: one document, two parties, both balances move
--
-- Phase 4, tasks 4.3 – 4.7. The source table is migration 360.
--
-- ==============================================================================================
-- WHAT WRITES OR DEPENDS ON WHAT I AM CHANGING  (README-EXECUTION §H, first half)
-- ==============================================================================================
--
-- This migration creates ONE new function and changes nothing that already exists. It reuses,
-- unmodified: has_any_role, assign_document_number, require_asan_code, tehran_today, jalali_year,
-- and the dual_documents triggers from 360. Nothing calls create_dual_document yet.
-- dual_documents has no other writer at all — unlike payment_receipts and payment_vouchers, which
-- each carry a legacy path this RPC had to coexist with.
--
-- ==============================================================================================
-- WHAT WILL READ THE ROWS THIS STARTS CREATING  (§H, second half)
-- ==============================================================================================
--
-- Measured from the live catalogue before writing, not asserted:
--
--   1. asan_list_journal_export — reads journal_entries by source_type. It has branches for
--      'payment_receipt', 'payment_voucher' and 'mutual_settlement' and NO branch for
--      'dual_document', so a dual document falls to its ELSE and gets a NULL rich label: it still
--      exports, with the plainer description, and its description_quality reads 'simple'. Recorded
--      as contradiction C-d; phase 5 owns the export.
--      Its CLASSIFIER matters more: it is a bank-sign heuristic, and a dual document has NO bank
--      line at all, so bank_net = 0. If either party is an external_party the document classifies
--      as 'third_party'; otherwise it falls to 'unclassified'. Recorded as C-e.
--   2. person_settlement_position / list_mutual_settlement_candidates — read customer_credit and
--      supplier_payable lines per person. A dual document moves both, in the correct direction
--      under the convention phase 3 recorded.
--   3. vw_account_balances / get_account_ledger — read payment_receipts and payment_vouchers ONLY.
--      A dual document touches neither, so no cash view moves. That is correct: T12 says the money
--      never landed in our account.
--   4. polymorphic_ref_orphan_report, validate_journal_line_ref — structural.
--
-- ==============================================================================================
-- WHAT DOES EVERY RULE I AM INVENTING PERMIT THAT IT SHOULD NOT?  (§H, third half)
-- ==============================================================================================
--
-- Answered by trying to break each rule, not by reasoning that it holds. Results in
-- phase-4-PROGRESS.md § "Trying to break my own rules". The rules invented here are:
--
--   R1  the account kind is chosen from each party's TYPE (C-b). Break attempt: a party type with
--       no valid mapping. There is none — all three types map to kinds that already exist, so this
--       rule adds zero mappings (T13 c1) and has no unmapped branch to leak through.
--   R2  the two parties must be different (360's CHECK). Break attempt: same id both sides -> refused.
--   R3  the fee produces a third line keyed to the intermediary. Break attempts: fee >= amount when
--       the beneficiary bears it (would make their line zero or negative and silently violate
--       journal_lines_one_side); fee with no accounting code on the intermediary (would post a line
--       the export can never resolve); fee_borne_by='us' (unrepresentable — see OG-21).
--   R4  the balance assertion. Break attempt: every fee path, checked against sum(debit)=sum(credit).
--
-- ==============================================================================================
-- C-b — THE ACCOUNT KIND IS CHOSEN FROM THE PARTY'S TYPE. ZERO NEW MAPPINGS.
-- ==============================================================================================
--
-- The contract's §3 table says debit `supplier_payable` (beneficiary) and credit `customer_credit`
-- (payer). That is only true when the beneficiary is a supplier and the payer is a customer. T10
-- and OG-16 establish that either party may be any person, and this is exactly phase 3's C1 —
-- which was solved by selecting the kind from the party's type using only mappings
-- validate_journal_line_ref already has. The same solution applies here:
--
--     party type        account_kind       validate_journal_line_ref target    status
--     ---------------   -----------------  ----------------------------------  --------
--     customer          customer_credit    ARRAY['customers']                  existing
--     supplier          supplier_payable   ARRAY['suppliers']                  existing
--     external_party    external_party     ARRAY['external_parties']           existing
--
-- Zero new mappings (T13 constraint 1). The DIRECTION is what makes a party a payer or a
-- beneficiary, not the account kind: the payer's account is CREDITED (what they owed us falls) and
-- the beneficiary's is DEBITED (what we owed them falls), whichever kind each resolves to.
--
-- ==============================================================================================
-- C-c — THE INTERMEDIARY AND THE FEE. THE THREE DOCUMENTS CANNOT ALL BE TRUE AT ONCE.
-- ==============================================================================================
--
-- T11 makes the record-only roles Asan-code-free. MASTER-CHECKLIST 4.6 wants a third journal line
-- when the fee is non-zero. A journal line needs an account_ref_id that validate_journal_line_ref
-- accepts. Requirement 207 deliberately made the صراف's Asan code optional. Measured, these cannot
-- all hold.
--
-- THE READING ADOPTED, and it is an interpretation — raised as OG-21 for confirmation:
--
--   A صراف with a ZERO fee is metadata. No money is recorded against them, nothing moves, no code
--   is needed — exactly T11 and requirement 207.
--
--   A صراف with a NON-ZERO fee is being PAID BY US. Money is recorded against them. Under T10 that
--   makes them a counterparty whose balance moves, and under T3 a party whose balance moves needs a
--   code — like any other paid party. The record-only class in T11 covers the TRANSFERRER and the
--   RECIPIENT, who receive nothing; it does not have to cover a party we are paying a fee to.
--
-- This reading needs no new account_kind (the صراف is an external_parties row, so the third line is
-- ('external_party', intermediary_id) — an existing mapping), it satisfies 4.6's Accept (three
-- lines, still balances), and it keeps the document exportable. It is recorded rather than assumed,
-- and OG-21 asks the owner to confirm it.
--
-- p_fee_borne_by = 'us' IS REFUSED, and this is the part that genuinely cannot be built:
--
--   If we bear the fee, the money still reaches the صراف, so the entry needs a credit to them and a
--   debit to an expense of ours. THERE IS NO EXPENSE account_kind — the live CHECK admits only
--   customer_credit, bank, external_party, invoice_ar, clearing, other, supplier_payable,
--   cheque_receivable, cheque_payable. Using 'other' or 'clearing' would post to a control account
--   with no Asan code, which blocks the WHOLE document from the export (ledger-decisions Part 3
--   rule 2) — a silent, permanent consequence. Inventing an expense kind is forbidden by T13 c1 and
--   by this phase's brief in as many words. So 'us' raises P0001 and OG-21 carries the question.
--
--   'payer' and 'beneficiary' are both representable with existing kinds and are implemented:
--     payer bears it        credit payer (amount + fee); debit beneficiary amount; debit صراف fee
--     beneficiary bears it  credit payer amount; debit beneficiary (amount - fee); debit صراف fee
--   Both balance. The second requires fee < amount, or the beneficiary's line would be zero or
--   negative and violate journal_lines_one_side — refused explicitly so the user gets a sentence
--   rather than a constraint name.
--
-- ==============================================================================================
-- D9 — ONE AMOUNT, OWNER-CONFIRMED, NOT REOPENABLE
-- ==============================================================================================
--
-- The signature takes ONE amount. The owner confirmed on 2026-08-18 that the two sides of a dual
-- document are always equal, and that 100 owed with 60 to the creditor and 40 to us is TWO
-- documents, never one with unequal sides. Task 4.4's "unequal amounts raise P0001" is therefore
-- unreachable through the parameter BY CONSTRUCTION — which is the point of D9. What remains
-- reachable, and is checked, is an imbalance produced by the fee arithmetic; the balance assertion
-- catches it and raises P0001 before anything is returned.
--
-- ==============================================================================================
-- T14 — WHAT THIS FUNCTION DELIBERATELY DOES NOT CHECK
-- ==============================================================================================
--
-- T14 (2026-08-19) records that the ledger holds money movements only: purchases and sales never
-- post, so supplier_payable accumulates debits with no credits and customer_credit credits with no
-- debits, BY DESIGN. A party's ledger position is therefore NOT their balance.
--
-- So this function does NOT refuse a dual document because the payer's ledger position fails to
-- show them owing us. It usually will not, and that is evidence of nothing. No such check exists
-- here, and none should be added later.
--
-- Rollback: docs/verification/361-down.sql — statements only, full signature spelled out.

SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.create_dual_document(
  p_payer_type             text,
  p_payer_id               uuid,
  p_beneficiary_type       text,
  p_beneficiary_id         uuid,
  p_amount                 numeric,
  p_document_date          date,
  p_tracking_number        text,
  p_description            text,
  p_source_bank            text    DEFAULT NULL,
  p_destination_bank       text    DEFAULT NULL,
  p_transferrer_name       text    DEFAULT NULL,
  p_transferrer_account_no text    DEFAULT NULL,
  p_recipient_name         text    DEFAULT NULL,
  p_recipient_account_no   text    DEFAULT NULL,
  p_intermediary_id        uuid    DEFAULT NULL,
  p_intermediary_fee       numeric DEFAULT 0,
  p_fee_borne_by           text    DEFAULT NULL,
  p_attachment_ids         uuid[]  DEFAULT NULL
)
RETURNS TABLE (
  document_id      uuid,
  document_number  text,
  journal_entry_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid            uuid := auth.uid();
  _payer_type     text := lower(btrim(coalesce(p_payer_type, '')));
  _benef_type     text := lower(btrim(coalesce(p_beneficiary_type, '')));
  _fee_by         text := lower(btrim(coalesce(p_fee_borne_by, '')));
  _fee            numeric := coalesce(p_intermediary_fee, 0);
  _doc_id         uuid := gen_random_uuid();
  _doc_number     text;
  _entry_id       uuid;
  _payer_person   uuid;
  _benef_person   uuid;
  _payer_name     text;
  _benef_name     text;
  _payer_code     text;
  _benef_code     text;
  _payer_kind     text;
  _benef_kind     text;
  _interm_name    text;
  _interm_code    text;
  _interm_active  boolean;
  _payer_credit   numeric;
  _benef_debit    numeric;
  _debit_total    numeric;
  _credit_total   numeric;
  _line_no        int := 0;
BEGIN
  ----------------------------------------------------------------------------
  -- 1. Role gate (task 4.7). OG-13 answer (a). The ARRAY is cast to app_role[]
  --    explicitly: has_any_role has a text[] and an app_role[] overload and an
  --    uncast array matches both.
  ----------------------------------------------------------------------------
  IF NOT public.has_any_role(_uid,
        ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ ثبت سند دوطرفه را ندارید'
      USING ERRCODE = '42501';
  END IF;

  ----------------------------------------------------------------------------
  -- 2. Argument validation (22023).
  ----------------------------------------------------------------------------
  IF _payer_type NOT IN ('customer', 'supplier', 'external_party') THEN
    RAISE EXCEPTION 'نوع پرداخت‌کننده نامعتبر است؛ یکی از customer / supplier / external_party باید باشد'
      USING ERRCODE = '22023';
  END IF;
  IF _benef_type NOT IN ('customer', 'supplier', 'external_party') THEN
    RAISE EXCEPTION 'نوع دریافت‌کننده نامعتبر است؛ یکی از customer / supplier / external_party باید باشد'
      USING ERRCODE = '22023';
  END IF;
  IF p_payer_id IS NULL OR p_beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ هر دو طرف سند دوطرفه الزامی است'
      USING ERRCODE = '22023';
  END IF;

  -- The two account holders must be different parties. 360 enforces this with a CHECK; refusing
  -- here as well means the user gets a sentence instead of a constraint name.
  IF _payer_type = _benef_type AND p_payer_id = p_beneficiary_id THEN
    RAISE EXCEPTION 'پرداخت‌کننده و دریافت‌کننده نمی‌توانند یک نفر باشند'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ سند باید بزرگ‌تر از صفر باشد'
      USING ERRCODE = '22023';
  END IF;
  IF p_amount <> trunc(p_amount) THEN
    RAISE EXCEPTION 'مبلغ سند باید عدد صحیح (تومان) باشد'
      USING ERRCODE = '22023';
  END IF;

  IF p_document_date IS NULL THEN
    RAISE EXCEPTION 'تاریخ سند الزامی است' USING ERRCODE = '22023';
  END IF;

  -- Date bounds, exactly as migrations 351 and 355 apply them (Gate A M6). A backdated entry lands
  -- in an Asan export window that may already have been submitted, and 343 immutability plus the
  -- absence of reverse_document (OG-14) mean it can never be moved or withdrawn.
  IF p_document_date > public.tehran_today() THEN
    RAISE EXCEPTION 'تاریخ سند نمی‌تواند در آینده باشد' USING ERRCODE = '22023';
  END IF;
  IF public.jalali_year(p_document_date) < public.jalali_year(public.tehran_today()) - 1 THEN
    RAISE EXCEPTION 'تاریخ سند از سال % است و از سال گذشته قدیمی‌تر است؛ سال جاری %',
      public.jalali_year(p_document_date), public.jalali_year(public.tehran_today())
      USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(coalesce(p_tracking_number, '')), '') IS NULL THEN
    RAISE EXCEPTION 'شمارهٔ پیگیری از روی فیش انتقال الزامی است' USING ERRCODE = '22023';
  END IF;

  -- p_description is mandatory here and optional elsewhere: in the Asan accounting-document layout
  -- the tracking number and the party name are buried inside the شرح column, so the description is
  -- the only context an accountant sees for this document.
  IF NULLIF(btrim(coalesce(p_description, '')), '') IS NULL THEN
    RAISE EXCEPTION 'شرح سند دوطرفه الزامی است؛ در خروجی آسان تنها متنی است که حسابدار می‌بیند'
      USING ERRCODE = '22023';
  END IF;

  -- Attachments are not wired, exactly as in create_receipt and create_payment (Gate A m4):
  -- document_attachments.document_id is NOT NULL and validate_document_attachment_ref is a
  -- BEFORE INSERT existence trigger, so an attachment row cannot precede its document.
  IF p_attachment_ids IS NOT NULL AND array_length(p_attachment_ids, 1) > 0 THEN
    RAISE EXCEPTION 'پیوست فایل در این نسخه هنوز پشتیبانی نمی‌شود؛ سند را ثبت کنید و پیوست را بعداً اضافه کنید'
      USING ERRCODE = '0A000';
  END IF;

  ----------------------------------------------------------------------------
  -- 3. The fee rules (task 4.6). Validated before any party is read, so a
  --    malformed fee never reaches the numbering step.
  ----------------------------------------------------------------------------
  IF _fee < 0 OR _fee <> trunc(_fee) THEN
    RAISE EXCEPTION 'کارمزد باید عدد صحیح و نامنفی باشد' USING ERRCODE = '22023';
  END IF;

  IF _fee > 0 THEN
    IF p_intermediary_id IS NULL THEN
      RAISE EXCEPTION 'کارمزد بدون واسط (صراف) معنا ندارد؛ واسط را انتخاب کنید'
        USING ERRCODE = '22023';
    END IF;
    IF _fee_by NOT IN ('payer', 'beneficiary', 'us') THEN
      RAISE EXCEPTION 'مشخص کنید کارمزد بر عهدهٔ چه کسی است؛ یکی از payer / beneficiary باید باشد'
        USING ERRCODE = '22023';
    END IF;
    -- C-c. Unrepresentable, not merely unimplemented — see the header and OG-21.
    IF _fee_by = 'us' THEN
      RAISE EXCEPTION 'کارمزدی که بر عهدهٔ خودمان باشد در این نسخه ثبت نمی‌شود؛ حساب هزینه هنوز در دفتر تعریف نشده است'
        USING ERRCODE = 'P0001';
    END IF;
    IF _fee_by = 'beneficiary' AND _fee >= p_amount THEN
      RAISE EXCEPTION 'کارمزد (%) از مبلغ سند (%) کمتر باید باشد تا سهم دریافت‌کننده صفر یا منفی نشود',
        _fee, p_amount
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_fee_borne_by IS NOT NULL THEN
    RAISE EXCEPTION 'وقتی کارمزدی وجود ندارد، تعیین‌کنندهٔ کارمزد نباید ارسال شود'
      USING ERRCODE = '22023';
  END IF;

  ----------------------------------------------------------------------------
  -- 4. Resolve both account holders and enforce T3 for BOTH (task 4.5).
  --
  --    Done BEFORE the number is minted, so a document refused for a missing
  --    Asan code burns no serial (§F, and phase-2 Gate A m3's lesson about
  --    serials consumed by documents that never existed).
  --
  --    require_asan_code has no SECURITY clause, so it is SECURITY INVOKER —
  --    verified from the live catalogue. Inside this SECURITY DEFINER function
  --    it runs as the owner and sees every person_identifiers row, while a
  --    direct caller still gets only what that table's RLS grants them.
  ----------------------------------------------------------------------------
  IF _payer_type = 'customer' THEN
    SELECT c.person_id, c.name INTO _payer_person, _payer_name
      FROM public.customers c WHERE c.id = p_payer_id;
    _payer_kind := 'customer_credit';
  ELSIF _payer_type = 'supplier' THEN
    SELECT s.person_id, s.name INTO _payer_person, _payer_name
      FROM public.suppliers s WHERE s.id = p_payer_id;
    _payer_kind := 'supplier_payable';
  ELSE
    SELECT ep.person_id, ep.full_name INTO _payer_person, _payer_name
      FROM public.external_parties ep WHERE ep.id = p_payer_id;
    _payer_kind := 'external_party';
  END IF;
  IF _payer_person IS NULL THEN
    RAISE EXCEPTION 'پرداخت‌کننده یافت نشد' USING ERRCODE = '22023';
  END IF;

  IF _benef_type = 'customer' THEN
    SELECT c.person_id, c.name INTO _benef_person, _benef_name
      FROM public.customers c WHERE c.id = p_beneficiary_id;
    _benef_kind := 'customer_credit';
  ELSIF _benef_type = 'supplier' THEN
    SELECT s.person_id, s.name INTO _benef_person, _benef_name
      FROM public.suppliers s WHERE s.id = p_beneficiary_id;
    _benef_kind := 'supplier_payable';
  ELSE
    SELECT ep.person_id, ep.full_name INTO _benef_person, _benef_name
      FROM public.external_parties ep WHERE ep.id = p_beneficiary_id;
    _benef_kind := 'external_party';
  END IF;
  IF _benef_person IS NULL THEN
    RAISE EXCEPTION 'دریافت‌کننده یافت نشد' USING ERRCODE = '22023';
  END IF;

  -- Both account holders, per T11. Raises P0001 naming whichever party lacks a code.
  _payer_code := public.require_asan_code(_payer_person);
  _benef_code := public.require_asan_code(_benef_person);

  ----------------------------------------------------------------------------
  -- 5. The intermediary, if there is one.
  ----------------------------------------------------------------------------
  IF p_intermediary_id IS NOT NULL THEN
    SELECT ep.full_name, NULLIF(btrim(coalesce(ep.accounting_code, '')), ''), ep.is_active
      INTO _interm_name, _interm_code, _interm_active
      FROM public.external_parties ep WHERE ep.id = p_intermediary_id;
    IF _interm_name IS NULL THEN
      RAISE EXCEPTION 'واسط (صراف) یافت نشد' USING ERRCODE = '22023';
    END IF;
    IF NOT coalesce(_interm_active, false) THEN
      RAISE EXCEPTION 'واسط «%» غیرفعال است و نمی‌توان سند را به نام او ثبت کرد', _interm_name
        USING ERRCODE = '22023';
    END IF;
    -- Only when a fee is actually charged does the intermediary become a party we pay, and only
    -- then does it need a code. With a zero fee it is metadata (T11, requirement 207) and no code
    -- is required — that asymmetry is the whole of the C-c reading, and OG-21 asks the owner to
    -- confirm it.
    IF _fee > 0 AND _interm_code IS NULL THEN
      RAISE EXCEPTION 'کد حسابداری برای واسط «%» ثبت نشده است؛ بدون آن کارمزد قابل ارسال به آسان نیست', _interm_name
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 6. Amounts per line (task 4.6). D9 keeps the two SIDES equal; the fee is a
  --    separate line, and whoever bears it has their own line adjusted so the
  --    entry still balances.
  ----------------------------------------------------------------------------
  _payer_credit := p_amount;
  _benef_debit  := p_amount;
  IF _fee > 0 THEN
    IF _fee_by = 'payer' THEN
      _payer_credit := p_amount + _fee;      -- they transferred amount + fee
    ELSE                                      -- 'beneficiary'
      _benef_debit  := p_amount - _fee;      -- they received amount - fee
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 7. Document number (T6), then the source row.
  ----------------------------------------------------------------------------
  _doc_number := public.assign_document_number('dual', _doc_id);

  INSERT INTO public.dual_documents (
    id, document_number,
    payer_type, payer_customer_id, payer_supplier_id, payer_party_id,
    beneficiary_type, beneficiary_customer_id, beneficiary_supplier_id, beneficiary_party_id,
    amount, document_date, tracking_number, source_bank, destination_bank,
    transferrer_name, transferrer_account_no, recipient_name, recipient_account_no,
    intermediary_party_id, intermediary_fee, fee_borne_by,
    description, status, created_by
  ) VALUES (
    _doc_id, _doc_number,
    _payer_type,
    CASE WHEN _payer_type = 'customer'       THEN p_payer_id END,
    CASE WHEN _payer_type = 'supplier'       THEN p_payer_id END,
    CASE WHEN _payer_type = 'external_party' THEN p_payer_id END,
    _benef_type,
    CASE WHEN _benef_type = 'customer'       THEN p_beneficiary_id END,
    CASE WHEN _benef_type = 'supplier'       THEN p_beneficiary_id END,
    CASE WHEN _benef_type = 'external_party' THEN p_beneficiary_id END,
    p_amount, p_document_date, btrim(p_tracking_number),
    NULLIF(btrim(coalesce(p_source_bank, '')), ''),
    NULLIF(btrim(coalesce(p_destination_bank, '')), ''),
    NULLIF(btrim(coalesce(p_transferrer_name, '')), ''),
    NULLIF(btrim(coalesce(p_transferrer_account_no, '')), ''),
    NULLIF(btrim(coalesce(p_recipient_name, '')), ''),
    NULLIF(btrim(coalesce(p_recipient_account_no, '')), ''),
    p_intermediary_id, _fee, NULLIF(_fee_by, ''),
    btrim(p_description), 'approved', _uid
  );

  ----------------------------------------------------------------------------
  -- 8. The journal entry (task 4.3). doc_kind passed explicitly: 341 dropped its
  --    DEFAULT on purpose so an omission fails loudly instead of becoming 'other'.
  ----------------------------------------------------------------------------
  INSERT INTO public.journal_entries (
    doc_kind, source_type, source_id, entry_date, description,
    status, posted_by, payer_accounting_code, receiver_accounting_code
  ) VALUES (
    'dual', 'dual_document', _doc_id, p_document_date,
    'سند دوطرفه شمارهٔ ' || _doc_number,
    'posted', _uid, _payer_code, _benef_code
  )
  RETURNING id INTO _entry_id;

  -- The beneficiary's side: what we owed them falls.
  _line_no := _line_no + 1;
  INSERT INTO public.journal_lines (
    journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description
  ) VALUES (
    _entry_id, _line_no, _benef_kind, p_beneficiary_id, _benef_debit, 0,
    'کاهش بدهی ما به «' || coalesce(_benef_name, '؟') || '»'
  );

  -- The payer's side: what they owed us falls.
  _line_no := _line_no + 1;
  INSERT INTO public.journal_lines (
    journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description
  ) VALUES (
    _entry_id, _line_no, _payer_kind, p_payer_id, 0, _payer_credit,
    'کاهش طلب ما از «' || coalesce(_payer_name, '؟') || '»'
  );

  -- The fee, if there is one: the intermediary is a party we are paying (C-c).
  IF _fee > 0 THEN
    _line_no := _line_no + 1;
    INSERT INTO public.journal_lines (
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description
    ) VALUES (
      _entry_id, _line_no, 'external_party', p_intermediary_id, _fee, 0,
      'کارمزد واسط «' || coalesce(_interm_name, '؟') || '»'
    );
  END IF;

  -- Balance or nothing (ledger-decisions Part 3, rule 1). An unbalanced document is dropped from
  -- the Asan export entirely, so it must be refused at creation rather than created and silently
  -- withheld. With a fee this assertion is doing real work, not just guarding a future edit.
  SELECT coalesce(sum(jl.debit), 0), coalesce(sum(jl.credit), 0)
    INTO _debit_total, _credit_total
    FROM public.journal_lines jl
   WHERE jl.journal_entry_id = _entry_id;

  IF _debit_total <> _credit_total THEN
    RAISE EXCEPTION
      'سند حسابداری متوازن نیست: جمع بدهکار % و جمع بستانکار % است',
      _debit_total, _credit_total
      USING ERRCODE = 'P0001';
  END IF;

  ----------------------------------------------------------------------------
  -- 9. Audit (audit-trigger-spec.md §2), in the same transaction. audit_logs has
  --    no dedicated columns for these fields, so they go into diff jsonb — the
  --    same shape create_receipt and create_payment use.
  ----------------------------------------------------------------------------
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    _uid, 'dual_document', _doc_id::text, 'dual_document_created',
    jsonb_build_object(
      'document_number',      _doc_number,
      'journal_entry_id',     _entry_id,
      'amount',               p_amount,
      'document_date',        p_document_date,
      'tracking_number',      btrim(p_tracking_number),
      'payer_type',           _payer_type,
      'payer_id',             p_payer_id,
      'payer_person_id',      _payer_person,
      'payer_account_kind',   _payer_kind,
      'payer_credit',         _payer_credit,
      'beneficiary_type',     _benef_type,
      'beneficiary_id',       p_beneficiary_id,
      'beneficiary_person_id', _benef_person,
      'beneficiary_account_kind', _benef_kind,
      'beneficiary_debit',    _benef_debit,
      'intermediary_id',      p_intermediary_id,
      'intermediary_fee',     _fee,
      'fee_borne_by',         NULLIF(_fee_by, ''),
      'transferrer_recorded', (NULLIF(btrim(coalesce(p_transferrer_name, '')), '') IS NOT NULL),
      'recipient_recorded',   (NULLIF(btrim(coalesce(p_recipient_name, '')), '') IS NOT NULL),
      'line_count',           _line_no
    ));

  RETURN QUERY SELECT _doc_id, _doc_number, _entry_id;
END;
$function$;

-- Task 4.7 — grants. PUBLIC and anon must not hold EXECUTE on a SECURITY DEFINER function that
-- writes the ledger; the role gate inside is the boundary, the grant is the outer door. Mirrors
-- migrations 351 and 355.
REVOKE ALL ON FUNCTION public.create_dual_document(
  text, uuid, text, uuid, numeric, date, text, text, text, text,
  text, text, text, text, uuid, numeric, text, uuid[]
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_dual_document(
  text, uuid, text, uuid, numeric, date, text, text, text, text,
  text, text, text, text, uuid, numeric, text, uuid[]
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_dual_document(
  text, uuid, text, uuid, numeric, date, text, text, text, text,
  text, text, text, text, uuid, numeric, text, uuid[]
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_dual_document(
  text, uuid, text, uuid, numeric, date, text, text, text, text,
  text, text, text, text, uuid, numeric, text, uuid[]
) TO service_role;

COMMENT ON FUNCTION public.create_dual_document(
  text, uuid, text, uuid, numeric, date, text, text, text, text,
  text, text, text, text, uuid, numeric, text, uuid[]
) IS
  'Creates a dual document and posts its balanced journal entry in one transaction (phase 4, '
  'migration 361). Four roles per T11: payer and beneficiary are account holders whose balances '
  'move and who both need Asan codes; transferrer and recipient are recorded as name and account '
  'number only, with no journal line. The account_kind of each party is chosen from its TYPE using '
  'only mappings validate_journal_line_ref already has — zero new mappings (T13 c1). A non-zero '
  'intermediary fee adds a third line against the intermediary, who then needs an accounting code; '
  'fee_borne_by=''us'' is refused because no expense account_kind exists (OG-21). One amount only '
  '(D9, owner-confirmed). Role gate: admin, accountant, manager (OG-13 (a)).';
