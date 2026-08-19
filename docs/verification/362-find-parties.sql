SELECT 'customer' AS kind, c.id::text, c.name, c.person_id::text
  FROM public.customers c
  JOIN public.person_identifiers pi ON pi.person_id = c.person_id
 WHERE pi.kind = 'asan_person_code' AND NULLIF(btrim(pi.value_normalized), '') IS NOT NULL
 LIMIT 5;

SELECT 'supplier' AS kind, s.id::text, s.name, s.person_id::text
  FROM public.suppliers s
  JOIN public.person_identifiers pi ON pi.person_id = s.person_id
 WHERE pi.kind = 'asan_person_code' AND NULLIF(btrim(pi.value_normalized), '') IS NOT NULL
 LIMIT 5;

SELECT ur.user_id::text
  FROM public.user_roles ur
 WHERE ur.role = 'admin' AND ur.user_id = '1a15e8c6-3a83-49c2-9531-db9046d30968';
