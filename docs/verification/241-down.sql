SET client_encoding='UTF8';

-- =============================================================================
-- 241-down — rollback for Phase 8.4 (global contact uniqueness)
-- =============================================================================
--
-- This restores migration 228's B3 split: contact identifiers unique only when
-- confirmed. Rolling back loses no data — uniqueness is a rule, not a column —
-- and it can always succeed, because going from a stricter rule to a looser one
-- cannot conflict with existing rows.
--
-- ⚠️ It does re-open what 228 was worried about and what Decision 2 chose to
--    close: two persons may again hold the same unverified mobile, and the
--    duplicate identities that produces are exactly what checkpoint 8.2 had to
--    clean up by hand.
-- -----------------------------------------------------------------------------

-- Restore 228's confirmed-only index across all kinds.
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_confirmed_kind_value
  ON public.person_identifiers (kind, value_normalized)
  WHERE (status = 'confirmed');

DROP INDEX IF EXISTS public.uq_person_identifiers_custom_confirmed;
DROP INDEX IF EXISTS public.uq_person_identifiers_contact_global;

-- Restore the original validate_person_identifier (migration 226 definition):
-- the revoked-cannot-be-primary check only, invoker rights, no conflict lookup.
CREATE OR REPLACE FUNCTION public.validate_person_identifier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_primary = true AND NEW.status = 'revoked' THEN
    RAISE EXCEPTION 'A revoked identifier cannot be primary';
  END IF;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
