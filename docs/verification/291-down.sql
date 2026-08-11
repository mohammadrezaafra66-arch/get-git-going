-- Rollback for migration 291 — the Asan export module.
-- No BEGIN/COMMIT: transaction control belongs to the caller (mission control rule 2.4).
--
-- Note on the permission rows: removing them does NOT close the module, it opens it.
-- `has_dynamic_permission` grants access to every role when a module has no row at all, so
-- this delete is only correct together with removing the route itself.
SET client_encoding='UTF8';

DROP FUNCTION IF EXISTS public.asan_assign_document_numbers(text, uuid[]);

DELETE FROM public.role_permissions WHERE module = 'asan-export';
