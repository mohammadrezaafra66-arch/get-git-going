-- Dry run for migration 317. Everything is inside a transaction that is rolled
-- back, so the live database is unchanged when this finishes.
--
-- Run with:
--   docker cp supabase/migrations/20260808070000_317_polymorphic_ref_integrity.sql \
--     afrakala-lan-db:/tmp/317.sql
--   docker cp docs/verification/317-dry-run.sql afrakala-lan-db:/tmp/317-dry.sql
--   docker exec -e PGPASSWORD=... afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 -f /tmp/317-dry.sql
--
-- The point of a dry run here is not "does the trigger exist" but "does it
-- reject exactly the writes it should and none of the writes the application
-- actually makes". So it exercises the real writer (apply_stock_movement),
-- not just hand-written INSERTs.
SET client_encoding='UTF8';

BEGIN;

\echo '=== 0. before: pre-existing orphans (expect none) ==='
SELECT count(*) AS orphan_groups_before FROM (
  SELECT 1 FROM public.stock_movements sm
   WHERE sm.ref_id IS NOT NULL
     AND ((sm.ref_type='purchase'           AND NOT EXISTS (SELECT 1 FROM public.purchases t       WHERE t.id=sm.ref_id))
      OR  (sm.ref_type='sale_quote_confirm' AND NOT EXISTS (SELECT 1 FROM public.sales_quotes t    WHERE t.id=sm.ref_id))
      OR  (sm.ref_type='transfer'           AND NOT EXISTS (SELECT 1 FROM public.stock_transfers t WHERE t.id=sm.ref_id)))
) x;

\echo ''
\echo '=== 1. apply the migration (its gate raises on any mismatch) ==='
\i /tmp/317.sql

\echo ''
\echo '=== 2. the diagnostic reports nothing on clean data ==='
SELECT * FROM public.polymorphic_ref_orphan_report();
SELECT count(*) AS report_rows FROM public.polymorphic_ref_orphan_report();

