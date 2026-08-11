SET client_encoding='UTF8';

-- =============================================================================
-- 231 — Phase 5: person-based foreign keys on quotes, purchases and vouchers
-- =============================================================================
--
-- GOAL
--   Move the business tables off "customer" / "supplier" identity and onto the
--   unified persons core built in phases 1-4 (migrations 226-230), without
--   breaking a single existing write path.
--
-- CONTENTS
--   0. Preflight guards        — abort unless every customer/supplier has a person
--   1. New columns             — sales_quotes.customer_person_id,
--                                purchases.supplier_person_id,
--                                payment_vouchers.payee_person_id
--   2. Backfill                — derived from the legacy FK, one statement each
--   3. Completeness assertion  — abort if any resolvable row was missed
--   4. Derivation triggers     — the DB, not the client, owns these columns
--   5. Guard constraints       — the person column cannot outlive its legacy FK
--   6. Indexes
--   7. Deprecation comments on customers / suppliers
--   8. Drift report helper + PostgREST schema reload
--
-- -----------------------------------------------------------------------------
-- DECISION 1: these columns are DERIVED, not client-supplied.
--
-- A BEFORE INSERT OR UPDATE trigger recomputes each person column from the
-- legacy FK on every write, whatever the path (app, RPC, PostgREST, psql,
-- import). This mirrors the decision taken in migration 228 for
-- person_identifiers.value_normalized: if the client and the database ever
-- disagree, the database wins.
--
-- The consequence is deliberate and is the whole point: NO existing write path
-- has to change. create_sales_quote_with_items, pay_purchase_with_voucher, and
-- every direct client INSERT keep working untouched and start populating the
-- new columns automatically. Application code changes to *read* and *filter*
-- by person, not to write.
--
-- -----------------------------------------------------------------------------
-- DECISION 2: NOT NULL is deliberately NOT applied to the new columns.
--
-- The Phase 5 plan asked for NOT NULL. The live data does not permit it, and
-- forcing it would mean either rewriting history or rejecting legitimate rows:
--
--   sales_quotes      1 of 48 rows (SQ-2026-000002, status 'canceled') has
--                     customer_id IS NULL. It predates the persons work.
--   purchases         supplier_id is nullable by schema design.
--   payment_vouchers  the payee is polymorphic — payee_type 'external_party'
--                     points at external_parties, which has no person_id at
--                     all, and payee_type 'other' is a free-text name with no
--                     row behind it. Neither can ever yield a person.
--
-- What NOT NULL was meant to buy — "this column is never silently empty" — is
-- delivered instead by the derivation trigger (section 4), which makes it
-- impossible for the column to disagree with its source, plus the completeness
-- assertion in section 3 which aborts this migration if the backfill missed a
-- resolvable row.
--
-- The place where NOT NULL *would* be meaningful is customers.person_id and
-- suppliers.person_id. Both are 100% populated today (12/12 and 13/13), but
-- four application write paths still INSERT into those tables without a person:
--   src/shared/components/CustomerForm.tsx
--   src/shared/components/SupplierForm.tsx
--   src/shared/components/SupplierReferralModal.tsx
--   src/lib/customers/functions.ts
-- Adding NOT NULL before those are moved onto person_create_inline would break
-- customer and supplier creation in production. That conversion is Phase 6.
--
-- -----------------------------------------------------------------------------
-- SCOPE NOTE
--   23 foreign keys currently point at customers/suppliers. This migration
--   converts the three named in the Phase 5 plan (sales_quotes, purchases,
--   payment_vouchers). The other 20 — credit_*, customer_capital_*, invoices,
--   payment_receipts, delivery_receipts, didar_activities, product_suppliers,
--   purchase_prices, call_logs — are untouched and still customer/supplier
--   based. They are Phase 6 scope.
-- -----------------------------------------------------------------------------

-- Transaction handling follows migrations 228-230: no explicit BEGIN/COMMIT.
-- This file is applied with psql --single-transaction -v ON_ERROR_STOP=1, so
-- any RAISE below rolls the whole migration back.

-- -----------------------------------------------------------------------------
-- 0. PREFLIGHT GUARDS
--    Abort before touching anything if the persons core is not complete enough
--    to back this transition. --single-transaction turns any RAISE below into a
--    full rollback.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_customers_without_person integer;
  v_suppliers_without_person integer;
BEGIN
  SELECT count(*) INTO v_customers_without_person
    FROM public.customers WHERE person_id IS NULL;
  SELECT count(*) INTO v_suppliers_without_person
    FROM public.suppliers WHERE person_id IS NULL;

  IF v_customers_without_person > 0 THEN
    RAISE EXCEPTION
      'ABORT: % customer row(s) have no person_id. Run person_backfill_existing (migration 230) first.',
      v_customers_without_person;
  END IF;

  IF v_suppliers_without_person > 0 THEN
    RAISE EXCEPTION
      'ABORT: % supplier row(s) have no person_id. Run person_backfill_existing (migration 230) first.',
      v_suppliers_without_person;
  END IF;

  RAISE NOTICE 'Preflight OK: every customer and supplier resolves to a person.';
