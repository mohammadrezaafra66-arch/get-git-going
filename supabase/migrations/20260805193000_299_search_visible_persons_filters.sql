SET client_encoding='UTF8';

-- =====================================================================
-- 299 — extend search_visible_persons with directory filters
--
-- Audit: docs/verification/person-filters-phase3-audit.md
-- Down:   docs/verification/299-down.sql
--
-- Adds p_context_kinds / p_active_status / p_missing_identifier_kinds.
-- SECURITY INVOKER unchanged. Viewer-only callers cannot use missing-
-- identifier filters (is_viewer_only → ignore param).
-- No new indexes.
-- =====================================================================

DROP FUNCTION IF EXISTS public.search_visible_persons(text, integer, integer, text);

CREATE OR REPLACE FUNCTION public.search_visible_persons(
  p_query                     text DEFAULT NULL,
  p_limit                     integer DEFAULT 20,
  p_offset                    integer DEFAULT 0,
  p_kind                      text DEFAULT NULL,
  p_context_kinds             text[] DEFAULT NULL,
  p_active_status             text DEFAULT 'all',
  p_missing_identifier_kinds  text[] DEFAULT NULL
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
  _active  text;
  _ctx_all text[];
  _ctx_concrete text[];
  _want_no_context boolean;
  _missing text[];
BEGIN
  _limit  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  _offset := GREATEST(COALESCE(p_offset, 0), 0);

  _kind := NULLIF(btrim(COALESCE(p_kind, '')), '');
  IF _kind IS NOT NULL AND _kind NOT IN ('individual', 'organization') THEN
    _kind := NULL;
  END IF;

  _active := lower(btrim(COALESCE(p_active_status, 'all')));
  IF _active NOT IN ('all', 'active', 'inactive') THEN
    _active := 'all';
  END IF;

  -- Whitelist context tokens; empty/NULL → no context filter.
  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[])
    INTO _ctx_all
    FROM unnest(COALESCE(p_context_kinds, ARRAY[]::text[])) AS x
   WHERE x IN (
     'customer', 'supplier', 'staff_link', 'accounting_party', 'no_context'
   );

  _want_no_context := 'no_context' = ANY (_ctx_all);
  SELECT COALESCE(array_agg(x), ARRAY[]::text[])
    INTO _ctx_concrete
    FROM unnest(_ctx_all) AS x
   WHERE x <> 'no_context';

  -- Missing-identifier filters: strip unknowns; viewer-only ignores entirely.
  IF public.is_viewer_only(auth.uid()) THEN
    _missing := ARRAY[]::text[];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[])
      INTO _missing
      FROM unnest(COALESCE(p_missing_identifier_kinds, ARRAY[]::text[])) AS x
     WHERE x IN ('mobile_e164', 'national_id_ir', 'asan_person_code');
  END IF;

  _raw := left(btrim(COALESCE(p_query, '')), 80);

  -- Short/empty query → filtered visible directory (matched_by NULL).
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
        AND (
          _active = 'all'
          OR (_active = 'active' AND p.is_active IS TRUE)
          OR (_active = 'inactive' AND p.is_active IS FALSE)
        )
        AND (
          cardinality(_ctx_all) = 0
          OR (
            (_want_no_context AND NOT EXISTS (
              SELECT 1 FROM public.person_context_links pcl
               WHERE pcl.person_id = p.id AND pcl.ended_at IS NULL
            ))
            OR (
              cardinality(_ctx_concrete) > 0 AND EXISTS (
                SELECT 1 FROM public.person_context_links pcl
                 WHERE pcl.person_id = p.id
                   AND pcl.ended_at IS NULL
                   AND pcl.context_kind = ANY (_ctx_concrete)
              )
            )
          )
        )
        AND (
          cardinality(_missing) = 0
          OR (
            SELECT bool_and(NOT EXISTS (
              SELECT 1 FROM public.person_identifiers pi
               WHERE pi.person_id = p.id
                 AND pi.kind = mk
                 AND pi.status <> 'revoked'
            ))
            FROM unnest(_missing) AS mk
          )
        )
      ORDER BY p.created_at DESC, p.id
    )
    SELECT
      b.id, b.kind, b.display_name, b.legal_name, b.visibility_scope,
      b.is_active, b.created_at, b.updated_at, b.matched_by, b.total_count
    FROM base b
    LIMIT _limit OFFSET _offset;
    RETURN;
  END IF;

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
                WHERE pa.person_id = p.id AND pa.alias_normalized = _term
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
      AND (
        _active = 'all'
        OR (_active = 'active' AND p.is_active IS TRUE)
        OR (_active = 'inactive' AND p.is_active IS FALSE)
      )
      AND (
        cardinality(_ctx_all) = 0
        OR (
          (_want_no_context AND NOT EXISTS (
            SELECT 1 FROM public.person_context_links pcl
             WHERE pcl.person_id = p.id AND pcl.ended_at IS NULL
          ))
          OR (
            cardinality(_ctx_concrete) > 0 AND EXISTS (
              SELECT 1 FROM public.person_context_links pcl
               WHERE pcl.person_id = p.id
                 AND pcl.ended_at IS NULL
                 AND pcl.context_kind = ANY (_ctx_concrete)
            )
          )
        )
      )
      AND (
        cardinality(_missing) = 0
        OR (
          SELECT bool_and(NOT EXISTS (
            SELECT 1 FROM public.person_identifiers pi
             WHERE pi.person_id = p.id
               AND pi.kind = mk
               AND pi.status <> 'revoked'
          ))
          FROM unnest(_missing) AS mk
        )
      )
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

COMMENT ON FUNCTION public.search_visible_persons(text, integer, integer, text, text[], text, text[]) IS
  'Phase 3 person directory search+filters (migration 299). SECURITY INVOKER. '
  'Filters: p_kind, p_context_kinds (OR; no_context sentinel), p_active_status '
  '(all|active|inactive), p_missing_identifier_kinds (AND; ignored for viewer-only). '
  'Context active = ended_at IS NULL. Identifier present = status <> revoked.';

REVOKE ALL ON FUNCTION public.search_visible_persons(text, integer, integer, text, text[], text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_visible_persons(text, integer, integer, text, text[], text, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_visible_persons(text, integer, integer, text, text[], text, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
