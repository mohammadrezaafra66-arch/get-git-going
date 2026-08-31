SET client_encoding='UTF8';

-- 416. The write policy on settlement_types disagreed with the page that writes it.
--
-- Measured on 2026-08-31, before this migration:
--
--   page guard   src/routes/_app.pricing.settlement-types.tsx:21  ["admin","accountant"]
--   RLS write    settlement_types_write                           ARRAY['admin','manager']
--   menu entry   src/lib/navigation/registry.ts:983               adminOnly  (= admin OR manager)
--
-- Three layers, three different answers, and both mismatches were user-visible:
--
--   * an ACCOUNTANT passed requireAnyRole and got the page, the "new type" button and both row
--     actions -- and then RLS filtered every row out of their UPDATE. An UPDATE that matches no
--     rows is NOT an error, so `const { error } = await supabase...update(...)` returned
--     error = null and the page ran its success branch: the accountant saw the toast
--     "به‌روزرسانی شد" while nothing whatsoever had changed. Only INSERT failed visibly.
--   * a MANAGER, whom this policy did allow to write, was blocked from the page entirely by
--     requireAnyRole, and had no other route to the table.
--
-- So the policy granted write to the one role that could not reach the form, and withheld it
-- from the one role the form was built for. Aligning it on the page guard is what the owner
-- chose; the alternative (adding manager to the page guard) would hand write access to a role
-- that has never had a screen for it.
--
-- Dropping manager takes away nothing that was reachable through the application.
-- The companion commit puts allowedRoles ["admin","accountant"] on the menu entry, so all
-- three layers finally name the same two roles.
--
-- Shape is preserved exactly as read from pg_policies before the change: PERMISSIVE, FOR ALL,
-- TO public, text[] overload of has_any_role, same expression in USING and WITH CHECK.

DROP POLICY IF EXISTS settlement_types_write ON public.settlement_types;

CREATE POLICY settlement_types_write ON public.settlement_types
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'accountant'::text]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'accountant'::text]));

DO $$
DECLARE _q text;
BEGIN
  SELECT qual INTO _q FROM pg_policies
   WHERE tablename='settlement_types' AND policyname='settlement_types_write';
  IF _q IS NULL OR _q NOT LIKE '%accountant%' OR _q LIKE '%manager%' THEN
    RAISE EXCEPTION '416 did not take: settlement_types_write is now %', COALESCE(_q,'(missing)');
  END IF;
END $$;
