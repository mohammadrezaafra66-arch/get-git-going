-- 343-down.sql -- rollback for migration 343 (task 1.6)
-- WARNING: this re-opens editing and deletion of POSTED journal entries. rollback-plan.md
-- flags this explicitly. Only run it if immutability itself is the problem.
SET client_encoding='UTF8';
BEGIN;
DROP TRIGGER IF EXISTS trg_journal_line_immutable ON public.journal_lines;
DROP TRIGGER IF EXISTS trg_journal_entry_immutable ON public.journal_entries;
DROP FUNCTION IF EXISTS public.tg_journal_line_immutable();
DROP FUNCTION IF EXISTS public.tg_journal_entry_immutable();
COMMIT;
