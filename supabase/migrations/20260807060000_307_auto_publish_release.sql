SET client_encoding='UTF8';

-- 307 - انتشار خودکار نسخه هنگام استقرار.
--
-- Step 2 of making /updates fill itself with no manual approval step. Migration
-- 302 built the manual path: an admin creates a draft, writes the Persian text,
-- then calls publish_platform_release(). That function is kept exactly as it is
-- and is still the only way a human publishes.
--
-- This adds a SECOND, system-only entry point for the deploy pipeline. It is a
-- separate function rather than a relaxation of the existing one, because the
-- two have opposite authorisation rules and merging them would weaken the
-- human path:
--
--   publish_platform_release  requires auth.uid() to be an admin.
--   auto_publish_release      has NO auth.uid() at all - the caller is the
--                             server process - and is therefore restricted by
--                             GRANT to service_role only.
--
-- SECURITY. This function is SECURITY DEFINER and bypasses RLS, so EXECUTE is
-- revoked from PUBLIC, anon and authenticated and granted solely to
-- service_role. Without that revoke any logged-in user could publish arbitrary
-- text to every user's update popup. The revoke is the security boundary here,
-- not an afterthought.
--
-- IDEMPOTENCY. The deploy hook runs on every container start, so the function
-- keys on git_sha: if a release already exists for that commit, the existing
-- row is returned untouched and nothing is inserted. Restarting the container,
-- rolling back, or scaling out cannot produce duplicates.
--
-- git_sha NORMALISATION. deploy/lan/build.ps1 stamps "<sha>-dirty" when the
-- working tree has uncommitted tracked changes, and platform_releases_git_sha_chk
-- only accepts ^[0-9a-fA-F]{7,40}$. The leading hex run is extracted so a dirty
-- build records its commit instead of failing the whole deploy on a CHECK.
--
-- WHAT THIS DOES NOT DO. It never edits or republishes an existing release.
-- trg_platform_releases_protect_published already forbids changing published
-- text, and that guarantee is left intact - published history stays immutable.
--
-- Down script: docs/verification/307-down.sql

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
  r    public.platform_releases;
  _sha text;
BEGIN
  -- Strip a "-dirty" suffix (or anything else trailing) down to the hex run.
  _sha := substring(COALESCE(p_git_sha, '') from '^[0-9a-fA-F]{7,40}');
  IF _sha IS NULL OR _sha = '' THEN
    RAISE EXCEPTION 'شناسهٔ کامیت نامعتبر است' USING ERRCODE = '22023';
  END IF;

  -- Idempotent on the commit. Any status counts: a release that was published
  -- and later archived must not be resurrected by a restart.
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

  -- actor_id stays NULL: this was the system, not a person. The audit trail
  -- must not imply a human published it.
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

COMMENT ON FUNCTION public.auto_publish_release(text, timestamptz, text, text, text, text, jsonb) IS
  'System-only: publishes one release per deploy, idempotent on git_sha. service_role only - never grant to authenticated.';

-- The security boundary. SECURITY DEFINER + bypassed RLS means an over-broad
-- grant would let any logged-in user write to every user''s update popup.
REVOKE ALL ON FUNCTION public.auto_publish_release(text, timestamptz, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_publish_release(text, timestamptz, text, text, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.auto_publish_release(text, timestamptz, text, text, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auto_publish_release(text, timestamptz, text, text, text, text, jsonb) TO service_role;

-- Prove the grants landed as intended rather than trusting the statements.
DO $$
DECLARE _bad text;
BEGIN
  SELECT string_agg(g, ', ') INTO _bad
    FROM (
      SELECT r.rolname AS g
        FROM pg_roles r
       WHERE r.rolname IN ('anon', 'authenticated')
         AND has_function_privilege(
               r.rolname,
               'public.auto_publish_release(text,timestamptz,text,text,text,text,jsonb)',
               'EXECUTE')
    ) x;
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION '307 failed: % can still EXECUTE auto_publish_release', _bad;
  END IF;

  IF NOT has_function_privilege(
        'service_role',
        'public.auto_publish_release(text,timestamptz,text,text,text,text,jsonb)',
        'EXECUTE') THEN
    RAISE EXCEPTION '307 failed: service_role cannot EXECUTE auto_publish_release';
  END IF;
END $$;