\echo ''
\echo '=== 3. stock_movements: a bogus ref must be REJECTED ==='
DO $t$
DECLARE _p uuid; _w uuid; _msg text;
BEGIN
  SELECT id INTO _p FROM public.products      LIMIT 1;
  SELECT id INTO _w FROM public.warehouses    LIMIT 1;
  BEGIN
    INSERT INTO public.stock_movements
      (product_id, warehouse_id, movement_type, quantity, delta, ref_type, ref_id)
    VALUES (_p, _w, 'in', 1, 1, 'purchase', '00000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'FAIL: a purchase ref pointing at nothing was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    RAISE NOTICE 'PASS (rejected): %', _msg;
  END;
END
$t$;

\echo ''
\echo '=== 4. stock_movements: a real ref must be ACCEPTED, via the real writer ==='
DO $t$
DECLARE _p uuid; _w uuid; _purchase uuid; _id uuid; _before bigint; _after bigint;
BEGIN
  SELECT id INTO _purchase FROM public.purchases LIMIT 1;
  SELECT sm.product_id, sm.warehouse_id INTO _p, _w
    FROM public.stock_movements sm
    JOIN public.warehouse_stock ws
      ON ws.product_id = sm.product_id AND ws.warehouse_id = sm.warehouse_id
   WHERE ws.quantity > 0 LIMIT 1;

  SELECT count(*) INTO _before FROM public.stock_movements;
  _id := public.apply_stock_movement(_p, _w, 'in', 1, 'purchase', _purchase, NULL, 'dry run 317', NULL);
  SELECT count(*) INTO _after FROM public.stock_movements;

  IF _id IS NULL OR _after <> _before + 1 THEN
    RAISE EXCEPTION 'FAIL: the real writer could not record a valid purchase movement';
  END IF;
  RAISE NOTICE 'PASS (accepted): apply_stock_movement wrote %', _id;
END
$t$;

\echo ''
\echo '=== 5. stock_movements: manual/NULL refs still pass (no target table) ==='
DO $t$
DECLARE _p uuid; _w uuid;
BEGIN
  SELECT sm.product_id, sm.warehouse_id INTO _p, _w FROM public.stock_movements sm LIMIT 1;
  INSERT INTO public.stock_movements
    (product_id, warehouse_id, movement_type, quantity, delta, ref_type, ref_id)
  VALUES (_p, _w, 'adjust', 1, 1, 'manual', NULL);
  INSERT INTO public.stock_movements
    (product_id, warehouse_id, movement_type, quantity, delta, ref_type, ref_id)
  VALUES (_p, _w, 'in', 1, 1, NULL, NULL);
  RAISE NOTICE 'PASS: manual and NULL discriminators are not blocked';
END
$t$;

\echo ''
\echo '=== 6. journal_lines: a bogus ref must be REJECTED, per account_kind ==='
DO $t$
DECLARE _je uuid; _msg text; _kind text;
BEGIN
  SELECT id INTO _je FROM public.journal_entries LIMIT 1;
  FOREACH _kind IN ARRAY ARRAY['customer_credit','bank','external_party','supplier_payable']
  LOOP
    BEGIN
      INSERT INTO public.journal_lines
        (journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
      VALUES (_je, 9001, _kind, '00000000-0000-0000-0000-000000000002', 1, 0, 'dry run 317');
      RAISE EXCEPTION 'FAIL: kind % accepted a ref pointing at nothing', _kind;
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
      RAISE NOTICE 'PASS (% rejected): %', _kind, _msg;
    END;
  END LOOP;
END
$t$;

\echo ''
\echo '=== 7. journal_lines: real refs must be ACCEPTED ==='
DO $t$
DECLARE _je uuid; _ref uuid; _n integer := 0;
BEGIN
  SELECT id INTO _je FROM public.journal_entries LIMIT 1;

  SELECT id INTO _ref FROM public.customers LIMIT 1;
  INSERT INTO public.journal_lines
    (journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
  VALUES (_je, 9101, 'customer_credit', _ref, 1, 0, 'dry run 317'); _n := _n + 1;

  SELECT id INTO _ref FROM public.bank_accounts LIMIT 1;
  INSERT INTO public.journal_lines
    (journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
  VALUES (_je, 9102, 'bank', _ref, 1, 0, 'dry run 317'); _n := _n + 1;

  SELECT id INTO _ref FROM public.suppliers LIMIT 1;
  INSERT INTO public.journal_lines
    (journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
  VALUES (_je, 9103, 'supplier_payable', _ref, 1, 0, 'dry run 317'); _n := _n + 1;

  RAISE NOTICE 'PASS: % valid journal lines accepted', _n;
END
$t$;

\echo ''
\echo '=== 8. journal_lines: control accounts pass unvalidated (documented) ==='
DO $t$
DECLARE _je uuid;
BEGIN
  SELECT id INTO _je FROM public.journal_entries LIMIT 1;
  INSERT INTO public.journal_lines
    (journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
  VALUES (_je, 9201, 'clearing', NULL, 1, 0, 'dry run 317');
  RAISE NOTICE 'PASS: clearing with no reference is not blocked';
END
$t$;

\echo ''
\echo '=== 9. UPDATE is guarded too, not just INSERT ==='
DO $t$
DECLARE _id uuid; _msg text;
BEGIN
  SELECT id INTO _id FROM public.stock_movements WHERE ref_type = 'purchase' LIMIT 1;
  BEGIN
    UPDATE public.stock_movements
       SET ref_id = '00000000-0000-0000-0000-000000000003'
     WHERE id = _id;
    RAISE EXCEPTION 'FAIL: UPDATE moved a ref to a row that does not exist';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    RAISE NOTICE 'PASS (update rejected): %', _msg;
  END;
END
$t$;

\echo ''
\echo '=== 10. an unrelated UPDATE must NOT be blocked (no false positives) ==='
DO $t$
DECLARE _id uuid;
BEGIN
  SELECT id INTO _id FROM public.stock_movements WHERE ref_type = 'purchase' LIMIT 1;
  UPDATE public.stock_movements SET note = 'dry run 317 touch' WHERE id = _id;
  RAISE NOTICE 'PASS: editing a column other than the reference is unaffected';
END
$t$;

\echo ''
\echo '=== 11. the diagnostic sees an orphan once one exists (trigger disabled) ==='
DO $t$
DECLARE _p uuid; _w uuid; _n bigint;
BEGIN
  SELECT sm.product_id, sm.warehouse_id INTO _p, _w FROM public.stock_movements sm LIMIT 1;
  ALTER TABLE public.stock_movements DISABLE TRIGGER trg_validate_stock_movement_ref;
  INSERT INTO public.stock_movements
    (product_id, warehouse_id, movement_type, quantity, delta, ref_type, ref_id)
  VALUES (_p, _w, 'in', 1, 1, 'purchase', '00000000-0000-0000-0000-000000000004');
  ALTER TABLE public.stock_movements ENABLE TRIGGER trg_validate_stock_movement_ref;

  SELECT coalesce(sum(r.rows), 0) INTO _n
    FROM public.polymorphic_ref_orphan_report() r WHERE r.problem = 'orphan';
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL: report found % orphans, expected 1', _n; END IF;
  RAISE NOTICE 'PASS: the report finds the planted orphan';
END
$t$;
SELECT * FROM public.polymorphic_ref_orphan_report();

\echo ''
\echo '=== 12. down script removes everything it added ==='
DROP TRIGGER IF EXISTS trg_validate_stock_movement_ref ON public.stock_movements;
DROP TRIGGER IF EXISTS trg_validate_journal_line_ref  ON public.journal_lines;
DROP FUNCTION IF EXISTS public.validate_stock_movement_ref();
DROP FUNCTION IF EXISTS public.validate_journal_line_ref();
DROP FUNCTION IF EXISTS public.polymorphic_ref_orphan_report();
SELECT count(*) AS triggers_left FROM pg_trigger
 WHERE tgname IN ('trg_validate_stock_movement_ref','trg_validate_journal_line_ref')
   AND NOT tgisinternal;

ROLLBACK;

\echo ''
\echo '=== rolled back; live database unchanged ==='
SELECT count(*) AS live_stock_movements FROM public.stock_movements;
SELECT count(*) AS live_journal_lines   FROM public.journal_lines;
SELECT count(*) AS live_triggers FROM pg_trigger
 WHERE tgname IN ('trg_validate_stock_movement_ref','trg_validate_journal_line_ref')
   AND NOT tgisinternal;
