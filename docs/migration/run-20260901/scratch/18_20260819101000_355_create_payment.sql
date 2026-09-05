-- 355 — create_payment: a payment posts and reduces what we owe, in one transaction
--
-- Phase 3, tasks 3.3 – 3.7 and 3.9 (MASTER-CHECKLIST). Task 3.8's schema support is migration 354.
--
-- ==============================================================================================
-- WHAT WRITES OR DEPENDS ON THE OBJECTS THIS TOUCHES  (README-EXECUTION §H, first half)
-- ==============================================================================================
--
-- This migration creates ONE new function and changes nothing that already exists. It reuses,
-- without modifying: has_any_role, assign_document_number, require_asan_code, tehran_today,
-- jalali_year, and the payment_vouchers triggers (numbering, person derivation, burn, attachments,
-- updated_at). Nothing currently calls create_payment, so there is no caller to break.
--
-- payment_vouchers already has exactly one SQL writer, pay_purchase_with_voucher, and one
-- front-end writer, createPaymentVoucher. Neither is touched. This function is a SECOND writer of
-- the same table, which is deliberate and is what A4 asks for: the legacy path stays until task
-- 6.9 retires it (D12), exactly as post_receipt_accounting stayed alongside create_receipt.
--
-- ==============================================================================================
-- WHAT WILL READ THE ROWS THIS STARTS CREATING  (README-EXECUTION §H, second half)
-- ==============================================================================================
--
-- Measured from the live catalogue before writing a line of this function. Phase 2 shipped cash
-- receipts into the accountant's bank-deposit export precisely because this half was not asked.
--
--   1. vw_account_balances     — outflow CTE: SUM(pv.amount) WHERE pv.status='approved',
--                                GROUPED BY source_bank_account_id. NO channel filter.
--   2. get_account_ledger      — same shape, and it shows pv.voucher_number AS document_number.
--   3. asan_list_journal_export— reads journal_entries WHERE source_type='payment_voucher'.
--   4. person_settlement_position / list_mutual_settlement_candidates — read supplier_payable and
--                                customer_credit lines for a person.
--   5. person_merge, person_fk_drift_report, validate_document_attachment_ref — structural only.
--
-- THREE CONSEQUENCES THAT FOLLOW, RECORDED RATHER THAN DISCOVERED LATER:
--
--   (a) A CHEQUE payment will be counted as money leaving the source bank account by BOTH
--       vw_account_balances and get_account_ledger, because they filter on status alone. No money
--       leaves until the cheque clears. This is the same defect class as phase 2's B1 and it is
--       PRE-EXISTING — pay_purchase_with_voucher can already write a cheque voucher. This function
--       does not fix those readers (they are phase 5's surface); it is recorded in
--       phase-3-PROGRESS.md as contradiction C4 and raised as OG-18. What this function DOES do is
--       refuse to pretend: the ledger entry for a cheque credits cheque_payable or
--       cheque_receivable, never bank, so the LEDGER is right even while the two cash views are not.
--
--   (b) asan_list_journal_export classifies by a BANK-SIGN HEURISTIC, not by doc_kind:
--         has_external -> 'third_party'; bank_net > 0 -> 'receipt'; bank_net < 0 -> 'payment';
--         else 'unclassified'.
--       So a payment to an external_party classifies as 'third_party', and a CHEQUE payment has no
--       bank line at all and classifies as 'unclassified' — dropping out of every filtered export.
--       doc_kind='payment' is still written, because task 3.4 requires it and because it is the
--       only non-heuristic signal available to phase 5. Recorded as contradiction C5.
--
--   (c) A payment moves a party balance that person_settlement_position reads. The sign convention
--       is confirmed below and is NOT changed by this migration — see the SIGN CONVENTION block.
--
-- ==============================================================================================
-- THE DEBIT SIDE: why it is chosen by payee_type, and not keyed to a supplier unconditionally
-- ==============================================================================================
--
-- T13 constraint 3 is explicit, and this is the single most important line in the migration.
-- pay_purchase_with_voucher posts its debit as:
--
--     (_journal_id, 1, 'supplier_payable', _purchase.supplier_id, _amt, 0, _debit_desc)
--
-- unconditionally — including when _payee_type='external_party', and including when _payee_type
-- ='other', in which case _purchase.supplier_id is NULL and validate_journal_line_ref returns
-- early on the NULL ref, so nothing checks it at all. Money paid to a third party is recorded
-- against a supplier who did not receive it. T10 forbids exactly that: a payment has one
-- counterparty and it moves THAT person's balance.
--
-- This function therefore selects the debit account_kind from payee_type, using ONLY mappings
-- validate_journal_line_ref already has (T13 constraint 1 — zero new mappings):
--
--     payee_type        debit account_kind   validate_journal_line_ref target   status
--     ----------------  -------------------  ---------------------------------  ------
--     supplier          supplier_payable     ARRAY['suppliers']                 existing
--     external_party    external_party       ARRAY['external_parties']          existing
--     customer          customer_credit      ARRAY['customers']                 existing
--     other             (refused)            —                                  see below
--
-- 'other' IS REFUSED. payment_vouchers_payee_matches_type_chk admits it (free-text payee_name, no
-- row behind it), but T3 makes an Asan code a precondition for creating a document and an Asan
-- code lives on a person. 'other' has no person: payment_vouchers_payee_person_requires_payee_chk
-- makes payee_person_id NULL for it by construction. Admitting it would mean either skipping T3 or
-- inventing a person, and both are worse than refusing. The legacy path keeps its 'other' fallback
-- for purchases with no supplier; this RPC does not. Recorded as contradiction C2.
--
-- ==============================================================================================
-- SIGN CONVENTION  (MASTER-CHECKLIST phase-3 exit; recorded, deliberately NOT inverted)
-- ==============================================================================================
--
-- The checklist says supplier_payable "is summed as credit − debit by person_settlement_position
-- while the only writer debits it, so a paid supplier reads negative", and asks phase 3 to fix it.
-- Measured before acting, and the premise does not hold — the convention is already correct and
-- already coherent across every reader and writer:
--
--     person_settlement_position          receivable = SUM(debit − credit) on customer_credit
--                                         payable    = SUM(credit − debit) on supplier_payable
--     list_mutual_settlement_candidates   identical, both kinds
--     post_mutual_settlement              settles by DEBITing supplier_payable (payable falls)
--                                         and CREDITing customer_credit (receivable falls)
--
-- For a two-sided party account that is right: a liability rises on credit and falls on debit. A
-- payment must debit supplier_payable, and under credit − debit that lowers what we owe — which is
-- exactly the phase-3 exit criterion. Inverting the arithmetic would invert three functions and
-- turn every future settlement the wrong way round, which is the outcome the contract's own
-- warning says to avoid.
--
-- A paid supplier reads negative for a different reason: NOTHING EVER CREDITS supplier_payable,
-- because purchases are never posted to the ledger. It is the exact mirror of what the T9 research
-- found for customer_credit — nothing ever debits it because no sales posting exists. The cause is
-- an absent counter-posting, not a sign. Phase 3 does not build purchase posting, so phase 3 does
-- not fix it, and this migration does not claim to. Raised as OG-19; recorded in
-- phase-3-PROGRESS.md as contradiction C1.
--
-- THE CONVENTION THIS PROGRAMME USES, stated once so phases 4 and 5 cannot invert it:
--
--     liability-side kinds  (supplier_payable, cheque_payable)  outstanding = SUM(credit − debit)
--     party-receivable kinds(customer_credit, cheque_receivable, external_party)
--                                                               outstanding = SUM(debit − credit)
--
-- ==============================================================================================
-- Rollback: docs/verification/355-down.sql — statements only, full signature spelled out.
-- ==============================================================================================

SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.create_payment(
  p_channel              text,
  p_payee_type           text,
  p_payee_id             uuid,
  p_amount               numeric,
  p_payment_date         date,
  p_source_account_id    uuid,
  p_tracking_number      text    DEFAULT NULL,
  p_cheque_kind          text    DEFAULT NULL,
  p_cheque_number        text    DEFAULT NULL,
  p_cheque_due_date      date    DEFAULT NULL,
  p_endorsed_cheque_id   uuid    DEFAULT NULL,
  p_purchase_id          uuid    DEFAULT NULL,
  p_description          text    DEFAULT NULL,
  p_attachment_ids       uuid[]  DEFAULT NULL
)
RETURNS TABLE (
  voucher_id       uuid,
  document_number  text,
  journal_entry_id uuid,
  new_balance      numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid            uuid := auth.uid();
  _channel        text := lower(btrim(coalesce(p_channel, '')));
  _payee_type     text := lower(btrim(coalesce(p_payee_type, '')));
  _cheque_kind    text := lower(btrim(coalesce(p_cheque_kind, '')));
  _voucher_id     uuid := gen_random_uuid();
  _doc_number     text;
  _entry_id       uuid;
  _person_id      uuid;
  _payee_name     text;
  _receiver_code  text;   -- their side: the party we paid
  _payer_code     text;   -- our side: the account the money leaves
  _account_type   text;
  _account_title  text;
  _is_active      boolean;
  _asan_code      text;
  _debit_kind     text;
  _credit_kind    text;
  _credit_ref     uuid;
  _doc_channel    text;
  _tracking       text;
  _cheque_number  text;
  _cheque_due     date;
  _endorsed       record;
  _debit_total    numeric;
  _credit_total   numeric;
  _balance        numeric;
  _debit_desc     text;
  _credit_desc    text;
BEGIN
  ----------------------------------------------------------------------------
  -- 1. Role gate (task 3.9).
  --
  -- OG-13 answer (a): create = admin, accountant, manager. The same boundary
  -- assign_document_number has enforced since 346, so a caller admitted here is
  -- never refused mid-transaction at the numbering step (phase-1 Gate A M3).
  -- The ARRAY is cast to app_role[] explicitly: has_any_role has a text[] and an
  -- app_role[] overload and an uncast array matches both (PGRST203 / 42725).
  ----------------------------------------------------------------------------
  IF NOT public.has_any_role(_uid,
        ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ ثبت سند پرداخت را ندارید'
      USING ERRCODE = '42501';
  END IF;

  ----------------------------------------------------------------------------
  -- 2. Argument validation (22023) — everything checkable without a table read.
  ----------------------------------------------------------------------------
  IF _channel NOT IN ('bank', 'cash', 'cheque') THEN
    RAISE EXCEPTION 'روش پرداخت نامعتبر است؛ یکی از bank / cash / cheque باید باشد'
      USING ERRCODE = '22023';
  END IF;

  IF _payee_type NOT IN ('supplier', 'external_party', 'customer') THEN
    IF _payee_type = 'other' THEN
      -- Contradiction C2. See the header: T3 needs a person, 'other' has none.
      RAISE EXCEPTION 'پرداخت به «سایر» از این مسیر ثبت نمی‌شود؛ ابتدا طرف حساب را به عنوان تأمین‌کننده، مشتری یا طرف حساب خارجی ثبت کنید تا کد آسان داشته باشد'
        USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'نوع دریافت‌کننده نامعتبر است؛ یکی از supplier / external_party / customer باید باشد'
      USING ERRCODE = '22023';
  END IF;

  IF p_payee_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ دریافت‌کننده الزامی است'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ پرداخت باید بزرگ‌تر از صفر باشد'
      USING ERRCODE = '22023';
  END IF;

  -- No fractional Toman (ledger-decisions Part 3, rule 3). The ×10 to Rial must
  -- be exact and the Asan export blocks on fractions anyway.
  IF p_amount <> trunc(p_amount) THEN
    RAISE EXCEPTION 'مبلغ پرداخت باید عدد صحیح (تومان) باشد'
      USING ERRCODE = '22023';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'تاریخ پرداخت الزامی است'
      USING ERRCODE = '22023';
  END IF;

  -- Date bounds, mirroring migration 351 (Gate A M6) exactly. The rationale is
  -- identical on this side: a backdated entry lands in an Asan export window
  -- that may already have been submitted, and 343 immutability plus the absence
  -- of reverse_document (OG-14) mean it can never be moved or withdrawn. The
  -- two rules are refused separately so the message names the one that was hit.
  IF p_payment_date > public.tehran_today() THEN
    RAISE EXCEPTION 'تاریخ پرداخت نمی‌تواند در آینده باشد'
      USING ERRCODE = '22023';
  END IF;

  IF public.jalali_year(p_payment_date) < public.jalali_year(public.tehran_today()) - 1 THEN
    RAISE EXCEPTION 'تاریخ پرداخت از سال % است و از سال گذشته قدیمی‌تر است؛ سال جاری %',
      public.jalali_year(p_payment_date), public.jalali_year(public.tehran_today())
      USING ERRCODE = '22023';
  END IF;

  -- The source account is required on every channel because
  -- payment_vouchers.source_bank_account_id is NOT NULL. For a cheque that is a
  -- record of which account the cheque is drawn on, not a movement — the ledger
  -- entry below credits a cheque account, never bank. Contradiction C3.
  IF p_source_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب مبدأ پرداخت الزامی است'
      USING ERRCODE = '22023';
  END IF;

  IF _channel = 'bank'
     AND NULLIF(btrim(coalesce(p_tracking_number, '')), '') IS NULL THEN
    RAISE EXCEPTION 'شمارهٔ پیگیری برای پرداخت بانکی الزامی است'
      USING ERRCODE = '22023';
  END IF;

  IF _channel = 'cheque' THEN
    IF _cheque_kind NOT IN ('own', 'endorsed') THEN
      RAISE EXCEPTION 'نوع چک نامعتبر است؛ own یا endorsed باید باشد'
        USING ERRCODE = '22023';
    END IF;
    IF _cheque_kind = 'own' AND NULLIF(btrim(coalesce(p_cheque_number, '')), '') IS NULL THEN
      RAISE EXCEPTION 'شمارهٔ چک برای چک خودمان الزامی است'
        USING ERRCODE = '22023';
    END IF;
    IF _cheque_kind = 'endorsed' AND p_endorsed_cheque_id IS NULL THEN
      RAISE EXCEPTION 'برای ظهرنویسی باید چک دریافتی را انتخاب کنید'
        USING ERRCODE = '22023';
    END IF;
  ELSIF _cheque_kind <> '' OR p_cheque_number IS NOT NULL
        OR p_cheque_due_date IS NOT NULL OR p_endorsed_cheque_id IS NOT NULL THEN
    -- Refuse loudly rather than silently discarding a value the caller sent.
    RAISE EXCEPTION 'اطلاعات چک فقط برای پرداخت چکی معتبر است'
      USING ERRCODE = '22023';
  END IF;

  -- p_attachment_ids is not wired, exactly as in create_receipt (Gate A m4):
  -- document_attachments.document_id is NOT NULL and validate_document_attachment_ref is a
  -- BEFORE INSERT existence trigger, so an attachment row cannot precede its document. Refuse
  -- loudly rather than accept a silent no-op. NULL and an empty array both mean "no attachments".
  IF p_attachment_ids IS NOT NULL AND array_length(p_attachment_ids, 1) > 0 THEN
    RAISE EXCEPTION 'پیوست فایل در این نسخه هنوز پشتیبانی نمی‌شود؛ سند را ثبت کنید و پیوست را بعداً اضافه کنید'
      USING ERRCODE = '0A000';
  END IF;

  IF p_purchase_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.purchases WHERE id = p_purchase_id) THEN
    RAISE EXCEPTION 'خرید انتخاب‌شده یافت نشد'
      USING ERRCODE = '22023';
  END IF;

  ----------------------------------------------------------------------------
  -- 3. Resolve the payee, and the Asan-code precondition (task 3.5, T3).
  --
  -- The debit kind is chosen here, from payee_type, using only mappings
  -- validate_journal_line_ref already has (T13 constraint 1). See the header for
  -- why this is not keyed to a supplier unconditionally (T13 constraint 3).
  --
  -- require_asan_code has no SECURITY clause, so it is SECURITY INVOKER — verified
  -- from the live catalogue rather than assumed (task 3.5). Inside this SECURITY
  -- DEFINER function it therefore runs as this function's owner and sees every
  -- person_identifiers row, while a direct caller of require_asan_code gets only
  -- what that table's RLS grants them.
  ----------------------------------------------------------------------------
  IF _payee_type = 'supplier' THEN
    SELECT s.person_id, s.name, NULLIF(btrim(coalesce(s.accounting_code, '')), '')
      INTO _person_id, _payee_name, _receiver_code
      FROM public.suppliers s WHERE s.id = p_payee_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'تأمین‌کننده یافت نشد' USING ERRCODE = '22023';
    END IF;
    _debit_kind := 'supplier_payable';

  ELSIF _payee_type = 'external_party' THEN
    SELECT ep.person_id, ep.full_name, NULLIF(btrim(coalesce(ep.accounting_code, '')), ''), ep.is_active
      INTO _person_id, _payee_name, _receiver_code, _is_active
      FROM public.external_parties ep WHERE ep.id = p_payee_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'طرف حساب خارجی یافت نشد' USING ERRCODE = '22023';
    END IF;
    -- Matches pay_purchase_with_voucher's existing refusal, so the two writers
    -- agree on what an inactive party means.
    IF NOT coalesce(_is_active, false) THEN
      RAISE EXCEPTION 'طرف حساب خارجی «%» غیرفعال است و نمی‌توان به او پرداخت ثبت کرد', _payee_name
        USING ERRCODE = '22023';
    END IF;
    _debit_kind := 'external_party';

  ELSE  -- customer
    SELECT c.person_id, c.name, NULLIF(btrim(coalesce(c.accounting_code, '')), '')
      INTO _person_id, _payee_name, _receiver_code
      FROM public.customers c WHERE c.id = p_payee_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'مشتری یافت نشد' USING ERRCODE = '22023';
    END IF;
    _debit_kind := 'customer_credit';
  END IF;

  -- T3. Called unconditionally and exactly once: it is the precondition, not a
  -- lookup, so it must run even when the role row already carries an
  -- accounting_code mirror. It raises P0001 naming the party. person_id is
  -- NOT NULL on all three role tables (measured: 29 of 29 persons-referencing
  -- FKs registered ok), so this is always reachable.
  --
  -- ground-truth §12 records a customer whose customers.accounting_code is set
  -- while person_identifiers has no row — the mirror can disagree with the
  -- identifier, and the export reads the identifier. The Asan code therefore
  -- wins over the mirror here, rather than the other way round.
  _asan_code := public.require_asan_code(_person_id);
  _receiver_code := coalesce(_asan_code, _receiver_code);

  ----------------------------------------------------------------------------
  -- 4. Resolve the credit side — where the money comes from.
  ----------------------------------------------------------------------------
  SELECT ba.title, NULLIF(btrim(coalesce(ba.accounting_code, '')), ''), ba.account_type
    INTO _account_title, _payer_code, _account_type
    FROM public.bank_accounts ba WHERE ba.id = p_source_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'حساب مبدأ یافت نشد' USING ERRCODE = '22023';
  END IF;

  IF _channel IN ('bank', 'cash') THEN
    -- Task 3.6, and the mirror of migration 351's B1 fix on the receipt side.
    -- D2 makes a cash box a bank_accounts row with account_type='cash'. Without
    -- this check a cash payment would credit a real bank account and understate
    -- it in vw_account_balances and get_account_ledger — the same wrong ledger
    -- entry 351 stopped on the receipt side, in the opposite direction.
    --
    -- CONSEQUENCE, recorded not hidden: this database has one bank_accounts row
    -- and it is account_type='bank', so every CASH payment is refused until the
    -- owner creates the صندوق. That is the intended outcome of the guard, the
    -- same as for cash receipts since 351 — not a defect.
    IF _channel = 'cash' AND _account_type IS DISTINCT FROM 'cash' THEN
      RAISE EXCEPTION 'پرداخت نقدی باید از صندوق انجام شود؛ حساب «%» از نوع صندوق نیست', _account_title
        USING ERRCODE = 'P0001';
    END IF;
    IF _channel = 'bank' AND _account_type IS DISTINCT FROM 'bank' THEN
      RAISE EXCEPTION 'پرداخت بانکی باید از حساب بانکی انجام شود؛ حساب «%» از نوع بانکی نیست', _account_title
        USING ERRCODE = 'P0001';
    END IF;

    IF _payer_code IS NULL THEN
      RAISE EXCEPTION 'کد حسابداری برای حساب «%» ثبت نشده است؛ بدون آن سند قابل ارسال به آسان نیست', _account_title
        USING ERRCODE = 'P0001';
    END IF;

    _credit_kind := 'bank';
    _credit_ref  := p_source_account_id;
    _credit_desc := 'خروج وجه از ' || coalesce(_account_title, 'حساب');

  ELSIF _cheque_kind = 'own' THEN
    -- Task 3.7. cheque_payable's targets are ARRAY['suppliers','external_parties']
    -- since migration 347 (OG-10: a cheque we issue may go to someone who is not a
    -- supplier). customers is NOT among them, and T13 constraint 1 forbids adding
    -- it, so an own cheque to a customer payee is refused rather than mis-keyed.
    IF _payee_type = 'customer' THEN
      RAISE EXCEPTION 'صدور چک در وجه مشتری از این مسیر پشتیبانی نمی‌شود؛ برای پرداخت به مشتری از روش بانکی استفاده کنید'
        USING ERRCODE = 'P0001';
    END IF;
    _credit_kind := 'cheque_payable';
    _credit_ref  := p_payee_id;
    _credit_desc := 'صدور چک شمارهٔ ' || btrim(p_cheque_number);

  ELSE  -- cheque, endorsed (task 3.8)
    -- The endorsed cheque is a received cheque: a payment_receipts row with
    -- document_channel='cheque'. There is no cheque register (A2 defers the
    -- lifecycle) — migration 354's header records how "the same cheque" was
    -- established. The credit keys to cheque_receivable -> customers, which
    -- validate_journal_line_ref already accepts (347 also allows external_parties).
    SELECT pr.id, pr.customer_id, pr.amount, pr.cheque_number, pr.document_channel
      INTO _endorsed
      FROM public.payment_receipts pr
     WHERE pr.id = p_endorsed_cheque_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'چک دریافتی انتخاب‌شده یافت نشد' USING ERRCODE = '22023';
    END IF;
    IF _endorsed.document_channel IS DISTINCT FROM 'cheque' THEN
      RAISE EXCEPTION 'سند انتخاب‌شده چک نیست و قابل ظهرنویسی نیست' USING ERRCODE = 'P0001';
    END IF;
    IF _endorsed.customer_id IS NULL THEN
      RAISE EXCEPTION 'چک دریافتی صادرکننده ندارد و قابل ظهرنویسی نیست' USING ERRCODE = 'P0001';
    END IF;
    IF _endorsed.amount IS DISTINCT FROM p_amount THEN
      RAISE EXCEPTION 'مبلغ ظهرنویسی باید برابر مبلغ چک باشد؛ مبلغ چک % است', _endorsed.amount
        USING ERRCODE = 'P0001';
    END IF;

    -- Task 3.8's Accept: a second endorsement must raise. The partial UNIQUE
    -- index from 354 is the real guarantee — it holds against a concurrent
    -- second endorsement that this SELECT would not see. This check exists so
    -- the user gets a sentence instead of a constraint name.
    IF EXISTS (SELECT 1 FROM public.payment_vouchers pv
                WHERE pv.endorsed_receipt_id = p_endorsed_cheque_id
                  AND pv.status <> 'rejected') THEN
      RAISE EXCEPTION 'این چک قبلاً ظهرنویسی شده است و دوباره قابل استفاده نیست'
        USING ERRCODE = 'P0001';
    END IF;

    _credit_kind   := 'cheque_receivable';
    _credit_ref    := _endorsed.customer_id;
    _cheque_number := _endorsed.cheque_number;
    _credit_desc   := 'ظهرنویسی چک دریافتی شمارهٔ ' || coalesce(_endorsed.cheque_number, '؟');
  END IF;

  ----------------------------------------------------------------------------
  -- 5. Document number (T6), then the fields derived from it.
  --
  -- The id is minted here rather than by the INSERT's DEFAULT so the number can
  -- be assigned before the row exists, exactly as create_receipt does.
  --
  -- voucher_number is set to the SAME value. payment_vouchers already carries
  -- trg_payment_voucher_set_number, which mints 'PV-YYYY-NNNNN' from a sequence
  -- when voucher_number IS NULL — a second, parallel identity for one document.
  -- Supplying the PAY number suppresses it (the trigger only fills a NULL), so a
  -- payment has ONE number, and tg_burn_payment_document_number — which already
  -- burns document_numbers keyed by the voucher id — stays correct. Recorded as
  -- contradiction C6. The front end reads voucher_number as an opaque string
  -- (src/lib/treasury/queries.ts, _app.accounting.payment-vouchers.tsx:294) and
  -- does not parse the PV- prefix, so the change of format is safe.
  ----------------------------------------------------------------------------
  _doc_number := public.assign_document_number('payment', _voucher_id);

  -- document_channel is NOT NULL and its CHECK admits card_to_card | paya | pol |
  -- satna | cash | cheque | other — there is no 'bank' value. The real sub-channel
  -- is not known until the phase-6 wizard collects it, so a bank payment is stored
  -- as 'other' rather than guessing. Contradiction C7, the mirror of phase 2's C6.
  _doc_channel := CASE _channel
                    WHEN 'cash'   THEN 'cash'
                    WHEN 'cheque' THEN 'cheque'
                    ELSE 'other'
                  END;

  -- tracking_number is nullable here (unlike payment_receipts), so a non-bank
  -- payment does not need a minted value. A caller-supplied one is honoured on
  -- every channel — discarding a value the caller sent is a swallowed input
  -- (Gate A m5, the receipt side's lesson).
  _tracking := NULLIF(btrim(coalesce(p_tracking_number, '')), '');
  IF _tracking IS NULL AND _channel <> 'bank' THEN
    _tracking := 'INT-' || _doc_number;
  END IF;

  _cheque_number := coalesce(_cheque_number, NULLIF(btrim(coalesce(p_cheque_number, '')), ''));
  _cheque_due    := p_cheque_due_date;

  ----------------------------------------------------------------------------
  -- 6. The voucher row (task 3.3).
  --
  -- The payee columns are filled in the exact shape
  -- payment_vouchers_payee_matches_type_chk already requires — reused, not
  -- replaced (ground-truth §5). payee_person_id is left to
  -- trg_payment_vouchers_derive_person, which already resolves it from whichever
  -- payee column is set; T13 constraint 2 is satisfied by an existing trigger at
  -- zero cost, and it is asserted below rather than trusted.
  ----------------------------------------------------------------------------
  INSERT INTO public.payment_vouchers (
    id, voucher_number, amount, payment_date, payee_type,
    payee_supplier_id, payee_party_id, payee_customer_id, payee_name,
    document_channel, source_bank_account_id, tracking_number,
    cheque_number, cheque_due_date, endorsed_receipt_id,
    description, status, purchase_id, created_by
  ) VALUES (
    _voucher_id, _doc_number, p_amount, p_payment_date, _payee_type,
    CASE WHEN _payee_type = 'supplier'       THEN p_payee_id END,
    CASE WHEN _payee_type = 'external_party' THEN p_payee_id END,
    CASE WHEN _payee_type = 'customer'       THEN p_payee_id END,
    NULL,
    _doc_channel, p_source_account_id, _tracking,
    _cheque_number, _cheque_due,
    CASE WHEN _channel = 'cheque' AND _cheque_kind = 'endorsed' THEN p_endorsed_cheque_id END,
    coalesce(p_description, 'سند پرداخت ' || _doc_number),
    'approved', p_purchase_id, _uid
  );

  -- T13 constraint 2, asserted rather than assumed.
  IF (SELECT pv.payee_person_id FROM public.payment_vouchers pv WHERE pv.id = _voucher_id)
     IS DISTINCT FROM _person_id THEN
    RAISE EXCEPTION 'شناسهٔ شخص دریافت‌کننده ثبت نشد؛ ثبت سند لغو شد'
      USING ERRCODE = 'P0001';
  END IF;

  ----------------------------------------------------------------------------
  -- 7. The journal entry (task 3.4).
  --
  -- doc_kind is passed explicitly: 341 dropped its DEFAULT on purpose so an
  -- omission fails loudly instead of becoming 'other'.
  ----------------------------------------------------------------------------
  _debit_desc := 'کاهش بدهی به «' || coalesce(_payee_name, '؟') || '»';

  INSERT INTO public.journal_entries (
    doc_kind, source_type, source_id, entry_date, description,
    status, posted_by, payer_accounting_code, receiver_accounting_code
  ) VALUES (
    'payment', 'payment_voucher', _voucher_id, p_payment_date,
    'سند پرداخت شمارهٔ ' || _doc_number,
    'posted', _uid, _payer_code, _receiver_code
  )
  RETURNING id INTO _entry_id;

  INSERT INTO public.journal_lines (
    journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description
  ) VALUES
    (_entry_id, 1, _debit_kind,  p_payee_id,  p_amount, 0, _debit_desc),
    (_entry_id, 2, _credit_kind, _credit_ref, 0, p_amount, _credit_desc);

  -- Balance or nothing (ledger-decisions Part 3, rule 1). An unbalanced document
  -- is dropped from the Asan export entirely, so it must be refused at creation
  -- rather than created and silently withheld.
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
  -- 8. The payee's balance after this payment, in the convention recorded in
  --    the header. Positive means "still owed to them" for the liability-side
  --    kinds and "still owed to us" for customer_credit. It is computed from the
  --    ledger rather than from a cached column because no cached balance exists
  --    on the payment side — there is no supplier equivalent of
  --    customer_credit_balance, and inventing one is T9's business, not phase 3's.
  ----------------------------------------------------------------------------
  SELECT CASE WHEN _debit_kind = 'customer_credit'
              THEN coalesce(sum(jl.debit - jl.credit), 0)
              ELSE coalesce(sum(jl.credit - jl.debit), 0)
         END
    INTO _balance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
   WHERE je.status = 'posted'
     AND jl.account_kind = _debit_kind
     AND jl.account_ref_id = p_payee_id;

  ----------------------------------------------------------------------------
  -- 9. Audit (audit-trigger-spec.md §2), in the same transaction.
  --
  -- audit_logs has no dedicated journal_entry_id / document_number / amount /
  -- counterparty columns, so those fields go into diff jsonb — the same shape
  -- create_receipt uses.
  ----------------------------------------------------------------------------
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    _uid, 'payment_voucher', _voucher_id::text, 'payment_created',
    jsonb_build_object(
      'document_number',   _doc_number,
      'journal_entry_id',  _entry_id,
      'amount',            p_amount,
      'payment_date',      p_payment_date,
      'channel',           _channel,
      'document_channel',  _doc_channel,
      'payee_type',        _payee_type,
      'payee_id',          p_payee_id,
      'payee_person_id',   _person_id,
      'debit_account_kind',  _debit_kind,
      'credit_account_kind', _credit_kind,
      'source_account_id', p_source_account_id,
      'cheque_kind',       NULLIF(_cheque_kind, ''),
      'endorsed_receipt_id', CASE WHEN _cheque_kind = 'endorsed' THEN p_endorsed_cheque_id END,
      'purchase_id',       p_purchase_id,
      'tracking_number',   _tracking
    ));

  RETURN QUERY SELECT _voucher_id, _doc_number, _entry_id, _balance;
END;
$function$;

-- Task 3.9 — grants. PUBLIC and anon must not hold EXECUTE on a SECURITY DEFINER
-- function that writes the ledger; the role gate inside is the boundary, and the
-- grant is the outer door. Mirrors migration 351's grants for create_receipt.
REVOKE ALL ON FUNCTION public.create_payment(
  text, text, uuid, numeric, date, uuid, text, text, text, date, uuid, uuid, text, uuid[]
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_payment(
  text, text, uuid, numeric, date, uuid, text, text, text, date, uuid, uuid, text, uuid[]
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_payment(
  text, text, uuid, numeric, date, uuid, text, text, text, date, uuid, uuid, text, uuid[]
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_payment(
  text, text, uuid, numeric, date, uuid, text, text, text, date, uuid, uuid, text, uuid[]
) TO service_role;

COMMENT ON FUNCTION public.create_payment(
  text, text, uuid, numeric, date, uuid, text, text, text, date, uuid, uuid, text, uuid[]
) IS
  'Creates a payment voucher and posts its balanced journal entry in one transaction (phase 3, '
  'migration 355). The debit account_kind is chosen from payee_type using only mappings '
  'validate_journal_line_ref already has — supplier_payable/suppliers, external_party/'
  'external_parties, customer_credit/customers — so a payment moves the balance of the party who '
  'was actually paid (T10, T13 constraint 3). payee_type ''other'' is refused: T3 requires an Asan '
  'code and ''other'' has no person. Cash requires a bank_accounts row with account_type=''cash''. '
  'p_payment_date may not be in the future nor older than the previous Jalali year. '
  'p_attachment_ids raises 0A000 — not wired. Role gate: admin, accountant, manager (OG-13 (a)).';
