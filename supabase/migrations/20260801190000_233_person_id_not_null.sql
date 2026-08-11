SET client_encoding='UTF8';

-- =============================================================================
-- 233 — Phase 6.3: backfill remaining person_id NULLs, then enforce NOT NULL
-- =============================================================================
--
-- GOAL
--   Every supplier and customer belongs to a person, enforced by the schema
--   rather than by convention. This is the milestone Phase 5 deferred: at that
--   time four forms could still create person-less rows, so NOT NULL would have
--   broken supplier/customer creation. Migrations 232 + checkpoints 6.1/6.2
--   closed those paths, so the constraint is now safe to add.
--
-- WHAT IS BEING ABSORBED (state at authoring time)
--   suppliers: 15 rows, 2 with person_id IS NULL
--     - 'api'          — no phone at all
--     - 'تست دستی من'  — phone 09122270261
--   customers: 12 rows, 0 NULL
--
-- -----------------------------------------------------------------------------
-- DECISION: never auto-merge identities during a backfill.
--
--   'تست دستی من' carries 09122270261, which normalizes to +989122270261 — a
--   number ALREADY held by the person «محمدرضا افرا». Attaching the supplier to
--   that existing person would be an identity merge performed silently by a
--   migration, on the strength of one shared phone number. Phone numbers are
--   reassigned, shared between a company and its owner, and mistyped.
--
--   So every orphan legacy row gets its OWN new person. Where the row's mobile
--   collides with an existing person, that is recorded as a MERGE CANDIDATE for
--   a human to decide — migration 234 (Phase 6.8) derives the queue from the
--   data, so nothing has to be hand-fed here.
--
--   This is safe under the Phase 2 uniqueness rules: mobile_e164 is a WEAK
--   identifier. uq_person_identifiers_strong_active covers only national_id_ir,
--   tax_id_ir, company_reg_id_ir and iban; and
--   uq_person_identifiers_confirmed_kind_value only bites between two CONFIRMED
--   rows. Both the existing and the new identifier are 'provisional', so the
--   duplicate is permitted and stays visible.
--
-- -----------------------------------------------------------------------------
-- IRREVERSIBILITY
--   NOT NULL is the one part that cannot be undone by data alone. 233-down.sql
--   drops the two constraints and keeps every row, so the schema is reversible;
--   the persons created below simply remain (they are real records, not junk).
--   Backup taken before applying:
--     D:\backups\afrakala\pre_phase6_3_20260801_180920.sql.gz
--     sha256 8edecb25d7ec7071641e54c253da6114f1f8e886c888efa17b6bb7f22baa12ce
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. BACKFILL
--    Direct INSERTs rather than person_create_full: that RPC requires
--    auth.uid(), which is NULL when a migration runs as supabase_admin.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r              record;
  v_person_id    uuid;
  v_created      integer := 0;
  v_with_ident   integer := 0;
  v_skipped_bad  integer := 0;
