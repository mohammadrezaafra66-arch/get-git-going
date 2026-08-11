SET client_encoding='UTF8';

-- =============================================================================
-- 274 — D8-8: warehouse selection moves to LINE level.
--
-- Owner decision: a single proforma may draw its lines from different
-- warehouses. The existing rule must survive intact — a proforma MAY be created
-- with insufficient stock, but the accountant MUST NOT finalise more than
-- actual stock — and that check now runs PER LINE against PER-WAREHOUSE stock.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DISCOVERY, REPORTED BEFORE CHANGING ANYTHING (mission step 7.2)
-- ─────────────────────────────────────────────────────────────────────────────
-- Every place that reads a document-level warehouse for a STOCK decision:
--
--   1. trg_sales_quote_stock_out   (trigger on sales_quotes)
--        _wh := COALESCE(NEW.warehouse_id, default_warehouse_id())
--        then groups items by product_id ONLY and deducts all of them from _wh.
--        -> rewritten here to group by (product_id, effective warehouse).
--   2. trg_purchase_item_stock_in  (trigger on purchase_items)
--        reads purchases.warehouse_id for the parent document.
--        -> rewritten here to prefer the line's own warehouse.
--   3. check_quote_stock_availability(_quote_id, _warehouse_id)
--        resolves ONE warehouse for the whole quote and reports per product.
--        -> rewritten here to report per (product, warehouse).
--   4. apply_stock_movement — the actual guard. NOT CHANGED. It already
--        refuses to drive stock below zero and already raises a Persian error
--        naming BOTH the product and the warehouse:
--          «موجودی کافی نیست: «X» در انبار «Y» فقط N عدد موجود دارد …»
--        Hard-gate assertion 3 (an error naming the line and the warehouse) is
--        therefore satisfied by extending this path, not by adding a second
--        guard next to it. Building a parallel check would have been the
--        classic mistake this project keeps paying for.
--   5. sync_product_stock_status / adjust_warehouse_stock — product- and
--        warehouse-scoped already, no document warehouse involved. Untouched.
--
-- Frontend call sites that matter (no stock decision is made in the browser):
--   - _app.sales.quotes.$quoteId.tsx — accept dialog; writes
--     sales_quotes.warehouse_id BEFORE the status change because the deduction
--     trigger reads it at that moment. That still works: the document warehouse
--     is now the FALLBACK for lines that do not carry their own.
--   - lib/warehouses/queries.ts — checkQuoteStockAvailability wrapper.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE RESOLUTION RULE — one rule, one function, three call sites
-- ─────────────────────────────────────────────────────────────────────────────
--   effective warehouse of a line
--     = COALESCE(line.warehouse_id, document.warehouse_id, default_warehouse_id())
--
-- WHY THIS PRESERVES TODAY'S BEHAVIOUR EXACTLY: every existing line backfills
-- to the document's warehouse where the document had one, and NULL otherwise.
-- With every line resolving to the same document warehouse, grouping by
-- (product, warehouse) is arithmetically identical to grouping by product and
-- deducting from that one warehouse. A single-warehouse proforma cannot notice
-- this migration happened.
--
-- MEASURED STARTING STATE (2026-08-03, before this migration):
--   sales_quotes    50 rows, only 11 carry warehouse_id
--   purchases      204 rows, only  5 carry warehouse_id
--   sales_quote_items  53 rows · purchase_items 204 rows · warehouses 3
--   warehouse_stock     9 rows   <-- see the honest note at the bottom
-- So most lines legitimately backfill to NULL. The mission's check is
-- "zero lines without a warehouse WHERE THE DOCUMENT HAD ONE" — not "zero
-- NULLs", which would be unachievable and would mean inventing data.
--
-- NOT DONE ON PURPOSE: the document-level columns are KEPT (dual-column during
-- transition — the same pattern phases 5-7 of the person work used). No NOT
-- NULL, no column dropped, no FK repointed.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 7.1 — Schema
-- -----------------------------------------------------------------------------
ALTER TABLE public.sales_quote_items
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);

COMMENT ON COLUMN public.sales_quote_items.warehouse_id IS
  'D8-8 (274): the warehouse this LINE is drawn from. NULL falls back to '
  'sales_quotes.warehouse_id, then default_warehouse_id(). Kept nullable so a '
  'single-warehouse proforma stays exactly as cheap to fill in as it was.';

COMMENT ON COLUMN public.purchase_items.warehouse_id IS
  'D8-8 (274): the warehouse this LINE is received into. NULL falls back to '
  'purchases.warehouse_id, then default_warehouse_id().';

-- The stock query joins warehouse_stock on (warehouse_id, product_id); these
-- indexes serve the line -> stock lookup direction.
CREATE INDEX IF NOT EXISTS idx_sales_quote_items_warehouse_product
  ON public.sales_quote_items (warehouse_id, product_id)
  WHERE warehouse_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_items_warehouse_product
  ON public.purchase_items (warehouse_id, product_id)
  WHERE warehouse_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 7.1 — Backfill from the document so every existing line keeps its meaning
-- -----------------------------------------------------------------------------
UPDATE public.sales_quote_items sqi
   SET warehouse_id = q.warehouse_id
  FROM public.sales_quotes q
 WHERE q.id = sqi.quote_id
   AND q.warehouse_id IS NOT NULL
   AND sqi.warehouse_id IS NULL;

UPDATE public.purchase_items pi
   SET warehouse_id = p.warehouse_id
  FROM public.purchases p
 WHERE p.id = pi.purchase_id
   AND p.warehouse_id IS NOT NULL
   AND pi.warehouse_id IS NULL;


