SET client_encoding='UTF8';

-- =============================================================================
-- 238 — Phase 7.4 (Group D): the remaining person FKs + full drift coverage
-- =============================================================================
--
-- SCOPE — everything the Step 0 enumeration listed that Groups A-C did not take:
--   invoices.customer_id          0 rows, legacy nullable
--   didar_activities.customer_id  0 rows, legacy nullable
--
-- Both are empty, so the backfill is trivial. They are migrated anyway: Phase 8
-- turns customers/suppliers into views, and a table that still references them
-- with no person counterpart would be a dangling reference at that point. Doing
-- it now costs nothing; discovering it during Phase 8 would cost a rework.
--
-- Also finishes person_fk_drift_report(): migration 236 extended it to Phase 5 +
-- Groups A and B, and this adds Groups C and D so the report finally covers
-- EVERY derived person column in the schema. A column the report does not look
-- at is a column nobody is checking.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. COLUMNS + BACKFILL + ASSERTION
-- -----------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS customer_person_id uuid REFERENCES public.persons(id) ON DELETE RESTRICT;
ALTER TABLE public.didar_activities
  ADD COLUMN IF NOT EXISTS customer_person_id uuid REFERENCES public.persons(id) ON DELETE RESTRICT;

UPDATE public.invoices i
   SET customer_person_id = c.person_id
  FROM public.customers c
 WHERE c.id = i.customer_id
   AND i.customer_person_id IS DISTINCT FROM c.person_id;

UPDATE public.didar_activities d
   SET customer_person_id = c.person_id
  FROM public.customers c
 WHERE c.id = d.customer_id
   AND d.customer_person_id IS DISTINCT FROM c.person_id;

DO $$
DECLARE v_inv integer; v_did integer;
BEGIN
  SELECT count(*) INTO v_inv FROM public.invoices
   WHERE customer_id IS NOT NULL AND customer_person_id IS NULL;
  SELECT count(*) INTO v_did FROM public.didar_activities
   WHERE customer_id IS NOT NULL AND customer_person_id IS NULL;

  IF v_inv + v_did > 0 THEN
    RAISE EXCEPTION 'ABORT: orphans — invoices=%, didar_activities=%', v_inv, v_did;
  END IF;
  RAISE NOTICE 'Group D backfill verified: 0 orphans.';
END
$$;

-- -----------------------------------------------------------------------------
-- 2. DERIVATION TRIGGERS
--    Reuses tg_credit_derive_customer_person() from migration 237: it reads
--    NEW.customer_id and writes NEW.customer_person_id, which is exactly what
--    these two tables need. Its name says "credit" only because that is where it
--    was introduced; the comment below records the wider reuse.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_invoices_derive_person ON public.invoices;
CREATE TRIGGER trg_invoices_derive_person
  BEFORE INSERT OR UPDATE OF customer_id ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_credit_derive_customer_person();

DROP TRIGGER IF EXISTS trg_didar_activities_derive_person ON public.didar_activities;
CREATE TRIGGER trg_didar_activities_derive_person
  BEFORE INSERT OR UPDATE OF customer_id ON public.didar_activities
  FOR EACH ROW EXECUTE FUNCTION public.tg_credit_derive_customer_person();

COMMENT ON FUNCTION public.tg_credit_derive_customer_person() IS
  'Migrations 237/238. Shared BEFORE trigger for every table with a customer_id -> customer_person_id pair: the 7 credit tables, invoices and didar_activities. Keeps customer_person_id in sync with customers.person_id; the database is authoritative. Credit MATH still keys on customer_id - see the migration 237 header for why.';

-- -----------------------------------------------------------------------------
-- 3. CONSTRAINTS (legacy columns are nullable here, so guards not NOT NULL)
-- -----------------------------------------------------------------------------
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_customer_person_requires_customer_chk;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_customer_person_requires_customer_chk
  CHECK (customer_person_id IS NULL OR customer_id IS NOT NULL);

