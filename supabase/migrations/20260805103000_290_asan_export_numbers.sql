-- 290: stable Asan document numbering (M4.1).
--
-- The owner is starting Asan from document number 1. A document exported once must keep its
-- number forever, numbers are never reused, never renumbered, never reordered, and each
-- document type mirrors a separate Asan register so each has its own 1..N.
--
-- Design notes, and why the obvious alternatives were rejected:
--
--  * A SEQUENCE per document type would be simpler and is WRONG here: a sequence burns a value
--    on any rolled-back transaction, so a failed export attempt would silently create a gap the
--    owner cannot explain. `max+1` under an advisory lock leaves no trace when it rolls back.
--    Every gap in this table is therefore a deliberate, recorded burn.
--
--  * Assignment lives in a SECURITY DEFINER function and the table has **no INSERT/UPDATE/DELETE
--    policy at all** (rule 2.5): a direct PostgREST call cannot mint, edit or delete a number.
--    The only way in is the function, and the function is idempotent.
--
--  * No foreign key to the source documents. A number must survive the deletion of the document
--    that consumed it - that is exactly what "burned, not recycled" means. A FK with ON DELETE
--    CASCADE would erase the evidence, and one with RESTRICT would block ordinary deletions.
--    The burn triggers below record the disappearance instead.
--
-- Rollback: docs/verification/290-down.sql
SET client_encoding='UTF8';

CREATE TABLE IF NOT EXISTS public.asan_export_numbers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type     text NOT NULL
               CHECK (doc_type IN ('sales_invoice', 'purchase_invoice', 'accounting_document')),
  source_id    uuid NOT NULL,
  asan_number  integer NOT NULL CHECK (asan_number > 0),
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  assigned_by  uuid,
  burned_at    timestamptz,
  burned_reason text,
  CONSTRAINT asan_export_numbers_one_number_per_document UNIQUE (doc_type, source_id),
  CONSTRAINT asan_export_numbers_number_unique_per_type  UNIQUE (doc_type, asan_number)
);

COMMENT ON TABLE public.asan_export_numbers IS
  'ASAN M4.1: (document type, internal id) -> Asan document number. Assigned at first export, never reused.';
COMMENT ON COLUMN public.asan_export_numbers.burned_at IS
  'Set when the source document is deleted or cancelled after its number was assigned. The number stays consumed; the gap is deliberate and explainable.';

CREATE INDEX IF NOT EXISTS asan_export_numbers_type_number_idx
  ON public.asan_export_numbers (doc_type, asan_number);

ALTER TABLE public.asan_export_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asan_export_numbers_select ON public.asan_export_numbers;
CREATE POLICY asan_export_numbers_select ON public.asan_export_numbers
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));

-- Deliberately no INSERT/UPDATE/DELETE policy. PostgREST writes are impossible by construction.

