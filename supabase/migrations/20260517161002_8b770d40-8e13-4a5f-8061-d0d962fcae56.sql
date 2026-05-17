-- AFRA-20260517-PERSONS-U01-S13 — verification cleanup
DELETE FROM public.person_identifiers
WHERE id = 'a418bdec-052e-4c83-b41c-216917f2f49d'
  AND status = 'revoked';