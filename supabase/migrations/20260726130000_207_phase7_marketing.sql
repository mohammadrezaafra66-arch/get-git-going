-- Phase 7 — مارکتینگ: سقف رندوم کانال (۱۶۴/۱۶۵) + وزن مستقل محصول (۱۶۶)
--             + اتصال تبلیغ/نامزدی به گیمیفیکیشن (۱۶۷/۱۶۸)
--
-- هیچ داده‌ای حذف یا نوع ستونی عوض نمی‌شود. یک ستون با default خنثی (=۱)
-- اضافه می‌شود، یک ویو با CREATE OR REPLACE بازتعریف می‌گردد، و دو تریگر
-- رویداد امتیاز می‌سازند.

BEGIN;

-- ===========================================================================
-- ۱) وزن مستقل محصول در تبلیغات (۱۶۶)
--    `product_recommendation_overrides` برای این کار مناسب نیست (جدول
--    cross-sell محصول→محصول است، نه ضریب وزن). یک ستون سبک با پیش‌فرض خنثی.
-- ===========================================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS promotion_weight numeric NOT NULL DEFAULT 1;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_promotion_weight_chk;

ALTER TABLE public.products
  ADD CONSTRAINT products_promotion_weight_chk
  CHECK (promotion_weight >= 0 AND promotion_weight <= 100);

COMMENT ON COLUMN public.products.promotion_weight IS
  'ضریب وزن مستقل محصول در امتیاز تبلیغات (۱۶۶). پیش‌فرض ۱ = خنثی؛ در market_score ضرب می‌شود.';

-- ===========================================================================
-- ۲) v_promotion_suggestions — ضرب promotion_weight در market_score
--    ساختار ستون‌ها دقیقاً حفظ می‌شود (CREATE OR REPLACE اجازهٔ تغییر نمی‌دهد).
--    برای محصولاتی که وزنشان ۱ است، عدد دقیقاً مثل قبل می‌ماند (بدون regression).
-- ===========================================================================
CREATE OR REPLACE VIEW public.v_promotion_suggestions AS
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

-- ===========================================================================
-- ۳) سقف کانال = انتخاب رندومِ پایدارِ روزانه (۱۶۴/۱۶۵)
--    قبلاً یک گیت بولی روی کل کانال بود (used_today < daily_quota) و همهٔ
--    واجدشرایط‌ها را برمی‌گرداند. حالا برای هر کانال حداکثر daily_quota محصول
--    انتخاب می‌شود، رندوم ولی پایدار در طول روز: کلید مرتب‌سازی
--    md5(channel_id || تاریخ تهران || product_id) در طول روز ثابت است، پس
--    refresh دوباره همان مجموعه را می‌دهد.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.compute_promotion_scores(
  _channel_id uuid DEFAULT NULL::uuid,
  _min_score numeric DEFAULT 0,
  _limit integer DEFAULT 200
)
RETURNS SETOF public.v_promotion_suggestions
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH eligible AS (
    SELECT v.*,
      ROW_NUMBER() OVER (
        PARTITION BY v.channel_id
        ORDER BY md5(
          v.channel_id::text
          || ((now() AT TIME ZONE 'Asia/Tehran')::date)::text
          || v.product_id::text
        )
      ) AS rn
    FROM public.v_promotion_suggestions v
    WHERE v.score > 0
      AND v.stock_factor > 0
      AND (_channel_id IS NULL OR v.channel_id = _channel_id)
      AND v.score >= COALESCE(_min_score, 0)
  )
  SELECT
    e.product_id, e.product_name, e.sku, e.stock_status,
    e.channel_id, e.channel_name, e.label_weight_sum, e.channel_weight,
    e.stock_factor, e.recency_factor, e.score, e.qty_90d,
    e.daily_quota, e.used_today, e.remaining_today, e.market_score,
    e.sales_nomination_boost, e.final_score, e.nomination_count, e.last_nominated_at
  FROM eligible e
  WHERE e.daily_quota IS NULL OR e.daily_quota = 0 OR e.rn <= e.daily_quota
  ORDER BY e.final_score DESC, e.score DESC
  LIMIT GREATEST(COALESCE(_limit, 200), 1);
