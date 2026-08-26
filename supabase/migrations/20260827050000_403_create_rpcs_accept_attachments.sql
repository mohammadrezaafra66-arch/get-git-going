SET client_encoding='UTF8';

-- 403 — M1 part 2: the three create RPCs stop refusing attachments and start CREATING them,
-- in the same transaction as the document.
--
-- WHAT WAS THERE, and why it was not simply a missing feature.
-- All three functions accepted `p_attachment_ids uuid[]` and raised `0A000` the moment you
-- passed one. The comment in `create_receipt` explains itself precisely, and it was correct:
--
--     -- A3 gives document_attachments a NOT NULL document_id and a BEFORE INSERT/UPDATE
--     -- existence trigger, so an attachment row cannot exist before the document it belongs
--     -- to. There is therefore no id this parameter could legitimately carry today, and
--     -- accepting one would either be a silent no-op or a way to re-point somebody else's
--     -- attachment onto this receipt. ... Phase 6 decides the upload order and wires this.
--
-- So the refusal was not laziness: **the parameter had the wrong SHAPE for any order of
-- operations that was still allowed.** `uuid[]` presumes the attachment ROWS already exist,
-- which is create-then-attach — the order the owner rejected. That decision is now made, and
-- the shape changes with it.
--
-- THE NEW SHAPE: `p_attachments jsonb`, an array of
--     { "storage_path": "...", "mime_type": "...", "ocr_payload": {...}, "ocr_status": "done" }
-- The client uploads to STORAGE first (which needs no document id — the bucket policies gate on
-- bucket and role, never on path, verified) and OCRs from raw bytes via `extractReceiptFromBytes`
-- BEFORE submitting. This function then creates the document row and its attachment rows
-- together. The attachment precedes the document in the USER'S workflow, which is what was
-- decided; neither ROW can exist without the other, which is what makes an orphan impossible.
--
-- SIGNATURE CHANGE, SO THE OLD ONE IS DROPPED IN THE SAME MIGRATION. Safety rule 5: changing a
-- parameter's type does not replace a function, it OVERLOADS it — the old signature would stay,
-- every existing call would become ambiguous, and the feature would break at runtime in a way
-- that looks nothing like this migration. Each `DROP FUNCTION` below names the exact old
-- signature by type.
--
-- BODIES ARE BYTE-FOR-BYTE COPIES of the live definitions (`pg_get_functiondef`, captured
-- 2026-08-26) with exactly three edits each, applied by script rather than by hand: the
-- parameter, the refusal block (replaced by early validation), and one INSERT placed
-- immediately before the closing `RETURN QUERY`. Nothing else in ~1,100 lines was touched.

