SET client_encoding = 'UTF8';
\pset pager off

SELECT 'census_before_362' AS marker;
SELECT to_regclass('public.dual_documents') AS dual_documents;
SELECT count(*) AS dual_document_rows FROM public.dual_documents;
SELECT count(*) AS dual_entries FROM public.journal_entries WHERE source_type = 'dual_document';
SELECT count(*) AS create_dual_overloads
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'create_dual_document';
SELECT p.oid::regprocedure::text AS signature
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'create_dual_document'
 ORDER BY 1;
SELECT count(*) AS public_functions FROM pg_proc WHERE pronamespace = 'public'::regnamespace;
SELECT count(*) AS journal_entries FROM public.journal_entries;
SELECT count(*) AS journal_lines FROM public.journal_lines;
