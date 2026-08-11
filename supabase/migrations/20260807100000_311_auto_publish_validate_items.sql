SET client_encoding='UTF8';

-- 311 - Validate release item SHAPE inside auto_publish_release.
--
-- ============================================================================
-- WHY
-- ============================================================================
-- Migration 307 checked only that p_items was a non-empty JSON array:
--
--     IF jsonb_typeof(COALESCE(p_items,'[]'::jsonb)) <> 'array'
--        OR jsonb_array_length(COALESCE(p_items,'[]'::jsonb)) < 1 THEN
--
-- Any array passed. server/publish-release.mjs was emitting `{text, sha}` while
-- the contract in src/lib/platform-releases/types.ts:3-10 is
-- `{item_number, title_fa, description_fa, ...}`, and
-- PlatformReleaseCard.tsx:76-79 renders exactly those three. Result: every
-- auto-published release stored its Persian text under keys nothing reads, and
-- the page showed blank bullets. Full diagnosis in
-- docs/audits/release-notes-description-gap.md.
--
-- The TypeScript validator validateReleaseItems (validate.ts:19-43) already
-- required both title_fa and description_fa — but it only guards the manual
-- admin draft path. The RPC bypassed it entirely, so nothing checked the
-- machine-generated path, which is the one that runs on every deploy.
--
-- This adds that check at the database boundary, where it cannot be bypassed.
--
-- ============================================================================
-- WHAT IS ENFORCED
-- ============================================================================
--   * every element is a JSON object
--   * title_fa       present, non-blank, <= 160 chars   (MAX_ITEM_TITLE)
--   * description_fa present, non-blank, <= 500 chars   (MAX_ITEM_DESC)
--   * item_number    a positive integer, unique within the release
--   * at most 40 items                                   (MAX_ITEMS)
-- The limits mirror src/lib/platform-releases/constants.ts:31-33 so the two
-- validators agree rather than drifting.
--
-- NOT TOUCHED: already-published releases. Owner decision - releases 14 and 15
-- keep their malformed items. trg_platform_releases_protect_published forbids
-- editing published rows and this migration does not bypass it for two cosmetic
-- rows. New releases from the next deploy onward are correct.
--
-- Live definition snapshotted to docs/verification/pre-311/ (rule 2.3).
-- Signature unchanged, so CREATE OR REPLACE replaces and cannot overload.
--
-- Down script: docs/verification/311-down.sql

-- Transaction control belongs to the caller (psql --single-transaction).

CREATE OR REPLACE FUNCTION public.auto_publish_release(
  p_git_sha    text,
  p_build_time timestamptz,
  p_version    text,
  p_title_fa   text,
  p_summary_fa text,
  p_category   text,
  p_items      jsonb
) RETURNS public.platform_releases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  r        public.platform_releases;
  _sha     text;
  _el      jsonb;
  _n       int;
  _seen    int[] := '{}';
BEGIN
  _sha := substring(COALESCE(p_git_sha, '') from '^[0-9a-fA-F]{7,40}');
  IF _sha IS NULL OR _sha = '' THEN
    RAISE EXCEPTION 'شناسهٔ کامیت نامعتبر است' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM public.platform_releases WHERE git_sha = _sha LIMIT 1;
  IF FOUND THEN
    RETURN r;
  END IF;

  IF COALESCE(btrim(p_title_fa), '') = '' OR COALESCE(btrim(p_summary_fa), '') = '' THEN
    RAISE EXCEPTION 'عنوان و خلاصهٔ فارسی الزامی است' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) < 1 THEN
    RAISE EXCEPTION 'حداقل یک مورد تغییر لازم است' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_items) > 40 THEN
    RAISE EXCEPTION 'حداکثر ۴۰ مورد تغییر مجاز است' USING ERRCODE = '22023';
  END IF;

  -- Shape check. This is the guard whose absence let the malformed payload land.
  FOR _el IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(_el) <> 'object' THEN
      RAISE EXCEPTION 'هر مورد تغییر باید یک شیء باشد' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(btrim(_el->>'title_fa'), '') = '' THEN
      RAISE EXCEPTION 'عنوان هر مورد تغییر الزامی است (کلید title_fa)'
        USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(_el->>'title_fa')) > 160 THEN
      RAISE EXCEPTION 'عنوان مورد تغییر خیلی طولانی است' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(btrim(_el->>'description_fa'), '') = '' THEN
      RAISE EXCEPTION 'توضیح هر مورد تغییر الزامی است (کلید description_fa)'
        USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(_el->>'description_fa')) > 500 THEN
      RAISE EXCEPTION 'توضیح مورد تغییر خیلی طولانی است' USING ERRCODE = '22023';
    END IF;

    BEGIN
      _n := (_el->>'item_number')::int;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'شمارهٔ مورد تغییر نامعتبر است' USING ERRCODE = '22023';
    END;
    IF _n IS NULL OR _n < 1 THEN
      RAISE EXCEPTION 'شمارهٔ مورد تغییر نامعتبر است' USING ERRCODE = '22023';
    END IF;
    IF _n = ANY(_seen) THEN
      RAISE EXCEPTION 'شمارهٔ موارد تغییر تکراری است' USING ERRCODE = '22023';
    END IF;
    _seen := _seen || _n;
  END LOOP;

  INSERT INTO public.platform_releases (
    release_number, version, git_sha, build_time,
    title_fa, summary_fa, category, status, items, published_at
  ) VALUES (
    nextval('public.platform_release_number_seq'),
    NULLIF(btrim(COALESCE(p_version, '')), ''),
    _sha,
    p_build_time,
    left(btrim(p_title_fa), 200),
    left(btrim(p_summary_fa), 1000),
    p_category,
    'published',
    p_items,
    COALESCE(p_build_time, now())
  )
  RETURNING * INTO r;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'platform_release_auto_published',
    'platform_release',
    r.id,
    NULL,
    jsonb_build_object(
      'release_number', r.release_number,
      'title_fa',       r.title_fa,
      'category',       r.category,
      'git_sha',        r.git_sha,
      'item_count',     jsonb_array_length(r.items),
      'source',         'deploy'
    )
  );

  RETURN r;
END;
$function$;

-- The grants from 307 must survive a CREATE OR REPLACE. Re-asserted, then proven.
REVOKE ALL ON FUNCTION public.auto_publish_release(text, timestamptz, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_publish_release(text, timestamptz, text, text, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.auto_publish_release(text, timestamptz, text, text, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auto_publish_release(text, timestamptz, text, text, text, text, jsonb) TO service_role;

DO $$
DECLARE _bad text;
BEGIN
  SELECT string_agg(g, ', ') INTO _bad
    FROM (
      SELECT r.rolname AS g FROM pg_roles r
       WHERE r.rolname IN ('anon', 'authenticated')
         AND has_function_privilege(r.rolname,
               'public.auto_publish_release(text,timestamptz,text,text,text,text,jsonb)',
               'EXECUTE')
    ) x;
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION '311 failed: % can still EXECUTE auto_publish_release', _bad;
  END IF;
  IF NOT has_function_privilege('service_role',
        'public.auto_publish_release(text,timestamptz,text,text,text,text,jsonb)',
        'EXECUTE') THEN
    RAISE EXCEPTION '311 failed: service_role lost EXECUTE';
  END IF;
END $$;