-- create_receipt: parameter reshaped, refusal replaced, attachments created in-transaction
CREATE OR REPLACE FUNCTION public.create_receipt(p_channel text, p_customer_id uuid, p_amount numeric, p_payment_date date, p_payment_time time without time zone, p_destination_bank_account_id uuid DEFAULT NULL::uuid, p_tracking_number text DEFAULT NULL::text, p_source_bank text DEFAULT NULL::text, p_cheque_number text DEFAULT NULL::text, p_cheque_due_date date DEFAULT NULL::date, p_cheque_bank text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_allocations jsonb DEFAULT '[]'::jsonb, p_attachments jsonb DEFAULT NULL::jsonb)
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
  _account_type   text;
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

  -- M6 / Gate A. p_payment_date was unbounded: a receipt dated 2019-01-01 was accepted and
  -- posted an immutable entry on that date, while its document number carried the CURRENT
  -- Jalali year (RCP-1405-…). A date 400 days in the future was accepted too. Both land in
  -- asan_list_journal_export's and asan_list_bank_deposit_export's date windows, and neither
  -- can be moved or withdrawn afterwards (343 immutability, and reverse_document does not
  -- exist — OG-14).
  --
  -- Two different problems, refused separately so the message tells the user which one:
  --   * A FUTURE date is always wrong. Money that has not arrived is not a receipt.
  --   * A date older than the PREVIOUS Jalali year is refused; the current and the previous
  --     Jalali year are allowed. The one-year window is deliberate: an accountant entering a
  --     29 Esfand receipt on 2 Farvardin is doing normal year-end work, and refusing that would
  --     push them back onto the legacy form. Anything older is data entry into a period that has
  --     already been exported to Asan.
  --
  -- Consequence worth naming: inside the allowed window the document number's Jalali year and
  -- the entry date can still differ by one year, because assign_document_number takes the year
  -- from tehran_today() and the serial is global (OG-9 — the year is a label, not a key).
  -- That is the widest they can now differ; before this migration it was unbounded.
  IF p_payment_date > public.tehran_today() THEN
    RAISE EXCEPTION 'تاریخ دریافت نمی‌تواند در آینده باشد؛ تاریخ امروز یا پیش از آن را وارد کنید'
      USING ERRCODE = '22023';
  END IF;

  IF public.jalali_year(p_payment_date) < public.jalali_year(public.tehran_today()) - 1 THEN
    RAISE EXCEPTION
      'تاریخ دریافت به سال % برمی‌گردد؛ فقط سال جاری (%) و سال پیش از آن قابل ثبت است',
      public.jalali_year(p_payment_date), public.jalali_year(public.tehran_today())
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


  -- M1 (migrations 402 + 403). Attachments are no longer refused, and no longer identified by id.
  -- The old `uuid[]` parameter was the wrong SHAPE: it presumed the attachment ROWS already
  -- existed, which is the create-then-attach order the owner rejected, and the previous author
  -- said so exactly -- "there is therefore no id this parameter could legitimately carry today,
  -- and accepting one would either be a silent no-op or a way to re-point somebody else's
  -- attachment onto this receipt."
  --
  -- What the decided flow actually needs: the client uploads the file to STORAGE (which needs no
  -- document id -- the bucket policies gate on bucket and role only, never on path) and OCRs it
  -- from raw bytes via `extractReceiptFromBytes`, both BEFORE submitting. It then passes the
  -- storage paths here, and this function creates the document row and its attachment rows in
  -- ONE transaction. So the attachment precedes the document in the USER'S workflow, while
  -- neither row can exist without the other -- an orphaned attachment row is impossible by
  -- construction rather than by cleanup.
  --
  -- Validated EARLY, before any work is done, so a malformed payload costs nothing.
  IF p_attachments IS NOT NULL THEN
    IF jsonb_typeof(p_attachments) <> 'array' THEN
      RAISE EXCEPTION 'فهرست پیوست‌ها باید یک آرایه باشد'
        USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_attachments) a
       WHERE NULLIF(btrim(coalesce(a ->> 'storage_path', '')), '') IS NULL
    ) THEN
      RAISE EXCEPTION 'هر پیوست باید storage_path داشته باشد'
        USING ERRCODE = '22023';
    END IF;
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
    SELECT ba.title, NULLIF(btrim(coalesce(ba.accounting_code, '')), ''), ba.account_type
      INTO _receiver_name, _receiver_code, _account_type
      FROM public.bank_accounts ba
     WHERE ba.id = p_destination_bank_account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'حساب مقصد یافت نشد'
        USING ERRCODE = '22023';
    END IF;

    -- B1 second half / Gate A. The channel and the account type must agree.
    --
    -- D2 makes a cash box a bank_accounts row with account_type='cash', and C5 makes a
    -- destination account mandatory for cash as well as bank. Nothing checked that the account
    -- actually WAS a cash box. This database has exactly one bank_accounts row and it is
    -- account_type='bank', so every cash receipt created so far debited a real bank account and
    -- inflated it in vw_account_balances (measured: total_in 10,100,050,000 over 51 rows) and in
    -- get_account_ledger. Excluding cash from the Asan export (350) stops the wrong FILE being
    -- produced; it does not stop the wrong LEDGER ENTRY being written. This does.
    --
    -- The bank half is checked too. It is the exact mirror — a bank transfer pointed at a cash
    -- box would inflate the صندوق and, because 350 keys on document_channel rather than on the
    -- account, would still be exported as a bank deposit. One condition, both directions, so the
    -- mirror defect cannot ship later.
    --
    -- KNOWN CONSEQUENCE, deliberate and recorded: until a bank_accounts row with
    -- account_type='cash' exists on this database, every cash receipt is refused. That is the
    -- correct outcome — refusing loudly beats silently inflating a bank balance — and it is a
    -- data-entry item for the owner (create the صندوق row), not a defect to work around.
    IF _channel = 'cash' AND _account_type IS DISTINCT FROM 'cash' THEN
      RAISE EXCEPTION
        'حساب «%» یک حساب بانکی است، نه صندوق؛ برای دریافت نقدی باید صندوق را انتخاب کنید. اگر هنوز صندوقی تعریف نشده، ابتدا در صفحهٔ «حساب‌های بانکی» یک حساب از نوع «صندوق» بسازید',
        coalesce(_receiver_name, '?')
        USING ERRCODE = 'P0001';
    END IF;

    IF _channel = 'bank' AND _account_type IS DISTINCT FROM 'bank' THEN
      RAISE EXCEPTION
        'حساب «%» صندوق است، نه حساب بانکی؛ برای واریز بانکی یک حساب بانکی انتخاب کنید',
        coalesce(_receiver_name, '?')
        USING ERRCODE = 'P0001';
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

  -- M1: the attachment rows are created ONLY NOW, after the document row exists, so the real
  -- foreign key added by migration 402 is satisfiable. If anything above this line raised, the
  -- whole transaction rolls back and no attachment survives; if anything below raises, the same.
  -- That is the "no orphan attachment" guarantee, enforced by the transaction rather than by a
  -- cleanup job somebody has to remember to run.
  IF p_attachments IS NOT NULL AND jsonb_array_length(p_attachments) > 0 THEN
    INSERT INTO public.document_attachments
      (receipt_id, storage_path, mime_type, ocr_payload, ocr_status, uploaded_by)
    SELECT _receipt_id,
           btrim(a ->> 'storage_path'),
           NULLIF(btrim(coalesce(a ->> 'mime_type', '')), ''),
           a -> 'ocr_payload',
           coalesce(NULLIF(btrim(coalesce(a ->> 'ocr_status', '')), ''), 'pending'),
           _uid
      FROM jsonb_array_elements(p_attachments) a;
  END IF;

  RETURN QUERY SELECT _receipt_id, _doc_number, _entry_id, _balance;
