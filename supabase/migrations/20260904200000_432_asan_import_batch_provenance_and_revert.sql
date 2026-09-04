SET client_encoding = 'UTF8';

-- 432 — A-7. A committed import batch can be reverted, as far as it is safe to revert it.
--
-- THE DEFECT
--   `discard` only ever set `status = 'discarded'` (`_app.admin.asan-import.tsx:396-398`).
--   On a staged batch that is exactly right — nothing was written. On a COMMITTED batch it
--   was theatre: the persons, the customers mirrors and the identifiers all stayed, and the
--   batch that produced them started claiming it had been thrown away.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--   It does not delete persons. `persons` has no DELETE policy and 72 of 86 people are held
--   by a RESTRICT foreign key from `customers` alone; the owner limited deletion to the nine
--   safe persons and the delete path is owned elsewhere. A revert that removed people would
--   be a person-delete path wearing a different name, so the boundary is drawn here and
--   reported rather than crossed: the batch's ADDITIVE half is undone, and the persons it
--   created are counted and named as remaining work.
--
-- WHY PROVENANCE HAD TO BE ADDED FIRST
--   Nothing recorded which identifier came from which import. Correlating on
--   `created_at` against `committed_at` would guess, and a guess that revokes a phone number
--   the accountant typed by hand is worse than no revert at all. `source_batch_id` makes the
--   question answerable exactly. Rows written before this migration carry NULL and are
--   therefore never touched by a revert — a revert of an old batch honestly reports zero.
--
-- WHY `revoked` AND NOT `DELETE`
--   `person_identifiers.status = 'revoked'` is the schema's own reversible state. Every
--   uniqueness index is already `WHERE status <> 'revoked'`, so revoking frees the value for
--   re-import, and a mistaken revert is undone with an UPDATE rather than a re-entry.
--
-- THE FK GATE (CLAUDE.md rule 9)
--   `source_batch_id` references `asan_import_batches`, not `persons`, so the `person_merge`
--   registry set is unchanged. Verified before writing this file by running all four ALTERs
--   inside `BEGIN … ROLLBACK`: every one succeeded, the event trigger did not fire.

---------------------------------------------------------------------------------------
-- 1. Provenance.
---------------------------------------------------------------------------------------
ALTER TABLE public.person_identifiers
  ADD COLUMN IF NOT EXISTS source_batch_id uuid;

ALTER TABLE public.person_identifiers
  DROP CONSTRAINT IF EXISTS person_identifiers_source_batch_id_fkey;
ALTER TABLE public.person_identifiers
  ADD CONSTRAINT person_identifiers_source_batch_id_fkey
  FOREIGN KEY (source_batch_id) REFERENCES public.asan_import_batches(id) ON DELETE SET NULL;

-- Partial: only import-written rows carry a value, and only those are ever looked up by it.
CREATE INDEX IF NOT EXISTS idx_person_identifiers_source_batch
  ON public.person_identifiers (source_batch_id)
  WHERE source_batch_id IS NOT NULL;

COMMENT ON COLUMN public.person_identifiers.source_batch_id IS
  'The Asan import batch that wrote this identifier, or NULL when it was entered another way. Read by asan_revert_person_batch; NULL is never reverted (migration 432).';

ALTER TABLE public.asan_import_person_rows
  ADD COLUMN IF NOT EXISTS applied_action text;

ALTER TABLE public.asan_import_person_rows
  DROP CONSTRAINT IF EXISTS asan_import_person_rows_applied_action_check;
ALTER TABLE public.asan_import_person_rows
  ADD CONSTRAINT asan_import_person_rows_applied_action_check
  CHECK (applied_action IS NULL OR applied_action = ANY (ARRAY['created'::text, 'updated'::text]));

COMMENT ON COLUMN public.asan_import_person_rows.applied_action IS
  'Whether the commit created the person or updated an existing one. A revert must not revoke identifiers on a person the batch itself created, because that person cannot be removed (migration 432).';

---------------------------------------------------------------------------------------
-- 2. `reverted` is a status of its own — a reverted batch is not a discarded one.
---------------------------------------------------------------------------------------
ALTER TABLE public.asan_import_batches DROP CONSTRAINT asan_import_batches_status_check;
ALTER TABLE public.asan_import_batches
  ADD CONSTRAINT asan_import_batches_status_check
  CHECK (status = ANY (ARRAY['staged'::text, 'committed'::text, 'discarded'::text, 'reverted'::text]));

