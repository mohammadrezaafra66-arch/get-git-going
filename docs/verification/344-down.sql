-- 344-down.sql -- rollback for migration 344 (task 1.7)
-- CAUTION: removing these rows makes 'ledger-documents' OPEN to every role again, because
-- has_dynamic_permission grants to all roles when a module has no row. Only run this if the
-- module itself is being removed (rollback-plan.md, phase 1, task 1.7).
SET client_encoding='UTF8';
DELETE FROM public.role_permissions WHERE module = 'ledger-documents';
