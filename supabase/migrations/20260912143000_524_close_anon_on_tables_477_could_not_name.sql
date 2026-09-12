SET client_encoding='UTF8';

-- ============================================================================================
-- 524 - close anon on the seven tables migration 477 could not name.
--
-- ASCII-ONLY BY DESIGN, as 477 and 523 are.
--
-- ============================================================================================
-- THE GAP, AND WHY 523 DOES NOT CLOSE IT
-- ============================================================================================
--
-- 477 is a STATIC list of REVOKE statements generated from the TEST database's catalogue on
-- 2026-09-06. Two migrations had already run there and changed that catalogue:
--
--   450  RENAMEd knowledge_articles, messages, price_lists, price_list_items to zz_retired_*
--        and DROPPED payment_receipts_backup_20260722
--   452  RENAMEd the two dynamic_parameter_weights backups to zz_retired_*
--
-- So 477's list names six tables by names that exist only on test, and contains no line at all
-- for payment_receipts_backup_20260722 - it had already been dropped when the list was made.
--
-- On production 449, 450 and 452 were all skipped: each asserts an absolute row count read off
-- the test database, and those counts do not match production's data. The tables therefore
-- still exist under their ORIGINAL names.
--
-- 523 is 477 minus exactly twelve lines, so that it can apply at all. Its value is being
-- provably 477-minus-twelve-lines, which means it must not gain REVOKEs 477 never had. The
-- consequence is that after 523 these seven tables still hold every anon grant:
--
--     dynamic_parameter_weights_backup_142
--     dynamic_parameter_weights_backup_20260722
--     knowledge_articles
--     messages
--     price_list_items
--     price_lists
--     payment_receipts_backup_20260722
--
-- This migration closes exactly those seven and nothing else.
--
-- ============================================================================================
-- WHY IT IS DRIVEN BY THE CATALOGUE, NOT BY A LIST
-- ============================================================================================
--
-- 477 failed on production because a static list assumed a shape. Repeating that here would be
-- a poor joke: if any of these seven has since been dropped or renamed, a static REVOKE aborts
-- the whole migration. So each name is checked against the catalogue and skipped when absent,
-- and the migration reports what it found rather than assuming.
--
-- This is narrowing only. It removes privileges from anon and grants nothing to anyone. RLS is
-- enabled on all of these and 477's own live PostgREST probe found every comparable table
-- returning zero rows to an anonymous caller, so nothing an anonymous visitor can do today
-- stops working. As with 477, the honest reason to ship it is defence in depth: a dead grant
-- becomes a live hole the moment someone writes one permissive policy.
--
-- These seven are retired tables and backups. If 450 and 452 are ever revisited and do run,
-- they RENAME rather than DROP, and a renamed table carries its privileges with it - so the
-- revocations below survive the rename and this migration does not need to be repeated.
-- ============================================================================================

DO $close$
DECLARE
  v_names  text[] := ARRAY[
    'dynamic_parameter_weights_backup_142',
    'dynamic_parameter_weights_backup_20260722',
    'knowledge_articles',
    'messages',
    'price_list_items',
    'price_lists',
    'payment_receipts_backup_20260722'
  ];
  v_name     text;
  v_oid      oid;
  v_before   text;
  v_present  int := 0;
  v_absent   int := 0;
  v_revoked  int := 0;
BEGIN
  FOREACH v_name IN ARRAY v_names LOOP
    v_oid := to_regclass('public.' || quote_ident(v_name));

    IF v_oid IS NULL THEN
      v_absent := v_absent + 1;
      RAISE NOTICE '524: public.% is absent - skipped (this is not an error)', v_name;
      CONTINUE;
    END IF;

    v_present := v_present + 1;

    SELECT string_agg(p, ',') INTO v_before
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
     WHERE has_table_privilege('anon', v_oid, p);

    IF v_before IS NULL THEN
      RAISE NOTICE '524: public.% already grants anon nothing - no change', v_name;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_name);
    v_revoked := v_revoked + 1;
    RAISE NOTICE '524: public.% - anon held %, now revoked', v_name, v_before;
  END LOOP;

  RAISE NOTICE '524: % present, % absent, % revoked', v_present, v_absent, v_revoked;
END
$close$;

-- Verification in the SAME transaction, re-read from the catalogue rather than trusting the
-- REVOKEs' own reports. PostgreSQL prints REVOKE even when there was nothing to revoke, so the
-- statement tag proves nothing; this read is the proof.
DO $verify$
DECLARE
  v_names text[] := ARRAY[
    'dynamic_parameter_weights_backup_142',
    'dynamic_parameter_weights_backup_20260722',
    'knowledge_articles',
    'messages',
    'price_list_items',
    'price_lists',
    'payment_receipts_backup_20260722'
  ];
  v_name text;
  v_oid  oid;
  v_left text;
  v_bad  text := NULL;
BEGIN
  FOREACH v_name IN ARRAY v_names LOOP
    v_oid := to_regclass('public.' || quote_ident(v_name));
    CONTINUE WHEN v_oid IS NULL;

    SELECT string_agg(p, ',') INTO v_left
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
     WHERE has_table_privilege('anon', v_oid, p);

    IF v_left IS NOT NULL THEN
      v_bad := coalesce(v_bad || '; ', '') || v_name || ' still grants anon ' || v_left;
    END IF;
  END LOOP;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '524 VERIFY: %', v_bad;
  END IF;

  RAISE NOTICE '524 VERIFY: none of the seven grants anon anything';
END
$verify$;
