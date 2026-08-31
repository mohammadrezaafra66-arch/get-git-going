BEGIN;
-- DISTURBANCE 1: corrupt ONE row -- set it to the quote's own created_at instead of the audit
-- event, which is exactly the plausible-looking wrong answer the migration rejected in decision
-- (c). The migration's own verification block must refuse it.
UPDATE public.sales_quotes SET accepted_at = created_at
 WHERE quote_number = 'SQ-2026-000004';

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