-- -----------------------------------------------------------------------------
-- The resolution rule, as ONE function. STABLE (not IMMUTABLE) because
-- default_warehouse_id() reads a table.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.effective_line_warehouse(
  _line_warehouse_id     uuid,
  _document_warehouse_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(_line_warehouse_id, _document_warehouse_id, public.default_warehouse_id());
$function$;

COMMENT ON FUNCTION public.effective_line_warehouse(uuid, uuid) IS
  'D8-8 (274): line warehouse, else document warehouse, else the default. The '
  'single source of truth — the sales-out trigger, the purchase-in trigger and '
  'check_quote_stock_availability all resolve through it so they cannot drift.';


-- -----------------------------------------------------------------------------
-- 7.2 — Sales deduction, now per line and per warehouse
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sales_quote_stock_out()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _group record;
BEGIN
  -- Re-deduction guard: if this quote already has an out movement, stop.
  -- (unchanged from the pre-274 behaviour)
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
     WHERE ref_type = 'sale_quote_confirm' AND ref_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- One group per (product, effective warehouse). Two lines of the same product
  -- from two different warehouses now produce TWO movements, each checked
  -- against its own warehouse's stock by apply_stock_movement.
  FOR _group IN
    SELECT sqi.product_id,
           public.effective_line_warehouse(sqi.warehouse_id, NEW.warehouse_id) AS wh,
           SUM(sqi.quantity) AS qty
      FROM public.sales_quote_items sqi
     WHERE sqi.quote_id = NEW.id
       AND sqi.product_id IS NOT NULL
     GROUP BY sqi.product_id,
              public.effective_line_warehouse(sqi.warehouse_id, NEW.warehouse_id)
  LOOP
    -- No warehouse resolvable at all = the multi-warehouse model was never set
    -- up for this line. Preserve the pre-274 behaviour and skip rather than
    -- breaking a sale. (Same reasoning as the original Persian comment.)
    CONTINUE WHEN _group.wh IS NULL;
    CONTINUE WHEN COALESCE(_group.qty, 0) <= 0;

    PERFORM public.apply_stock_movement(
      _group.product_id, _group.wh, 'out', _group.qty,
      'sale_quote_confirm', NEW.id, NULL, 'کسر موجودی از قطعی‌کردن پیش‌فاکتور', NULL
    );
  END LOOP;

  RETURN NEW;
END;
$function$;


-- -----------------------------------------------------------------------------
-- 7.2 — Purchase receipt, now honouring the line's own warehouse
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_purchase_item_stock_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _doc_wh uuid;
  _wh uuid;
BEGIN
  IF NEW.product_id IS NULL OR COALESCE(NEW.quantity, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT p.warehouse_id INTO _doc_wh
    FROM public.purchases p
   WHERE p.id = NEW.purchase_id;

  _wh := public.effective_line_warehouse(NEW.warehouse_id, _doc_wh);

  -- انباری تعریف نشده = مدل چندانباره هنوز راه‌اندازی نشده؛ خرید را نشکن.
  IF _wh IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.apply_stock_movement(
    NEW.product_id, _wh, 'in', NEW.quantity,
    'purchase', NEW.purchase_id, NULL, 'افزایش موجودی از خرید', NULL
  );

  RETURN NEW;
END;
$function$;


-- -----------------------------------------------------------------------------
-- 7.2 — Availability, now reported per (product, warehouse)
--
-- The return signature changes, so the old function MUST be dropped rather than
-- replaced — adding columns to a RETURNS TABLE is not an in-place change and
-- CREATE OR REPLACE would fail. (rule 5)
--
-- _warehouse_id keeps its meaning from before: an override the accountant
-- chooses in the accept dialog. It now overrides the DOCUMENT level, i.e. it
-- applies to lines that do not carry their own warehouse — a line that names
-- its warehouse explicitly is not silently moved somewhere else.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.check_quote_stock_availability(uuid, uuid);

CREATE OR REPLACE FUNCTION public.check_quote_stock_availability(
  _quote_id     uuid,
  _warehouse_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  product_id     uuid,
  product_name   text,
  warehouse_id   uuid,
  warehouse_name text,
  required       numeric,
  available      numeric,
  is_sufficient  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH doc AS (
    SELECT COALESCE(_warehouse_id, q.warehouse_id) AS wh
      FROM public.sales_quotes q
     WHERE q.id = _quote_id
  ), need AS (
    SELECT sqi.product_id,
           public.effective_line_warehouse(sqi.warehouse_id, doc.wh) AS wh,
           SUM(sqi.quantity) AS required
      FROM public.sales_quote_items sqi
      CROSS JOIN doc
     WHERE sqi.quote_id = _quote_id
       AND sqi.product_id IS NOT NULL
     GROUP BY sqi.product_id, public.effective_line_warehouse(sqi.warehouse_id, doc.wh)
  )
  SELECT
    n.product_id,
    p.name AS product_name,
    n.wh   AS warehouse_id,
    w.name AS warehouse_name,
    n.required,
    COALESCE(ws.quantity, 0) AS available,
    COALESCE(ws.quantity, 0) >= n.required AS is_sufficient
  FROM need n
  JOIN public.products p ON p.id = n.product_id
  LEFT JOIN public.warehouses w ON w.id = n.wh
  LEFT JOIN public.warehouse_stock ws
         ON ws.product_id = n.product_id AND ws.warehouse_id = n.wh
  ORDER BY (COALESCE(ws.quantity, 0) >= n.required), w.name NULLS FIRST, p.name;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_quote_stock_availability(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_quote_stock_availability(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.effective_line_warehouse(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_line_warehouse(uuid, uuid) TO authenticated;
