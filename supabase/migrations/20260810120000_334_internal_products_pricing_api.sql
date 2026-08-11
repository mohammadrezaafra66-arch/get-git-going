SET client_encoding='UTF8';

-- ============================================================================
-- 334 — Internal read-only products + pricing API
-- ----------------------------------------------------------------------------
-- Purpose: give the project owner a single read-only HTTP endpoint (through the
-- PostgREST that already runs behind Kong on port 9000) that returns every
-- product together with every price that is actually live for it.
--
-- Nothing here writes. No table is created, altered or dropped. This migration
-- only adds two VIEWs, one NOLOGIN Postgres role, and grants.
--
-- Design notes (see docs/execution/internal-products-pricing-api-mission-COMPLETE.md):
--
--   * "current_price" mirrors exactly what the app shows in sales search:
--     product_computed_prices.rounded_sale_price, keyed by
--     (product, sale_price_type, settlement_type). This is the pricing engine's
--     output, and it is what get_sales_search_products() returns today.
--
--   * "announced_price" / "previous_price" / "last_updated_at" come from
--     product_sale_price_history — the recorded/announced price trail, which is
--     also what get_product_sale_price() and the quote floor guard read.
--
--   * Baseline rows (settlement_type_id IS NULL) are emitted for every ACTIVE
--     sale price type even when there is no computed price yet, exactly like
--     get_sales_search_products() does. Per-settlement rows are emitted only
--     when a computed price actually exists.
--
--   * Price bounds (min / max / cap) are NOT re-implemented here. The nested
--     view calls the existing function public.get_product_price_bounds(), so the
--     floor the API reports and the floor the quote guard enforces can never
--     drift apart.
--
-- Security model:
--   * Both views are owned by supabase_admin, so they read their base tables
--     with the owner's rights (RLS on the base tables is bypassed *inside the
--     view*). That is deliberate: the access boundary for this API is the GRANT,
--     not RLS. The role below can SELECT these two views and nothing else — no
--     base table, no function, no other view.
--   * Because supabase_admin has ALTER DEFAULT PRIVILEGES granting new relations
--     to postgres/anon/authenticated/service_role, this migration explicitly
--     REVOKEs those grants. Without that revoke, any logged-in app user could
--     read purchase prices through these views. Do not remove the REVOKEs.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Flat view — one row per (product, sale price type, settlement type)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.api_product_price_rows AS
-- baseline rows: every active sale price type, whether or not it has a price
SELECT
    p.id                                        AS product_id,
    p.sku,
    p.name                                      AS product_name,
    b.name                                      AS brand_name,
    c.name                                      AS category_name,
    p.product_type::text                        AS product_type,
    p.stock_status::text                        AS stock_status,
    p.status::text                              AS product_status,
    p.is_active                                 AS product_is_active,
    p.base_currency,
    spt.id                                      AS sale_price_type_id,
    spt.code                                    AS sale_price_type_code,
    spt.title                                   AS sale_price_type_title,
    NULL::uuid                                  AS settlement_type_id,
    NULL::text                                  AS settlement_type_code,
    NULL::text                                  AS settlement_type_title,
    pcp.rounded_sale_price                      AS current_price,
    pcp.final_sale_price,
    hh.announced_price,
    hh.previous_price,
    hh.last_updated_at,
    pcp.input_purchase_price,
    pcp.input_currency,
    pcp.currency_rate,
    pcp.purchase_price_toman,
    pcp.shipping_cost,
    pcp.margin_amount,
    pcp.pricing_rule_id,
    pcp.computed_at,
    pcp.source                                  AS computed_source,
    (pcp.rounded_sale_price IS NOT NULL)        AS has_price,
    (spt.sort_order * 1000)                     AS sort_order
FROM public.products p
CROSS JOIN public.sale_price_types spt
LEFT JOIN public.brands b     ON b.id = p.brand_id
LEFT JOIN public.categories c ON c.id = p.category_id
LEFT JOIN public.product_computed_prices pcp
       ON pcp.product_id = p.id
      AND pcp.sale_price_type_id = spt.id
      AND pcp.settlement_type_id IS NULL
