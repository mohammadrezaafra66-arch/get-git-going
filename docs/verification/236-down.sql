SET client_encoding='UTF8';

-- =============================================================================
-- 236-down — rollback for migration 236 (Group B receipt/delivery person FKs)
-- =============================================================================
--
-- Restores the schema to its post-235 state:
--   * drops the derived person columns on payment_receipts / delivery_receipts
--   * restores the migration-231 voucher guard (supplier/customer only)
--   * restores the migration-231 person_fk_drift_report body plus the Group A
--     branches added in 236 MINUS the Group B ones
--   * reverts tg_payment_vouchers_derive_person to its pre-236 form
--
-- WHAT IS NOT UNDONE, on purpose:
--   external_parties.person_id and the persons created for it are KEPT. Those
--   persons are real identity records, not scaffolding; deleting them would
--   destroy data and would break payment_vouchers rows whose payee_person_id was
--   derived from them. The column is nullable, so leaving it costs nothing.
--   If you truly need it gone, drop it manually AFTER clearing any voucher that
--   references one of those persons.
--
-- ORDER MATTERS: the voucher guard must be narrowed only after any external
-- party-derived payee_person_id has been cleared, or the ALTER will fail. That
-- clearing is done below and is safe — the value is derived, not authored.
--
-- HOW TO RUN:
--   docker cp docs\verification\236-down.sql afrakala-lan-db:/tmp/236-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/236-down.sql
--   docker restart afrakala-lan-rest
-- =============================================================================

-- 1. Triggers first.
DROP TRIGGER IF EXISTS trg_payment_receipts_derive_person ON public.payment_receipts;
DROP TRIGGER IF EXISTS trg_delivery_receipts_derive_person ON public.delivery_receipts;
DROP FUNCTION IF EXISTS public.tg_payment_receipts_derive_person();
DROP FUNCTION IF EXISTS public.tg_delivery_receipts_derive_person();

-- 2. Revert the voucher trigger to its migration-231 form (no party branch).
CREATE OR REPLACE FUNCTION public.tg_payment_vouchers_derive_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.payee_supplier_id IS NOT NULL THEN
    SELECT s.person_id INTO NEW.payee_person_id
      FROM public.suppliers s WHERE s.id = NEW.payee_supplier_id;
  ELSIF NEW.payee_customer_id IS NOT NULL THEN
    SELECT c.person_id INTO NEW.payee_person_id
      FROM public.customers c WHERE c.id = NEW.payee_customer_id;
  ELSE
    NEW.payee_person_id := NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_payment_vouchers_derive_person ON public.payment_vouchers;
CREATE TRIGGER trg_payment_vouchers_derive_person
  BEFORE INSERT OR UPDATE OF payee_supplier_id, payee_customer_id
  ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_vouchers_derive_person();

-- 3. Clear party-derived payee persons so the narrowed guard can be re-applied.
UPDATE public.payment_vouchers
   SET payee_person_id = NULL
 WHERE payee_party_id IS NOT NULL
   AND payee_supplier_id IS NULL
   AND payee_customer_id IS NULL;

ALTER TABLE public.payment_vouchers
  DROP CONSTRAINT IF EXISTS payment_vouchers_payee_person_requires_payee_chk;
ALTER TABLE public.payment_vouchers
  ADD CONSTRAINT payment_vouchers_payee_person_requires_payee_chk
  CHECK (payee_person_id IS NULL
         OR payee_supplier_id IS NOT NULL
         OR payee_customer_id IS NOT NULL);

-- 4. Group B constraints, indexes and columns.
ALTER TABLE public.payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_receiver_person_requires_party_chk;
ALTER TABLE public.delivery_receipts
  DROP CONSTRAINT IF EXISTS delivery_receipts_customer_person_requires_customer_chk;

DROP INDEX IF EXISTS public.payment_receipts_customer_person_id_idx;
DROP INDEX IF EXISTS public.payment_receipts_receiver_party_person_id_idx;
DROP INDEX IF EXISTS public.delivery_receipts_customer_person_id_idx;

ALTER TABLE public.payment_receipts  DROP COLUMN IF EXISTS customer_person_id;
ALTER TABLE public.payment_receipts  DROP COLUMN IF EXISTS receiver_party_person_id;
ALTER TABLE public.delivery_receipts DROP COLUMN IF EXISTS customer_person_id;

-- 5. Drift report back to Phase 5 + Group A coverage only.
CREATE OR REPLACE FUNCTION public.person_fk_drift_report()
RETURNS TABLE (table_name text, drifted_rows bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 'sales_quotes'::text, count(*)
    FROM public.sales_quotes q
    LEFT JOIN public.customers c ON c.id = q.customer_id
   WHERE q.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'purchases'::text, count(*)
    FROM public.purchases p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
   WHERE p.supplier_person_id IS DISTINCT FROM s.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'payment_vouchers'::text, count(*)
    FROM public.payment_vouchers v
    LEFT JOIN public.suppliers s ON s.id = v.payee_supplier_id
    LEFT JOIN public.customers c ON c.id = v.payee_customer_id
   WHERE v.payee_person_id IS DISTINCT FROM coalesce(s.person_id, c.person_id)
  HAVING count(*) > 0
  UNION ALL
  SELECT 'product_suppliers'::text, count(*)
    FROM public.product_suppliers ps
    LEFT JOIN public.suppliers s ON s.id = ps.supplier_id
   WHERE ps.supplier_person_id IS DISTINCT FROM s.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'purchase_prices'::text, count(*)
    FROM public.purchase_prices pp
    LEFT JOIN public.suppliers s ON s.id = pp.supplier_id
   WHERE pp.supplier_person_id IS DISTINCT FROM s.person_id
  HAVING count(*) > 0;
$$;

DO $$
DECLARE v_cols integer;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema='public'
     AND ((table_name='payment_receipts' AND column_name IN ('customer_person_id','receiver_party_person_id'))
       OR (table_name='delivery_receipts' AND column_name='customer_person_id'));
  IF v_cols > 0 THEN
    RAISE EXCEPTION 'Rollback incomplete: % Group B column(s) remain', v_cols;
  END IF;
  RAISE NOTICE 'Migration 236 rolled back. external_parties.person_id intentionally kept.';
END
$$;

NOTIFY pgrst, 'reload schema';
