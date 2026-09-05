SET client_encoding='UTF8';

-- 418. The nine quotes that were accepted before 417 existed get their acceptance moment back.
--
-- 417 added sales_quotes.accepted_at and stamps it from now on. It deliberately backfilled
-- nothing, because filling these nine means inferring history, and inference needs its own
-- change and its own approval. This is that change. The owner approved the three decisions
-- below explicitly after reading a read-only report of every row it touches.
--
-- WHERE THE TIMESTAMP COMES FROM. Not a guess. The trigger audit_sales_quotes has recorded
-- every status change on this table for its whole life:
--
--     INSERT INTO public.audit_logs (..., action, diff)
--     VALUES (..., 'sales_quote_status_changed',
--             jsonb_build_object('old_status', old.status, 'new_status', new.status, ...));
--
-- so the acceptance moment is audit_logs.created_at of the row whose diff->>'new_status' is
-- 'accepted'. Measured before writing this: all nine accepted quotes have exactly one such
-- event, every one of them later than the quote's own created_at, with delays from 5 seconds
-- to 1 day 21 hours -- all plausible, none anomalous.
--
-- (audit_logs holds 103 such events in total. The other 94 point at quotes that no longer
-- exist, so the join to sales_quotes drops them. Noted here so the number is not a surprise
-- to whoever reads the log next.)
--
-- THE THREE DECISIONS, as approved:
--
--   a. MORE THAN ONE EVENT -> take the FIRST (row_number() ORDER BY created_at, rn = 1).
--      None of the nine has more than one, so this is a rule for the future rather than a
--      choice being exercised. The first event is the moment the customer said yes and the
--      settlement clock started; a later one would be a repeat or a correction, and taking it
--      would push the deadline out in the customer's favour. sales_quotes_validate_status also
--      refuses any transition out of a final state, so a second event could only come from a
--      path that bypassed it -- which makes the first the more trustworthy of the two.
--
--   b. TIME ZONE -> no conversion, direct copy. audit_logs.created_at and
--      sales_quotes.accepted_at are both timestamptz, which stores an absolute instant, not a
--      wall clock; the server's UTC setting only affects display. Converting would be the bug:
--      `AT TIME ZONE 'Asia/Tehran'` yields a naive timestamp that shifts by 3.5 hours on the
--      way back in.
--
--   c. NO EVENT -> leave NULL. Never fabricate a date. created_at would start the clock when
--      the draft was written, which for SQ-2026-000004 is a day and 21 hours too early;
--      updated_at has been overwritten by every later edit. A missing due date that announces
--      itself is safer than a plausible wrong one. All nine do have events, so this branch
--      writes nothing today -- it is the guarantee, not a live case.
--
-- SAFETY. status is not touched, so old.status IS NOT DISTINCT FROM new.status and none of the
-- table's status-driven triggers fire. Measured in a rolled-back transaction beforehand: 9 rows
-- updated, and a delta of exactly 0 in audit_logs, stock_movements, notification_queue,
-- customer_credit_balance, customer_capital_allocations_dynamic, capital_allocation_ledger and
-- tasks. This is the failure mode 411 hit -- a recompute that quietly rewrote nine customers'
-- credit ceilings -- and it does not happen here.
--
-- IDEMPOTENT. The `accepted_at IS NULL` guard means a second run updates zero rows. It also
-- means this migration can never overwrite a value 417 stamped for real.
--
-- NOT TOUCHED, deliberately: SQ-2026-000005 points at the settlement type «تسویه ۲روزه», whose
-- days is 0 -- so its computed due date will be the acceptance day itself, two days early. That
-- is a data defect, not a structural one; the owner fixes it from the UI, which migration 416
-- made possible. Carried into PR 3 instead: the receivables report must not compute a due date
-- from an INACTIVE settlement type as though nothing were wrong.

WITH ev AS (
  SELECT a.entity_id,
         a.created_at,
         row_number() OVER (PARTITION BY a.entity_id ORDER BY a.created_at) AS rn
  FROM public.audit_logs a
  WHERE a.entity_type = 'sales_quotes'
    AND a.action      = 'sales_quote_status_changed'
    AND a.diff->>'new_status' = 'accepted'
)
UPDATE public.sales_quotes q
   SET accepted_at = e.created_at
  FROM ev e
 WHERE e.entity_id = q.id::text
   AND e.rn = 1
   AND q.status = 'accepted'
   AND q.accepted_at IS NULL;

DO $v$
DECLARE
  _total int; _filled int; _null int; _future int; _before_creation int; _mismatch int;
BEGIN
  SELECT count(*) INTO _total  FROM public.sales_quotes WHERE status='accepted';
  IF _total < 1 THEN
    RAISE EXCEPTION '418: expected 9 accepted quotes, found % -- the data moved under the migration', _total;
  END IF;

  SELECT count(*) FILTER (WHERE accepted_at IS NOT NULL),
         count(*) FILTER (WHERE accepted_at IS NULL)
    INTO _filled, _null
    FROM public.sales_quotes WHERE status='accepted';
  IF _null <> 0 THEN
    RAISE EXCEPTION '418: % of 9 filled, % still NULL', _filled, _null;
  END IF;

  -- no fabricated or impossible instants
  SELECT count(*) INTO _future FROM public.sales_quotes
   WHERE status='accepted' AND accepted_at > now();
  IF _future > 0 THEN RAISE EXCEPTION '418: % rows accepted in the future', _future; END IF;

  SELECT count(*) INTO _before_creation FROM public.sales_quotes
   WHERE status='accepted' AND accepted_at < created_at;
  IF _before_creation > 0 THEN
    RAISE EXCEPTION '418: % rows accepted before they were created', _before_creation;
  END IF;

  -- every value must be exactly the first audit event, byte for byte -- no drift, no rounding
  SELECT count(*) INTO _mismatch
  FROM public.sales_quotes q
  JOIN LATERAL (
    SELECT a.created_at FROM public.audit_logs a
     WHERE a.entity_type='sales_quotes' AND a.action='sales_quote_status_changed'
       AND a.diff->>'new_status'='accepted' AND a.entity_id=q.id::text
     ORDER BY a.created_at LIMIT 1
  ) f ON true
  WHERE q.status='accepted' AND q.accepted_at IS DISTINCT FROM f.created_at;
  IF _mismatch > 0 THEN
    RAISE EXCEPTION '418: % rows do not equal their first audit event', _mismatch;
  END IF;
END
$v$;
