-- AFRA-20260517-PERSONS-U01-S13 — D3: DB-level duplicate prevention
-- Option A: UNIQUE(kind, value_normalized) WHERE status IN ('provisional','confirmed').
-- Pre-condition (verified before applying): zero duplicate groups for active identifiers.
-- Cleanup performed separately by U01 approval (revoked 843c6f53… on person be43ff2a…).
-- Reversible: DROP INDEX IF EXISTS public.uq_person_identifiers_active_kind_value;

CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_active_kind_value
  ON public.person_identifiers (kind, value_normalized)
  WHERE status IN ('provisional', 'confirmed');

COMMENT ON INDEX public.uq_person_identifiers_active_kind_value IS
  'AFRA-S13/D3: DB-level guarantee that no two active (provisional/confirmed) identifiers share (kind, value_normalized). Closes concurrent-insert race for cross-person and same-person duplicates. Revoked rows are excluded.';