-- --------------------------------------------------------------- assignment ----
CREATE OR REPLACE FUNCTION public.asan_assign_document_number(_doc_type text, _source_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _uid    uuid := auth.uid();
  _number integer;
BEGIN
  IF _doc_type IS NULL OR _doc_type NOT IN
     ('sales_invoice', 'purchase_invoice', 'accounting_document') THEN
    RAISE EXCEPTION 'نوع سند برای شماره‌گذاری آسان معتبر نیست' USING ERRCODE = '22023';
  END IF;

  IF _source_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ سند برای شماره‌گذاری آسان الزامی است' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ شماره‌گذاری سند آسان را ندارید' USING ERRCODE = '42501';
  END IF;

  -- Already numbered: hand back the same number. This is what makes re-export stable, and it
  -- runs before the lock so the common case costs nothing.
  SELECT asan_number INTO _number
    FROM public.asan_export_numbers
   WHERE doc_type = _doc_type AND source_id = _source_id;
  IF FOUND THEN
    RETURN _number;
  END IF;

  -- One lock per document type, held to the end of the transaction. Two concurrent exports of
  -- two different documents of the same type therefore cannot both read the same max.
  PERFORM pg_advisory_xact_lock(hashtext('asan_export_numbers:' || _doc_type));

  -- Re-read under the lock: the other transaction may have inserted this exact document while
  -- we waited.
  SELECT asan_number INTO _number
    FROM public.asan_export_numbers
   WHERE doc_type = _doc_type AND source_id = _source_id;
  IF FOUND THEN
    RETURN _number;
  END IF;

  SELECT COALESCE(MAX(asan_number), 0) + 1 INTO _number
    FROM public.asan_export_numbers
   WHERE doc_type = _doc_type;

  INSERT INTO public.asan_export_numbers (doc_type, source_id, asan_number, assigned_by)
  VALUES (_doc_type, _source_id, _number, _uid);

  RETURN _number;
END;
$fn$;

REVOKE ALL ON FUNCTION public.asan_assign_document_number(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_assign_document_number(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.asan_assign_document_number(text, uuid) IS
  'ASAN M4.1: idempotent, concurrency-safe assignment of the next Asan number for a document type.';

-- -------------------------------------------------------------------- burns ----
CREATE OR REPLACE FUNCTION public.asan_burn_document_number(
  _doc_type text, _source_id uuid, _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  UPDATE public.asan_export_numbers
     SET burned_at = COALESCE(burned_at, now()),
         burned_reason = COALESCE(burned_reason, _reason)
   WHERE doc_type = _doc_type
     AND source_id = _source_id;
END;
$fn$;

COMMENT ON FUNCTION public.asan_burn_document_number(text, uuid, text) IS
  'ASAN M4.1: marks an assigned number as burned. Called from triggers only; the number is never returned to the pool.';

-- The source documents. Each trigger is deliberately narrow: it records, it never deletes.
CREATE OR REPLACE FUNCTION public.tg_asan_burn_sales_quote_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.asan_burn_document_number('sales_invoice', OLD.id, 'پیش‌فاکتور حذف شد');
    RETURN OLD;
  END IF;

  -- Writing a status over itself is not a transition (rule 2.5, the migration-278 lesson).
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text IN ('canceled', 'cancelled') THEN
    PERFORM public.asan_burn_document_number('sales_invoice', NEW.id, 'پیش‌فاکتور باطل شد');
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_asan_burn_sales_quote_number ON public.sales_quotes;
CREATE TRIGGER trg_asan_burn_sales_quote_number
  AFTER UPDATE OF status OR DELETE ON public.sales_quotes
  FOR EACH ROW EXECUTE FUNCTION public.tg_asan_burn_sales_quote_number();

CREATE OR REPLACE FUNCTION public.tg_asan_burn_purchase_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM public.asan_burn_document_number('purchase_invoice', OLD.id, 'سند خرید حذف شد');
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_asan_burn_purchase_number ON public.purchases;
CREATE TRIGGER trg_asan_burn_purchase_number
  AFTER DELETE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.tg_asan_burn_purchase_number();

CREATE OR REPLACE FUNCTION public.tg_asan_burn_journal_entry_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM public.asan_burn_document_number('accounting_document', OLD.id, 'سند حسابداری حذف شد');
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_asan_burn_journal_entry_number ON public.journal_entries;
CREATE TRIGGER trg_asan_burn_journal_entry_number
  AFTER DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_asan_burn_journal_entry_number();

-- --------------------------------------------------------------------- gate ----
DO $chk$
DECLARE
  _n integer;
BEGIN
  SELECT count(*) INTO _n FROM pg_class WHERE relname = 'asan_export_numbers' AND relrowsecurity;
  IF _n <> 1 THEN RAISE EXCEPTION 'asan_export_numbers has no RLS'; END IF;

  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'asan_export_numbers';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'expected exactly one policy (select), found %', _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_constraint
   WHERE conrelid = 'public.asan_export_numbers'::regclass AND contype = 'u';
  IF _n <> 2 THEN RAISE EXCEPTION 'expected 2 unique constraints, found %', _n; END IF;

  SELECT count(*) INTO _n FROM pg_trigger
   WHERE tgname IN ('trg_asan_burn_sales_quote_number',
                    'trg_asan_burn_purchase_number',
                    'trg_asan_burn_journal_entry_number')
     AND NOT tgisinternal;
  IF _n <> 3 THEN RAISE EXCEPTION 'expected 3 burn triggers, found %', _n; END IF;

  -- Persian round-trip: no '?' may have replaced a Persian character on the way in (rule 2.1).
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('asan_assign_document_number', 'tg_asan_burn_sales_quote_number')
     AND pg_get_functiondef(p.oid) LIKE '%?%';
  IF _n <> 0 THEN RAISE EXCEPTION 'persian text corrupted on the way in'; END IF;
END
$chk$;
