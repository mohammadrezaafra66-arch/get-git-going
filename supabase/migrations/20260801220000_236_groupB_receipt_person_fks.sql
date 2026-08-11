SET client_encoding='UTF8';

-- =============================================================================
-- 236 — Phase 7.2 (Group B): person FKs on receipts, delivery and party payees
-- =============================================================================
--
-- SCOPE (authoritative enumeration)
--   payment_receipts.customer_id        4 rows, 4 non-null, legacy NOT NULL
--   payment_receipts.receiver_party_id  4 rows, 2 non-null, legacy nullable
--   delivery_receipts.customer_id       0 rows,             legacy nullable
--   payment_vouchers.payee_party_id     0 rows,             legacy nullable
--
-- -----------------------------------------------------------------------------
-- PREREQUISITE THAT THE PLAN ANTICIPATED: external_parties had NO person_id.
--
-- Phase 4 bridged customers, Phase 6 bridged suppliers, but external_parties was
-- never given one. Without it, receiver_party_id and payee_party_id have nothing
-- to resolve to. Section 1 adds and backfills it first.
--
-- Backfill approach mirrors migration 233: create a person per party rather than
-- matching an existing one. The single live party has no national_id and no
-- phone, so there is nothing to match on — and guessing would be an identity
-- merge, which this project does not do silently.
--
-- context_kind is 'accounting_party'. 'external_party' is NOT one of the 18
-- values person_context_links_context_kind_check permits; 'accounting_party' is,
-- and it is what an external payee/receiver actually is in this system.
--
-- NOTE ON NULLABILITY OF external_parties.person_id: left NULLABLE on purpose.
-- Making it NOT NULL would break the external-parties creation form the same way
-- it would have broken supplier creation before Phase 6 routed that form through
-- person_create_inline. Backfilled 1/1 today; mandating it is follow-up work and
-- is called out in PROGRESS.md rather than smuggled in here.
--
-- SHAPE OF payment_receipts: this is NOT polymorphic in the payment_vouchers
-- sense. customer_id is always the payer; receiver_party_id is an optional
-- external receiver, mutually exclusive with destination_bank_account_id (see
-- payment_receipts_receiver_exclusive_chk). So it gets TWO independent person
-- columns, not one discriminated column.
--
-- payment_vouchers IS polymorphic, and its payee_person_id (migration 231)
-- deliberately stayed NULL for payee_type='external_party' because no person
-- existed. Section 5 closes that gap now that one does.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. external_parties.person_id — the Group B prerequisite
-- -----------------------------------------------------------------------------
ALTER TABLE public.external_parties
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id);

DO $$
DECLARE
  r           record;
  v_person_id uuid;
  v_created   integer := 0;
BEGIN
  FOR r IN SELECT id, full_name, national_id, phone, notes
             FROM public.external_parties
            WHERE person_id IS NULL
            ORDER BY created_at
  LOOP
    INSERT INTO public.persons (kind, display_name, notes)
    VALUES (
      'individual',
      NULLIF(btrim(COALESCE(r.full_name, '')), ''),
      COALESCE(r.notes, '') ||
        CASE WHEN COALESCE(r.notes, '') = '' THEN '' ELSE E'\n' END ||
        'ساخته‌شده در فاز ۷ (۲۳۶) از رکورد طرف حساب خارجی.'
    )
    RETURNING id INTO v_person_id;
    v_created := v_created + 1;

    -- Identifiers only where they actually exist. normalize_identifier RAISEs on
    -- junk, so a bad value must not abort the whole backfill.
    IF r.national_id IS NOT NULL AND btrim(r.national_id) <> '' THEN
      BEGIN
        INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
        VALUES (v_person_id, 'national_id_ir', btrim(r.national_id), 'provisional', true);
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'external_party %: national_id % unusable (%)', r.id, r.national_id, SQLERRM;
      END;
    END IF;

    IF r.phone IS NOT NULL AND btrim(r.phone) <> '' THEN
      BEGIN
        INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
        VALUES (v_person_id, 'mobile_e164', btrim(r.phone), 'provisional', true);
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'external_party %: phone % unusable (%)', r.id, r.phone, SQLERRM;
      END;
    END IF;

    INSERT INTO public.person_context_links
      (person_id, context_kind, ref_table, ref_id, started_at)
    VALUES (v_person_id, 'accounting_party', 'external_parties', r.id, now());

    UPDATE public.external_parties SET person_id = v_person_id WHERE id = r.id;
  END LOOP;

  RAISE NOTICE 'external_parties: % person(s) created and linked.', v_created;
END
$$;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad FROM public.external_parties WHERE person_id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ABORT: % external_parties row(s) still have no person_id.', v_bad;
  END IF;
  RAISE NOTICE 'Every external party resolves to a person.';
END
$$;

CREATE INDEX IF NOT EXISTS external_parties_person_id_idx
  ON public.external_parties (person_id) WHERE person_id IS NOT NULL;