END;
$function$;

DROP FUNCTION IF EXISTS public.create_receipt(text, uuid, numeric, date, time without time zone, uuid, text, text, text, date, text, text, jsonb, uuid[]);


-- create_payment: parameter reshaped, refusal replaced, attachments created in-transaction
CREATE OR REPLACE FUNCTION public.create_payment(p_channel text, p_payee_type text, p_payee_id uuid, p_amount numeric, p_payment_date date, p_source_account_id uuid, p_tracking_number text DEFAULT NULL::text, p_cheque_kind text DEFAULT NULL::text, p_cheque_number text DEFAULT NULL::text, p_cheque_due_date date DEFAULT NULL::date, p_endorsed_cheque_id uuid DEFAULT NULL::uuid, p_purchase_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_attachments jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(voucher_id uuid, document_number text, journal_entry_id uuid, new_balance numeric)
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


  -- M1 (migrations 402 + 403). Attachments are no longer refused, and no longer identified by id.
  -- The old `uuid[]` parameter was the wrong SHAPE: it presumed the attachment ROWS already
  -- existed, which is the create-then-attach order the owner rejected, and the previous author
  -- said so exactly -- "there is therefore no id this parameter could legitimately carry today,
  -- and accepting one would either be a silent no-op or a way to re-point somebody else's
  -- attachment onto this receipt."
  --
  -- What the decided flow actually needs: the client uploads the file to STORAGE (which needs no
  -- document id -- the bucket policies gate on bucket and role only, never on path) and OCRs it
  -- from raw bytes via `extractReceiptFromBytes`, both BEFORE submitting. It then passes the
  -- storage paths here, and this function creates the document row and its attachment rows in
  -- ONE transaction. So the attachment precedes the document in the USER'S workflow, while
  -- neither row can exist without the other -- an orphaned attachment row is impossible by
  -- construction rather than by cleanup.
  --
  -- Validated EARLY, before any work is done, so a malformed payload costs nothing.
  IF p_attachments IS NOT NULL THEN
    IF jsonb_typeof(p_attachments) <> 'array' THEN
      RAISE EXCEPTION 'فهرست پیوست‌ها باید یک آرایه باشد'
        USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_attachments) a
       WHERE NULLIF(btrim(coalesce(a ->> 'storage_path', '')), '') IS NULL
    ) THEN
      RAISE EXCEPTION 'هر پیوست باید storage_path داشته باشد'
        USING ERRCODE = '22023';
    END IF;
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

    -- Task 3.8's Accept: a second endorsement must raise. The UNIQUE index is the
    -- real guarantee — it holds against a concurrent second endorsement that this
    -- SELECT would not see. This check exists so the user gets a sentence instead
    -- of a constraint name.
    --
    -- 356 / Gate A B1: the predicate is UNCONDITIONAL. It used to exclude
    -- status='rejected', so rejecting a voucher freed its cheque — while the entry
    -- that voucher posted stayed posted and immutable (343). Re-endorsing then
    -- credited the SAME cheque twice, permanently. Owner decision 2026-08-19,
    -- option (a): one cheque is consumed once. The accepted cost is that a mistaken
    -- endorsement cannot be corrected until reverse_document exists (OG-14), and
    -- the message below says so to the user rather than leaving them guessing.
    IF EXISTS (SELECT 1 FROM public.payment_vouchers pv
                WHERE pv.endorsed_receipt_id = p_endorsed_cheque_id
                  AND pv.reversed_at IS NULL) THEN
      RAISE EXCEPTION 'این چک قبلاً ظهرنویسی شده است و سند ظهرنویسی هنوز برگشت نخورده است'
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

  -- M1: the attachment rows are created ONLY NOW, after the document row exists, so the real
  -- foreign key added by migration 402 is satisfiable. If anything above this line raised, the
  -- whole transaction rolls back and no attachment survives; if anything below raises, the same.
  -- That is the "no orphan attachment" guarantee, enforced by the transaction rather than by a
  -- cleanup job somebody has to remember to run.
  IF p_attachments IS NOT NULL AND jsonb_array_length(p_attachments) > 0 THEN
    INSERT INTO public.document_attachments
      (voucher_id, storage_path, mime_type, ocr_payload, ocr_status, uploaded_by)
    SELECT _voucher_id,
           btrim(a ->> 'storage_path'),
           NULLIF(btrim(coalesce(a ->> 'mime_type', '')), ''),
           a -> 'ocr_payload',
           coalesce(NULLIF(btrim(coalesce(a ->> 'ocr_status', '')), ''), 'pending'),
           _uid
      FROM jsonb_array_elements(p_attachments) a;
  END IF;

  RETURN QUERY SELECT _voucher_id, _doc_number, _entry_id, _balance;
