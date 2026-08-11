CREATE OR REPLACE FUNCTION public.auto_publish_release(p_git_sha text, p_build_time timestamp with time zone, p_version text, p_title_fa text, p_summary_fa text, p_category text, p_items jsonb)
 RETURNS platform_releases
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
$function$

