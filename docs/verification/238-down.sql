SET client_encoding='UTF8';

-- =============================================================================
-- 238-down — rollback for migration 238 (Group D remaining person FKs)
-- =============================================================================
--
-- Drops the invoices / didar_activities person columns and reverts
-- person_fk_drift_report() to its post-236 coverage (Phase 5 + Groups A and B).
-- Both tables are empty, so no data is involved either way.
--
-- HOW TO RUN:
--   docker cp docs\verification\238-down.sql afrakala-lan-db:/tmp/238-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/238-down.sql
--   docker restart afrakala-lan-rest
--
-- NOTE: run 237-down BEFORE this one if you are unwinding both, otherwise the
-- restored drift report below still references the Group C columns and will
-- error once they are gone.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_invoices_derive_person ON public.invoices;
DROP TRIGGER IF EXISTS trg_didar_activities_derive_person ON public.didar_activities;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_customer_person_requires_customer_chk;
ALTER TABLE public.didar_activities
  DROP CONSTRAINT IF EXISTS didar_activities_customer_person_requires_customer_chk;

DROP INDEX IF EXISTS public.invoices_customer_person_id_idx;
DROP INDEX IF EXISTS public.didar_activities_customer_person_id_idx;

ALTER TABLE public.invoices         DROP COLUMN IF EXISTS customer_person_id;
ALTER TABLE public.didar_activities DROP COLUMN IF EXISTS customer_person_id;

-- Drift report back to post-236 coverage (Phase 5 + Groups A and B).
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
    LEFT JOIN public.external_parties ep ON ep.id = v.payee_party_id
   WHERE v.payee_person_id IS DISTINCT FROM coalesce(s.person_id, c.person_id, ep.person_id)
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
  HAVING count(*) > 0
  UNION ALL
  SELECT 'payment_receipts.customer'::text, count(*)
    FROM public.payment_receipts pr
    LEFT JOIN public.customers c ON c.id = pr.customer_id
   WHERE pr.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'payment_receipts.receiver_party'::text, count(*)
    FROM public.payment_receipts pr
    LEFT JOIN public.external_parties ep ON ep.id = pr.receiver_party_id
   WHERE pr.receiver_party_person_id IS DISTINCT FROM ep.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'delivery_receipts'::text, count(*)
    FROM public.delivery_receipts dr
    LEFT JOIN public.customers c ON c.id = dr.customer_id
   WHERE dr.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0;
$$;

DO $$
DECLARE v_cols integer;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema='public' AND column_name='customer_person_id'
     AND table_name IN ('invoices','didar_activities');
  IF v_cols > 0 THEN
    RAISE EXCEPTION 'Rollback incomplete: % Group D column(s) remain', v_cols;
  END IF;
  RAISE NOTICE 'Migration 238 rolled back cleanly.';
END
$$;

NOTIFY pgrst, 'reload schema';
