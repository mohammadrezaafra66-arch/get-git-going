SET client_encoding='UTF8';

-- =============================================================================
-- 246-249-down — rollback for Issue 219 / C1
-- =============================================================================
--
-- ⚠️ READ THIS BEFORE RUNNING IT.
--
-- WHILE C1 IS STILL INERT (no RPC writes to these tables, no UI reads them),
-- this rollback is completely safe: the two new tables are empty, so dropping
-- them loses nothing.
--
-- ONCE C2/C3/C4 HAVE SHIPPED AND REAL PURCHASES HAVE BEEN LINKED, THIS SCRIPT
-- MUST NOT BE RUN AS-IS. purchase_request_fulfillments is then the only record
-- of which purchase satisfied which request — money that was actually spent.
-- The ON DELETE RESTRICT foreign keys exist precisely so that data cannot be
-- removed by accident, and this script would defeat them deliberately.
--
-- FORWARD-FIX IS THE PREFERRED RECOVERY once data exists:
--   * stop writing to the tables (revert the application commit)
--   * leave the schema in place; it is inert without the RPC
--   * fix forward in a new migration
-- Dropping is only appropriate after an explicit export:
--   \copy (SELECT * FROM public.purchase_request_fulfillments) TO 'prf.csv' CSV HEADER
--   \copy (SELECT * FROM public.purchase_idempotency)          TO 'idem.csv' CSV HEADER
--
-- SAFETY INTERLOCK: this script refuses to run if either table holds rows.
-- Comment out the guard only after taking the export above.
-- -----------------------------------------------------------------------------

DO $guard$
DECLARE _prf int; _idem int;
BEGIN
  SELECT COUNT(*) INTO _prf  FROM public.purchase_request_fulfillments;
  SELECT COUNT(*) INTO _idem FROM public.purchase_idempotency;
  IF _prf > 0 OR _idem > 0 THEN
    RAISE EXCEPTION
      'رول‌بک متوقف شد: % ردیف تأمین و % ردیف idempotency وجود دارد. این داده سابقهٔ مالی است. ابتدا export بگیرید و سپس این محافظ را کنار بگذارید.',
      _prf, _idem;
  END IF;
  RAISE NOTICE 'Guard passed: both new tables are empty, rollback is lossless.';
END $guard$;

-- -----------------------------------------------------------------------------
-- 249 — views
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_purchase_requests_legacy_unknown;
DROP VIEW IF EXISTS public.v_purchase_request_fulfillment;
DROP VIEW IF EXISTS public.v_purchase_item_allocation;

-- -----------------------------------------------------------------------------
-- 248 — status value and legacy marker
--
-- The flag is cleared before the column is dropped so the operation is
-- explicit rather than a silent side effect of DROP COLUMN. No request's
-- status is touched: 248 never changed one, so there is nothing to restore.
-- The CHECK is narrowed back only after proving no row uses the new value.
-- -----------------------------------------------------------------------------
DO $status_guard$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM public.purchase_requests WHERE status = 'partially_purchased';
  IF _n > 0 THEN
    RAISE EXCEPTION
      'رول‌بک متوقف شد: % درخواست در وضعیت partially_purchased است. ابتدا باید آگاهانه تعیین تکلیف شوند (نگاشت به approved یا purchased).', _n;
  END IF;
END $status_guard$;

UPDATE public.purchase_requests SET legacy_no_fulfillment = false WHERE legacy_no_fulfillment;
ALTER TABLE public.purchase_requests DROP COLUMN IF EXISTS legacy_no_fulfillment;

ALTER TABLE public.purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_status_check;
ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_status_check
  CHECK (status = ANY (ARRAY['pending','approved','purchased','delivered','cancelled']));

COMMENT ON COLUMN public.purchase_requests.status IS NULL;

-- -----------------------------------------------------------------------------
-- 247 — idempotency
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.purchase_idempotency;

-- -----------------------------------------------------------------------------
-- 246 — fulfillment core
--
-- idx_purchase_items_purchase is deliberately KEPT. It is a plain performance
-- index on a pre-existing table that was missing before issue 219 and is
-- useful regardless of this feature; dropping it would be a gratuitous
-- regression. Drop it manually if a truly pristine rollback is required.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.purchase_request_fulfillments;
DROP FUNCTION IF EXISTS public.tg_prf_validate_allocation();

\echo 'C1 rollback complete. idx_purchase_items_purchase was intentionally retained.'

NOTIFY pgrst, 'reload schema';
