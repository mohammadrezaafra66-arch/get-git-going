 WITH label_sums AS (
         SELECT pll.product_id,
            COALESCE(sum(pl.weight), 0::bigint)::numeric AS label_weight_sum
           FROM product_label_links pll
             JOIN product_labels pl ON pl.id = pll.label_id AND pl.is_active = true
          GROUP BY pll.product_id
        ), sales_90d AS (
         SELECT ii.product_id,
            COALESCE(sum(ii.quantity), 0::numeric) AS qty_90d
           FROM invoice_items ii
             JOIN invoices i ON i.id = ii.invoice_id
          WHERE i.issue_date >= (CURRENT_DATE - '90 days'::interval) AND COALESCE(i.status, ''::text) <> 'cancelled'::text
          GROUP BY ii.product_id
        ), used_today AS (
         SELECT (audit_logs.diff ->> 'channel_id'::text)::uuid AS channel_id,
            count(*)::integer AS used
           FROM audit_logs
          WHERE audit_logs.action = 'promotion_suggestion_used'::text AND audit_logs.created_at >= (date_trunc('day'::text, (now() AT TIME ZONE 'Asia/Tehran'::text)) AT TIME ZONE 'Asia/Tehran'::text) AND audit_logs.diff ? 'channel_id'::text
          GROUP BY ((audit_logs.diff ->> 'channel_id'::text)::uuid)
        ), nom_today AS (
         SELECT pn.product_id,
            COALESCE(sum(pn.boost_applied), 0::numeric) AS raw_boost,
            count(*)::integer AS nomination_count,
            max(pn.created_at) AS last_nominated_at
           FROM promotion_nominations pn
          WHERE pn.nominated_on = (now() AT TIME ZONE 'Asia/Tehran'::text)::date AND pn.cancelled_at IS NULL
          GROUP BY pn.product_id
        ), def_policy AS (
         SELECT promotion_nomination_policy.boost_cap_per_product
           FROM promotion_nomination_policy
          WHERE promotion_nomination_policy.is_active AND promotion_nomination_policy.role IS NULL AND promotion_nomination_policy.user_id IS NULL
         LIMIT 1
        )
 SELECT p.id AS product_id,
    p.name AS product_name,
    p.sku,
    p.stock_status,
    mc.id AS channel_id,
    mc.name AS channel_name,
    COALESCE(ls.label_weight_sum, 0::numeric) AS label_weight_sum,
    mc.weight::numeric AS channel_weight,
        CASE p.stock_status::text
            WHEN 'available'::text THEN 1.0
            WHEN 'limited'::text THEN 0.6
            WHEN 'unknown'::text THEN 0.4
            ELSE 0.0
        END AS stock_factor,
    LEAST(3.0, 1::numeric + ln(1::numeric + COALESCE(s90.qty_90d, 0::numeric)) / 5::numeric) AS recency_factor,
    COALESCE(ls.label_weight_sum, 0::numeric) * mc.weight::numeric * COALESCE(p.promotion_weight, 1::numeric) *
        CASE p.stock_status::text
            WHEN 'available'::text THEN 1.0
            WHEN 'limited'::text THEN 0.6
            WHEN 'unknown'::text THEN 0.4
            ELSE 0.0
        END * LEAST(3.0, 1::numeric + ln(1::numeric + COALESCE(s90.qty_90d, 0::numeric)) / 5::numeric) +
        CASE
            WHEN dp.boost_cap_per_product IS NULL OR dp.boost_cap_per_product <= 0::numeric THEN COALESCE(nt.raw_boost, 0::numeric)
            ELSE LEAST(COALESCE(nt.raw_boost, 0::numeric), dp.boost_cap_per_product)
        END AS score,
    COALESCE(s90.qty_90d, 0::numeric) AS qty_90d,
    mc.daily_quota,
    COALESCE(ut.used, 0) AS used_today,
        CASE
            WHEN mc.daily_quota IS NULL OR mc.daily_quota = 0 THEN NULL::integer
            ELSE GREATEST(mc.daily_quota - COALESCE(ut.used, 0), 0)
        END AS remaining_today,
    COALESCE(ls.label_weight_sum, 0::numeric) * mc.weight::numeric * COALESCE(p.promotion_weight, 1::numeric) *
        CASE p.stock_status::text
            WHEN 'available'::text THEN 1.0
            WHEN 'limited'::text THEN 0.6
            WHEN 'unknown'::text THEN 0.4
            ELSE 0.0
        END * LEAST(3.0, 1::numeric + ln(1::numeric + COALESCE(s90.qty_90d, 0::numeric)) / 5::numeric) AS market_score,
        CASE
            WHEN dp.boost_cap_per_product IS NULL OR dp.boost_cap_per_product <= 0::numeric THEN COALESCE(nt.raw_boost, 0::numeric)
            ELSE LEAST(COALESCE(nt.raw_boost, 0::numeric), dp.boost_cap_per_product)
        END AS sales_nomination_boost,
    COALESCE(ls.label_weight_sum, 0::numeric) * mc.weight::numeric * COALESCE(p.promotion_weight, 1::numeric) *
        CASE p.stock_status::text
            WHEN 'available'::text THEN 1.0
            WHEN 'limited'::text THEN 0.6
            WHEN 'unknown'::text THEN 0.4
            ELSE 0.0
        END * LEAST(3.0, 1::numeric + ln(1::numeric + COALESCE(s90.qty_90d, 0::numeric)) / 5::numeric) +
        CASE
            WHEN dp.boost_cap_per_product IS NULL OR dp.boost_cap_per_product <= 0::numeric THEN COALESCE(nt.raw_boost, 0::numeric)
            ELSE LEAST(COALESCE(nt.raw_boost, 0::numeric), dp.boost_cap_per_product)
        END AS final_score,
    COALESCE(nt.nomination_count, 0) AS nomination_count,
    nt.last_nominated_at
   FROM products p
     CROSS JOIN marketing_channels mc
     LEFT JOIN label_sums ls ON ls.product_id = p.id
     LEFT JOIN sales_90d s90 ON s90.product_id = p.id
     LEFT JOIN used_today ut ON ut.channel_id = mc.id
     LEFT JOIN nom_today nt ON nt.product_id = p.id
     LEFT JOIN def_policy dp ON true
  WHERE p.is_active = true AND mc.is_active = true;