---------------------------------------------------------------------------------------
-- 3. Commit — records what it did. Everything else is migration 430 verbatim.
---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asan_commit_person_batch(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r          record;
  _code       text;
  _mob        text;
  _land       text;
  _nid        text;
  _pid        uuid;
  _reject     text;
  _is_new     boolean;
  _created    integer := 0;
  _updated    integer := 0;
  _skipped    integer := 0;
  _rejected   integer := 0;
  _reasons    jsonb   := '[]'::jsonb;
  _summary    text;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.asan_import_batches
                  WHERE id = p_batch_id AND status = 'staged') THEN
    RAISE EXCEPTION 'این دسته در وضعیت قابل ثبت نیست' USING ERRCODE = '22023';
  END IF;

  FOR _r IN
    SELECT * FROM public.asan_import_person_rows
     WHERE batch_id = p_batch_id
       AND classification IN ('new', 'update')
       AND decision = 'accept'
     ORDER BY row_number
  LOOP
    _code := public.normalize_identifier('asan_person_code', coalesce(_r.asan_code, ''), false);
    _mob  := public.normalize_identifier('mobile_e164', coalesce(_r.mobile_raw, ''), false);
    _land := public.normalize_identifier('landline', coalesce(_r.landline_raw, ''), false);
    _nid  := public.normalize_identifier('national_id_ir', coalesce(_r.national_id_raw, ''), false);

    -- 430 — re-resolve identity HERE, not from the classification snapshot.
    _pid := _r.matched_person_id;
    IF _pid IS NULL AND _code IS NOT NULL THEN
      SELECT pi.person_id INTO _pid FROM public.person_identifiers pi
       WHERE pi.kind = 'asan_person_code' AND pi.value_normalized = _code
         AND pi.status <> 'revoked' LIMIT 1;
    END IF;
    IF _pid IS NULL AND _mob IS NOT NULL THEN
      SELECT pi.person_id INTO _pid FROM public.person_identifiers pi
       WHERE pi.kind = 'mobile_e164' AND pi.value_normalized = _mob
         AND pi.status <> 'revoked' LIMIT 1;
    END IF;

    -- An `update` row whose match has since disappeared is skipped rather than turned into
    -- a new person. Unchanged behaviour, moved below the re-resolution so a row that can
    -- still be found by its identifiers is not lost.
    IF _r.classification = 'update' AND _pid IS NULL THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    -- 430 — A-1 / A-2. Refused rows are COUNTED and NAMED, never silently dropped.
    _reject := public.asan_person_import_rejection(_r.asan_code, _r.mobile_raw, _pid, _r.row_number);
    IF _reject IS NOT NULL THEN
      _rejected := _rejected + 1;
      _skipped  := _skipped + 1;
      -- Bounded: a 488-row file of nothing but bad rows must not push a megabyte of text
      -- into `stats`. The count is always exact; the list is the first 200 reasons.
      IF _rejected <= 200 THEN
        _reasons := _reasons || to_jsonb(_reject);
      END IF;
      UPDATE public.asan_import_person_rows
         SET apply_note = _reject
       WHERE id = _r.id;
      CONTINUE;
    END IF;

    _is_new := _pid IS NULL;

    IF _is_new THEN
      INSERT INTO public.persons (kind, display_name, notes)
      VALUES ('individual', btrim(_r.display_name), NULLIF(btrim(coalesce(_r.address, '')), ''))
      RETURNING id INTO _pid;
      _created := _created + 1;
    ELSE
      -- Never overwrite a non-empty AfraKala value: the owner's data is often more current
      -- than Asan's. Only a NULL/blank field is filled in.
      UPDATE public.persons
         SET notes = coalesce(NULLIF(btrim(coalesce(notes, '')), ''), NULLIF(btrim(coalesce(_r.address, '')), ''))
       WHERE id = _pid;
      _updated := _updated + 1;
    END IF;

    -- 414 — the Asan import path must produce customers too. This function keeps its
    -- SECURITY DEFINER + admin/accountant gate deliberately: routing it through
    -- person_create_inline would turn it INVOKER and put RLS on a path that does not
    -- have it today. That is a security change; it is not this migration's job.
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE person_id = _pid) THEN
      INSERT INTO public.customers (name, phone, person_id)
      VALUES (btrim(_r.display_name),
              NULLIF(btrim(coalesce(_r.mobile_raw, '')), ''),
              _pid);
    END IF;

    -- identifiers are additive and idempotent: a value already present is left alone.
    -- 432 — each one records the batch that wrote it, so a revert can undo exactly this
    -- import and nothing else. A value that already existed gets no provenance, because
    -- this import did not create it and must not be allowed to revoke it.
    IF _code IS NOT NULL THEN
      INSERT INTO public.person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary, source_batch_id)
      SELECT _pid, 'asan_person_code', _code, _code, 'confirmed', false, p_batch_id
       WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                          WHERE pi.kind = 'asan_person_code' AND pi.value_normalized = _code
                            AND pi.status <> 'revoked');
      -- an import against the real Asan file is what promotes a provisional code
      UPDATE public.person_identifiers
         SET status = 'confirmed', verified_at = now(), verified_by = auth.uid()
       WHERE kind = 'asan_person_code' AND value_normalized = _code AND status = 'provisional';
    END IF;

    IF _mob IS NOT NULL THEN
      INSERT INTO public.person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary, source_batch_id)
      SELECT _pid, 'mobile_e164', _r.mobile_raw, _mob, 'provisional', false, p_batch_id
       WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                          WHERE pi.kind = 'mobile_e164' AND pi.value_normalized = _mob
                            AND pi.status <> 'revoked');
    END IF;

    IF _land IS NOT NULL THEN
      INSERT INTO public.person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary, source_batch_id)
      SELECT _pid, 'landline', _r.landline_raw, _land, 'provisional', false, p_batch_id
       WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                          WHERE pi.person_id = _pid AND pi.kind = 'landline'
                            AND pi.value_normalized = _land AND pi.status <> 'revoked');
    END IF;

    IF _nid IS NOT NULL THEN
      INSERT INTO public.person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary, source_batch_id)
      SELECT _pid, 'national_id_ir', _r.national_id_raw, _nid, 'provisional', false, p_batch_id
       WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                          WHERE pi.kind = 'national_id_ir' AND pi.value_normalized = _nid
                            AND pi.status <> 'revoked');
    END IF;

    -- Record which person this row produced, and whether it made them. For a `new` row the
    -- person id is the only trace linking the staged line to what it created, and the action
    -- is what tells a revert which half of the batch it may safely undo.
    UPDATE public.asan_import_person_rows
       SET applied_at = now(), classification = 'unchanged', matched_person_id = _pid,
           apply_note = NULL,
           applied_action = CASE WHEN _is_new THEN 'created' ELSE 'updated' END
     WHERE id = _r.id;
  END LOOP;

  IF _rejected > 0 THEN
    _summary := format('%s ردیف به دلیل نداشتن کد آسان یا شماره موبایل وارد نشد.', _rejected);
  END IF;

  UPDATE public.asan_import_batches
     SET status = 'committed', committed_at = now(), committed_by = auth.uid(),
         stats = stats || jsonb_build_object('created', _created, 'updated', _updated,
                                             'skipped', _skipped, 'rejected', _rejected,
                                             'rejections', _reasons, 'summary', _summary)
   WHERE id = p_batch_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'asan_import', p_batch_id::text, 'asan_persons_imported',
          jsonb_build_object('created', _created, 'updated', _updated, 'skipped', _skipped,
                             'rejected', _rejected));

  RETURN jsonb_build_object('created', _created, 'updated', _updated, 'skipped', _skipped,
                            'rejected', _rejected, 'rejections', _reasons,
                            'summary', _summary);
