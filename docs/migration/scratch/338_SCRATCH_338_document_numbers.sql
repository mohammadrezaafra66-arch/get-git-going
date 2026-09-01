-- 338 -- task 1.2 -- document_numbers + assign_document_number(doc_type, source_id)
--
-- Mirrors asan_assign_document_number exactly (ground-truth.md section 8, "the proven pattern"):
--   * advisory lock per doc_type, held to end of transaction
--   * check-before-lock, then re-check under the lock (a concurrent txn may have inserted ours)
--   * COALESCE(MAX(serial),0)+1 -- deliberately NOT a sequence: a sequence burns a value on
--     rollback and leaves gaps nobody can explain (decisions.md D4)
--   * idempotent on (doc_type, source_id)
--   * no FK to source tables -- sources live in different tables and one is not built yet
--   * burn-on-delete triggers so a deleted source never lets its number be reused
--
-- FORMAT (decisions.md D3): <PREFIX>-<jalali year>-<6 digits>  e.g. RCP-1405-000042
-- Prefixes: receipt=RCP, payment=PAY, dual=DUAL. Jalali year via public.jalali_year (mig 337).
--
-- SERIES SCOPE -- recorded for the owner, see phase-1-PROGRESS.md task 1.2:
--   The serial is max+1 per doc_type GLOBALLY, exactly as the reference does, so numbering runs
--   RCP-1405-000042 -> RCP-1406-000043 across a year boundary. The alternative convention is a
--   per-year reset (RCP-1406-000001). The checklist says "mirror asan_assign_document_number
--   exactly", so the global series is implemented. Flagged as OG-9 because it is an
--   accountant-visible convention, not a technical choice.
--
-- ROLLBACK: docs/verification/338-down.sql

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() NOT IN ('afrakala','postgres') THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

-- ---------------------------------------------------------------- table ----
CREATE TABLE IF NOT EXISTS public.document_numbers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type        text        NOT NULL,
  source_id       uuid        NOT NULL,
  serial          integer     NOT NULL,
  jalali_year     integer     NOT NULL,
  document_number text        NOT NULL,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  assigned_by     uuid,
  burned_at       timestamptz,
  burned_reason   text,
  CONSTRAINT document_numbers_doc_type_check
    CHECK (doc_type = ANY (ARRAY['receipt'::text, 'payment'::text, 'dual'::text])),
  CONSTRAINT document_numbers_serial_check CHECK (serial > 0),
  CONSTRAINT document_numbers_one_per_document UNIQUE (doc_type, source_id),
  CONSTRAINT document_numbers_serial_unique_per_type UNIQUE (doc_type, serial),
  CONSTRAINT document_numbers_number_unique UNIQUE (document_number)
);

ALTER TABLE public.document_numbers ENABLE ROW LEVEL SECURITY;

-- RLS per docs/security/audit-trigger-spec.md section 4:
-- SELECT for admin+accountant; NO insert/update/delete policy at all, so a direct PostgREST
-- write is impossible by construction. The only way in is the SECURITY DEFINER function below.
DROP POLICY IF EXISTS document_numbers_select_finance ON public.document_numbers;
CREATE POLICY document_numbers_select_finance ON public.document_numbers
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));

-- ------------------------------------------------------------- assigner ----
CREATE OR REPLACE FUNCTION public.assign_document_number(_doc_type text, _source_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid    uuid := auth.uid();
  _number text;
  _serial integer;
  _jyear  integer;
  _prefix text;
BEGIN
  IF _doc_type IS NULL OR _doc_type NOT IN ('receipt', 'payment', 'dual') THEN
    RAISE EXCEPTION 'نوع سند برای شماره‌گذاری معتبر نیست' USING ERRCODE = '22023';
  END IF;

  IF _source_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ سند برای شماره‌گذاری الزامی است' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ شماره‌گذاری سند را ندارید' USING ERRCODE = '42501';
  END IF;

  -- Already numbered: hand back the same number, before taking any lock.
  SELECT document_number INTO _number
    FROM public.document_numbers
   WHERE doc_type = _doc_type AND source_id = _source_id;
  IF FOUND THEN
    RETURN _number;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('document_numbers:' || _doc_type));

  -- Re-read under the lock: another transaction may have inserted this exact document.
  SELECT document_number INTO _number
    FROM public.document_numbers
   WHERE doc_type = _doc_type AND source_id = _source_id;
  IF FOUND THEN
    RETURN _number;
  END IF;

  SELECT COALESCE(MAX(serial), 0) + 1 INTO _serial
    FROM public.document_numbers
   WHERE doc_type = _doc_type;

  _jyear  := public.jalali_year(public.tehran_today());
  _prefix := CASE _doc_type
               WHEN 'receipt' THEN 'RCP'
               WHEN 'payment' THEN 'PAY'
               WHEN 'dual'    THEN 'DUAL'
             END;
  _number := _prefix || '-' || _jyear::text || '-' || lpad(_serial::text, 6, '0');

  INSERT INTO public.document_numbers
    (doc_type, source_id, serial, jalali_year, document_number, assigned_by)
  VALUES (_doc_type, _source_id, _serial, _jyear, _number, _uid);

  RETURN _number;
END;
$function$;

-- ----------------------------------------------------------------- burn ----
CREATE OR REPLACE FUNCTION public.burn_document_number(_doc_type text, _source_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.document_numbers
     SET burned_at = now(), burned_reason = _reason
   WHERE doc_type = _doc_type AND source_id = _source_id AND burned_at IS NULL;
END;
$function$;

-- A burned number is never reissued: the row stays, so MAX(serial) still counts it.
CREATE OR REPLACE FUNCTION public.tg_burn_receipt_document_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.burn_document_number('receipt', OLD.id, 'فیش دریافت حذف شد');
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_burn_payment_document_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.burn_document_number('payment', OLD.id, 'سند پرداخت حذف شد');
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_burn_receipt_document_number ON public.payment_receipts;
CREATE TRIGGER trg_burn_receipt_document_number
  AFTER DELETE ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.tg_burn_receipt_document_number();

DROP TRIGGER IF EXISTS trg_burn_payment_document_number ON public.payment_vouchers;
CREATE TRIGGER trg_burn_payment_document_number
  AFTER DELETE ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.tg_burn_payment_document_number();

-- NOTE: no 'dual' burn trigger yet -- its source table is decided in task 4.2 (decisions.md D10).

REVOKE ALL ON FUNCTION public.assign_document_number(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_document_number(text, uuid) TO authenticated;

DO $verify$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'document_numbers') THEN
    RAISE EXCEPTION '338: RLS is not enabled on document_numbers';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE tablename = 'document_numbers') <> 1 THEN
    RAISE EXCEPTION '338: expected exactly 1 policy on document_numbers, found %',
      (SELECT count(*) FROM pg_policies WHERE tablename = 'document_numbers');
  END IF;
END
$verify$;
