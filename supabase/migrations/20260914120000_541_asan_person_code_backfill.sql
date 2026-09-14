SET client_encoding = 'UTF8';

-- 541 -- Backfill asan_person_code identifiers from customers/suppliers.accounting_code.
--
-- WHY THIS MATTERS
--   asan_list_sales_export resolves a quote's person code ONLY from person_identifiers
--   (kind = 'asan_person_code'). The customer path has NO accounting_code fallback -- the
--   COALESCE(accounting_code, ...) in 367 exists on the supplier_payable branch of the journal
--   export only. A customer whose code lives solely in customers.accounting_code is therefore
--   blocked from the sales export outright, and this backfill is the only way those quotes export.
--
-- PREMISE, MEASURED ON A RESTORE OF PRODUCTION (post-release dump, ledger 696)
--   72 customer/supplier rows carry both a code and an Asan identifier; all agree after
--   normalize_identifier (0 mismatches). So the old accounting_code IS the Asan code.
--
-- WHAT IT DOES
--   For every person who has a non-empty (after btrim) accounting_code on customers or suppliers
--   and NO asan_person_code row of any status, insert one asan_person_code identifier.
--   Nothing is updated or deleted in person_identifiers. Existing rows are never touched.
--
-- STATUS = 'provisional'
--   These codes come from AfraKala's own column, not from the real Asan file. Importing the Asan
--   person file (asan_commit_person_batch) is what promotes a provisional code to 'confirmed'.
--
-- SOURCES = customers + suppliers ONLY
--   trg_person_identifiers_propagate_asan_code keeps customers.accounting_code and
--   suppliers.accounting_code in sync with the identifier. It does not touch external_parties,
--   so identifiers derived from external_parties would not be maintained by anything.
--
-- PER-PERSON REFUSAL (a skipped person is skipped silently in the data, loudly in the output)
--   Evaluated in this order; each person gets at most one reason:
--   1. non_numeric_code        -- a code normalize_identifier rejects (it RAISES in strict mode,
--                                 so one bad code would otherwise abort the whole migration).
--   2. conflicting_party_code  -- the person's customer/supplier rows carry more than one
--                                 distinct non-empty code (compared as trimmed TEXT: '002' and
--                                 '2' conflict here, because the propagate trigger would rewrite
--                                 one of them).
--   3. duplicate_code          -- the normalized code is already held by a DIFFERENT person,
--                                 either as a non-revoked asan_person_code identifier or as a
--                                 customer/supplier accounting_code. Compared on
--                                 normalize_identifier, because the unique index
--                                 uq_person_identifiers_asan_code_active is on value_normalized.
--                                 Both sides of a candidate-vs-candidate collision are skipped.
--
-- TRIGGER SIDE EFFECT, GUARDED
--   The propagate trigger writes the code into customers/suppliers rows of the SAME person where
--   the value differs. With the refusals above, that can only fill a NULL/blank code. This
--   migration snapshots every customers/suppliers accounting_code first and RAISES (rolling
--   everything back) if any non-empty value changed, or if any row outside the backfilled
--   persons changed at all.
--
-- IDEMPOTENT
--   A second run finds every backfilled person already holding a row and inserts nothing; the
--   summary audit row is written only when something was inserted.
--
-- APPLYING
--   psql direct application does not write the ledger: record 20260914120000 in
--   supabase_migrations.schema_migrations in the same breath (CLAUDE.md rule 2b).
--   This file is ASCII only and may be delivered by any route.

DO $mig$
DECLARE
  _planned        integer;
  _backfilled     integer;
  _skip_dup       integer;
  _skip_conflict  integer;
  _skip_nonnum    integer;
  _asan_before    integer;
  _asan_after     integer;
  _rewritten      integer;
  _outsiders      integer;
  _filled         integer;
  _ids            uuid[];
  _r              record;
  _shown          integer := 0;