END;
$function$;

---------------------------------------------------------------------------------------
-- 4. The revert.
---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asan_revert_person_batch(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _revoked   integer := 0;
  _remaining integer := 0;
  _mirrors   integer := 0;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- A staged batch is thrown away with `discard`; that path is unchanged and still correct,
  -- because a staged batch has written nothing. Only a committed one is reverted.
  IF NOT EXISTS (SELECT 1 FROM public.asan_import_batches
                  WHERE id = p_batch_id AND kind = 'persons' AND status = 'committed') THEN
    RAISE EXCEPTION 'فقط دستهٔ «اشخاص» که ثبت نهایی شده است بازگردانده می‌شود' USING ERRCODE = '22023';
  END IF;

  -- Undo the additive half: every identifier this batch wrote onto a person that already
  -- existed. Identifiers on a person the batch CREATED are left in place — that person
  -- cannot be removed here, and stripping their Asan code would leave exactly the
  -- unusable record migration 430 exists to prevent.
  UPDATE public.person_identifiers pi
     SET status = 'revoked', updated_at = now()
   WHERE pi.source_batch_id = p_batch_id
     AND pi.status <> 'revoked'
     AND NOT EXISTS (
       SELECT 1 FROM public.asan_import_person_rows r
        WHERE r.batch_id = p_batch_id
          AND r.applied_action = 'created'
          AND r.matched_person_id = pi.person_id);
  GET DIAGNOSTICS _revoked = ROW_COUNT;

  -- What a revert cannot reach, counted rather than hidden.
  SELECT count(*) INTO _remaining
    FROM public.asan_import_person_rows r
    JOIN public.persons p ON p.id = r.matched_person_id
   WHERE r.batch_id = p_batch_id AND r.applied_action = 'created';

  SELECT count(*) INTO _mirrors
    FROM public.asan_import_person_rows r
    JOIN public.customers c ON c.person_id = r.matched_person_id
   WHERE r.batch_id = p_batch_id AND r.applied_action = 'created';

  UPDATE public.asan_import_batches
     SET status = 'reverted',
         stats = stats || jsonb_build_object(
                   'revoked_identifiers', _revoked,
                   'persons_created_remaining', _remaining,
                   'customers_created_remaining', _mirrors)
   WHERE id = p_batch_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'asan_import', p_batch_id::text, 'asan_persons_import_reverted',
          jsonb_build_object('revoked_identifiers', _revoked,
                             'persons_created_remaining', _remaining,
                             'customers_created_remaining', _mirrors));

  RETURN jsonb_build_object('revoked_identifiers', _revoked,
                            'persons_created_remaining', _remaining,
                            'customers_created_remaining', _mirrors);
END;
$function$;

COMMENT ON FUNCTION public.asan_revert_person_batch(uuid) IS
  'Undoes the reversible half of a committed Asan person import: identifiers this batch wrote onto people who already existed are revoked, the batch becomes `reverted`, and the persons it created are counted and returned as remaining work. It never deletes a person (migration 432).';
