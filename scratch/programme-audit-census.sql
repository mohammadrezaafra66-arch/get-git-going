-- programme-audit live catalogue (ASCII). Invoke with BEGIN/ROLLBACK wrapper for writes.
SET client_encoding = 'UTF8';
\pset pager off

SELECT 'CENSUS' AS k,
  (SELECT count(*) FROM public.journal_entries) AS journal_entries,
  (SELECT count(*) FROM public.journal_lines) AS journal_lines,
  (SELECT count(*) FROM public.payment_receipts) AS payment_receipts,
  (SELECT count(*) FROM public.payment_vouchers) AS payment_vouchers,
  (SELECT count(*) FROM public.dual_documents) AS dual_documents,
  (SELECT count(*) FROM public.document_numbers) AS document_numbers,
  (SELECT count(*) FROM public.document_numbers WHERE burned_at IS NULL) AS numbers_live,
  (SELECT count(*) FROM public.document_attachments) AS document_attachments,
  (SELECT count(*) FROM public.audit_logs) AS audit_logs,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f') AS public_functions;

SELECT 'DEAD_PATH' AS k,
  (SELECT count(*) FROM pg_proc WHERE proname='post_receipt_journal') AS post_receipt_journal,
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_payment_receipts_post_journal') AS trg_post_journal,
  (SELECT count(*) FROM pg_proc WHERE proname='trg_post_receipt_on_approve') AS trg_on_approve_fn,
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_post_receipt_on_approve') AS trg_on_approve_armed;

SELECT 'FOUNDATIONS' AS k,
  (SELECT count(*) FROM pg_class WHERE relname='document_numbers' AND relkind='r') AS document_numbers,
  (SELECT count(*) FROM pg_proc WHERE proname='assign_document_number') AS assign_document_number,
  (SELECT count(*) FROM pg_proc WHERE proname='require_asan_code') AS require_asan_code,
  (SELECT count(*) FROM pg_proc WHERE proname='jalali_year') AS jalali_year,
  (SELECT count(*) FROM journal_entries WHERE doc_kind IS NULL) AS doc_kind_null,
  (SELECT relrowsecurity FROM pg_class WHERE relname='document_attachments') AS attachments_rls,
  (SELECT count(*) FROM pg_policies WHERE tablename='document_attachments') AS attachments_policies;

SELECT 'WRITERS' AS k,
  (SELECT count(*) FROM pg_proc WHERE proname='create_receipt') AS create_receipt,
  (SELECT count(*) FROM pg_proc WHERE proname='create_payment') AS create_payment,
  (SELECT count(*) FROM pg_proc WHERE proname='create_dual_document') AS create_dual_document,
  (SELECT count(*) FROM pg_proc WHERE proname='reverse_document') AS reverse_document,
  (SELECT pronargs FROM pg_proc WHERE proname='create_dual_document') AS dual_nargs;

SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef,
       (SELECT unnest FROM unnest(p.proconfig) WHERE unnest LIKE 'search_path%' LIMIT 1) AS search_path
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('create_receipt','create_payment','create_dual_document','reverse_document',
                     'assign_document_number','require_asan_code','asan_list_journal_export')
 ORDER BY 2;

SELECT 'CASH_BOX' AS k, count(*) AS n FROM public.bank_accounts WHERE account_type='cash';
SELECT 'BANK_ACC' AS k, count(*) AS n FROM public.bank_accounts WHERE account_type='bank' AND is_active;

SELECT 'SCHEMA_MIG' AS k, count(*) AS n, max(version) AS max_version
  FROM supabase_migrations.schema_migrations;

SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 8;

SELECT 'STRESS_LEFT' AS k,
  (SELECT count(*) FROM payment_receipts WHERE description LIKE 'PHASE2_STRESS%') AS phase2_stress,
  (SELECT count(*) FROM payment_receipts WHERE tracking_number='OG14-CONC') AS og14_conc,
  (SELECT count(*) FROM document_numbers WHERE source_id='8141b507-3905-4c2e-918f-a05b81b510c0') AS phantom_number,
  (SELECT count(*) FROM journal_entries WHERE description LIKE '%OG14%') AS og14_journals;

SELECT doc_kind, status, count(*) FROM journal_entries GROUP BY 1,2 ORDER BY 1,2;

SELECT 'JE_INSERT_POLICIES' AS k, policyname, cmd
  FROM pg_policies WHERE tablename='journal_entries' ORDER BY 1;

SELECT 'REQUIRE_ASAN_SEC' AS k, prosecdef
  FROM pg_proc WHERE proname='require_asan_code';

SELECT 'LEDGER_MOD' AS k, role_name, can_view, can_create
  FROM role_permissions WHERE module='ledger-documents' ORDER BY 1;

SELECT 'INVOICE_AR' AS k, account_kind, accounting_code FROM asan_control_accounts;

SELECT 'VALIDATE_MAPS' AS k,
  (length(pg_get_functiondef(oid)) - length(replace(pg_get_functiondef(oid), 'THEN ARRAY', ''))) / length('THEN ARRAY') AS array_maps
  FROM pg_proc WHERE proname='validate_journal_line_ref';

SELECT 'EXPORT_BODY' AS k,
  (pg_get_functiondef(oid) LIKE '%stored_kind%' OR pg_get_functiondef(oid) LIKE '%e.doc_kind%') AS uses_stored,
  pg_get_functiondef(oid) LIKE '%bank_net%' AS has_bank_net,
  pg_get_functiondef(oid) LIKE '%p_intermediary%' AS dual_fee_in_export
  FROM pg_proc WHERE proname='asan_list_journal_export';

SELECT 'DUAL_FEE_COLS' AS k, count(*) AS n
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='dual_documents'
   AND (column_name ILIKE '%fee%' OR column_name ILIKE '%intermed%');

SELECT 'REVERSE_GATE' AS k,
  pg_get_functiondef(oid) LIKE '%manager%' AS mentions_manager,
  pg_get_functiondef(oid) LIKE '%accountant%' AS mentions_accountant
  FROM pg_proc WHERE proname='reverse_document';
