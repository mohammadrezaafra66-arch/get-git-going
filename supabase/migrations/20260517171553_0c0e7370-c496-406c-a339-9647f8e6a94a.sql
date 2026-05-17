-- AFRA-20260517-PERSONS-U01-S17: link customers to unified persons (additive only).
-- Adds nullable customers.person_id FK to persons(id) + supporting index.
-- No NOT NULL, no UNIQUE, no backfill, no RLS/RBAC change, no data mutation.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS person_id uuid NULL REFERENCES public.persons(id);

CREATE INDEX IF NOT EXISTS customers_person_id_idx
  ON public.customers(person_id);

COMMENT ON COLUMN public.customers.person_id IS
  'Optional link to public.persons unified person record. Added for Phase 2 customer-person integration (S17). Nullable until controlled backfill/linking steps.';