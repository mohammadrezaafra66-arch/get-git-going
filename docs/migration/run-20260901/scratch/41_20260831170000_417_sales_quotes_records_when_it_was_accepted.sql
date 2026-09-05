SET client_encoding='UTF8';

-- 417. sales_quotes records WHEN a quote was accepted.
--
-- Until now it did not. The table carries canceled_at, expires_at, accounting_registered_at and
-- four more timestamps, but nothing marked the one moment the business counts from: the customer
-- saying yes. The receivables report had nothing honest to count from and used expires_at, the
-- quote's validity deadline, which is NULL on all nine accepted quotes.
--
-- All nine stay NULL after this migration. Backfilling them infers history and gets its own
-- change and its own approval.
--
-- WHERE IT IS STAMPED, AND WHY NOT IN THE RPC.
-- The obvious place looks like update_sales_quote_status. It is the wrong place: that function
-- does not write canceled_at either. It writes cancel_reason. canceled_at is written by this
-- BEFORE trigger, and following that pattern means writing accepted_at here too -- which also
-- covers every writer that never goes through the RPC.
--
-- BEFORE INSERT **OR** UPDATE, NOT UPDATE ALONE.
-- The first draft of this migration only added the UPDATE branch, on the reasoning that status
-- DEFAULTs to 'draft', that create_sales_quote_with_items does not set it, and that this trigger
-- already refuses every transition into 'accepted' except from 'sent'. That reasoning covers the
-- RPC and nothing else, and it was wrong. Measured on the live database:
--
--     INSERT INTO public.sales_quotes (quote_number, customer_name, customer_phone, status)
--     VALUES ('HOLE-417','probe','09120000009','accepted');
--     -> status=accepted   accepted_at=NULL
--
-- `authenticated` holds an INSERT grant on the table and the RLS insert policy does not constrain
-- status, so this is reachable by an ordinary user through PostgREST, and committed e2e fixtures
-- in this repo already do it. Worse, the row is UNREPAIRABLE: re-asserting the same status is not
-- DISTINCT, so the outer guard never opens and no later UPDATE can ever stamp it:
--
--     UPDATE public.sales_quotes SET status='accepted' WHERE id=<that row>;
--     -> accepted_at=NULL
--
-- A due date computed from a NULL that cannot be repaired is worse than no due date at all, so
-- the trigger now fires on INSERT as well.
--
-- WHAT coalesce IS AND IS NOT FOR.
-- It preserves an explicitly supplied value on the statement that sets the status. It is NOT what
-- makes a later backfill safe: a backfill updates accepted_at on rows that are ALREADY accepted,
-- so old.status IS NOT DISTINCT FROM new.status, the branch never executes, and the value is
-- simply written by the UPDATE. Both facts were measured; do not conflate them.
--
-- KNOWN AND DELIBERATELY OUT OF SCOPE: canceled_at has exactly the same INSERT hole. It is not
-- fixed here because nothing computes from it and widening this migration to cover it would mean
-- changing behaviour nobody asked about.
--
-- The function below is the live definition read with pg_get_functiondef immediately before this
-- migration was written -- diffed against migration 408 first and found identical, so the file was
-- not stale -- with the two branches above added and nothing else changed.

ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS accepted_at timestamptz NULL;

COMMENT ON COLUMN public.sales_quotes.accepted_at IS
  'لحظهٔ پذیرش پیش‌فاکتور. مبدأ شمارش مهلت تسویه است. برای پیش‌فاکتورهای پذیرفته‌شده پیش از مهاجرت ۴۱۷ خالی است.';

CREATE OR REPLACE FUNCTION public.sales_quotes_validate_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status) THEN
    -- Final states cannot be changed
    IF old.status IN ('accepted','rejected','canceled') THEN
      RAISE EXCEPTION 'cannot change status of a finalized quote (%, %)', old.quote_number, old.status
        USING ERRCODE = '22023';
    END IF;
    -- Allowed transitions
    IF NOT (
      (old.status = 'draft' AND new.status IN ('sent','canceled'))
      OR (old.status = 'sent' AND new.status IN ('accepted','rejected','canceled'))
    ) THEN
      RAISE EXCEPTION 'invalid status transition: % -> %', old.status, new.status
        USING ERRCODE = '22023';
    END IF;

    IF new.status = 'canceled' THEN
      new.canceled_at := coalesce(new.canceled_at, now());
      new.canceled_by := coalesce(new.canceled_by, auth.uid());
    END IF;

    IF new.status = 'accepted' THEN
      new.accepted_at := coalesce(new.accepted_at, now());
    END IF;
  END IF;

  -- A quote can also be born accepted: this trigger fires BEFORE INSERT as well, because a plain
  -- INSERT with status='accepted' does not pass through the transition logic above and would
  -- otherwise leave accepted_at NULL forever -- see the header for why "forever" is literal.
  IF tg_op = 'INSERT' AND new.status = 'accepted' THEN
    new.accepted_at := coalesce(new.accepted_at, now());
  END IF;

  RETURN new;
END;
$function$;

-- The trigger itself must change: it was BEFORE UPDATE only.
CREATE OR REPLACE TRIGGER trg_sales_quotes_validate_status
  BEFORE INSERT OR UPDATE ON public.sales_quotes
  FOR EACH ROW EXECUTE FUNCTION public.sales_quotes_validate_status();

DO $v$
DECLARE _n int; _src text; _def text;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='sales_quotes' AND column_name='accepted_at';
  IF _n <> 1 THEN RAISE EXCEPTION '417: accepted_at column missing'; END IF;

  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='sales_quotes_validate_status';
  IF _src NOT LIKE '%new.accepted_at := coalesce(new.accepted_at, now())%' THEN
    RAISE EXCEPTION '417: the trigger does not stamp accepted_at';
  END IF;
  IF _src NOT LIKE '%tg_op = ''INSERT'' AND new.status = ''accepted''%' THEN
    RAISE EXCEPTION '417: the INSERT branch is missing -- a quote could be born accepted with NULL';
  END IF;
  IF _src NOT LIKE '%new.canceled_at := coalesce(new.canceled_at, now())%'
     OR _src NOT LIKE '%invalid status transition%'
     OR _src NOT LIKE '%cannot change status of a finalized quote%' THEN
    RAISE EXCEPTION '417: the rewrite dropped existing behaviour';
  END IF;

  SELECT pg_get_triggerdef(t.oid) INTO _def FROM pg_trigger t
   WHERE t.tgrelid='public.sales_quotes'::regclass AND t.tgname='trg_sales_quotes_validate_status';
  IF _def NOT LIKE '%BEFORE INSERT OR UPDATE%' THEN
    RAISE EXCEPTION '417: the trigger still does not fire on INSERT: %', _def;
  END IF;
END
$v$;
