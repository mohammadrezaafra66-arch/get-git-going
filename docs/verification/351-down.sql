-- 351-down.sql — rollback for
--   supabase/migrations/20260819091000_351_create_receipt_cash_account_and_date_bounds.sql
--
-- Restores public.create_receipt to the definition that was live immediately before migration 351
-- — i.e. exactly what migration 349 installed. The body below was NOT hand-copied: it is the
-- verbatim output of pg_get_functiondef against the live catalogue, taken 2026-08-19 before 351
-- was written, so it cannot have drifted from what was actually running.
--
-- NO TRANSACTION CONTROL IN THIS FILE — deliberately. See Gate A M7 and
-- docs/verification/rollback-dryrun.sql. The caller owns the transaction:
--   real:     psql … -v ON_ERROR_STOP=1 --single-transaction -f 351-down.sql
--   dry-run:  psql … -v downfile=/tmp/351-down.sql -f /tmp/rollback-dryrun.sql
--
-- CREATE OR REPLACE preserves the ACL, so the grants migration 349 issued (authenticated,
-- service_role; no PUBLIC, no anon) survive this rollback and do not need reissuing. Verified by
-- the dry-run, which reads pg_proc.proacl back afterwards.
--
-- WHAT ROLLING THIS BACK RE-OPENS — read before running:
--
--   * Gate A B1 second half. Cash receipts stop checking that their destination is a
--     bank_accounts row with account_type='cash', so a cash receipt can again debit a real BANK
--     account and inflate it in vw_account_balances and get_account_ledger.
--   * Gate A M6. p_payment_date becomes unbounded again: a receipt dated years in the past or
--     400 days in the future is accepted and posts an immutable entry on that date, which
--     cannot then be moved or reversed (reverse_document does not exist — OG-14).
--
-- Neither is a data-loss risk. Documents created while 351 was live remain valid: 351 only ever
-- REFUSED inputs, it never wrote a row shape that 349 could not produce.
--
-- Ordering: independent of 350, 352 and 353. May be rolled back alone.

SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.create_receipt(p_channel text, p_customer_id uuid, p_amount numeric, p_payment_date date, p_payment_time time without time zone, p_destination_bank_account_id uuid DEFAULT NULL::uuid, p_tracking_number text DEFAULT NULL::text, p_source_bank text DEFAULT NULL::text, p_cheque_number text DEFAULT NULL::text, p_cheque_due_date date DEFAULT NULL::date, p_cheque_bank text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_allocations jsonb DEFAULT '[]'::jsonb, p_attachment_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(receipt_id uuid, document_number text, journal_entry_id uuid, new_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid            uuid := auth.uid();
  _channel        text := lower(btrim(coalesce(p_channel, '')));
  _receipt_id     uuid := gen_random_uuid();
  _doc_number     text;
  _entry_id       uuid;
  _person_id      uuid;
  _payer_code     text;
  _payer_name     text;
  _receiver_name  text;
  _receiver_code  text;
  _tracking       text;
  _doc_channel    text;
  _source_bank    text;
  _debit_kind     text;
  _debit_ref      uuid;
  _debit_desc     text;
  _balance        numeric;
  _alloc          jsonb;
  _alloc_quote    uuid;
  _alloc_amount   numeric;
  _alloc_count    integer := 0;
  _quote_customer uuid;
  _debit_total    numeric;
  _credit_total   numeric;
BEGIN
  ----------------------------------------------------------------------------
  -- 1. Role gate (task 2.8).
  --
  -- OG-13 answer (a): create = admin, accountant, manager. The same boundary
  -- assign_document_number enforces since 346, so a caller admitted here is
  -- never refused mid-transaction at the numbering step — that was Gate A's M3.
  -- The cast to app_role[] picks one of the two has_any_role overloads
  -- explicitly; calling it unqualified through PostgREST throws PGRST203.
  --
  -- Refuse loudly. An unauthorised caller receiving an empty result is read
  -- upstream as "there is nothing here" (audit-trigger-spec.md §3.3).
  ----------------------------------------------------------------------------
  IF NOT public.has_any_role(_uid,
        ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ ثبت فیش دریافت را ندارید'
      USING ERRCODE = '42501';
  END IF;

  ----------------------------------------------------------------------------
  -- 2. Argument validation (22023). Everything checkable without touching a
  --    table is checked here, before a document number is burned.
  ----------------------------------------------------------------------------
  IF _channel NOT IN ('bank', 'cash', 'cheque') THEN
    RAISE EXCEPTION 'نوع دریافت نامعتبر است؛ باید یکی از «واریز بانکی»، «نقدی» یا «چک» باشد'
      USING ERRCODE = '22023';
  END IF;

  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'مشتری پرداخت‌کننده انتخاب نشده است'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ فیش باید بزرگ‌تر از صفر باشد'
      USING ERRCODE = '22023';
  END IF;

  -- D5: the Asan export blocks fractional Toman because the ×10 conversion to
  -- Rial must be exact. Refuse at the door rather than create a document that
  -- is then silently withheld from the export.
  IF p_amount <> trunc(p_amount) THEN
    RAISE EXCEPTION 'مبلغ فیش باید عدد صحیح به تومان باشد؛ مبلغ اعشاری پذیرفته نمی‌شود'
      USING ERRCODE = '22023';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'تاریخ دریافت الزامی است'
      USING ERRCODE = '22023';
  END IF;

  -- payment_time is NOT NULL with no default (ground-truth §5).
  IF p_payment_time IS NULL THEN
    RAISE EXCEPTION 'ساعت دریافت الزامی است'
      USING ERRCODE = '22023';
  END IF;

  -- C5: cash needs a destination account too. D2 makes a cash box a
  -- bank_accounts row with account_type='cash', the debit line needs something
  -- to reference, and payment_receipts_receiver_exclusive_chk demands a
  -- receiver on any row that is not pending_review.
  IF _channel IN ('bank', 'cash') AND p_destination_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب مقصد (بانک یا صندوق) برای این نوع دریافت الزامی است'
      USING ERRCODE = '22023';
  END IF;

  IF _channel = 'bank'
     AND NULLIF(btrim(coalesce(p_tracking_number, '')), '') IS NULL THEN
    RAISE EXCEPTION 'شمارهٔ پیگیری برای واریز بانکی الزامی است'
      USING ERRCODE = '22023';
  END IF;

  IF _channel = 'cheque' THEN
    IF NULLIF(btrim(coalesce(p_cheque_number, '')), '') IS NULL THEN
      RAISE EXCEPTION 'شمارهٔ چک الزامی است'
        USING ERRCODE = '22023';
    END IF;
    IF p_cheque_due_date IS NULL THEN
      RAISE EXCEPTION 'تاریخ سررسید چک الزامی است'
        USING ERRCODE = '22023';
    END IF;
    -- A cheque is not deposited at the moment it is received (A2 defers the
    -- cheque lifecycle; D7 posts it to cheque_receivable). Storing a
    -- destination account we are not crediting would be a field nobody reads
    -- and everybody misreads.
    IF p_destination_bank_account_id IS NOT NULL THEN
      RAISE EXCEPTION 'برای چک، حساب مقصد ثبت نمی‌شود؛ چک پس از وصول به حساب می‌نشیند'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    -- Mirrors payment_receipts_cheque_fields_chk so the caller gets a readable
    -- Persian message instead of a raw 23514 from the table constraint.
    IF p_cheque_number IS NOT NULL OR p_cheque_due_date IS NOT NULL THEN
      RAISE EXCEPTION 'مشخصات چک فقط برای دریافت از نوع «چک» قابل ثبت است'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'فهرست تخصیص‌ها باید یک آرایه باشد'
      USING ERRCODE = '22023';
  END IF;

  -- A3 gives document_attachments a NOT NULL document_id and a BEFORE
  -- INSERT/UPDATE existence trigger, so an attachment row cannot exist before
  -- the document it belongs to. There is therefore no id this parameter could
  -- legitimately carry today, and accepting one would either be a silent no-op
  -- or a way to re-point somebody else's attachment onto this receipt.
  -- Refuse loudly, exactly as validate_document_attachment_ref already does for
  -- document_type='dual'. Phase 6 decides the upload order and wires this.
  -- Recorded as C8 in docs/execution/phase-2-PROGRESS.md.
  IF p_attachment_ids IS NOT NULL AND array_length(p_attachment_ids, 1) > 0 THEN
    RAISE EXCEPTION 'پیوست فایل در این نسخه هنوز پشتیبانی نمی‌شود؛ با فرم پیوست فاز بعد اضافه می‌شود'
      USING ERRCODE = '0A000';
  END IF;

  ----------------------------------------------------------------------------
  -- 3. Asan-code precondition (task 2.3, T3).
  --
  -- require_asan_code is SECURITY INVOKER since 346. That is deliberate: inside
  -- this SECURITY DEFINER function it runs as the owner and sees everything,
  -- while a direct caller gets exactly the visibility person_identifiers' RLS
  -- already grants them (Gate A, M1).
  ----------------------------------------------------------------------------
  SELECT c.person_id INTO _person_id
    FROM public.customers c
   WHERE c.id = p_customer_id;

  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'مشتری یافت نشد'
      USING ERRCODE = '22023';
  END IF;

  _payer_code := public.require_asan_code(_person_id);   -- raises P0001, naming the customer

  SELECT p.display_name INTO _payer_name
    FROM public.persons p
   WHERE p.id = _person_id;

  ----------------------------------------------------------------------------
  -- 4. Resolve the debit side and prove it carries an accounting code.
  --
  -- Discovering a missing code at export time means silently withholding the
  -- document, so it is checked here (contract §1, "Before posting").
  ----------------------------------------------------------------------------
  IF _channel IN ('bank', 'cash') THEN
    SELECT ba.title, NULLIF(btrim(coalesce(ba.accounting_code, '')), '')
      INTO _receiver_name, _receiver_code
      FROM public.bank_accounts ba
     WHERE ba.id = p_destination_bank_account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'حساب مقصد یافت نشد'
        USING ERRCODE = '22023';
    END IF;

    IF _receiver_code IS NULL THEN
      RAISE EXCEPTION
        'کد حسابداری برای حساب «%» ثبت نشده است؛ ابتدا در صفحهٔ «حساب‌های بانکی» کد حسابداری آن را وارد کنید، سپس فیش را ثبت کنید',
        coalesce(_receiver_name, '?')
        USING ERRCODE = 'P0001';
    END IF;

    _receiver_name := coalesce(NULLIF(btrim(_receiver_name), ''), 'حساب شرکت');
    _debit_kind    := 'bank';          -- D2: cash is a bank_accounts row, not a new kind
    _debit_ref     := p_destination_bank_account_id;
    _debit_desc    := CASE WHEN _channel = 'cash'
                           THEN 'دریافت نقدی به صندوق شرکت'
                           ELSE 'واریز به حساب بانکی شرکت'
                      END;
  ELSE
    -- C1: the contract said "the cheque register row". There is no cheque
    -- register — A2 defers the cheque lifecycle. validate_journal_line_ref
    -- accepts cheque_receivable only against customers or external_parties
    -- (341, widened by 347 for OG-10), so the reference is the drawer.
    --
    -- Nothing to verify on the code side: cheque_receivable has no Asan code by
    -- design and the export skips those lines rather than blocking the document
    -- (D8, task 5.2).
    _receiver_name := 'چک دریافتی نزد شرکت';
    _receiver_code := NULL;
    _debit_kind    := 'cheque_receivable';
    _debit_ref     := p_customer_id;
    _debit_desc    := 'چک دریافتی از مشتری';
  END IF;

  ----------------------------------------------------------------------------
  -- 5. Document number (T6), then the tracking number that is derived from it.
  ----------------------------------------------------------------------------
  _doc_number := public.assign_document_number('receipt', _receipt_id);

  -- Task 2.5. tracking_number is NOT NULL with no default and a cash receipt
  -- has no bank reference, so one is minted. A value the caller did supply is
  -- honoured rather than discarded — the cheque branch in particular may carry
  -- a real reference.
  _tracking := NULLIF(btrim(coalesce(p_tracking_number, '')), '');
  IF _tracking IS NULL THEN
    _tracking := 'INT-' || _doc_number;
  END IF;

  -- C6: document_channel's CHECK has no 'bank' value. Recording a false
  -- sub-channel (paya / other) would be worse than recording none; the wizard
  -- collects the real one in phase 6.
  _doc_channel := CASE _channel
                    WHEN 'cash'   THEN 'cash'
                    WHEN 'cheque' THEN 'cheque'
                    ELSE NULL
                  END;

  -- For a cheque the funds come from the bank the cheque is drawn on, which is
  -- what source_bank means. p_cheque_bank fills it when the caller did not.
  _source_bank := coalesce(
                    NULLIF(btrim(coalesce(p_source_bank, '')), ''),
                    CASE WHEN _channel = 'cheque'
                         THEN NULLIF(btrim(coalesce(p_cheque_bank, '')), '')
                    END);

  ----------------------------------------------------------------------------
  -- 6. The receipt row (task 2.2).
  --
  -- C3: status='approved' + posting_status='posted'. T1 removed the approval
  -- STEP, and it is removed — nobody approves anything, the row is born posted
  -- inside this transaction. It is not status='posted' because that value does
  -- not exist (payment_receipts_status_check), and because
  -- enforce_payment_receipt_link_limits caps a proforma's remaining balance
  -- counting only status='approved' receipts: a fourth status value would have
  -- silently disabled the over-allocation cap for every receipt created here.
  --
  -- receipt_type carries its fixed default (T5 / D1): the field is gone from
  -- the UI, the column stays NOT NULL so existing readers keep working.
  ----------------------------------------------------------------------------
  INSERT INTO public.payment_receipts (
    id, customer_id,
    payer_name, payer_accounting_code,
    receiver_name, receiver_accounting_code,
    amount, payment_date, payment_time, tracking_number,
    source_bank, description,
    status, posting_status, posted_at,
    created_by, receipt_type, document_channel,
    destination_bank_account_id, cheque_number, cheque_due_date
  ) VALUES (
    _receipt_id, p_customer_id,
    _payer_name, _payer_code,
    _receiver_name, _receiver_code,
    p_amount, p_payment_date, p_payment_time, _tracking,
    _source_bank, NULLIF(btrim(coalesce(p_description, '')), ''),
    'approved', 'posted', now(),
    _uid, 'invoice_payment', _doc_channel,
    p_destination_bank_account_id,
    NULLIF(btrim(coalesce(p_cheque_number, '')), ''), p_cheque_due_date
  );

  ----------------------------------------------------------------------------
  -- 7. Proforma allocations (task 2.7).
  --
  -- Same transaction, so a failure anywhere below aborts the whole thing and
  -- leaves zero payment_receipts rows. That is the entire point of A4: the
  -- current page's compensating DELETE matches nothing, so its orphan is
  -- guaranteed rather than possible.
  --
  -- The two money caps are NOT re-implemented here.
  -- trg_payment_receipt_links_enforce_limits already enforces both, with
  -- Persian messages written for the user, and a second copy would drift.
  ----------------------------------------------------------------------------
  IF jsonb_array_length(coalesce(p_allocations, '[]'::jsonb)) > 0 THEN

    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements(p_allocations) a
       GROUP BY a.value->>'quote_id'
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'هر پیش‌فاکتور فقط یک‌بار می‌تواند در یک فیش تخصیص بگیرد'
        USING ERRCODE = '22023';
    END IF;

    FOR _alloc IN SELECT a.value FROM jsonb_array_elements(p_allocations) a LOOP

      IF jsonb_typeof(_alloc) <> 'object' THEN
        RAISE EXCEPTION 'هر تخصیص باید شامل «quote_id» و «amount» باشد'
          USING ERRCODE = '22023';
      END IF;

      IF coalesce(_alloc->>'quote_id', '') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'شناسهٔ پیش‌فاکتور در تخصیص‌ها معتبر نیست'
          USING ERRCODE = '22023';
      END IF;

      IF jsonb_typeof(_alloc->'amount') <> 'number' THEN
        RAISE EXCEPTION 'مبلغ تخصیص باید عدد باشد'
          USING ERRCODE = '22023';
      END IF;

      _alloc_quote  := (_alloc->>'quote_id')::uuid;
      _alloc_amount := (_alloc->>'amount')::numeric;

      IF _alloc_amount <= 0 OR _alloc_amount <> trunc(_alloc_amount) THEN
        RAISE EXCEPTION 'مبلغ تخصیص باید عدد صحیح و بزرگ‌تر از صفر باشد'
          USING ERRCODE = '22023';
      END IF;

      -- A receipt from one customer must not settle another customer's
      -- proforma. The link trigger caps the money but does not check whose
      -- document it is, and this RPC is now the single place the rule can live
      -- for every caller (A4).
      SELECT q.customer_id INTO _quote_customer
        FROM public.sales_quotes q
       WHERE q.id = _alloc_quote;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'پیش‌فاکتور انتخاب‌شده یافت نشد'
          USING ERRCODE = '22023';
      END IF;

      IF _quote_customer IS DISTINCT FROM p_customer_id THEN
        RAISE EXCEPTION 'این پیش‌فاکتور متعلق به مشتری دیگری است و با این فیش قابل تسویه نیست'
          USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO public.payment_receipt_links (receipt_id, quote_id, amount)
      VALUES (_receipt_id, _alloc_quote, _alloc_amount);

      _alloc_count := _alloc_count + 1;
    END LOOP;
  END IF;

  ----------------------------------------------------------------------------
  -- 8. The journal entry (tasks 2.4, 2.6).
  --
  -- doc_kind is passed explicitly: 341 dropped its DEFAULT on purpose so an
  -- omission fails loudly instead of becoming 'other' (and that omission is
  -- exactly what Gate A's B1 caught in three existing writers).
  ----------------------------------------------------------------------------
  INSERT INTO public.journal_entries (
    doc_kind, source_type, source_id, entry_date, description,
    status, posted_by, payer_accounting_code, receiver_accounting_code
  ) VALUES (
    'receipt', 'payment_receipt', _receipt_id, p_payment_date,
    'فیش دریافت شمارهٔ ' || _doc_number,
    'posted', _uid, _payer_code, _receiver_code
  )
  RETURNING id INTO _entry_id;

  INSERT INTO public.journal_lines (
    journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description
  ) VALUES
    (_entry_id, 1, _debit_kind, _debit_ref, p_amount, 0, _debit_desc),
    (_entry_id, 2, 'customer_credit', p_customer_id, 0, p_amount,
     'افزایش اعتبار / کاهش بدهی مشتری');

  -- Balance or nothing (ledger-decisions Part 3, rule 1). An unbalanced
  -- document is excluded from the Asan export entirely, so it must be refused
  -- at creation rather than created and silently dropped. The two lines above
  -- cannot currently be unbalanced; the assertion exists so that a future edit
  -- to them fails here instead of at export time, months later.
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
  -- 9. Move the customer's balance (T2).
  --
  -- Reuses increase_credit — the function the approval path already used — so
  -- there is one place that writes customer_credit_balance and one
  -- customer_credit_ledger shape. It gates on admin/manager/accountant, the
  -- same boundary as this function.
  ----------------------------------------------------------------------------
  PERFORM public.increase_credit(p_customer_id, p_amount, _receipt_id, _uid);

  SELECT g.available_credit INTO _balance
    FROM public.get_customer_credit(p_customer_id) g;

  ----------------------------------------------------------------------------
  -- 10. Audit (audit-trigger-spec.md §2), in the same transaction.
  --
  -- The spec's required fields have no dedicated columns on audit_logs, so they
  -- go into diff. actor_id is auth.uid() and never a parameter, so a caller
  -- cannot claim to be someone else.
  --
  -- Deliberately absent: the party's Asan code, phone and national id. The
  -- audit answers who did what to which document, not who the person is.
  ----------------------------------------------------------------------------
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    _uid, 'payment_receipt', _receipt_id::text, 'receipt_created',
    jsonb_build_object(
      'journal_entry_id',  _entry_id,
      'document_number',   _doc_number,
      'amount',            p_amount,
      'counterparty_id',   p_customer_id,
      'counterparty_kind', 'customer',
      'channel',           _channel,
      'debit_account_kind', _debit_kind,
      'allocation_count',  _alloc_count
    )
  );

  RETURN QUERY SELECT _receipt_id, _doc_number, _entry_id, _balance;
END;
$function$
;