END;
$function$;

DROP FUNCTION IF EXISTS public.create_payment(text, text, uuid, numeric, date, uuid, text, text, text, date, uuid, uuid, text, uuid[]);


-- create_dual_document: parameter reshaped, refusal replaced, attachments created in-transaction
CREATE OR REPLACE FUNCTION public.create_dual_document(p_payer_type text, p_payer_id uuid, p_beneficiary_type text, p_beneficiary_id uuid, p_amount numeric, p_document_date date, p_tracking_number text, p_description text, p_source_bank text DEFAULT NULL::text, p_destination_bank text DEFAULT NULL::text, p_transferrer_name text DEFAULT NULL::text, p_transferrer_account_no text DEFAULT NULL::text, p_recipient_name text DEFAULT NULL::text, p_recipient_account_no text DEFAULT NULL::text, p_attachments jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(document_id uuid, document_number text, journal_entry_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid            uuid := auth.uid();
  _payer_type     text := lower(btrim(coalesce(p_payer_type, '')));
  _benef_type     text := lower(btrim(coalesce(p_beneficiary_type, '')));
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
  _payer_credit   numeric;
  _benef_debit    numeric;
  _debit_total    numeric;
  _credit_total   numeric;
  _line_no        int := 0;
BEGIN
  IF NOT public.has_any_role(_uid,
        ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ ثبت سند دوطرفه را ندارید'
      USING ERRCODE = '42501';
  END IF;

  IF _payer_type NOT IN ('customer', 'supplier', 'external_party') THEN
    RAISE EXCEPTION 'نوع پرداخت‌کننده نامعتبر است؛ یکی از مشتری، تأمین‌کننده یا طرف بیرونی باید باشد'
      USING ERRCODE = '22023';
  END IF;
  IF _benef_type NOT IN ('customer', 'supplier', 'external_party') THEN
    RAISE EXCEPTION 'نوع دریافت‌کننده نامعتبر است؛ یکی از مشتری، تأمین‌کننده یا طرف بیرونی باید باشد'
      USING ERRCODE = '22023';
  END IF;
  IF p_payer_id IS NULL OR p_beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ هر دو طرف سند دوطرفه الزامی است'
      USING ERRCODE = '22023';
  END IF;

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

  IF NULLIF(btrim(coalesce(p_description, '')), '') IS NULL THEN
    RAISE EXCEPTION 'شرح سند دوطرفه الزامی است؛ در خروجی آسان تنها متنی است که حسابدار می‌بیند'
      USING ERRCODE = '22023';
  END IF;


  -- M1 (migrations 402 + 403). Attachments are no longer refused, and no longer identified by id.
  -- The old `uuid[]` parameter was the wrong SHAPE: it presumed the attachment ROWS already
  -- existed, which is the create-then-attach order the owner rejected, and the previous author
  -- said so exactly -- "there is therefore no id this parameter could legitimately carry today,
  -- and accepting one would either be a silent no-op or a way to re-point somebody else's
  -- attachment onto this receipt."
  --
  -- What the decided flow actually needs: the client uploads the file to STORAGE (which needs no
  -- document id -- the bucket policies gate on bucket and role only, never on path) and OCRs it
  -- from raw bytes via `extractReceiptFromBytes`, both BEFORE submitting. It then passes the
  -- storage paths here, and this function creates the document row and its attachment rows in
  -- ONE transaction. So the attachment precedes the document in the USER'S workflow, while
  -- neither row can exist without the other -- an orphaned attachment row is impossible by
  -- construction rather than by cleanup.
  --
  -- Validated EARLY, before any work is done, so a malformed payload costs nothing.
  IF p_attachments IS NOT NULL THEN
    IF jsonb_typeof(p_attachments) <> 'array' THEN
      RAISE EXCEPTION 'فهرست پیوست‌ها باید یک آرایه باشد'
        USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_attachments) a
       WHERE NULLIF(btrim(coalesce(a ->> 'storage_path', '')), '') IS NULL
    ) THEN
      RAISE EXCEPTION 'هر پیوست باید storage_path داشته باشد'
        USING ERRCODE = '22023';
    END IF;
  END IF;

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

  _payer_code := public.require_asan_code(_payer_person);
  _benef_code := public.require_asan_code(_benef_person);

  _payer_credit := p_amount;
  _benef_debit  := p_amount;

  _doc_number := public.assign_document_number('dual', _doc_id);

  INSERT INTO public.dual_documents (
    id, document_number,
    payer_type, payer_customer_id, payer_supplier_id, payer_party_id,
    beneficiary_type, beneficiary_customer_id, beneficiary_supplier_id, beneficiary_party_id,
    amount, document_date, tracking_number, source_bank, destination_bank,
    transferrer_name, transferrer_account_no, recipient_name, recipient_account_no,
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
    btrim(p_description), 'approved', _uid
  );

  INSERT INTO public.journal_entries (
    doc_kind, source_type, source_id, entry_date, description,
    status, posted_by, payer_accounting_code, receiver_accounting_code
  ) VALUES (
    'dual', 'dual_document', _doc_id, p_document_date,
    'سند دوطرفه شمارهٔ ' || _doc_number,
    'posted', _uid, _payer_code, _benef_code
  )
  RETURNING id INTO _entry_id;

  _line_no := _line_no + 1;
  INSERT INTO public.journal_lines (
    journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description
  ) VALUES (
    _entry_id, _line_no, _benef_kind, p_beneficiary_id, _benef_debit, 0,
    'کاهش بدهی ما به «' || coalesce(_benef_name, '؟') || '»'
  );

  _line_no := _line_no + 1;
  INSERT INTO public.journal_lines (
    journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description
  ) VALUES (
    _entry_id, _line_no, _payer_kind, p_payer_id, 0, _payer_credit,
    'کاهش طلب ما از «' || coalesce(_payer_name, '؟') || '»'
  );

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
      'transferrer_recorded', (NULLIF(btrim(coalesce(p_transferrer_name, '')), '') IS NOT NULL),
      'recipient_recorded',   (NULLIF(btrim(coalesce(p_recipient_name, '')), '') IS NOT NULL),
      'line_count',           _line_no
    ));

  -- M1: the attachment rows are created ONLY NOW, after the document row exists, so the real
  -- foreign key added by migration 402 is satisfiable. If anything above this line raised, the
  -- whole transaction rolls back and no attachment survives; if anything below raises, the same.
  -- That is the "no orphan attachment" guarantee, enforced by the transaction rather than by a
  -- cleanup job somebody has to remember to run.
  IF p_attachments IS NOT NULL AND jsonb_array_length(p_attachments) > 0 THEN
    INSERT INTO public.document_attachments
      (dual_id, storage_path, mime_type, ocr_payload, ocr_status, uploaded_by)
    SELECT _doc_id,
           btrim(a ->> 'storage_path'),
           NULLIF(btrim(coalesce(a ->> 'mime_type', '')), ''),
           a -> 'ocr_payload',
           coalesce(NULLIF(btrim(coalesce(a ->> 'ocr_status', '')), ''), 'pending'),
           _uid
      FROM jsonb_array_elements(p_attachments) a;
  END IF;

  RETURN QUERY SELECT _doc_id, _doc_number, _entry_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.create_dual_document(text, uuid, text, uuid, numeric, date, text, text, text, text, text, text, text, text, uuid[]);