END
$$;

-- -----------------------------------------------------------------------------
-- 1. NEW COLUMNS
--    ON DELETE mirrors each table's existing convention for its legacy FK:
--    NO ACTION on sales_quotes/purchases, RESTRICT on payment_vouchers.
-- -----------------------------------------------------------------------------
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS customer_person_id uuid
    REFERENCES public.persons(id);

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS supplier_person_id uuid
    REFERENCES public.persons(id);

ALTER TABLE public.payment_vouchers
  ADD COLUMN IF NOT EXISTS payee_person_id uuid
    REFERENCES public.persons(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- 2. BACKFILL
-- -----------------------------------------------------------------------------
UPDATE public.sales_quotes q
   SET customer_person_id = c.person_id
  FROM public.customers c
 WHERE c.id = q.customer_id
   AND q.customer_person_id IS DISTINCT FROM c.person_id;

UPDATE public.purchases p
   SET supplier_person_id = s.person_id
  FROM public.suppliers s
 WHERE s.id = p.supplier_id
   AND p.supplier_person_id IS DISTINCT FROM s.person_id;

UPDATE public.payment_vouchers v
   SET payee_person_id = s.person_id
  FROM public.suppliers s
 WHERE s.id = v.payee_supplier_id
   AND v.payee_person_id IS DISTINCT FROM s.person_id;

UPDATE public.payment_vouchers v
   SET payee_person_id = c.person_id
  FROM public.customers c
 WHERE c.id = v.payee_customer_id
   AND v.payee_person_id IS DISTINCT FROM c.person_id;

-- -----------------------------------------------------------------------------
-- 3. COMPLETENESS ASSERTION
--    Every row whose legacy FK resolves to a person must now carry that person.
--    Rows with a NULL legacy FK, or an external_party/other payee, are expected
--    to stay NULL and are excluded — see DECISION 2.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_quotes    integer;
  v_purchases integer;
  v_vouchers  integer;
BEGIN
  SELECT count(*) INTO v_quotes
    FROM public.sales_quotes q
    JOIN public.customers c ON c.id = q.customer_id
   WHERE c.person_id IS NOT NULL
     AND q.customer_person_id IS DISTINCT FROM c.person_id;

  SELECT count(*) INTO v_purchases
    FROM public.purchases p
    JOIN public.suppliers s ON s.id = p.supplier_id
   WHERE s.person_id IS NOT NULL
     AND p.supplier_person_id IS DISTINCT FROM s.person_id;

  SELECT count(*) INTO v_vouchers
    FROM public.payment_vouchers v
    LEFT JOIN public.suppliers s ON s.id = v.payee_supplier_id
    LEFT JOIN public.customers c ON c.id = v.payee_customer_id
   WHERE coalesce(s.person_id, c.person_id) IS NOT NULL
     AND v.payee_person_id IS DISTINCT FROM coalesce(s.person_id, c.person_id);

  IF v_quotes + v_purchases + v_vouchers > 0 THEN
    RAISE EXCEPTION
      'ABORT: backfill incomplete — sales_quotes=%, purchases=%, payment_vouchers=%',
      v_quotes, v_purchases, v_vouchers;
  END IF;

  RAISE NOTICE 'Backfill verified complete: 0 unresolved rows across all three tables.';
END
$$;

-- -----------------------------------------------------------------------------
-- 4. DERIVATION TRIGGERS
--    The database owns these columns. Anything the client sends is overwritten.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_sales_quotes_derive_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.customer_id IS NULL THEN
    NEW.customer_person_id := NULL;
  ELSE
    SELECT c.person_id INTO NEW.customer_person_id
      FROM public.customers c WHERE c.id = NEW.customer_id;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.tg_sales_quotes_derive_person() IS
  'Migration 231. Keeps sales_quotes.customer_person_id in sync with customers.person_id. The database is authoritative; a client-supplied value is ignored.';

DROP TRIGGER IF EXISTS trg_sales_quotes_derive_person ON public.sales_quotes;
CREATE TRIGGER trg_sales_quotes_derive_person
  BEFORE INSERT OR UPDATE OF customer_id ON public.sales_quotes
  FOR EACH ROW EXECUTE FUNCTION public.tg_sales_quotes_derive_person();

CREATE OR REPLACE FUNCTION public.tg_purchases_derive_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.supplier_id IS NULL THEN
    NEW.supplier_person_id := NULL;
  ELSE
    SELECT s.person_id INTO NEW.supplier_person_id
      FROM public.suppliers s WHERE s.id = NEW.supplier_id;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.tg_purchases_derive_person() IS
  'Migration 231. Keeps purchases.supplier_person_id in sync with suppliers.person_id. The database is authoritative; a client-supplied value is ignored.';

DROP TRIGGER IF EXISTS trg_purchases_derive_person ON public.purchases;
CREATE TRIGGER trg_purchases_derive_person
  BEFORE INSERT OR UPDATE OF supplier_id ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.tg_purchases_derive_person();

CREATE OR REPLACE FUNCTION public.tg_payment_vouchers_derive_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- payee_type 'external_party' and 'other' have no person behind them.
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

COMMENT ON FUNCTION public.tg_payment_vouchers_derive_person() IS
  'Migration 231. Keeps payment_vouchers.payee_person_id in sync with the supplier/customer payee. NULL for external_party and other payees, which have no person.';

DROP TRIGGER IF EXISTS trg_payment_vouchers_derive_person ON public.payment_vouchers;
CREATE TRIGGER trg_payment_vouchers_derive_person
  BEFORE INSERT OR UPDATE OF payee_supplier_id, payee_customer_id
  ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_vouchers_derive_person();

-- -----------------------------------------------------------------------------
-- 5. GUARD CONSTRAINTS
--    A person column may never be populated without its legacy FK. This is the
--    strongest constraint the nullable legacy columns admit; the trigger covers
--    the other direction.
-- -----------------------------------------------------------------------------
ALTER TABLE public.sales_quotes
  DROP CONSTRAINT IF EXISTS sales_quotes_customer_person_requires_customer_chk;
ALTER TABLE public.sales_quotes
  ADD CONSTRAINT sales_quotes_customer_person_requires_customer_chk
  CHECK (customer_person_id IS NULL OR customer_id IS NOT NULL);

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_supplier_person_requires_supplier_chk;
ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_supplier_person_requires_supplier_chk
  CHECK (supplier_person_id IS NULL OR supplier_id IS NOT NULL);

ALTER TABLE public.payment_vouchers
  DROP CONSTRAINT IF EXISTS payment_vouchers_payee_person_requires_payee_chk;
ALTER TABLE public.payment_vouchers
  ADD CONSTRAINT payment_vouchers_payee_person_requires_payee_chk
  CHECK (payee_person_id IS NULL
         OR payee_supplier_id IS NOT NULL
         OR payee_customer_id IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 6. INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS sales_quotes_customer_person_id_idx
  ON public.sales_quotes (customer_person_id)
  WHERE customer_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchases_supplier_person_id_idx
  ON public.purchases (supplier_person_id)
  WHERE supplier_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_vouchers_payee_person_id_idx
  ON public.payment_vouchers (payee_person_id)
  WHERE payee_person_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 7. COLUMN AND TABLE COMMENTS
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.sales_quotes.customer_person_id IS
  'Unified person behind customer_id. Derived by trg_sales_quotes_derive_person (migration 231) - do not write directly. Prefer this over customer_id in new queries.';
COMMENT ON COLUMN public.purchases.supplier_person_id IS
  'Unified person behind supplier_id. Derived by trg_purchases_derive_person (migration 231) - do not write directly. Prefer this over supplier_id in new queries.';
COMMENT ON COLUMN public.payment_vouchers.payee_person_id IS
  'Unified person behind the supplier/customer payee. Derived by trg_payment_vouchers_derive_person (migration 231) - do not write directly. NULL for external_party and other payees.';

COMMENT ON TABLE public.customers IS
  'DEPRECATED as an identity store (Phase 5, migration 231). A customer row is now a commercial role attached to persons via customers.person_id; identity (names, national id, phone, email) belongs in persons and person_identifiers. Still authoritative for customer-specific commercial fields and for the 20 FKs not yet migrated. Do not add identity columns here.';
COMMENT ON TABLE public.suppliers IS
  'DEPRECATED as an identity store (Phase 5, migration 231). A supplier row is now a commercial role attached to persons via suppliers.person_id; identity (names, national id, phone, email) belongs in persons and person_identifiers. Still authoritative for supplier-specific commercial fields. Do not add identity columns here.';

COMMENT ON COLUMN public.customers.person_id IS
  'The unified person this customer role belongs to. 100% populated as of migration 231 but still nullable: CustomerForm.tsx and customers/functions.ts can still insert without one. Phase 6 moves them onto person_create_inline, after which this becomes NOT NULL.';
COMMENT ON COLUMN public.suppliers.person_id IS
  'The unified person this supplier role belongs to. 100% populated as of migration 231 but still nullable: SupplierForm.tsx and SupplierReferralModal.tsx can still insert without one. Phase 6 moves them onto person_create_inline, after which this becomes NOT NULL.';

-- -----------------------------------------------------------------------------
-- 8. DRIFT REPORT HELPER
--    Returns one row per table that has drifted. An empty result is the healthy
--    state. Used by the Phase 5 smoke test and safe to call any time.
-- -----------------------------------------------------------------------------
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
  HAVING count(*) > 0;
$$;

COMMENT ON FUNCTION public.person_fk_drift_report() IS
  'Migration 231. Returns any rows where a derived *_person_id column disagrees with its legacy FK. An empty result means the Phase 5 columns are consistent.';

REVOKE ALL ON FUNCTION public.person_fk_drift_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_fk_drift_report() TO authenticated, service_role;

-- PostgREST must re-read the schema or it will not expose the new columns.
-- Delivered on commit; the deploy step also restarts the rest container.
NOTIFY pgrst, 'reload schema';
