SET client_encoding='UTF8';

-- =====================================================================
-- 298 — search_visible_persons: RLS-safe person directory search
--
-- Audit: docs/verification/person-search-phase2-audit.md
-- Down:   docs/verification/298-down.sql
--
-- SECURITY INVOKER by design: FROM persons inherits can_read_person_scoped;
-- EXISTS into person_identifiers / person_aliases inherits their RLS
-- (including viewer_restricted on identifiers from migration 281).
-- Do NOT switch this to SECURITY DEFINER without re-auditing viewer leaks.
-- =====================================================================

-- Strengthen aliases SELECT to the same predicate identifiers use (264).
-- Previous policy only EXISTS-checked persons (RLS-filtered under INVOKER but
-- weaker wording). Strengthening only — no broader access.
DROP POLICY IF EXISTS person_aliases_select_via_person ON public.person_aliases;
CREATE POLICY person_aliases_select_via_person
  ON public.person_aliases
  FOR SELECT
  TO authenticated
  USING (public.can_read_person(person_id));

CREATE OR REPLACE FUNCTION public.search_visible_persons(
  p_query  text DEFAULT NULL,
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_kind   text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  kind text,
  display_name text,
  legal_name text,
  visibility_scope text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  matched_by text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  _raw     text;
  _term    text;
  _escaped text;
  _like_contains text;
  _like_prefix   text;
  _mobile  text;
  _nid     text;
  _asan    text;
  _limit   integer;
  _offset  integer;
  _kind    text;
BEGIN
  _limit  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  _offset := GREATEST(COALESCE(p_offset, 0), 0);
  _kind   := NULLIF(btrim(COALESCE(p_kind, '')), '');
  IF _kind IS NOT NULL AND _kind NOT IN ('individual', 'organization') THEN
    _kind := NULL;
  END IF;

  _raw := left(btrim(COALESCE(p_query, '')), 80);

  -- Preserve list UX: short/empty query → paginated visible directory.
  IF char_length(_raw) < 2 THEN
    RETURN QUERY
    WITH base AS (
      SELECT
        p.id,
        p.kind,
        p.display_name,
        p.legal_name,
        p.visibility_scope,
        p.is_active,
        p.created_at,
        p.updated_at,
        NULL::text AS matched_by,
        count(*) OVER() AS total_count
      FROM public.persons p
      WHERE (_kind IS NULL OR p.kind = _kind)
      ORDER BY p.created_at DESC, p.id
    )
    SELECT
      b.id, b.kind, b.display_name, b.legal_name, b.visibility_scope,
      b.is_active, b.created_at, b.updated_at, b.matched_by, b.total_count
    FROM base b
    LIMIT _limit OFFSET _offset;
    RETURN;
  END IF;

  -- Normalize first, then escape ILIKE metacharacters on the normalized term.
  _term := COALESCE(public.normalize_fa_text(_raw), '');
  _escaped := replace(replace(replace(_term, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  _like_contains := '%' || _escaped || '%';
  _like_prefix   := _escaped || '%';

  _mobile := public.normalize_identifier('mobile_e164', _raw, false);
  _nid    := public.normalize_identifier('national_id_ir', _raw, false);
  _asan   := public.normalize_identifier('asan_person_code', _raw, false);

  RETURN QUERY
  WITH scored AS (
    SELECT
      p.id,
      p.kind,
      p.display_name,
      p.legal_name,
      p.visibility_scope,
      p.is_active,
      p.created_at,
      p.updated_at,
      CASE
        WHEN _mobile IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.person_identifiers pi
           WHERE pi.person_id = p.id
             AND pi.kind = 'mobile_e164'
             AND pi.status <> 'revoked'
             AND pi.value_normalized = _mobile
        ) THEN 'mobile'
        WHEN _nid IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.person_identifiers pi
           WHERE pi.person_id = p.id
             AND pi.kind = 'national_id_ir'
             AND pi.status <> 'revoked'
             AND pi.value_normalized = _nid
        ) THEN 'national_id'
        WHEN _asan IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.person_identifiers pi
           WHERE pi.person_id = p.id
             AND pi.kind = 'asan_person_code'
             AND pi.status <> 'revoked'
             AND pi.value_normalized = _asan
        ) THEN 'asan_code'
        WHEN _term <> '' AND (
             public.normalize_fa_text(p.display_name) = _term
          OR (p.legal_name IS NOT NULL AND public.normalize_fa_text(p.legal_name) = _term)
          OR EXISTS (
               SELECT 1 FROM public.person_aliases pa
                WHERE pa.person_id = p.id
                  AND pa.alias_normalized = _term
             )
        ) THEN CASE
          WHEN public.normalize_fa_text(p.display_name) = _term
            OR (p.legal_name IS NOT NULL AND public.normalize_fa_text(p.legal_name) = _term)
            THEN 'name'
          ELSE 'alias'
        END
        WHEN _term <> '' AND (
             public.normalize_fa_text(p.display_name) ILIKE _like_prefix ESCAPE '\'
          OR (p.legal_name IS NOT NULL
              AND public.normalize_fa_text(p.legal_name) ILIKE _like_prefix ESCAPE '\')
          OR EXISTS (
               SELECT 1 FROM public.person_aliases pa
                WHERE pa.person_id = p.id
                  AND pa.alias_normalized ILIKE _like_prefix ESCAPE '\'
             )
        ) THEN CASE
          WHEN public.normalize_fa_text(p.display_name) ILIKE _like_prefix ESCAPE '\'
            OR (p.legal_name IS NOT NULL
                AND public.normalize_fa_text(p.legal_name) ILIKE _like_prefix ESCAPE '\')
            THEN 'name'
          ELSE 'alias'
        END
        WHEN _term <> '' AND (
             public.normalize_fa_text(p.display_name) ILIKE _like_contains ESCAPE '\'
          OR (p.legal_name IS NOT NULL
              AND public.normalize_fa_text(p.legal_name) ILIKE _like_contains ESCAPE '\')
          OR EXISTS (
               SELECT 1 FROM public.person_aliases pa
                WHERE pa.person_id = p.id
                  AND pa.alias_normalized ILIKE _like_contains ESCAPE '\'
             )
        ) THEN CASE
          WHEN public.normalize_fa_text(p.display_name) ILIKE _like_contains ESCAPE '\'
            OR (p.legal_name IS NOT NULL
                AND public.normalize_fa_text(p.legal_name) ILIKE _like_contains ESCAPE '\')
            THEN 'name'
          ELSE 'alias'
        END
        ELSE NULL
      END AS matched_by,
      CASE
        WHEN _mobile IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.person_identifiers pi
           WHERE pi.person_id = p.id
             AND pi.kind = 'mobile_e164'
             AND pi.status <> 'revoked'
             AND pi.value_normalized = _mobile
        ) THEN 1
        WHEN _nid IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.person_identifiers pi
           WHERE pi.person_id = p.id
             AND pi.kind = 'national_id_ir'
             AND pi.status <> 'revoked'
             AND pi.value_normalized = _nid
        ) THEN 2
        WHEN _asan IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.person_identifiers pi
           WHERE pi.person_id = p.id
             AND pi.kind = 'asan_person_code'
             AND pi.status <> 'revoked'
             AND pi.value_normalized = _asan
        ) THEN 3
        WHEN _term <> '' AND (
             public.normalize_fa_text(p.display_name) = _term
          OR (p.legal_name IS NOT NULL AND public.normalize_fa_text(p.legal_name) = _term)
          OR EXISTS (
               SELECT 1 FROM public.person_aliases pa
                WHERE pa.person_id = p.id AND pa.alias_normalized = _term
             )
        ) THEN 4
        WHEN _term <> '' AND (
             public.normalize_fa_text(p.display_name) ILIKE _like_prefix ESCAPE '\'
          OR (p.legal_name IS NOT NULL
              AND public.normalize_fa_text(p.legal_name) ILIKE _like_prefix ESCAPE '\')
          OR EXISTS (
               SELECT 1 FROM public.person_aliases pa
                WHERE pa.person_id = p.id
                  AND pa.alias_normalized ILIKE _like_prefix ESCAPE '\'
             )
        ) THEN 5
        WHEN _term <> '' AND (
             public.normalize_fa_text(p.display_name) ILIKE _like_contains ESCAPE '\'
          OR (p.legal_name IS NOT NULL
              AND public.normalize_fa_text(p.legal_name) ILIKE _like_contains ESCAPE '\')
          OR EXISTS (
               SELECT 1 FROM public.person_aliases pa
                WHERE pa.person_id = p.id
                  AND pa.alias_normalized ILIKE _like_contains ESCAPE '\'
             )
        ) THEN 6
        ELSE 99
      END AS match_rank
    FROM public.persons p
    WHERE (_kind IS NULL OR p.kind = _kind)
  ),
  filtered AS (
    SELECT s.*
    FROM scored s
    WHERE s.match_rank < 99
  ),
  counted AS (
    SELECT
      f.*,
      count(*) OVER() AS total_count
    FROM filtered f
  )
  SELECT
    c.id,
    c.kind,
    c.display_name,
    c.legal_name,
    c.visibility_scope,
    c.is_active,
    c.created_at,
    c.updated_at,
    c.matched_by,
    c.total_count
  FROM counted c
  ORDER BY c.match_rank ASC, c.created_at DESC, c.id
  LIMIT _limit OFFSET _offset;
END;
$fn$;

COMMENT ON FUNCTION public.search_visible_persons(text, integer, integer, text) IS
  'Phase 2 person directory search (migration 298). SECURITY INVOKER: persons RLS '
  '(can_read_person_scoped) is applied first; identifier/alias EXISTS inherit child RLS '
  'including viewer_restricted. Returns one row per visible person. matched_by never '
  'exposes identifier values. Empty/short query returns the visible directory. '
  'Optional p_kind filters individual|organization (existing list control, not a new filter).';

-- Drop any prior 3-arg overload from the first apply of this file.
DROP FUNCTION IF EXISTS public.search_visible_persons(text, integer, integer);

REVOKE ALL ON FUNCTION public.search_visible_persons(text, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_visible_persons(text, integer, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_visible_persons(text, integer, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
