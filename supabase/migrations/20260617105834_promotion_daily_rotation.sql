-- =====================================================================
-- Migration: افزودن چرخش روزانه به پیشنهادهای تبلیغاتی
-- تاریخ: 2026-06-17
-- توضیح: هر روز یه seed از تاریخ ساخته میشه و به هر محصول
--         یه ضریب تصادفی ثابت (برای همون روز) اضافه میشه
--         تا ترتیب پیشنهادها هر روز تغییر کنه.
-- شدت: متوسط — ضریب بین 0.7 تا 1.3
-- =====================================================================

-- بازسازی view با اضافه کردن rotation_factor روزانه
CREATE OR REPLACE VIEW public.v_promotion_suggestions AS
WITH label_sums AS (
  SELECT pll.product_id,
         COALESCE(SUM(pl.weight), 0)::numeric AS label_weight_sum
  FROM public.product_label_links pll
  JOIN public.product_labels pl ON pl.id = pll.label_id AND pl.is_active = true
  GROUP BY pll.product_id
),
sales_90d AS (
  SELECT ii.product_id,
         COALESCE(SUM(ii.quantity), 0)::numeric AS qty_90d
  FROM public.invoice_items ii
  JOIN public.invoices i ON i.id = ii.invoice_id
  WHERE i.issue_date >= (CURRENT_DATE - INTERVAL '90 days')
    AND COALESCE(i.status, '') <> 'cancelled'
  GROUP BY ii.product_id
),
used_today AS (
  SELECT (diff->>'channel_id')::uuid AS channel_id,
         COUNT(*)::int AS used
  FROM public.audit_logs
  WHERE action = 'promotion_suggestion_used'
    AND created_at >= (date_trunc('day', (now() AT TIME ZONE 'Asia/Tehran')) AT TIME ZONE 'Asia/Tehran')
    AND diff ? 'channel_id'
  GROUP BY 1
),
-- seed روزانه: از تاریخ امروز یه عدد صحیح میسازیم
daily_seed AS (
  SELECT EXTRACT(EPOCH FROM date_trunc('day', CURRENT_DATE))::bigint AS seed_val
)
SELECT
  p.id           AS product_id,
  p.name         AS product_name,
  p.sku          AS sku,
  p.stock_status AS stock_status,
  mc.id          AS channel_id,
  mc.name        AS channel_name,
  COALESCE(ls.label_weight_sum, 0)::numeric AS label_weight_sum,
  mc.weight::numeric AS channel_weight,
  (CASE p.stock_status::text
     WHEN 'available' THEN 1.0
     WHEN 'limited'   THEN 0.6
     WHEN 'unknown'   THEN 0.4
     ELSE 0.0
   END)::numeric AS stock_factor,
  LEAST(3.0, 1 + ln(1 + COALESCE(s90.qty_90d, 0)) / 5)::numeric AS recency_factor,
  -- ضریب چرخش روزانه: بین 0.7 تا 1.3
  -- seed از تاریخ + product_id + channel_id ساخته میشه → هر جفت (محصول×کانال) ضریب منحصربه‌فرد داره
  (0.7 + 0.6 * (
    (hashtext(ds.seed_val::text || p.id::text || mc.id::text) & 2147483647)::numeric
    / 2147483647.0
  ))::numeric AS rotation_factor,
  -- امتیاز پایه (بدون چرخش) — برای مرجع
  (
    COALESCE(ls.label_weight_sum, 0)
    * mc.weight
    * (CASE p.stock_status::text
         WHEN 'available' THEN 1.0
         WHEN 'limited'   THEN 0.6
         WHEN 'unknown'   THEN 0.4
         ELSE 0.0
       END)
    * LEAST(3.0, 1 + ln(1 + COALESCE(s90.qty_90d, 0)) / 5)
  )::numeric AS base_score,
  -- امتیاز نهایی = امتیاز پایه × ضریب چرخش
  (
    COALESCE(ls.label_weight_sum, 0)
    * mc.weight
    * (CASE p.stock_status::text
         WHEN 'available' THEN 1.0
         WHEN 'limited'   THEN 0.6
         WHEN 'unknown'   THEN 0.4
         ELSE 0.0
       END)
    * LEAST(3.0, 1 + ln(1 + COALESCE(s90.qty_90d, 0)) / 5)
    * (0.7 + 0.6 * (
        (hashtext(ds.seed_val::text || p.id::text || mc.id::text) & 2147483647)::numeric
        / 2147483647.0
      ))
  )::numeric AS score,
  COALESCE(s90.qty_90d, 0)::numeric AS qty_90d,
  mc.daily_quota AS daily_quota,
  COALESCE(ut.used, 0)::int AS used_today,
  CASE
    WHEN mc.daily_quota IS NULL OR mc.daily_quota = 0 THEN NULL
    ELSE GREATEST(mc.daily_quota - COALESCE(ut.used, 0), 0)
  END AS remaining_today
FROM public.products p
CROSS JOIN public.marketing_channels mc
CROSS JOIN daily_seed ds
LEFT JOIN label_sums ls ON ls.product_id = p.id
LEFT JOIN sales_90d  s90 ON s90.product_id = p.id
LEFT JOIN used_today ut ON ut.channel_id = mc.id
WHERE p.is_active = true
  AND mc.is_active = true;

ALTER VIEW public.v_promotion_suggestions SET (security_invoker = true);

-- بازسازی RPC (بدون تغییر در منطق فیلتر — فقط view عوض شده)
CREATE OR REPLACE FUNCTION public.compute_promotion_scores(
  _channel_id uuid DEFAULT NULL,
  _min_score  numeric DEFAULT 0,
  _limit      int DEFAULT 200
)
RETURNS SETOF public.v_promotion_suggestions
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.v_promotion_suggestions
  WHERE score > 0
    AND (_channel_id IS NULL OR channel_id = _channel_id)
    AND score >= COALESCE(_min_score, 0)
    AND (daily_quota IS NULL OR daily_quota = 0 OR used_today < daily_quota)
  ORDER BY score DESC, base_score DESC, product_id
  LIMIT GREATEST(COALESCE(_limit, 200), 1);
$$;

REVOKE ALL ON FUNCTION public.compute_promotion_scores(uuid, numeric, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compute_promotion_scores(uuid, numeric, int) TO authenticated;