-- Assertions. Structural here; the end-to-end behaviour is proven by
-- `e2e/business-flows/m1-attachment-before-document.spec.ts`, which can drive the real RPC
-- through PostgREST as a real role — something this migration cannot do honestly.
DO $verify$
DECLARE
  v_old int;
  v_new int;
  v_missing text;
BEGIN
  -- The overload trap (safety rule 5). If the old uuid[] signature survived, every existing
  -- caller becomes ambiguous and the failure appears far away from here.
  SELECT count(*) INTO v_old
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_receipt','create_payment','create_dual_document')
     AND pg_get_function_identity_arguments(p.oid) LIKE '%p_attachment_ids%';
  IF v_old > 0 THEN
    RAISE EXCEPTION '403: % old uuid[] signature(s) survived - the functions are now OVERLOADED and every call is ambiguous', v_old;
  END IF;

  SELECT count(*) INTO v_new
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_receipt','create_payment','create_dual_document')
     AND pg_get_function_identity_arguments(p.oid) LIKE '%p_attachments jsonb%';
  IF v_new <> 3 THEN
    RAISE EXCEPTION '403: expected 3 functions taking p_attachments jsonb, found %', v_new;
  END IF;

  -- Each must actually WRITE an attachment. A body that accepts the parameter and ignores it
  -- would satisfy every check above and be exactly the "silent no-op" the original author
  -- refused to ship.
  SELECT string_agg(p.proname, ', ') INTO v_missing
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_receipt','create_payment','create_dual_document')
     AND pg_get_functiondef(p.oid) NOT ILIKE '%INSERT INTO public.document_attachments%';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '403: these accept p_attachments but never insert one: %', v_missing;
  END IF;

  -- And each must target its OWN parent column, or two branches would write to one table.
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='create_receipt') NOT ILIKE '%(receipt_id, storage_path%' THEN
    RAISE EXCEPTION '403: create_receipt does not write receipt_id';
  END IF;
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='create_payment') NOT ILIKE '%(voucher_id, storage_path%' THEN
    RAISE EXCEPTION '403: create_payment does not write voucher_id';
  END IF;
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='create_dual_document') NOT ILIKE '%(dual_id, storage_path%' THEN
    RAISE EXCEPTION '403: create_dual_document does not write dual_id';
  END IF;

  RAISE NOTICE '403: verified - 3 functions take p_attachments jsonb, no uuid[] overload survives, each writes its own parent column';
END
$verify$;
