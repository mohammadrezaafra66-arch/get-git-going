CREATE OR REPLACE FUNCTION public.detect_phone_collisions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _inserted integer := 0;
BEGIN
  WITH all_phones AS (
    SELECT 'customers'  AS tbl, c.id::text AS ref, c.name        AS label,
           public.normalize_phone_local(c.phone) AS ph
      FROM public.customers c WHERE coalesce(btrim(c.phone), '') <> ''
    UNION ALL
    SELECT 'suppliers', s.id::text, s.name, public.normalize_phone_local(s.phone)
      FROM public.suppliers s WHERE coalesce(btrim(s.phone), '') <> ''
    UNION ALL
    SELECT 'external_parties', e.id::text, e.full_name, public.normalize_phone_local(e.phone)
      FROM public.external_parties e WHERE coalesce(btrim(e.phone), '') <> ''
    UNION ALL
    SELECT 'profiles', p.id::text, p.full_name, public.normalize_phone_local(p.phone)
      FROM public.profiles p WHERE coalesce(btrim(p.phone), '') <> ''
    UNION ALL
    SELECT 'visitors', v.id::text, v.full_name, public.normalize_phone_local(v.phone)
      FROM public.visitors v WHERE coalesce(btrim(v.phone), '') <> ''
  ),
  grouped AS (
    SELECT ph,
           jsonb_agg(jsonb_build_object('table', tbl, 'id', ref, 'label', label)
                     ORDER BY tbl, ref) AS refs,
           count(*) AS n
      FROM all_phones
     WHERE ph ~ '^09[0-9]{9}$'
     GROUP BY ph
    HAVING count(*) > 1
  )
  INSERT INTO public.phone_collisions (normalized_phone, entity_refs)
  SELECT g.ph, g.refs
    FROM grouped g
   WHERE NOT EXISTS (
     SELECT 1 FROM public.phone_collisions pc
      WHERE pc.normalized_phone = g.ph AND pc.status = 'pending');

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted;
END;
$function$

