-- phase-2-remediation-verify-cleanup.sql
--
-- Read-only confirmation that phase-2-remediation-testdata-cleanup.sql did what it was meant to.
-- Gate A phase 2, defects M4 and M5. Run AFTER the cleanup, on the TEST database only.
--
--   docker cp docs\verification\phase-2-remediation-verify-cleanup.sql afrakala-lan-db:/tmp/vc.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -f /tmp/vc.sql
--
-- Every row below must read PASS. Expected values are stated in the `expected` column so the
-- output is self-describing and does not have to be checked against another document.
--
-- SELECTs only. No transaction control (Gate A M7) — there is nothing here to roll back.

SET client_encoding = 'UTF8';
\pset pager off

-- The Asan export gates on has_any_role in its own body, so it needs a real admin JWT.
-- Any admin will do; this picks one.
SELECT set_config('request.jwt.claims',
         json_build_object('sub', (SELECT user_id::text FROM public.user_roles
                                    WHERE role = 'admin' ORDER BY user_id LIMIT 1),
                           'role', 'authenticated')::text,
         false) AS jwt_set;

WITH m AS (
  SELECT 'stress_receipts'        AS metric, '0'  AS expected,
         (SELECT count(*)::text FROM public.payment_receipts
           WHERE description = 'PHASE2_STRESS_do_not_keep')                       AS actual
  UNION ALL
  SELECT 'stress_journal_entries', '0',
         (SELECT count(*)::text FROM public.journal_entries je
           WHERE je.source_type = 'payment_receipt'
             AND je.source_id IN (SELECT id FROM public.payment_receipts
                                   WHERE description = 'PHASE2_STRESS_do_not_keep'))
  UNION ALL
  SELECT 'journal_entries_total', '1',
         (SELECT count(*)::text FROM public.journal_entries)
  UNION ALL
  SELECT 'journal_lines_total', '2',
         (SELECT count(*)::text FROM public.journal_lines)
  UNION ALL
  SELECT 'payment_receipts_total', '7',
         (SELECT count(*)::text FROM public.payment_receipts)
  UNION ALL
  SELECT 'credit_ledger_stress_rows', '0',
         (SELECT count(*)::text FROM public.customer_credit_ledger
           WHERE reference_type = 'receipt'
             AND reference_id IN (SELECT id FROM public.payment_receipts
                                   WHERE description = 'PHASE2_STRESS_do_not_keep'))
  UNION ALL
  SELECT 'available_credit_person_f144680e', '0.00',
         (SELECT available_credit::text FROM public.customer_credit_balance
           WHERE customer_person_id = 'f144680e-2580-4015-8034-8c03cb2b0fe2')
  UNION ALL
  SELECT 'receipt_numbers_total', '51',
         (SELECT count(*)::text FROM public.document_numbers WHERE doc_type = 'receipt')
  UNION ALL
  SELECT 'receipt_numbers_live', '0',
         (SELECT count(*)::text FROM public.document_numbers
           WHERE doc_type = 'receipt' AND burned_at IS NULL)
  UNION ALL
  SELECT 'RCP51_burned', 'true',
         (SELECT (burned_at IS NOT NULL)::text FROM public.document_numbers
           WHERE document_number = 'RCP-1405-000051')
  UNION ALL
  -- The one the accountant sees: /admin/asan-export
  SELECT 'asan_export_rows', '1',
         (SELECT count(*)::text FROM public.asan_list_bank_deposit_export(
                                        date '2026-01-01', date '2027-12-31'))
  UNION ALL
  -- Migration 353 must still be armed after the cleanup's DISABLE/ENABLE dance.
  SELECT 'trg_delete_guard_enabled', 'O',
         (SELECT t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
           WHERE c.relname = 'payment_receipts'
             AND t.tgname = 'trg_payment_receipts_block_delete_when_posted')
  UNION ALL
  SELECT 'trg_journal_entry_immutable_enabled', 'O',
         (SELECT t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
           WHERE c.relname = 'journal_entries' AND t.tgname = 'trg_journal_entry_immutable')
  UNION ALL
  SELECT 'trg_journal_line_immutable_enabled', 'O',
         (SELECT t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
           WHERE c.relname = 'journal_lines' AND t.tgname = 'trg_journal_line_immutable')
)
SELECT metric,
       expected,
       coalesce(actual, '(no row)') AS actual,
       CASE WHEN actual = expected THEN 'PASS' ELSE '**FAIL**' END AS verdict
  FROM m
 ORDER BY (actual = expected), metric;

-- The audit trail is deliberately left intact — the stress test really did happen. These rows
-- SHOULD still be here; they are reported so nobody reads their presence as a failed cleanup.
SELECT 'audit_logs kept (expected, not a failure)' AS note, action, count(*)
  FROM public.audit_logs
 WHERE action IN ('receipt_created', 'credit_payment')
 GROUP BY action ORDER BY action;