BEGIN
  -- Staff may be working: never hang on a lock, and freeze the three tables for the few seconds
  -- between classification and insert so the plan cannot go stale.
  PERFORM set_config('lock_timeout', '10s', true);
  LOCK TABLE public.person_identifiers, public.customers, public.suppliers
    IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO _asan_before
    FROM public.person_identifiers WHERE kind = 'asan_person_code';

  -- Same-session re-run safety (ON COMMIT DROP already removes them at the end of a transaction).
  IF to_regclass('pg_temp._asan541_before') IS NOT NULL THEN DROP TABLE pg_temp._asan541_before; END IF;
  IF to_regclass('pg_temp._asan541_plan') IS NOT NULL THEN DROP TABLE pg_temp._asan541_plan; END IF;

  CREATE TEMP TABLE _asan541_before ON COMMIT DROP AS
    SELECT 'customers'::text AS src, id, person_id, accounting_code FROM public.customers
    UNION ALL
    SELECT 'suppliers'::text, id, person_id, accounting_code FROM public.suppliers;

  CREATE TEMP TABLE _asan541_plan ON COMMIT DROP AS
    WITH codes AS (
      SELECT b.person_id,
             btrim(b.accounting_code) AS code,
             public.normalize_identifier('asan_person_code', btrim(b.accounting_code), false) AS norm
        FROM _asan541_before b
       WHERE NULLIF(btrim(b.accounting_code), '') IS NOT NULL
    ),
    cand AS (
      SELECT c.person_id,
             count(DISTINCT c.code)  AS n_codes,
             min(c.code)             AS code,
             min(c.norm)             AS norm,
             bool_or(c.norm IS NULL) AS any_non_numeric
        FROM codes c
       WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                          WHERE pi.person_id = c.person_id
                            AND pi.kind = 'asan_person_code')
       GROUP BY c.person_id
    )
    SELECT cand.person_id, cand.code, cand.norm,
           CASE
             WHEN cand.any_non_numeric THEN 'non_numeric_code'
             WHEN cand.n_codes > 1     THEN 'conflicting_party_code'
             WHEN EXISTS (SELECT 1 FROM public.person_identifiers pi
                           WHERE pi.kind = 'asan_person_code'
                             AND pi.status <> 'revoked'
                             AND pi.value_normalized = cand.norm
                             AND pi.person_id <> cand.person_id)
               OR EXISTS (SELECT 1 FROM codes o
                           WHERE o.norm = cand.norm
                             AND o.person_id <> cand.person_id)
                                       THEN 'duplicate_code'
           END AS skip_reason,
           (SELECT string_agg(DISTINCT h.person_id::text, ',')
              FROM (SELECT pi.person_id FROM public.person_identifiers pi
                     WHERE pi.kind = 'asan_person_code' AND pi.status <> 'revoked'
                       AND pi.value_normalized = cand.norm AND pi.person_id <> cand.person_id
                    UNION
                    SELECT o.person_id FROM codes o
                     WHERE o.norm = cand.norm AND o.person_id <> cand.person_id) h) AS held_by
      FROM cand;

  SELECT count(*) FILTER (WHERE skip_reason IS NULL),
         count(*) FILTER (WHERE skip_reason = 'duplicate_code'),
         count(*) FILTER (WHERE skip_reason = 'conflicting_party_code'),
         count(*) FILTER (WHERE skip_reason = 'non_numeric_code')
    INTO _planned, _skip_dup, _skip_conflict, _skip_nonnum
    FROM _asan541_plan;

  WITH ins AS (
    INSERT INTO public.person_identifiers
           (person_id, kind, value_raw, value_normalized, status, is_primary)
    SELECT p.person_id, 'asan_person_code', p.code, p.norm, 'provisional', false
      FROM _asan541_plan p
     WHERE p.skip_reason IS NULL
    RETURNING id
  )
  SELECT count(*), array_agg(id) INTO _backfilled, _ids FROM ins;

  -- Guard 1: exactly the planned rows, and no pre-existing identifier disappeared.
  SELECT count(*) INTO _asan_after
    FROM public.person_identifiers WHERE kind = 'asan_person_code';
  IF _backfilled <> _planned OR _asan_after <> _asan_before + _backfilled THEN
    RAISE EXCEPTION '541: planned %, inserted %, asan rows before %, after %; aborting',
      _planned, _backfilled, _asan_before, _asan_after;
  END IF;

  -- Guard 2: the propagate trigger may only FILL an empty code, and only for a backfilled person.
  SELECT count(*) FILTER (WHERE NULLIF(btrim(b.accounting_code), '') IS NOT NULL),
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM _asan541_plan p
                                             WHERE p.person_id = b.person_id
                                               AND p.skip_reason IS NULL)),
         count(*)
    INTO _rewritten, _outsiders, _filled
    FROM _asan541_before b
    LEFT JOIN public.customers c ON b.src = 'customers' AND c.id = b.id
    LEFT JOIN public.suppliers s ON b.src = 'suppliers' AND s.id = b.id
   WHERE CASE b.src WHEN 'customers' THEN c.accounting_code ELSE s.accounting_code END
         IS DISTINCT FROM b.accounting_code;
  IF _rewritten > 0 OR _outsiders > 0 THEN
    RAISE EXCEPTION '541: % existing non-empty accounting_code value(s) changed and % row(s) of untouched persons changed; aborting, nothing written',
      _rewritten, _outsiders;
  END IF;

  RAISE NOTICE '541 asan_person_code backfill: persons backfilled = %', _backfilled;
  RAISE NOTICE '541 asan_person_code backfill: persons skipped, duplicate code = %', _skip_dup;
  RAISE NOTICE '541 asan_person_code backfill: persons skipped, conflicting party code = %', _skip_conflict;
  RAISE NOTICE '541 asan_person_code backfill: persons skipped, non-numeric code = %', _skip_nonnum;
  RAISE NOTICE '541 asan_person_code backfill: empty party codes filled by the propagate trigger = %', _filled;

  FOR _r IN
    SELECT person_id, skip_reason, code, held_by FROM _asan541_plan
     WHERE skip_reason IS NOT NULL ORDER BY skip_reason, norm, person_id
  LOOP
    _shown := _shown + 1;
    IF _shown > 500 THEN
      RAISE NOTICE '541 skipped: ... % more not listed (see the audit_logs row)',
        (_skip_dup + _skip_conflict + _skip_nonnum) - 500;
      EXIT;
    END IF;
    RAISE NOTICE '541 skipped person_id=% reason=% code=% held_by=%',
      _r.person_id, _r.skip_reason, _r.code, COALESCE(_r.held_by, '-');
  END LOOP;

  IF _backfilled > 0 THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    SELECT NULL, 'migration', '20260914120000_541', 'asan_person_code_backfill',
           jsonb_build_object(
             'backfilled', _backfilled,
             'skipped_duplicate_code', _skip_dup,
             'skipped_conflicting_party_code', _skip_conflict,
             'skipped_non_numeric_code', _skip_nonnum,
             'party_codes_filled', _filled,
             'inserted_identifier_ids', to_jsonb(_ids),
             'skipped', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                     'person_id', p.person_id, 'reason', p.skip_reason,
                                     'code', p.code, 'held_by', p.held_by)
                                   ORDER BY p.skip_reason, p.norm)
                                   FROM _asan541_plan p WHERE p.skip_reason IS NOT NULL),
                                 '[]'::jsonb));
  END IF;
END
$mig$;
