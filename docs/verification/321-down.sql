SET client_encoding='UTF8';

-- Down script for migration 321 (UNIFY P1.4 — one Asan code per person).
--
-- 321 writes no data, so dropping the index restores the previous state
-- exactly. After this, a person can again hold several non-primary
-- asan_person_code rows and "which code is this person's?" has no single
-- answer.

DROP INDEX IF EXISTS public.uq_person_identifiers_asan_one_per_person;