LEFT JOIN LATERAL (
    SELECT
        max(h.created_at)                                           AS last_updated_at,
        (array_agg(h.new_sale_price ORDER BY h.created_at DESC))[1] AS announced_price,
        (array_agg(h.new_sale_price ORDER BY h.created_at DESC))[2] AS previous_price
    FROM public.product_sale_price_history h
    WHERE h.product_id = p.id
      AND h.sale_price_type_id = spt.id
      AND h.settlement_type_id IS NULL
) hh ON true
WHERE spt.is_active = true

UNION ALL

-- per-settlement rows: only where the engine actually produced a price
SELECT
    p.id,
    p.sku,
    p.name,
    b.name,
    c.name,
    p.product_type::text,
    p.stock_status::text,
    p.status::text,
    p.is_active,
    p.base_currency,
    spt.id,
    spt.code,
    spt.title,
    st.id,
    st.code,
    st.title,
    pcp.rounded_sale_price,
    pcp.final_sale_price,
    hh.announced_price,
    hh.previous_price,
    hh.last_updated_at,
    pcp.input_purchase_price,
    pcp.input_currency,
    pcp.currency_rate,
    pcp.purchase_price_toman,
    pcp.shipping_cost,
    pcp.margin_amount,
    pcp.pricing_rule_id,
    pcp.computed_at,
    pcp.source,
    true,
    (spt.sort_order * 1000 + st.sort_order + 1)
FROM public.products p
JOIN public.sale_price_types spt ON spt.is_active = true
JOIN public.settlement_types st  ON st.is_active = true
JOIN public.product_computed_prices pcp
      ON pcp.product_id = p.id
     AND pcp.sale_price_type_id = spt.id
     AND pcp.settlement_type_id = st.id
LEFT JOIN public.brands b     ON b.id = p.brand_id
LEFT JOIN public.categories c ON c.id = p.category_id
LEFT JOIN LATERAL (
    SELECT
        max(h.created_at)                                           AS last_updated_at,
        (array_agg(h.new_sale_price ORDER BY h.created_at DESC))[1] AS announced_price,
        (array_agg(h.new_sale_price ORDER BY h.created_at DESC))[2] AS previous_price
    FROM public.product_sale_price_history h
    WHERE h.product_id = p.id
      AND h.sale_price_type_id = spt.id
      AND h.settlement_type_id = st.id
) hh ON true
WHERE pcp.rounded_sale_price IS NOT NULL;


COMMENT ON VIEW public.api_product_price_rows IS
  'Internal read-only API (migration 334): one row per product x sale price type x settlement type. Reachable only by role products_api_readonly.';


-- ---------------------------------------------------------------------------
-- 2) Nested view — one row per product, all of its prices in one JSON array
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.api_products_pricing AS
SELECT
    p.id                          AS product_id,
    p.sku,
    p.name,
    p.description,
    p.unit,
    p.product_type::text          AS product_type,
    p.stock_status::text          AS stock_status,
    p.status::text                AS product_status,
    p.is_active                   AS product_is_active,
    p.base_currency,
    p.color,
    p.capacity,
    p.model,
    p.primary_spec,
    p.barcode,
    p.accounting_code,
    p.torob_url,
    p.updated_at                  AS product_updated_at,
    CASE WHEN b.id IS NULL THEN NULL
         ELSE jsonb_build_object('id', b.id, 'name', b.name) END AS brand,
    CASE WHEN c.id IS NULL THEN NULL
         ELSE jsonb_build_object('id', c.id, 'name', c.name) END AS category,

    -- latest active purchase price, via the view that already exists for it
    CASE WHEN vpp.purchase_price_id IS NULL THEN NULL ELSE jsonb_build_object(
        'purchase_price_id',    vpp.purchase_price_id,
        'amount',               vpp.purchase_price,
        'currency',             vpp.currency,
        'effective_at',         vpp.effective_at,
        'expires_at',           vpp.expires_at,
        'amount_toman',         eng.purchase_price_toman,
        'currency_rate_used',   eng.currency_rate
    ) END AS purchase_price,

    -- floor / ceiling, straight from the existing shared function
    jsonb_build_object(
        'min_price',  pb.min_price,
        'max_price',  pb.max_price,
        'cap_price',  pb.cap_price,
        'has_any',    pb.has_any
    ) AS price_bounds,

    COALESCE(sp.sale_prices, '[]'::jsonb) AS sale_prices,
    sp.prices_last_updated_at,
    now() AS generated_at
