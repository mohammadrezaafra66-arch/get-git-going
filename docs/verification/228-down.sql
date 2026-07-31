SET client_encoding='UTF8';

-- =============================================================================
-- DOWN script for migration 228 (Phase 2 — person aliases / normalization)
-- =============================================================================
-- Deliberately NOT in supabase/migrations/ so it is never auto-applied.
--
-- Run with:
--   docker cp docs/verification/228-down.sql afrakala-lan-db:/tmp/228down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f /tmp/228down.sql
--
-- DATA LOSS WARNING
--   Dropping person_aliases destroys every alias row. At the time 228 was
--   applied the table was brand new and empty, so reverting immediately is
--   lossless. If aliases have since been entered, export them first:
--     \copy (SELECT * FROM public.person_aliases) TO 'aliases_backup.csv' CSV HEADER
--   The DROP below is intentionally left commented out for that reason —
--   uncomment only after you have confirmed the table is empty or backed up.
-- =============================================================================

-- --- 5. B4 comments ---------------------------------------------------------
COMMENT ON COLUMN public.person_field_definitions.is_required IS NULL;
COMMENT ON TABLE  public.person_field_definitions IS NULL;

-- --- 4. person_aliases ------------------------------------------------------
DROP INDEX IF EXISTS public.idx_persons_display_name_trgm;
DROP INDEX IF EXISTS public.idx_persons_display_name_normalized;

-- Guard: refuse to silently destroy data.
DO $$
DECLARE _n bigint;
BEGIN
  SELECT count(*) INTO _n FROM public.person_aliases;
  IF _n > 0 THEN
    RAISE EXCEPTION
      'person_aliases holds % row(s). Back them up, then uncomment the DROP TABLE below.', _n;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_person_aliases_audit ON public.person_aliases;
DROP TRIGGER IF EXISTS trg_person_aliases_set_updated_at ON public.person_aliases;
DROP FUNCTION IF EXISTS public.audit_person_aliases();
DROP TABLE IF EXISTS public.person_aliases;

-- --- 3. restore the previous uniqueness semantics ---------------------------
DROP INDEX IF EXISTS public.uq_person_identifiers_strong_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_active_kind_value
  ON public.person_identifiers (kind, value_normalized)
  WHERE status = ANY (ARRAY['provisional'::text, 'confirmed'::text]);

-- --- 2. drop the normalization trigger (TS becomes authoritative again) -----
DROP TRIGGER IF EXISTS trg_person_identifiers_normalize ON public.person_identifiers;
DROP FUNCTION IF EXISTS public.tg_person_identifiers_normalize();

-- --- 1. drop the normalizer -------------------------------------------------
DROP FUNCTION IF EXISTS public.normalize_identifier(text, text, boolean);

-- NOTE: reverting step 2 does NOT un-normalize already-stored values. Rows
-- written while the trigger was active keep their DB-computed
-- value_normalized. That is harmless (the values are correct), but it means
-- the revert is not byte-for-byte symmetric.
