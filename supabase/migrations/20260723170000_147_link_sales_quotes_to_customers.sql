-- =====================================================================
-- 147 - Link sales_quotes to customers (nullable) + guarded backfill
-- =====================================================================
--
-- WHY: sales_quotes stored only free-text customer_name/customer_phone. Money
-- (payment_receipts) requires a real customer_id, and customers.phone is NOT
-- unique, so phone-alone matching could attach money to the wrong customer.
--
-- This adds a NULLABLE customer_id (a quote may be for a not-yet-registered
-- prospect) and backfills ONLY where the match is unambiguous: exactly one
-- customer matches on normalized phone AND that customer's name equals the
-- quote's stored name exactly. Everything else stays NULL by design.
--
-- customer_name / customer_phone are KEPT: they are the record of what was
-- actually written on the quote and the only data for prospects.
--
-- ROLLBACK:
--   ALTER TABLE public.sales_quotes DROP COLUMN customer_id;
--   (drops the index with it)
-- =====================================================================

BEGIN;

ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES public.customers(id);

CREATE INDEX IF NOT EXISTS idx_sales_quotes_customer_id
  ON public.sales_quotes(customer_id);

-- Guarded backfill: only unambiguous matches (exactly one customer matching
-- BOTH normalized phone AND exact name). Never phone-alone.
UPDATE public.sales_quotes q
   SET customer_id = m.cid
  FROM (
    SELECT sq.id AS qid, (array_agg(c.id))[1] AS cid
      FROM public.sales_quotes sq
      JOIN public.customers c
        ON regexp_replace(COALESCE(c.phone,''),  '\D', '', 'g')
         = regexp_replace(COALESCE(sq.customer_phone,''), '\D', '', 'g')
       AND regexp_replace(COALESCE(sq.customer_phone,''), '\D', '', 'g') <> ''
       AND btrim(c.name) = btrim(sq.customer_name)
     GROUP BY sq.id
    HAVING count(*) = 1
  ) m
 WHERE q.id = m.qid
   AND q.customer_id IS NULL;

DO $do$
DECLARE v_linked int; v_total int;
BEGIN
  SELECT count(*) FILTER (WHERE customer_id IS NOT NULL), count(*)
    INTO v_linked, v_total FROM public.sales_quotes;
  RAISE NOTICE 'Backfill: % of % quotes linked to a customer.', v_linked, v_total;
END $do$;

COMMIT;
