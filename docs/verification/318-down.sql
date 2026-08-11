-- Rollback for migration 318 (delete duplicate person 271d7c44).
--
-- Restores all three rows with their original ids, foreign keys and timestamps,
-- captured from the live database immediately before 318 was applied. Every
-- value below is the real one, not a placeholder — a rollback that invents a
-- created_at is a rollback that quietly changes history.
--
-- Insert order is the reverse of the delete order: person, then customer, then
-- the context link.
--
-- Idempotent: ON CONFLICT DO NOTHING, so running it twice restores once.
SET client_encoding='UTF8';

BEGIN;

INSERT INTO public.persons
  (id, kind, display_name, legal_name, visibility_scope, is_active, notes,
   created_by, created_at, updated_at)
VALUES
  ('271d7c44-c89f-44db-9b91-99474cdf0a2c', 'individual', 'محمدزین الدین', NULL,
   'internal_general', true, NULL,
   'b51e3d4f-2220-4e6b-a697-c326d70f9ad2',
   '2026-08-05 11:22:50.815664+00', '2026-08-05 11:22:50.815664+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customers
  (id, name, phone, email, address, tax_id, created_at, updated_at, city, notes,
   is_active, responsible_id, accounting_code, link_group, birth_date, person_id,
   didar_contact_id)
VALUES
  ('5f7b335e-ac1f-4a7f-92ec-54fb776f1ab0', 'محمدزین الدین', NULL, NULL, NULL, NULL,
   '2026-08-05 11:22:50.815664+00', '2026-08-05 11:22:50.815664+00', NULL, NULL,
   true, NULL, NULL, NULL, NULL,
   '271d7c44-c89f-44db-9b91-99474cdf0a2c', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.person_context_links
  (id, person_id, context_kind, ref_table, ref_id, note, started_at, ended_at,
   created_by, created_at, updated_at)
VALUES
  ('50c74c77-1ddb-433f-96ba-a881be53e7eb',
   '271d7c44-c89f-44db-9b91-99474cdf0a2c', 'customer', 'customers',
   '5f7b335e-ac1f-4a7f-92ec-54fb776f1ab0', NULL,
   '2026-08-05 11:22:50.815664+00', NULL,
   'b51e3d4f-2220-4e6b-a697-c326d70f9ad2',
   '2026-08-05 11:22:50.815664+00', '2026-08-05 11:22:50.815664+00')
ON CONFLICT (id) DO NOTHING;

DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.persons
   WHERE id = '271d7c44-c89f-44db-9b91-99474cdf0a2c';
  IF n <> 1 THEN RAISE EXCEPTION 'rollback failed: person not restored'; END IF;

  SELECT count(*) INTO n FROM public.customers
   WHERE id = '5f7b335e-ac1f-4a7f-92ec-54fb776f1ab0';
  IF n <> 1 THEN RAISE EXCEPTION 'rollback failed: customer not restored'; END IF;

  SELECT count(*) INTO n FROM public.person_context_links
   WHERE id = '50c74c77-1ddb-433f-96ba-a881be53e7eb';
  IF n <> 1 THEN RAISE EXCEPTION 'rollback failed: context link not restored'; END IF;
END
$chk$;

COMMIT;
