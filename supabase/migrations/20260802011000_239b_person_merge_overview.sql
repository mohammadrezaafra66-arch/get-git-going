SET client_encoding='UTF8';

-- =============================================================================
-- 239b — Phase 8.1: evidence feed for the merge review page
-- =============================================================================
--
-- WHY A SEPARATE MIGRATION
--   239 was already applied when the review UI was built. Rule 6 forbids
--   editing an applied migration, so the read-side function lands in its own
--   file. It is part of checkpoint 8.1 and is committed with it.
--
-- WHY AN RPC INSTEAD OF CLIENT-SIDE QUERIES
--   The reviewer has to decide which of two people is real. That decision needs
--   both sides' identifiers, aliases, contexts, legacy-row ownership AND how
--   many business rows point at each of them. Assembling that from PostgREST
--   would be roughly 20 queries per person per pair. Worse, the useful signal —
--   "this side has 47 transactions, that side has 0" — spans tables whose
--   SELECT policies deliberately hide rows from most roles, so a client-side
--   count would under-report and could talk a reviewer into deleting the wrong
--   identity.
--
--   The reference count is derived from pg_constraint at runtime, exactly like
--   person_merge's work list, so a person FK added by a later phase is counted
--   automatically instead of being silently missed.
--
-- SECURITY
--   SECURITY DEFINER, gated to admin/manager — the same audience as
--   person_merge itself. It returns only counts and identity attributes, never
--   amounts, prices or balances.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.person_merge_candidates_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _uid    uuid := auth.uid();
  _out    jsonb := '[]'::jsonb;
  _cand   record;
  _a      jsonb;
  _b      jsonb;
  _block  text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'مشاهدهٔ صف ادغام فقط برای مدیر سیستم یا مدیر مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  FOR _cand IN
    SELECT c.id, c.person_id_a, c.person_id_b, c.reason, c.detail, c.created_at
    FROM public.person_merge_candidates c
    JOIN public.persons pa ON pa.id = c.person_id_a
    JOIN public.persons pb ON pb.id = c.person_id_b
    WHERE c.status = 'pending'
      -- A pair whose side was already merged away is not reviewable.
      AND pa.is_active AND pb.is_active
    ORDER BY c.created_at
  LOOP
    _a := public._person_merge_side(_cand.person_id_a);
    _b := public._person_merge_side(_cand.person_id_b);

    _block := NULL;
    IF (_a->>'has_customer')::boolean AND (_b->>'has_customer')::boolean THEN
      _block := 'both_customer';
    ELSIF (_a->>'has_supplier')::boolean AND (_b->>'has_supplier')::boolean THEN
      _block := 'both_supplier';
    END IF;

    _out := _out || jsonb_build_object(
      'candidate_id',   _cand.id,
      'reason',         _cand.reason,
      'detail',         _cand.detail,
      'created_at',     _cand.created_at,
      'a',              _a,
      'b',              _b,
      'blocked_reason', _block
    );
  END LOOP;

  RETURN _out;
END;
$function$;

COMMENT ON FUNCTION public.person_merge_candidates_overview() IS
  'Phase 8.1 (239b). Returns every pending person_merge_candidates pair with both sides'' identity evidence and reference counts, plus blocked_reason when guard #7 of person_merge would refuse the pair. Read-only. Admin/manager only.';

REVOKE ALL ON FUNCTION public.person_merge_candidates_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_merge_candidates_overview() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Per-person evidence bundle. Split out so the merge page and any future
-- person-detail view share one definition of "what we know about this person".
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._person_merge_side(p_person_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _p    public.persons%ROWTYPE;
  _refs bigint := 0;
  _n    bigint;
  _r    record;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _p FROM public.persons WHERE id = p_person_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Business references: every FK to persons except the identity-core tables
  -- (person_*) and the three legacy mirrors, which are reported as ownership
  -- flags instead of being double-counted here.
  FOR _r IN
    SELECT con.conrelid::regclass::text AS tbl, att.attname::text AS col
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid
                         AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.persons'::regclass
      AND con.conrelid::regclass::text NOT LIKE 'person\_%'
      AND con.conrelid::regclass::text NOT IN ('customers','suppliers','external_parties')
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE %I = $1', _r.tbl, _r.col)
      INTO _n USING p_person_id;
    _refs := _refs + _n;
  END LOOP;

  RETURN jsonb_build_object(
    'id',                 _p.id,
    'display_name',       _p.display_name,
    'legal_name',         _p.legal_name,
    'kind',               _p.kind,
    'is_active',          _p.is_active,
    'notes',              _p.notes,
    'created_at',         _p.created_at,
    'has_customer',       EXISTS (SELECT 1 FROM public.customers        WHERE person_id = p_person_id),
    'has_supplier',       EXISTS (SELECT 1 FROM public.suppliers        WHERE person_id = p_person_id),
    'has_external_party', EXISTS (SELECT 1 FROM public.external_parties WHERE person_id = p_person_id),
    'reference_count',    _refs,
    'identifiers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'kind', i.kind, 'value_raw', i.value_raw,
               'value_normalized', i.value_normalized,
               'status', i.status, 'is_primary', i.is_primary) ORDER BY i.kind, i.value_normalized)
      FROM public.person_identifiers i WHERE i.person_id = p_person_id), '[]'::jsonb),
    'aliases', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('alias', a.alias, 'alias_kind', a.alias_kind) ORDER BY a.alias)
      FROM public.person_aliases a WHERE a.person_id = p_person_id), '[]'::jsonb),
    'contexts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'context_kind', l.context_kind, 'ref_table', l.ref_table,
               'ref_id', l.ref_id, 'ended_at', l.ended_at) ORDER BY l.context_kind)
      FROM public.person_context_links l WHERE l.person_id = p_person_id), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public._person_merge_side(uuid) IS
  'Phase 8.1 (239b). Identity evidence bundle for one person: attributes, identifiers, aliases, context links, legacy-row ownership flags and a catalog-derived count of business rows referencing them. Read-only, admin/manager only.';

REVOKE ALL ON FUNCTION public._person_merge_side(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._person_merge_side(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
