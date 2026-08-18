-- 343 -- task 1.6 -- posted journal entries are immutable
--
-- docs/security/audit-trigger-spec.md section 1: once journal_entries.status = 'posted', neither
-- that row nor any of its journal_lines may be UPDATEd or DELETEd. Correction is by reversal
-- (D11), never by edit.
--
-- Why a trigger and not RLS (spec section 1): an RLS UPDATE that matches no rows returns success
-- with zero rows changed, and the caller reads that as "done". This database already has that
-- exact failure mode - payment_receipts has no DELETE policy, so the create page's rollback
-- deletes nothing and returns 204. A trigger raises, so the caller cannot misread it.
--
-- What is still allowed:
--   * INSERT of any entry or line (the trigger is BEFORE UPDATE OR DELETE only)
--   * the draft -> posted transition, because the check reads OLD.status, not NEW.status
--   * any change to an entry still in 'draft' or 'void'
--
-- KNOWN INTERACTION, measured and recorded rather than worked around:
--   post_receipt_accounting has an idempotent ELSE branch that UPDATEs an EXISTING journal
--   entry's payer_accounting_code / receiver_accounting_code. That entry is 'posted', so after
--   this migration that branch raises P0001. It is reachable only when a journal entry exists
--   while the receipt's posting_status is not yet 'posted' - i.e. after a partial failure. The
--   normal path INSERTs a new entry and is unaffected (verified in the task's test).
--   Not exempted: audit-trigger-spec contemplates no exemptions, and an exemption would be a
--   bypass path around the very guarantee this task exists to create.
--   >>> OG-11: should post_receipt_accounting's back-fill branch be removed (phase 2 replaces
--   this function anyway), or should it be allowed to edit a posted entry?
--
-- ROLLBACK: docs/verification/343-down.sql  (note: re-opens editing of posted entries)

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() <> 'afrakala' THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

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

DO $verify$
DECLARE _raised boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE status = 'posted') THEN
    BEGIN
      UPDATE public.journal_entries SET description = description WHERE status = 'posted';
    EXCEPTION WHEN sqlstate 'P0001' THEN
      _raised := true;
    END;
    IF NOT _raised THEN
      RAISE EXCEPTION '343: a posted journal_entries row was still updatable'
        USING ERRCODE = '39000';
    END IF;
  END IF;
END
$verify$;
