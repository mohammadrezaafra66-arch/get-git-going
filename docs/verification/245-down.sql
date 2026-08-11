SET client_encoding='UTF8';

-- =============================================================================
-- 245-down — rollback for the landline narrowing
-- =============================================================================
--
-- This restores migration 241's behaviour: landline globally unique alongside
-- mobile_e164 and email.
--
-- ⚠️ UNLIKE 245 ITSELF, THIS ROLLBACK CAN FAIL, AND THAT IS THE POINT.
--   245 only ever removed a restriction, so it could not conflict with existing
--   data. Going the other way re-imposes one. If any two persons have recorded
--   the same landline since 245 was applied — which is exactly the situation
--   245 exists to permit — the CREATE UNIQUE INDEX below will fail with a
--   unique_violation and this script will stop.
--
--   That is the correct outcome: it means real shared-office-line data exists
--   and silently discarding one side of it to satisfy an index would be data
--   loss. Resolve those rows deliberately first:
--
--     SELECT value_normalized, count(DISTINCT person_id) AS persons,
--            array_agg(DISTINCT person_id) AS person_ids
--       FROM public.person_identifiers
--      WHERE kind = 'landline' AND status <> 'revoked'
--      GROUP BY value_normalized
--     HAVING count(DISTINCT person_id) > 1;
-- -----------------------------------------------------------------------------

DROP INDEX IF EXISTS public.uq_person_identifiers_landline_confirmed;
DROP INDEX IF EXISTS public.uq_person_identifiers_contact_global;

CREATE UNIQUE INDEX uq_person_identifiers_contact_global
  ON public.person_identifiers (kind, value_normalized)
  WHERE status <> 'revoked'
    AND kind IN ('mobile_e164', 'landline', 'email');

-- Restore 241's trigger, in which landline is treated like mobile and email.
-- Apply the validate_person_identifier definition from
--   supabase/migrations/20260802030000_241_global_contact_uniqueness.sql
-- The application layer must move back too, or it will be looser than the
-- schema: re-add "landline" to CONTACT_IDENTIFIER_KINDS in
--   src/lib/persons/identifiers.functions.ts
\echo 'Also restore validate_person_identifier from migration 241,'
\echo 'and re-add "landline" to CONTACT_IDENTIFIER_KINDS in identifiers.functions.ts.'

NOTIFY pgrst, 'reload schema';