COMMENT ON COLUMN public.external_parties.person_id IS
  'The unified person behind this external party. Added in migration 236 (Phase 7.2). Nullable for now: the external-parties form still inserts without one, exactly as SupplierForm did before Phase 6. Mandating it requires routing that form through person_create_inline first.';

-- -----------------------------------------------------------------------------
-- 2. COLUMNS on the Group B tables
-- -----------------------------------------------------------------------------
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS customer_person_id uuid
    REFERENCES public.persons(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS receiver_party_person_id uuid
    REFERENCES public.persons(id) ON DELETE RESTRICT;

ALTER TABLE public.delivery_receipts
  ADD COLUMN IF NOT EXISTS customer_person_id uuid
    REFERENCES public.persons(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- 3. BACKFILL
-- -----------------------------------------------------------------------------
UPDATE public.payment_receipts pr
   SET customer_person_id = c.person_id
  FROM public.customers c
 WHERE c.id = pr.customer_id
   AND pr.customer_person_id IS DISTINCT FROM c.person_id;

UPDATE public.payment_receipts pr
   SET receiver_party_person_id = ep.person_id
  FROM public.external_parties ep
 WHERE ep.id = pr.receiver_party_id
   AND pr.receiver_party_person_id IS DISTINCT FROM ep.person_id;

UPDATE public.delivery_receipts dr
   SET customer_person_id = c.person_id
  FROM public.customers c
 WHERE c.id = dr.customer_id
   AND dr.customer_person_id IS DISTINCT FROM c.person_id;

UPDATE public.payment_vouchers v
   SET payee_person_id = ep.person_id
  FROM public.external_parties ep
 WHERE ep.id = v.payee_party_id
   AND v.payee_person_id IS DISTINCT FROM ep.person_id;

-- -----------------------------------------------------------------------------
-- 4. COMPLETENESS ASSERTION
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_pr_cus integer; v_pr_party integer; v_dr integer; v_pv integer;
BEGIN
  SELECT count(*) INTO v_pr_cus FROM public.payment_receipts
   WHERE customer_id IS NOT NULL AND customer_person_id IS NULL;
  SELECT count(*) INTO v_pr_party FROM public.payment_receipts
   WHERE receiver_party_id IS NOT NULL AND receiver_party_person_id IS NULL;
  SELECT count(*) INTO v_dr FROM public.delivery_receipts
   WHERE customer_id IS NOT NULL AND customer_person_id IS NULL;
  SELECT count(*) INTO v_pv FROM public.payment_vouchers
   WHERE payee_party_id IS NOT NULL AND payee_person_id IS NULL;

  IF v_pr_cus + v_pr_party + v_dr + v_pv > 0 THEN
    RAISE EXCEPTION
      'ABORT: orphans — payment_receipts.customer=%, payment_receipts.party=%, delivery_receipts=%, payment_vouchers.party=%',
      v_pr_cus, v_pr_party, v_dr, v_pv;
  END IF;
  RAISE NOTICE 'Group B backfill verified: 0 orphans across all four references.';
END
$$;

-- -----------------------------------------------------------------------------
-- 5. DERIVATION TRIGGERS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_payment_receipts_derive_person()
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

  IF NEW.receiver_party_id IS NULL THEN
    NEW.receiver_party_person_id := NULL;
  ELSE
    SELECT ep.person_id INTO NEW.receiver_party_person_id
      FROM public.external_parties ep WHERE ep.id = NEW.receiver_party_id;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.tg_payment_receipts_derive_person() IS
  'Migration 236 (Phase 7.2). Keeps payment_receipts.customer_person_id and receiver_party_person_id in sync with their legacy FKs. The database is authoritative.';

DROP TRIGGER IF EXISTS trg_payment_receipts_derive_person ON public.payment_receipts;
CREATE TRIGGER trg_payment_receipts_derive_person
  BEFORE INSERT OR UPDATE OF customer_id, receiver_party_id ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_receipts_derive_person();

CREATE OR REPLACE FUNCTION public.tg_delivery_receipts_derive_person()
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

COMMENT ON FUNCTION public.tg_delivery_receipts_derive_person() IS
  'Migration 236 (Phase 7.2). Keeps delivery_receipts.customer_person_id in sync with customers.person_id.';

DROP TRIGGER IF EXISTS trg_delivery_receipts_derive_person ON public.delivery_receipts;
CREATE TRIGGER trg_delivery_receipts_derive_person
  BEFORE INSERT OR UPDATE OF customer_id ON public.delivery_receipts
  FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_receipts_derive_person();

-- Extend the Phase 5 voucher trigger to cover the external-party payee, which it
-- had to leave NULL because external_parties had no person until section 1.
-- Live definition read with pg_get_functiondef before editing; the supplier and
-- customer branches are byte-identical to migration 231, only the ELSIF for
-- payee_party_id is new.
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
  ELSIF NEW.payee_party_id IS NOT NULL THEN
    -- New in 236: external parties now have a person.
    SELECT ep.person_id INTO NEW.payee_person_id
      FROM public.external_parties ep WHERE ep.id = NEW.payee_party_id;
  ELSE
    -- payee_type 'other' is a free-text name with no row behind it.
    NEW.payee_person_id := NULL;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.tg_payment_vouchers_derive_person() IS
  'Migration 231, extended in 236 (Phase 7.2). Derives payment_vouchers.payee_person_id from the supplier, customer OR external-party payee. NULL only for payee_type ''other'', which has no row behind it.';

DROP TRIGGER IF EXISTS trg_payment_vouchers_derive_person ON public.payment_vouchers;
CREATE TRIGGER trg_payment_vouchers_derive_person
  BEFORE INSERT OR UPDATE OF payee_supplier_id, payee_customer_id, payee_party_id
  ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_vouchers_derive_person();

-- -----------------------------------------------------------------------------
-- 6. CONSTRAINTS — mirror legacy nullability
-- -----------------------------------------------------------------------------
--
-- FIRST: widen the migration-231 voucher guard. It was written when only a
-- supplier or customer payee could have a person:
--
--   CHECK (payee_person_id IS NULL
--          OR payee_supplier_id IS NOT NULL
--          OR payee_customer_id IS NOT NULL)
--
-- Now that section 5 derives a person for an external-party payee too, that
-- constraint rejects exactly the rows the trigger has just populated. Caught by
-- the dry-run: inserting a payee_type='external_party' voucher failed with
-- payment_vouchers_payee_person_requires_payee_chk. Widened to accept the party
-- branch while still forbidding a person on a payee_type='other' voucher, which
-- has no row behind it.
ALTER TABLE public.payment_vouchers
  DROP CONSTRAINT IF EXISTS payment_vouchers_payee_person_requires_payee_chk;
ALTER TABLE public.payment_vouchers
  ADD CONSTRAINT payment_vouchers_payee_person_requires_payee_chk
  CHECK (payee_person_id IS NULL
         OR payee_supplier_id IS NOT NULL
         OR payee_customer_id IS NOT NULL
         OR payee_party_id IS NOT NULL);

ALTER TABLE public.payment_receipts ALTER COLUMN customer_person_id SET NOT NULL;

ALTER TABLE public.payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_receiver_person_requires_party_chk;
ALTER TABLE public.payment_receipts
  ADD CONSTRAINT payment_receipts_receiver_person_requires_party_chk
  CHECK (receiver_party_person_id IS NULL OR receiver_party_id IS NOT NULL);

ALTER TABLE public.delivery_receipts
  DROP CONSTRAINT IF EXISTS delivery_receipts_customer_person_requires_customer_chk;
ALTER TABLE public.delivery_receipts
  ADD CONSTRAINT delivery_receipts_customer_person_requires_customer_chk
  CHECK (customer_person_id IS NULL OR customer_id IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 7. INDEXES + COMMENTS
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS payment_receipts_customer_person_id_idx
  ON public.payment_receipts (customer_person_id);
CREATE INDEX IF NOT EXISTS payment_receipts_receiver_party_person_id_idx
  ON public.payment_receipts (receiver_party_person_id)
  WHERE receiver_party_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS delivery_receipts_customer_person_id_idx
  ON public.delivery_receipts (customer_person_id)
  WHERE customer_person_id IS NOT NULL;

COMMENT ON COLUMN public.payment_receipts.customer_person_id IS
  'Unified person behind customer_id (the payer). Derived by trg_payment_receipts_derive_person (migration 236) - do not write directly.';
COMMENT ON COLUMN public.payment_receipts.receiver_party_person_id IS
  'Unified person behind receiver_party_id. Derived by trg_payment_receipts_derive_person (migration 236). NULL when the receiver is a bank account rather than an external party.';
COMMENT ON COLUMN public.delivery_receipts.customer_person_id IS
  'Unified person behind customer_id. Derived by trg_delivery_receipts_derive_person (migration 236) - do not write directly.';

-- -----------------------------------------------------------------------------
-- 8. person_fk_drift_report() — extend to the tables Phase 7 has added so far.
--
-- Two reasons this must change here, not later:
--   1. CORRECTNESS. The migration-231 body computed the expected voucher person
--      as coalesce(supplier, customer) only. Now that section 5 derives one from
--      an external party too, that formula reports a correct row as drifted —
--      the dry-run flagged payment_vouchers=1 for exactly this reason.
--   2. COVERAGE. The report is this phase's health check; a column it does not
--      look at is a column nobody is checking.
--
-- Group C and D tables are added to this same function by migration 238.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.person_fk_drift_report()
RETURNS TABLE (table_name text, drifted_rows bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Phase 5 tables
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
  -- Phase 7.1 (Group A)
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
  -- Phase 7.2 (Group B)
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

COMMENT ON FUNCTION public.person_fk_drift_report() IS
  'Migrations 231/236. Returns any rows where a derived *_person_id column disagrees with its legacy FK, across every table Phases 5-7 have migrated. An empty result is the healthy state.';

REVOKE ALL ON FUNCTION public.person_fk_drift_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_fk_drift_report() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
