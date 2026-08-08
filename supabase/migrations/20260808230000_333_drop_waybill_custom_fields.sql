SET client_encoding='UTF8';

-- ============================================================================
-- 333 — Remove waybill_custom_fields, the last orphan of the invoice subsystem.
-- ============================================================================
--
-- This table configured custom fields for waybills. Waybills no longer exist: migration
-- 323 dropped `waybills` and `waybill_items`, and 332 dropped the `invoices` table they
-- hung off. Since then /admin/waybill-fields has been a settings page for a feature that
-- is not there — visible in the sidebar, fully functional, and configuring nothing.
--
-- Verified live immediately before writing:
--   rows in waybill_custom_fields ......... 0
--   DB functions referencing it ........... 0
--   views / matviews depending on it ...... 0
--   foreign keys pointing at it ........... 0
--   triggers on it ........................ 1  (trg_wcf_updated_at -> set_updated_at)
--
-- That single trigger uses the SHARED set_updated_at function, which backs ~73 other
-- tables. Dropping a table drops its triggers but NOT their functions, so set_updated_at
-- is untouched here and is asserted below.
--
-- ⚠️ NOT removed, and easy to get wrong: the frontend component
-- src/shared/components/WaybillCustomFieldsInput.tsx. Despite its name it is generic, and
-- the LIVE PaymentReceiptForm renders it against `payment_receipt_custom_fields` — a
-- different table that is staying. Only the /admin/waybill-fields route goes.
--
-- Down-script: docs/verification/333-down.sql
-- ============================================================================

DO $guard$
DECLARE _rows bigint;
BEGIN
  IF to_regclass('public.waybill_custom_fields') IS NULL THEN
    RAISE NOTICE '333: waybill_custom_fields already absent — nothing to do';
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*) FROM public.waybill_custom_fields' INTO _rows;
  IF _rows <> 0 THEN
    RAISE EXCEPTION '333: refusing to drop a table holding % row(s). Someone configured waybill fields; re-assess.', _rows;
  END IF;
END
$guard$;

DROP TABLE IF EXISTS public.waybill_custom_fields;

DO $do$
DECLARE _n int;
BEGIN
  IF to_regclass('public.waybill_custom_fields') IS NOT NULL THEN
    RAISE EXCEPTION '333: table still exists';
  END IF;

  -- The shared trigger function must be untouched.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'set_updated_at';
  IF _n <> 1 THEN
    RAISE EXCEPTION '333: set_updated_at must survive, found % copies', _n;
  END IF;
  SELECT count(*) INTO _n FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal AND p.proname = 'set_updated_at';
  IF _n < 70 THEN
    RAISE EXCEPTION '333: set_updated_at should still back ~72 triggers, found %', _n;
  END IF;

  -- payment_receipt_custom_fields is a DIFFERENT table and must remain.
  IF to_regclass('public.payment_receipt_custom_fields') IS NULL THEN
    RAISE EXCEPTION '333: payment_receipt_custom_fields was dropped by mistake';
  END IF;

  PERFORM public.assert_person_fk_registry();

  RAISE NOTICE '333 OK: waybill_custom_fields dropped, set_updated_at intact, payment_receipt_custom_fields intact';
END
$do$;
