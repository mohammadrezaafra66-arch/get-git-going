-- Down script for migration 312 (add supplier_payable to journal_lines.account_kind).
--
-- 312 only widened a CHECK constraint. Reverting narrows it back to the
-- original six values.
--
-- REFUSES TO RUN if any journal_lines row already uses 'supplier_payable'.
-- Narrowing the CHECK with such rows present would fail at validation time
-- anyway; refusing up front with a clear message is better than a raw
-- check_violation. If you genuinely need to roll back after supplier payments
-- have been posted, you must first decide what happens to those ledger lines -
-- that is an accounting decision, not a migration one.
--
-- NO BEGIN / COMMIT here - transaction control belongs to the caller
-- (apply with psql --single-transaction -v ON_ERROR_STOP=1).
SET client_encoding='UTF8';

DO $guard$
DECLARE
  _n bigint;
BEGIN
  SELECT count(*) INTO _n
    FROM public.journal_lines
   WHERE account_kind = 'supplier_payable';

  IF _n > 0 THEN
    RAISE EXCEPTION
      'Refusing to revert 312: % journal_lines row(s) already use account_kind=''supplier_payable''. Resolve those ledger lines first.', _n;
  END IF;
END
$guard$;

ALTER TABLE public.journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_account_kind_chk;

ALTER TABLE public.journal_lines
  ADD CONSTRAINT journal_lines_account_kind_chk CHECK (
    account_kind IN (
      'customer_credit',
      'bank',
      'external_party',
      'invoice_ar',
      'clearing',
      'other'
    )
  );

COMMENT ON COLUMN public.journal_lines.account_kind IS NULL;

DO $$
BEGIN
  RAISE NOTICE '312 reverted: account_kind is back to the original six values.';
END $$;
