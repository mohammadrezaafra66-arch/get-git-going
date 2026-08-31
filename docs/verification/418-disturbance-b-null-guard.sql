BEGIN;
-- DISTURBANCE 2: the `accepted_at IS NULL` guard. Simulate a value 417 stamped for real, then
-- re-run the backfill. It must NOT be overwritten -- otherwise a re-run would silently rewrite
-- genuine data with an inferred value.
UPDATE public.sales_quotes SET accepted_at = '2020-01-01 00:00:00+00'
 WHERE quote_number = 'SQ-2026-000003';

WITH ev AS (
  SELECT a.entity_id, a.created_at,
         row_number() OVER (PARTITION BY a.entity_id ORDER BY a.created_at) AS rn
  FROM public.audit_logs a
  WHERE a.entity_type='sales_quotes' AND a.action='sales_quote_status_changed'
    AND a.diff->>'new_status'='accepted'
)
UPDATE public.sales_quotes q SET accepted_at = e.created_at
  FROM ev e
 WHERE e.entity_id=q.id::text AND e.rn=1 AND q.status='accepted' AND q.accepted_at IS NULL;

DO $d$
DECLARE _v timestamptz;
BEGIN
  SELECT accepted_at INTO _v FROM public.sales_quotes WHERE quote_number='SQ-2026-000003';
  IF _v = '2020-01-01 00:00:00+00' THEN
    RAISE NOTICE 'GUARD HOLDS: the pre-set value survived the backfill (%)', _v;
    RAISE NOTICE '             -- and the migration gate now correctly goes RED on it:';
  ELSE
    RAISE EXCEPTION 'GUARD FAILED: backfill overwrote a real value with %', _v;
  END IF;
END
$d$;

DO $v$
DECLARE
  _total int; _filled int; _null int; _future int; _before_creation int; _mismatch int;
BEGIN
  SELECT count(*) INTO _total  FROM public.sales_quotes WHERE status='accepted';
  IF _total <> 9 THEN
    RAISE EXCEPTION '418: expected 9 accepted quotes, found % -- the data moved under the migration', _total;
  END IF;

  SELECT count(*) FILTER (WHERE accepted_at IS NOT NULL),
         count(*) FILTER (WHERE accepted_at IS NULL)
    INTO _filled, _null
    FROM public.sales_quotes WHERE status='accepted';
  IF _filled <> 9 OR _null <> 0 THEN
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

ROLLBACK;
