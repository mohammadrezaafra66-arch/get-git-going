SET client_encoding='UTF8';

-- ============================================================================
-- 497 - call_logs grows the four columns a CDR import needs, and gains the UNIQUE
--       index that makes that import idempotent.
-- ============================================================================
--
-- THIS FILE IS DELIBERATELY PERSIAN-FREE. It adds no user-facing message.
--
-- THE COLUMN NAMES BELOW ARE A CONTRACT
-- -------------------------------------
-- Wave 6 CONTRACTS.md section 3 fixes them: `extension text`, `is_missed boolean`,
-- `is_internal boolean`, `disposition text`, and `direction`'s CHECK gains 'internal'.
-- C-4 (the importer) writes exactly these names and C-8 (the reporting view) reads
-- exactly these names. Neither is built yet - both are blocked on an Issabel MySQL
-- read-only user that does not exist. The columns land first, on purpose, so the
-- contract exists before anything can import against it.
--
-- WHY `direction` HAS TO CHANGE AT ALL
-- ------------------------------------
-- Measured live before this migration:
--
--   call_logs_direction_check :: CHECK ((direction = ANY (ARRAY['inbound'::text,
--                                                              'outbound'::text])))
--
-- Two values. A call from extension 201 to extension 205 is neither. So the database
-- as it stands does not merely fail to LABEL internal calls - it REJECTS them outright,
-- with a check violation, at insert time. Any importer that met one would fail its whole
-- batch. The constraint is dropped and recreated under the same name with the third
-- value added. call_logs holds 0 rows, so the revalidation is empty and instant.
--
-- HAZARD H.c - THE EXISTING INDEX IS NOT UNIQUE
-- ---------------------------------------------
-- Prior art recorded it as unique. It is not. Measured:
--
--   CREATE INDEX idx_call_logs_external ON public.call_logs USING btree (external_id)
--     WHERE (external_id IS NOT NULL)
--
-- CREATE INDEX, not CREATE UNIQUE INDEX. Nothing stops the same call detail record from
-- being inserted twice, so re-running an importer over an overlapping time window would
-- duplicate every row in it. That guarantee has to exist BEFORE any importer can run,
-- which is why it is added here in C-2 rather than in C-4 where it is needed.
--
-- The replacement mirrors the original's shape exactly and for the original's reason:
-- external_id is NULLABLE, because a call logged by hand through the UI has no external
-- identifier at all. A plain UNIQUE constraint would be wrong twice over - it would
-- demand a NOT NULL column, and (in Postgres) multiple NULLs do not collide anyway, so
-- the partial predicate is what actually documents the intent: uniqueness applies to
-- rows that HAVE an external id, and hand-logged rows are unconstrained.
--
-- The old non-unique index is then dropped. It is not "an index we lose": its definition
-- is character-for-character the leading columns and predicate of the new one, so the new
-- index serves every lookup the old one served. Keeping both would cost a second write on
-- every insert and leave two objects claiming the same job, one of which does not do it.
-- No DROP TABLE, no TRUNCATE, no DELETE - CLAUDE.md rule 3 governs data, and no row is
-- touched by this migration. Restoring it is one statement in docs/verification/497-down.sql.
--
-- WHAT external_id MUST CONTAIN - A NOTE FOR C-4
-- ----------------------------------------------
-- The unique index is on external_id ALONE, so external_id has to be unique across every
-- source that will ever write it, not just within one PBX's CDR table. Asterisk's
-- `uniqueid` is unique within one installation but carries no source marker, and a second
-- PBX (or a re-numbered one) could collide. C-4 must therefore write a NAMESPACED key -
-- 'issabel:' || cdr.uniqueid - rather than the bare uniqueid. This is recorded here
-- because the index is what enforces it, and because the real CDR column names remain
-- UNVERIFIED: no row of asteriskcdrdb has been read, and none will be until the owner
-- creates the read-only MySQL user.
--
-- WHY THE TWO BOOLEANS ARE NULLABLE WITH NO DEFAULT
-- -------------------------------------------------
-- `DEFAULT false` would be a fabricated fact. call_logs.source already defaults to
-- 'manual', and a call typed in by a person genuinely does not record whether it was
-- missed or internal. NULL means "not known", which is true, rather than "not missed",
-- which would be an assertion nobody made. An importer always writes an explicit boolean
-- derived from the CDR, so NULL will only ever mean a hand-logged row.
--
-- Consumers must therefore write `is_missed IS TRUE` / `COALESCE(is_missed, false)` and
-- never a bare `NOT is_missed`, which is NULL - not TRUE - for an unknown row. C-8's view
-- reads these columns and this is the rule it follows.
--
-- metadata jsonb is untouched and stays where everything else from a CDR goes.
--
-- Nothing existing is altered beyond the one CHECK constraint named above. No data is
-- read, written or deleted. anon receives nothing new - it holds no privilege on
-- call_logs today and adding a column grants none.
--
-- Rollback: docs/verification/497-down.sql
-- ============================================================================

SET lock_timeout = '60s';


-- ----------------------------------------------------------------------------
-- 1. The four new columns. All nullable: every one of them is unknown for a call
--    that was logged by hand, which is the only kind of row that can exist today.
-- ----------------------------------------------------------------------------
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS extension   text;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS is_missed   boolean;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS is_internal boolean;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS disposition text;

