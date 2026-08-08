SET client_encoding='UTF8';

-- ---------------------------------------------------------------------------
-- UNIFY P1.4 — one Asan code per person.
--
-- What was already guaranteed, and what was not
--   uq_person_identifiers_asan_code_active  (kind, value_normalized)
--       → two PEOPLE cannot share one code.
--   uq_person_identifiers_primary_active    (person_id, kind) WHERE is_primary
--       → one person has at most one PRIMARY code.
--
--   Neither says a person has at most one code. A person could hold any number
--   of non-primary asan_person_code rows, and one live row is already
--   non-primary (person 190eeb0b, code '002'). Since the Asan export reads the
--   identifier rather than the mirror column, "which code is this person's?"
--   had no single answer. This index gives it one.
--
-- Scope note
--   Revoked codes are excluded, so a person whose code was withdrawn can be
--   given a new one — the same convention every other partial index on this
--   table already uses.
--
-- Mirror consistency was checked, not assumed
--   Every customers/suppliers.accounting_code was compared against the
--   identifier on 2026-08-08: zero disagreements against value_raw, which is
--   the column migrations 309/310 propagate. (A naive comparison against
--   value_normalized appears to show one mismatch — code '002' normalises to
--   '2' — but that is the normaliser working, not drift.) No repair needed, so
--   this migration writes no data.
-- ---------------------------------------------------------------------------

-- Fail loudly and early rather than leaving the operator to decode a raw
-- unique-violation from CREATE INDEX.
DO $guard$
DECLARE
  _dupes int;
BEGIN
  SELECT count(*) INTO _dupes
  FROM (
    SELECT person_id
    FROM public.person_identifiers
    WHERE kind = 'asan_person_code'
      AND status <> 'revoked'
    GROUP BY person_id
    HAVING count(*) > 1
  ) d;

  IF _dupes > 0 THEN
    RAISE EXCEPTION
      'P1.4 cannot proceed: % person(s) hold more than one active Asan code. Resolve them before adding the index.',
      _dupes;
  END IF;
END;
$guard$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_asan_one_per_person
  ON public.person_identifiers (person_id)
  WHERE (kind = 'asan_person_code' AND status <> 'revoked');

COMMENT ON INDEX public.uq_person_identifiers_asan_one_per_person IS
  'UNIFY P1.4 (migration 321): a person has at most one active Asan code. Complements uq_person_identifiers_asan_code_active, which stops two people sharing one code.';