ALTER TABLE public.didar_activities
  DROP CONSTRAINT IF EXISTS didar_activities_customer_person_requires_customer_chk;
ALTER TABLE public.didar_activities
  ADD CONSTRAINT didar_activities_customer_person_requires_customer_chk
  CHECK (customer_person_id IS NULL OR customer_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS invoices_customer_person_id_idx
  ON public.invoices (customer_person_id) WHERE customer_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS didar_activities_customer_person_id_idx
  ON public.didar_activities (customer_person_id) WHERE customer_person_id IS NOT NULL;

COMMENT ON COLUMN public.invoices.customer_person_id IS
  'Unified person behind customer_id. Derived by trg_invoices_derive_person (migration 238) - do not write directly.';
COMMENT ON COLUMN public.didar_activities.customer_person_id IS
  'Unified person behind customer_id. Derived by trg_didar_activities_derive_person (migration 238) - do not write directly.';

-- -----------------------------------------------------------------------------
-- 4. person_fk_drift_report() — FINAL form, covering every derived column
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.person_fk_drift_report()
RETURNS TABLE (table_name text, drifted_rows bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Phase 5 (migration 231)
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
  -- Phase 7.1 (Group A, migration 235)
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
  -- Phase 7.2 (Group B, migration 236)
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
  HAVING count(*) > 0
  -- Phase 7.3 (Group C, migration 237)
  UNION ALL
  SELECT 'credit_requests'::text, count(*)
    FROM public.credit_requests x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'credit_score_snapshots'::text, count(*)
    FROM public.credit_score_snapshots x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_capital_allocations'::text, count(*)
    FROM public.customer_capital_allocations x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_capital_allocations_dynamic'::text, count(*)
    FROM public.customer_capital_allocations_dynamic x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_credit_balance'::text, count(*)
    FROM public.customer_credit_balance x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_credit_ledger'::text, count(*)
    FROM public.customer_credit_ledger x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_credit_profile'::text, count(*)
    FROM public.customer_credit_profile x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  -- Phase 7.4 (Group D, this migration)
  UNION ALL
  SELECT 'invoices'::text, count(*)
    FROM public.invoices x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'didar_activities'::text, count(*)
    FROM public.didar_activities x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0;
$$;

COMMENT ON FUNCTION public.person_fk_drift_report() IS
  'Migrations 231/236/238. Returns any rows where a derived *_person_id column disagrees with its legacy FK, across ALL 17 migrated references (Phases 5-7). An empty result is the healthy state.';

REVOKE ALL ON FUNCTION public.person_fk_drift_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_fk_drift_report() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. FINAL SWEEP — every legacy identity FK must now have a person counterpart
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r        record;
  v_missing text := '';
  v_count   integer := 0;
BEGIN
  FOR r IN
    SELECT con.conrelid::regclass::text AS tbl, att.attname AS col
      FROM pg_constraint con
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
     WHERE con.contype = 'f'
       AND con.confrelid::regclass::text IN ('customers','suppliers','external_parties')
  LOOP
    -- Expected person column: swap the trailing _id for _person_id.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = r.tbl
         AND column_name = regexp_replace(r.col, '_id$', '_person_id')
    )
    -- payment_vouchers uses ONE payee_person_id for all three payee branches,
    -- so payee_supplier_id/payee_customer_id/payee_party_id share a counterpart.
    AND NOT (r.tbl = 'payment_vouchers'
             AND EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='payment_vouchers'
                            AND column_name='payee_person_id'))
    THEN
      v_missing := v_missing || r.tbl || '.' || r.col || '  ';
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'SWEEP FAILED: % legacy FK(s) have no person counterpart: %', v_count, v_missing;
  END IF;
  RAISE NOTICE 'SWEEP PASSED: every legacy identity FK now has a person counterpart.';
END
$$;

NOTIFY pgrst, 'reload schema';
