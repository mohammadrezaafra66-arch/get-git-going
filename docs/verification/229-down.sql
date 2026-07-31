SET client_encoding='UTF8';

-- =============================================================================
-- DOWN script for migration 229 (Phase 3 — inline person creation)
-- =============================================================================
-- Deliberately NOT in supabase/migrations/ so it is never auto-applied.
--
--   docker cp docs/verification/229-down.sql afrakala-lan-db:/tmp/229down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f /tmp/229down.sql
--
-- CODE MUST BE REVERTED TOO. This script only undoes the database half:
--   src/components/persons/PersonModal.tsx          (delete)
--   src/shared/components/PurchaseForm.tsx          (remove modal + button)
--   src/shared/components/QuickAddCustomerDialog.tsx(restore direct insert)
--   src/lib/persons/identifiers.functions.ts        (restore old dup guard)
--   src/integrations/supabase/types.ts              (remove RPC entry)
-- Reverting the DB without the code leaves the UI calling a missing RPC.
-- =============================================================================

-- --- 2. the RPC -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.person_create_inline(
  text, text, text, jsonb, text, text, text, text
);

-- --- 1. suppliers.person_id -------------------------------------------------
-- DATA WARNING: dropping the column discards the person<->supplier bridge for
-- every supplier created inline. The persons rows themselves survive, but the
-- link is gone and would have to be re-established by hand.
DO $$
DECLARE _n bigint;
BEGIN
  SELECT count(*) INTO _n FROM public.suppliers WHERE person_id IS NOT NULL;
  IF _n > 0 THEN
    RAISE EXCEPTION
      '% supplier(s) are bridged to a person. Export them before dropping: '
      'SELECT id, name, person_id FROM suppliers WHERE person_id IS NOT NULL;', _n;
  END IF;
END $$;

DROP INDEX IF EXISTS public.suppliers_person_id_idx;
ALTER TABLE public.suppliers DROP COLUMN IF EXISTS person_id;

-- NOTE: person_context_links rows written by person_create_inline are left in
-- place on purpose. They are an append-only provenance log; deleting them would
-- destroy history, and they are harmless once the RPC is gone.