$function$;

-- ===========================================================================
-- ۴) اتصال تبلیغ/نامزدی به گیمیفیکیشن (۱۶۷/۱۶۸)
-- ===========================================================================

-- ۴.۱ ثبت رویداد در فهرست قوانین KPI (کلید مورد انتظار تست فاز)
INSERT INTO public.gamification_kpi_rules
  (title_fa, title_en, description, event_key, xp_amount, is_active, sort_order)
SELECT
  'انجام تبلیغ / نامزدی محصول',
  'Promotion completed',
  'هر بار که مسئول مارکتینگ از یک پیشنهاد تبلیغ استفاده کند یا محصولی را برای تبلیغ نامزد کند.',
  'promotion_completed', 15, true, 120
WHERE NOT EXISTS (
  SELECT 1 FROM public.gamification_kpi_rules WHERE event_key = 'promotion_completed'
);

-- ۴.۲ KPI امتیازدهی که واقعاً در لیدربرد شمرده می‌شود.
--     مقیاس: شمارشی مثل deals_registered (وزن ۳) — تبلیغ کمی سبک‌تر: ۲.
INSERT INTO public.gamification_kpis
  (key, label_fa, description, weight, enabled, team_scope, source, unit, direction, display_order)
SELECT
  'promotions_completed',
  'تبلیغ‌های انجام‌شده',
  'تعداد استفاده از پیشنهاد تبلیغ + نامزدی محصول توسط کاربر.',
  2, true, 'all', 'employee_score_events', 'مورد', 'higher_better', 120
WHERE NOT EXISTS (
  SELECT 1 FROM public.gamification_kpis WHERE key = 'promotions_completed'
);

-- ۴.۳ ایندکس برای شمارش سریع رویدادهای تبلیغ در بازه‌های امتیازدهی
CREATE INDEX IF NOT EXISTS idx_employee_score_events_promotion
  ON public.employee_score_events (employee_id, triggered_at DESC)
  WHERE event_type = 'promotion_completed';

-- ۴.۴ تریگر: استفاده از پیشنهاد تبلیغ (audit_logs) → رویداد امتیاز
CREATE OR REPLACE FUNCTION public.trg_promotion_used_score_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.action = 'promotion_suggestion_used' AND NEW.actor_id IS NOT NULL THEN
    INSERT INTO public.employee_score_events
      (employee_id, event_type, source_table, source_id, payload)
    VALUES (
      NEW.actor_id, 'promotion_completed', 'audit_logs', NEW.id::text,
      jsonb_build_object(
        'product_id', NEW.diff ->> 'product_id',
        'channel_id', NEW.diff ->> 'channel_id',
        'origin', 'suggestion_used'
      )
    );
    -- امتیاز بلافاصله بازمحاسبه می‌شود تا در لیدربرد دیده شود (۱۶۸).
    PERFORM public.calculate_employee_score(NEW.actor_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_promotion_used_score ON public.audit_logs;
CREATE TRIGGER trg_audit_promotion_used_score
  AFTER INSERT ON public.audit_logs
  FOR EACH ROW
  WHEN (NEW.action = 'promotion_suggestion_used')
  EXECUTE FUNCTION public.trg_promotion_used_score_event();

-- ۴.۵ تریگر: نامزدی محصول برای تبلیغ → رویداد امتیاز
CREATE OR REPLACE FUNCTION public.trg_promotion_nomination_score_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.employee_score_events
    (employee_id, event_type, source_table, source_id, payload)
  VALUES (
    NEW.nominated_by, 'promotion_completed', 'promotion_nominations', NEW.id::text,
    jsonb_build_object(
      'product_id', NEW.product_id,
      'channel_id', NEW.channel_id,
      'origin', 'nomination'
    )
  );
  PERFORM public.calculate_employee_score(NEW.nominated_by);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_promotion_nominations_score ON public.promotion_nominations;
CREATE TRIGGER trg_promotion_nominations_score
  AFTER INSERT ON public.promotion_nominations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_promotion_nomination_score_event();

COMMIT;