FROM public.products p
LEFT JOIN public.brands b     ON b.id = p.brand_id
LEFT JOIN public.categories c ON c.id = p.category_id
-- NOTE: public.v_latest_active_purchase_prices already computes exactly this,
-- but it is declared security_invoker=true on purpose, so it reads
-- purchase_prices with the *caller's* rights and RLS. A role that has no grant
-- on purchase_prices therefore gets "permission denied for table
-- purchase_prices" through it (verified live in the 334 dry-run). Changing that
-- view's security_invoker flag would weaken an existing app-facing guarantee,
-- so its DISTINCT ON is repeated here instead. If that view's rule ever changes
-- (active / effective_at / expires_at / tie-break order), change it here too.
LEFT JOIN LATERAL (
    SELECT DISTINCT ON (pp.product_id)
           pp.id AS purchase_price_id,
           pp.currency,
           pp.purchase_price,
           pp.effective_at,
           pp.expires_at
    FROM public.purchase_prices pp
    WHERE pp.product_id = p.id
      AND pp.is_active = true
      AND pp.effective_at <= now()
      AND (pp.expires_at IS NULL OR pp.expires_at > now())
    ORDER BY pp.product_id, pp.effective_at DESC, pp.created_at DESC
) vpp ON true
LEFT JOIN LATERAL (
    -- the FX rate / toman cost the pricing engine actually used, most recent first
    SELECT pcp.purchase_price_toman, pcp.currency_rate
    FROM public.product_computed_prices pcp
    WHERE pcp.product_id = p.id
    ORDER BY pcp.computed_at DESC
    LIMIT 1
) eng ON true
LEFT JOIN LATERAL public.get_product_price_bounds(p.id, NULL) pb ON true
LEFT JOIN LATERAL (
    SELECT
        jsonb_agg(
            jsonb_build_object(
                'sale_price_type_id',    r.sale_price_type_id,
                'sale_price_type_code',  r.sale_price_type_code,
                'sale_price_type_title', r.sale_price_type_title,
                'settlement_type_id',    r.settlement_type_id,
                'settlement_type_code',  r.settlement_type_code,
                'settlement_type_title', r.settlement_type_title,
                'current_price',         r.current_price,
                'final_sale_price',      r.final_sale_price,
                'announced_price',       r.announced_price,
                'previous_price',        r.previous_price,
                'last_updated_at',       r.last_updated_at,
                'purchase_price_toman',  r.purchase_price_toman,
                'shipping_cost',         r.shipping_cost,
                'margin_amount',         r.margin_amount,
                'pricing_rule_id',       r.pricing_rule_id,
                'computed_at',           r.computed_at,
                'computed_source',       r.computed_source,
                'has_price',             r.has_price
            )
            ORDER BY r.sort_order
        )                        AS sale_prices,
        max(r.last_updated_at)   AS prices_last_updated_at
    FROM public.api_product_price_rows r
    WHERE r.product_id = p.id
) sp ON true;


COMMENT ON VIEW public.api_products_pricing IS
  'Internal read-only API (migration 334): one row per product with every live price nested in sale_prices. Reachable only by role products_api_readonly.';


-- ---------------------------------------------------------------------------
-- 3) A dedicated Postgres role for this API — separate from every app role
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'products_api_readonly') THEN
    CREATE ROLE products_api_readonly NOLOGIN NOINHERIT;
  END IF;
END
$$;

COMMENT ON ROLE products_api_readonly IS
  'Read-only internal products+pricing API (migration 334). SELECT on api_products_pricing and api_product_price_rows only. Never grant anything else to this role.';

-- PostgREST connects as authenticator and SET ROLEs into whatever the JWT says,
-- so authenticator must be a member of this role.
GRANT products_api_readonly TO authenticator;

GRANT USAGE ON SCHEMA public TO products_api_readonly;

GRANT SELECT ON public.api_products_pricing  TO products_api_readonly;
GRANT SELECT ON public.api_product_price_rows TO products_api_readonly;


-- ---------------------------------------------------------------------------
-- 4) Close the default-privilege hole (see header). MUST run after CREATE VIEW.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.api_products_pricing  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.api_product_price_rows FROM PUBLIC, anon, authenticated, service_role;

-- Re-assert the only grant that should exist, in case the revokes above ran wide.
GRANT SELECT ON public.api_products_pricing  TO products_api_readonly;
GRANT SELECT ON public.api_product_price_rows TO products_api_readonly;