COMMENT ON COLUMN public.call_logs.extension IS
  'The PBX extension this call was handled on, as plain text (leading zeros are '
  'significant, so never numeric). Joins to call_log_extensions.extension to reach the '
  'employee. NULL for a hand-logged call. Migration 497.';

COMMENT ON COLUMN public.call_logs.is_missed IS
  'TRUE if the call was not answered. NULL means NOT KNOWN, not "answered" -- read it as '
  '`is_missed IS TRUE`, never as `NOT is_missed`. Migration 497.';

COMMENT ON COLUMN public.call_logs.is_internal IS
  'TRUE for extension-to-extension calls that never left the PBX. NULL means NOT KNOWN. '
  'A number that fails mobile normalisation and is 3-4 digits is the cheap discriminator '
  '(normalize_identifier(''mobile_e164'', ''201'', false) returns empty). Migration 497.';

COMMENT ON COLUMN public.call_logs.disposition IS
  'The PBX''s own outcome string for the call, stored verbatim and NOT constrained to a '
  'list: the real vocabulary of this Issabel installation is UNVERIFIED, because no row '
  'of asteriskcdrdb has been read. Constraining it to a guessed list would reject real '
  'calls. Migration 497.';


-- ----------------------------------------------------------------------------
-- 2. direction gains 'internal'. Same constraint name, three values instead of two.
-- ----------------------------------------------------------------------------
ALTER TABLE public.call_logs DROP CONSTRAINT IF EXISTS call_logs_direction_check;
ALTER TABLE public.call_logs ADD CONSTRAINT call_logs_direction_check
  CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text, 'internal'::text]));


-- ----------------------------------------------------------------------------
-- 3. Idempotency. The UNIQUE index that H.c showed does not exist yet.
--    Created BEFORE the old one is dropped, so there is no window in which
--    external_id has no index at all.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS call_logs_external_id_unique_idx
  ON public.call_logs (external_id)
  WHERE external_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_call_logs_external;


-- ----------------------------------------------------------------------------
-- 4. One supporting index. The extension -> employee join in C-3's mapping and every
--    per-extension report reads this column; rule 11 wants the index to exist before
--    the queries do. Partial for the same reason as above: hand-logged rows have none.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_call_logs_extension
  ON public.call_logs (extension)
  WHERE extension IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 5. Assertions.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  _cols   int;
  _chk    text;
  _uniq   boolean;
  _anon   text;
BEGIN
  -- 5a. All four contracted columns exist, with the contracted types.
  SELECT count(*) INTO _cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'call_logs'
     AND (column_name, data_type) IN (
           ('extension',   'text'),
           ('is_missed',   'boolean'),
           ('is_internal', 'boolean'),
           ('disposition', 'text'));
  IF _cols <> 4 THEN
    RAISE EXCEPTION '497: expected 4 contracted columns on call_logs, found %', _cols;
  END IF;

  -- 5b. direction now accepts exactly the three values, and still rejects anything else.
  SELECT pg_get_constraintdef(oid) INTO _chk
    FROM pg_constraint
   WHERE conrelid = 'public.call_logs'::regclass AND conname = 'call_logs_direction_check';
  IF _chk IS NULL THEN
    RAISE EXCEPTION '497: call_logs_direction_check is missing';
  END IF;
  IF _chk NOT LIKE '%internal%' OR _chk NOT LIKE '%inbound%' OR _chk NOT LIKE '%outbound%' THEN
    RAISE EXCEPTION '497: direction CHECK does not carry all three values: %', _chk;
  END IF;

  -- 5c. The external id index is UNIQUE now -- the whole point of H.c.
  SELECT i.indisunique INTO _uniq
    FROM pg_class c
    JOIN pg_index i ON i.indexrelid = c.oid
   WHERE c.relname = 'call_logs_external_id_unique_idx';
  IF _uniq IS NULL THEN
    RAISE EXCEPTION '497: call_logs_external_id_unique_idx was not created';
  END IF;
  IF NOT _uniq THEN
    RAISE EXCEPTION '497: call_logs_external_id_unique_idx exists but is NOT unique';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_call_logs_external') THEN
    RAISE EXCEPTION '497: the old non-unique idx_call_logs_external is still present';
  END IF;

  -- 5d. anon still holds nothing on call_logs.
  SELECT string_agg(p, ', ') INTO _anon
    FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                      'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
   WHERE has_table_privilege('anon', 'public.call_logs', p);
  IF _anon IS NOT NULL THEN
    RAISE EXCEPTION '497: anon holds % on call_logs', _anon;
  END IF;

  -- 5e. RLS is still on and still has its four policies -- adding columns must not have
  --     disturbed them.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.call_logs'::regclass) THEN
    RAISE EXCEPTION '497: row level security is not enabled on call_logs';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.call_logs'::regclass) <> 4 THEN
    RAISE EXCEPTION '497: expected exactly 4 policies on call_logs';
  END IF;

  RAISE NOTICE '497 OK: four CDR columns added, direction accepts internal, external_id is UNIQUE';
END
$do$;
