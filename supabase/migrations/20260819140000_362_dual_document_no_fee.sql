-- 362 — correct create_dual_document: there is no fee; record-only names are evidence
--
-- Phase 4 CORRECTION, 2026-08-19. Owner definition supersedes C-c / OG-21.
-- dual_documents holds 0 rows. create_dual_document has never been called outside a rolled-back
-- transaction. This is a correction of unused objects, not a data migration.
--
-- ==============================================================================================
-- WHAT WRITES OR DEPENDS ON WHAT I AM CHANGING  (README-EXECUTION §H)
-- ==============================================================================================
--
-- Writers: only create_dual_document writes dual_documents. No frontend caller of the fee
-- parameters (grep hits 360, 361, and docs only).
-- Readers: asan_list_journal_export still has no dual_document branch (C-d/C-e, phase 5).
-- Cash views ignore dual documents (correct, T12). Blast radius is the unused RPC and three
-- unused columns. Measured: 0 dual_documents rows.
--
-- ==============================================================================================
-- OWNER 2026-08-19 — OVERTURNS C-c
-- ==============================================================================================
--
-- A dual document knows exactly two account holders. Both have a file, both have an Asan code,
-- both balances move. The money goes from the party who owes us to the party we owe without
-- entering our account. Doing that in one document is what makes it dual.
--
-- The names on the bank slip (transferrer, recipient) are OPTIONAL plain text for evidence.
-- They are never account holders. صراف / واسط / شخص ثالث / نفر سوم / طرف سوم all name that
-- record-only class. There is no fee at all. OG-21 is CLOSED.
--
-- Column names kept: transferrer_name / transferrer_account_no / recipient_name /
-- recipient_account_no. They name the two roles in the owner's example (the father sent the
-- money; Mitra's account received it). They do not reintroduce صراف, واسط, intermediary, or
-- third_party as a column — that naming is what caused OG-21.
--
-- Slip fields already on the table: document_date, tracking_number, source_bank, destination_bank,
-- transferrer name and account, recipient name and account. Owner named those. Gap: the scanned
-- slip itself. p_attachment_ids still raises 0A000 (C8, phase 6). Recorded, not wired here.
--
-- Rollback: docs/verification/362-down.sql — statements only, 18-arg signature restored.

SET client_encoding = 'UTF8';

DO $$
DECLARE _n bigint;
BEGIN
  SELECT count(*) INTO _n FROM public.dual_documents;
  IF _n <> 0 THEN
    RAISE EXCEPTION
      'تصحیح سند دوطرفه فقط وقتی مجاز است که هیچ ردیفی در جدول نباشد؛ الان % ردیف وجود دارد',
      _n
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- CLAUDE.md rule 5: dropping parameters from a defaulted-argument function creates an overload
-- unless the full old signature is dropped first.
DROP FUNCTION public.create_dual_document(
  text, uuid, text, uuid, numeric, date, text, text, text, text,
  text, text, text, text, uuid, numeric, text, uuid[]
);

ALTER TABLE public.dual_documents DROP CONSTRAINT IF EXISTS dual_documents_fee_needs_intermediary_chk;
ALTER TABLE public.dual_documents DROP CONSTRAINT IF EXISTS dual_documents_fee_borne_by_chk;
ALTER TABLE public.dual_documents DROP CONSTRAINT IF EXISTS dual_documents_fee_chk;
ALTER TABLE public.dual_documents DROP COLUMN IF EXISTS intermediary_party_id;
ALTER TABLE public.dual_documents DROP COLUMN IF EXISTS intermediary_fee;
ALTER TABLE public.dual_documents DROP COLUMN IF EXISTS fee_borne_by;

COMMENT ON TABLE public.dual_documents IS
  'A receipt and a payment in the same instant, where the money never lands in one of our accounts '
  '(T11, T12). Two account holders (payer, beneficiary) whose balances move; two optional '
  'record-only names from the bank slip (transferrer, recipient) stored as plain text for evidence, '
  'with no file, no Asan code, no journal line. No fee. Migration 360 created the table; 362 '
  'removed the fee columns after the owner closed OG-21 on 2026-08-19.';

COMMENT ON COLUMN public.dual_documents.transferrer_name IS
  'Who actually sent the money (e.g. the payer''s father). Optional. Name from the slip. Not an '
  'account holder: no FK, no person_id, no Asan code, no journal line. Evidentiary — a year later '
  'the slip must be reconstructable from this document.';

COMMENT ON COLUMN public.dual_documents.recipient_name IS
  'Whose account actually received the money (e.g. Mitra). Optional. Name from the slip. Same '
  'record-only class as transferrer_name. Not named intermediary / صراف / third_party: those words '
  'were used interchangeably by the owner for this class and caused OG-21.';

CREATE FUNCTION public.create_dual_document(
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

  -- C8 / phase 6: a document whose purpose is evidence cannot yet hold the scanned slip.
  IF p_attachment_ids IS NOT NULL AND array_length(p_attachment_ids, 1) > 0 THEN
    RAISE EXCEPTION 'پیوست فایل در این نسخه هنوز پشتیبانی نمی‌شود؛ سند را ثبت کنید و پیوست را بعداً اضافه کنید'
      USING ERRCODE = '0A000';
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

  RETURN QUERY SELECT _doc_id, _doc_number, _entry_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_dual_document(
  text, uuid, text, uuid, numeric, date, text, text, text, text,
  text, text, text, text, uuid[]
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_dual_document(
  text, uuid, text, uuid, numeric, date, text, text, text, text,
  text, text, text, text, uuid[]
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_dual_document(
  text, uuid, text, uuid, numeric, date, text, text, text, text,
  text, text, text, text, uuid[]
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_dual_document(
  text, uuid, text, uuid, numeric, date, text, text, text, text,
  text, text, text, text, uuid[]
) TO service_role;

COMMENT ON FUNCTION public.create_dual_document(
  text, uuid, text, uuid, numeric, date, text, text, text, text,
  text, text, text, text, uuid[]
) IS
  'Creates a dual document and posts a balanced two-line journal entry in one transaction '
  '(phase 4 correction, migration 362). Owner 2026-08-19: no fee. Two account holders only. '
  'Transferrer and recipient are optional slip names. Role gate: admin, accountant, manager.';

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_dual_document';
  IF _n <> 1 THEN
    RAISE EXCEPTION
      'پس از تصحیح باید دقیقاً یک تابع ثبت سند دوطرفه باقی بماند؛ الان % تا است',
      _n
      USING ERRCODE = 'P0001';
  END IF;
END $$;