BEGIN
  ---------------------------------------------------------------------------
  -- Suppliers
  ---------------------------------------------------------------------------
  FOR r IN
    SELECT id, name, phone, notes, created_by
      FROM public.suppliers
     WHERE person_id IS NULL
     ORDER BY created_at
  LOOP
    INSERT INTO public.persons (kind, display_name, notes, created_by)
    VALUES (
      'organization',
      NULLIF(btrim(COALESCE(r.name, '')), ''),
      COALESCE(r.notes, '') ||
        CASE WHEN COALESCE(r.notes, '') = '' THEN '' ELSE E'\n' END ||
        'ساخته‌شده در پرکردن فاز ۶ (۲۳۳) از رکورد تأمین‌کنندهٔ بدون شخص.',
      r.created_by
    )
    RETURNING id INTO v_person_id;
    v_created := v_created + 1;

    -- Identifier only if the phone actually normalizes. normalize_identifier
    -- RAISEs on junk, so a bad phone must not abort the whole backfill.
    IF r.phone IS NOT NULL AND btrim(r.phone) <> '' THEN
      BEGIN
        INSERT INTO public.person_identifiers (
          person_id, kind, value_raw, status, is_primary, created_by
        )
        VALUES (v_person_id, 'mobile_e164', btrim(r.phone), 'provisional', true, r.created_by);
        v_with_ident := v_with_ident + 1;
      EXCEPTION
        WHEN others THEN
          v_skipped_bad := v_skipped_bad + 1;
          RAISE NOTICE 'supplier %: phone % not usable as an identifier (%), person created without it',
            r.id, r.phone, SQLERRM;
      END;
    END IF;

    INSERT INTO public.person_context_links (
      person_id, context_kind, ref_table, ref_id, started_at, created_by
    )
    VALUES (v_person_id, 'supplier', 'suppliers', r.id, now(), r.created_by);

    UPDATE public.suppliers SET person_id = v_person_id WHERE id = r.id;
  END LOOP;

  ---------------------------------------------------------------------------
  -- Customers (none at authoring time, but the loop must exist for re-runs
  -- and for any row created between authoring and apply)
  ---------------------------------------------------------------------------
  FOR r IN
    SELECT id, name, phone, notes, NULL::uuid AS created_by
      FROM public.customers
     WHERE person_id IS NULL
     ORDER BY created_at
  LOOP
    INSERT INTO public.persons (kind, display_name, notes)
    VALUES (
      'individual',
      NULLIF(btrim(COALESCE(r.name, '')), ''),
      COALESCE(r.notes, '') ||
        CASE WHEN COALESCE(r.notes, '') = '' THEN '' ELSE E'\n' END ||
        'ساخته‌شده در پرکردن فاز ۶ (۲۳۳) از رکورد مشتریِ بدون شخص.'
    )
    RETURNING id INTO v_person_id;
    v_created := v_created + 1;

    IF r.phone IS NOT NULL AND btrim(r.phone) <> '' THEN
      BEGIN
        INSERT INTO public.person_identifiers (
          person_id, kind, value_raw, status, is_primary
        )
        VALUES (v_person_id, 'mobile_e164', btrim(r.phone), 'provisional', true);
        v_with_ident := v_with_ident + 1;
      EXCEPTION
        WHEN others THEN
          v_skipped_bad := v_skipped_bad + 1;
          RAISE NOTICE 'customer %: phone % not usable as an identifier (%)', r.id, r.phone, SQLERRM;
      END;
    END IF;

    INSERT INTO public.person_context_links (
      person_id, context_kind, ref_table, ref_id, started_at
    )
    VALUES (v_person_id, 'customer', 'customers', r.id, now());

    UPDATE public.customers SET person_id = v_person_id WHERE id = r.id;
  END LOOP;

  RAISE NOTICE 'Backfill: % person(s) created, % with an identifier, % phone(s) unusable.',
    v_created, v_with_ident, v_skipped_bad;
END
$$;

-- -----------------------------------------------------------------------------
-- 2. COMPLETENESS ASSERTION — abort before the constraint if anything remains
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_sup integer;
  v_cus integer;
BEGIN
  SELECT count(*) INTO v_sup FROM public.suppliers WHERE person_id IS NULL;
  SELECT count(*) INTO v_cus FROM public.customers WHERE person_id IS NULL;

  IF v_sup > 0 OR v_cus > 0 THEN
    RAISE EXCEPTION
      'ABORT: person_id still NULL on % supplier(s) and % customer(s); refusing to add NOT NULL.',
      v_sup, v_cus;
  END IF;

  RAISE NOTICE 'Every supplier and customer resolves to a person. Safe to enforce.';
END
$$;

-- -----------------------------------------------------------------------------
-- 3. ENFORCE
-- -----------------------------------------------------------------------------
ALTER TABLE public.suppliers ALTER COLUMN person_id SET NOT NULL;
ALTER TABLE public.customers ALTER COLUMN person_id SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. COMMENTS — supersede the "nullable for now" notes left by migration 231
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.suppliers.person_id IS
  'The unified person this supplier role belongs to. NOT NULL since migration 233 (Phase 6.3): every creation path goes through person_create_inline, so a supplier without a person can no longer be created.';
COMMENT ON COLUMN public.customers.person_id IS
  'The unified person this customer role belongs to. NOT NULL since migration 233 (Phase 6.3): every creation path goes through person_create_inline, so a customer without a person can no longer be created.';

NOTIFY pgrst, 'reload schema';
