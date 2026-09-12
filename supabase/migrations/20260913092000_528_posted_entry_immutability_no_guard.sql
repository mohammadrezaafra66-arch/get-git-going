SET client_encoding = 'UTF8';

-- 528 -- 343's work, re-issued without the `current_database() <> 'afrakala'` guard.
--
-- 343 (20260818157000_343_posted_entry_immutability.sql) carries the identical guard block at
-- lines 32-38 as 336 did. Production's database is `postgres`, not `afrakala`, so 343 aborted
-- immediately and NONE of its objects were ever created there. Measured on prod_rehearsal_e1,
-- independently of what R-1 reported:
--   tg_journal_entry_immutable()  -- ABSENT
--   tg_journal_line_immutable()   -- ABSENT
--   trg_journal_entry_immutable   -- ABSENT (trigger)
--   trg_journal_line_immutable    -- ABSENT (trigger)
-- So unlike 336 (half no-op) and unlike 386/394/396/404/409 (catalogue drift), 343 never took
-- effect on production AT ALL. This file is 343's full body, unmodified except for the removed
-- guard. 343 is NOT edited (CLAUDE.md rule 6); its ledger row is marked superseded in the
-- release, which the orchestrator handles -- not this file.
--
-- SAFETY FACTS R-1 ALREADY ESTABLISHED, not re-derived here: all 17 posted journal_entries and
-- all 34 journal_lines on production correctly refuse UPDATE under this trigger -- zero rows
-- would escape the guard once it exists. Confirmed present on prod_rehearsal_e1 before applying
-- (17 posted entries, 34 lines -- see E-1-proof.md), so the verify block below is not vacuous.
--
-- Persian message, byte-for-byte, verified against 343's own file:
--   سند ثبت‌شده قابل تغییر نیست؛ برای اصلاح، سند برگشتی بزنید
-- Delivered to the container over stdin (never a PowerShell pipe) and md5-verified both sides
-- before every application, per CLAUDE.md's Persian-delivery rule.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION and DROP TRIGGER IF EXISTS + CREATE TRIGGER are both
-- safe to re-run; a second application replaces the same function bodies and triggers with
-- themselves. Proved by running this file twice on a fresh restore in E-1-proof.md.
--
-- These two functions are plain trigger functions (LANGUAGE plpgsql, no SECURITY DEFINER), so
-- the "every SECURITY DEFINER function carries its own REVOKE" contract does not apply to them --
-- matching 343's own file, which grants nothing (a trigger function is invoked by the trigger
-- mechanism, not called directly, so EXECUTE grants are moot for it).
--
-- ROLLBACK: docs/verification/343-down.sql already exists (captured before 343's own change,
-- dry-run proved) and re-opens editing of posted entries; it is the correct rollback for this
-- file too since the two create the same objects.

CREATE OR REPLACE FUNCTION public.tg_journal_entry_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'سند ثبت‌شده قابل تغییر نیست؛ برای اصلاح، سند برگشتی بزنید'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_journal_line_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _status text;
  _entry  uuid;
BEGIN
  _entry := CASE TG_OP WHEN 'DELETE' THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;

  SELECT je.status INTO _status
    FROM public.journal_entries je
   WHERE je.id = _entry;

  IF _status = 'posted' THEN
    RAISE EXCEPTION 'سند ثبت‌شده قابل تغییر نیست؛ برای اصلاح، سند برگشتی بزنید'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_journal_entry_immutable ON public.journal_entries;
CREATE TRIGGER trg_journal_entry_immutable
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_journal_entry_immutable();

DROP TRIGGER IF EXISTS trg_journal_line_immutable ON public.journal_lines;
CREATE TRIGGER trg_journal_line_immutable
  BEFORE UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_journal_line_immutable();

DO $verify528$
DECLARE _raised boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE status = 'posted') THEN
    BEGIN
      UPDATE public.journal_entries SET description = description WHERE status = 'posted';
    EXCEPTION WHEN sqlstate 'P0001' THEN
      _raised := true;
    END;
    IF NOT _raised THEN
      RAISE EXCEPTION '528: a posted journal_entries row was still updatable'
        USING ERRCODE = '39000';
    END IF;
  ELSE
    RAISE EXCEPTION '528: no posted journal_entries row exists to test against -- this assertion would be vacuous';
  END IF;

  RAISE NOTICE '528 OK: posted journal_entries rows refuse UPDATE (tested against a real row, rolled back automatically since this whole migration runs in --single-transaction on the caller''s script -- no row was permanently touched beyond the no-op self-update of description)';
END
$verify528$;
