SET client_encoding='UTF8';

-- =====================================================================
-- 272 — آستانه‌های نسخه‌دار سطح امتیاز (فاز ۵ · تصمیم D8-4)
--
-- تصمیم مالک — چهار باند مساوی ۲۰تایی:
--   ۸۰–۱۰۰  عالی
--   ۶۰–۷۹   قابل اعتماد
--   ۴۰–۵۹   متوسط
--   ۰–۳۹    پرریسک
--
-- snapshot تعریف زنده: docs/verification/pre-272/calculate_dynamic_score.sql
-- خط پایهٔ برابری عددی:   docs/verification/pre-272/parity-baseline.txt
--
-- ── مقیاس عدد — چیزی که باید اول روشن می‌شد ──────────────────────────
-- `calculate_dynamic_score` عددی به نام `weighted_score` می‌دهد که **۰ تا ۱**
-- است، نه ۰ تا ۱۰۰ (اندازه‌گیری شد: `dynamic_entity_scores.raw_score` بین
-- ۰.۰۰۰ و ۱.۰۰۰ است و امتیاز وزنی میانگین وزنیِ همان‌هاست؛ مقادیر واقعی مثل
-- ۰.۲۳۴۰۵۰ و ۱.۰۰۰۰۰۰).
--
-- ولی باندهای مالک روی مقیاس ۰–۱۰۰ نوشته شده‌اند، و **رابط هم از قبل همان
-- تبدیل را دارد**: `DynamicScoringSection.tsx` می‌نویسد
-- `weightedPct = weighted * 100` (کلمپ‌شده بین ۰ و ۱۰۰).
--
-- پس آستانه‌ها در دامنهٔ **۰–۱۰۰** ذخیره می‌شوند (همان چیزی که مالک نوشته و
-- کاربر می‌بیند) و تابع جست‌وجو ورودی ۰..۱ را ×۱۰۰ می‌کند. اگر آستانه‌ها را
-- ۰..۱ ذخیره می‌کردیم، عددِ روی صفحه و عددِ داخل جدول دو زبان مختلف حرف می‌زدند.
--
-- ── الگو: عیناً از `dynamic_parameter_weights` ───────────────────────
-- سند می‌گوید «دقیقاً بر اساس `dynamic_parameter_weights` مدل کن». تعریف زندهٔ
-- آن جدول اول خوانده شد و همان انضباط آینه شد:
--   • `valid_from date NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)`
--   • `valid_to date NULL`  +  CHECK (valid_to IS NULL OR valid_to > valid_from)
--   • `created_by`/`created_at`
--   • **EXCLUDE با gist** که هم‌پوشانی بازه‌ها را غیرممکن می‌کند — همان کاری که
--     `dyn_param_weights_no_overlap` می‌کند. (افزونهٔ `btree_gist` از قبل نصب
--     است، چون آن constraint از `parameter_id WITH =` استفاده می‌کند.)
--   • سیاست‌ها: نوشتن فقط admin، خواندن برای authenticated — عیناً همان دو
--     سیاستِ `dyn_param_weights_admin_write` / `dyn_param_weights_read_authenticated`.
--
-- ── چرا بازه به‌جای دو ستون min/max ──────────────────────────────────
-- `numrange` با کران پایینِ بسته و بالای باز (`[)`) شکاف و هم‌پوشانی را از
-- ریشه حذف می‌کند: امتیاز ۳۹.۵ یا ۷۹.۹ جایی می‌افتد و دقیقاً یک جا. با دو ستون
-- عددی، «۰–۳۹» و «۴۰–۵۹» عدد ۳۹.۵ را بی‌خانمان می‌گذاشتند. باند بالا کران بالا
-- ندارد تا خودِ ۱۰۰ (و هر عدد کلمپ‌نشدهٔ بالاتر) داخلش بیفتد.
--
-- ── دامنه‌ای که عمداً اضافه نشد ──────────────────────────────────────
-- ستون `entity_type` **اضافه نشد**. مالک یک مجموعه باند تعریف کرده، نه یکی برای
-- مشتری و یکی برای کارشناس. افزودن آن بُعد یعنی اختراع دامنه‌ای که خواسته نشده.
-- اگر روزی لازم شد، افزودن ستون + گنجاندنش در همان EXCLUDE کار ساده‌ای است.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.score_level_thresholds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_code    text        NOT NULL,
  label_fa      text        NOT NULL,
  score_range   numrange    NOT NULL,
  display_order int         NOT NULL DEFAULT 0,
  valid_from    date        NOT NULL DEFAULT (date_trunc('month', CURRENT_DATE))::date,
  valid_to      date,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT score_level_thresholds_validity_check
    CHECK (valid_to IS NULL OR valid_to > valid_from),
  -- No two bands may overlap in score AND be in force at the same time.
  -- Mirrors dyn_param_weights_no_overlap.
  CONSTRAINT score_level_thresholds_no_overlap
    EXCLUDE USING gist (
      score_range WITH &&,
      daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[)') WITH &&
    )
);

COMMENT ON TABLE public.score_level_thresholds IS
  'D8-4 (migration 272): versioned score bands. Modelled on dynamic_parameter_weights -- same valid_from/valid_to discipline, same no-overlap EXCLUDE, same admin-write/authenticated-read policies. score_range is on the 0-100 presentation scale, which is what the UI already shows (weighted_score * 100).';

COMMENT ON COLUMN public.score_level_thresholds.score_range IS
  'Half-open [min,max): gap-free and overlap-free, so 39.5 and 79.9 each land in exactly one band. The top band has no upper bound so 100 itself is included.';

CREATE INDEX IF NOT EXISTS idx_score_level_thresholds_validity
  ON public.score_level_thresholds (valid_from, valid_to);

ALTER TABLE public.score_level_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS score_level_thresholds_read_authenticated ON public.score_level_thresholds;
CREATE POLICY score_level_thresholds_read_authenticated
  ON public.score_level_thresholds FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS score_level_thresholds_admin_write ON public.score_level_thresholds;
CREATE POLICY score_level_thresholds_admin_write
  ON public.score_level_thresholds FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']));

REVOKE ALL ON public.score_level_thresholds FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.score_level_thresholds TO authenticated;

-- ── seed: the owner's four bands, in force from the current period ────
INSERT INTO public.score_level_thresholds (level_code, label_fa, score_range, display_order, valid_from)
SELECT * FROM (VALUES
  ('high_risk',  'پرریسک',      numrange(0,   40,   '[)'), 1, (date_trunc('month', CURRENT_DATE))::date),
  ('medium',     'متوسط',       numrange(40,  60,   '[)'), 2, (date_trunc('month', CURRENT_DATE))::date),
  ('trusted',    'قابل اعتماد', numrange(60,  80,   '[)'), 3, (date_trunc('month', CURRENT_DATE))::date),
  ('excellent',  'عالی',        numrange(80,  NULL, '[)'), 4, (date_trunc('month', CURRENT_DATE))::date)
) AS v(level_code, label_fa, score_range, display_order, valid_from)
WHERE NOT EXISTS (SELECT 1 FROM public.score_level_thresholds);

-- ── lookup: resolves against the version in force AT THE SCORE'S PERIOD ──
CREATE OR REPLACE FUNCTION public.score_level_at(
  p_weighted_score numeric,
  p_period_month   date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
              'level_code', t.level_code,
              'level_label', t.label_fa,
              'level_order', t.display_order,
              'score_pct',   ROUND(COALESCE(p_weighted_score, 0) * 100, 2))
       FROM public.score_level_thresholds t
      WHERE t.score_range @> (COALESCE(p_weighted_score, 0) * 100)::numeric
        -- The version in force at the SCORE'S period, not today's version.
        AND t.valid_from <= p_period_month
        AND (t.valid_to IS NULL OR t.valid_to > p_period_month)
      ORDER BY t.valid_from DESC
      LIMIT 1),
    jsonb_build_object(
      'level_code',  NULL,
      'level_label', NULL,
      'level_order', NULL,
      'score_pct',   ROUND(COALESCE(p_weighted_score, 0) * 100, 2))
  );
$$;

COMMENT ON FUNCTION public.score_level_at(numeric, date) IS
  'D8-4 (migration 272): resolves a 0..1 weighted score to its band, using the threshold version in force AT p_period_month -- not the version in force today. Changing the bands next year must not relabel last year''s scores. Returns NULLs (not an error) when no version covers that period, so historical scores from before the thresholds existed still render.';

REVOKE EXECUTE ON FUNCTION public.score_level_at(numeric, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.score_level_at(numeric, date) TO authenticated;


-- ── سطح به خروجی تابع امتیاز اضافه می‌شود ────────────────────────────
-- بدنه بایت‌به‌بایت از تعریف زنده است و **هیچ خطی از ریاضیات عوض نشده**؛ فقط
-- چند کلید به jsonb خروجی merge می‌شود. گیت برابری عددی همین را اثبات می‌کند.
CREATE OR REPLACE FUNCTION public.calculate_dynamic_score(p_entity_type text, p_entity_id uuid, p_period_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period date;
  v_total_active_weight numeric := 0;
  v_weighted_score numeric := 0;
  v_params_active int := 0;
  v_params_evaluated int := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF p_entity_type NOT IN ('customer','salesperson') THEN
    RAISE EXCEPTION 'entity_type نامعتبر: %', p_entity_type;
  END IF;
  v_period := date_trunc('month', COALESCE(p_period_month, current_date))::date;

  SELECT COALESCE(SUM(w.weight), 0)
  INTO v_total_active_weight
  FROM dynamic_scoring_parameters p
  JOIN dynamic_parameter_weights w
    ON w.parameter_id = p.id
    AND w.valid_from <= v_period
    AND (w.valid_to IS NULL OR w.valid_to >= v_period)
  JOIN dynamic_entity_scores s
    ON s.parameter_id = p.id
    AND s.entity_type = p_entity_type
    AND s.entity_id = p_entity_id
    AND s.period_month = v_period
  WHERE p.entity_type = p_entity_type
    AND p.is_active = true;

  SELECT COUNT(*)
  INTO v_params_active
  FROM dynamic_scoring_parameters
  WHERE entity_type = p_entity_type AND is_active = true;

  SELECT
    COUNT(*) FILTER (WHERE s.raw_score IS NOT NULL),
    jsonb_agg(
      jsonb_build_object(
        'parameter_code',    p.code,
        'parameter_name',    p.label_fa,
        'input_type',        p.input_type,
        'unit_label',        p.unit_label,
        'min_value',         p.min_value,
        'max_value',         p.max_value,
        'actual_value',      s.actual_value,
        'is_clipped',        COALESCE(s.is_clipped, false),
        'raw_score',         s.raw_score,
        'raw_weight',        w.weight,
        'normalized_weight', CASE
                                WHEN s.raw_score IS NOT NULL AND v_total_active_weight > 0
                                THEN ROUND((w.weight / v_total_active_weight)::numeric, 6)
                                ELSE 0
                              END,
        'contribution',      CASE
                                WHEN s.raw_score IS NOT NULL AND v_total_active_weight > 0
                                THEN ROUND((s.raw_score * w.weight / v_total_active_weight)::numeric, 6)
                                ELSE 0
                              END,
        'has_score',         s.raw_score IS NOT NULL
      ) ORDER BY p.display_order
    )
  INTO v_params_evaluated, v_breakdown
  FROM dynamic_scoring_parameters p
  LEFT JOIN dynamic_parameter_weights w
    ON w.parameter_id = p.id
    AND w.valid_from <= v_period
    AND (w.valid_to IS NULL OR w.valid_to >= v_period)
  LEFT JOIN dynamic_entity_scores s
    ON s.parameter_id = p.id
    AND s.entity_type = p_entity_type
    AND s.entity_id = p_entity_id
    AND s.period_month = v_period
  WHERE p.entity_type = p_entity_type
    AND p.is_active = true;

  IF v_total_active_weight > 0 THEN
    SELECT COALESCE(SUM(s.raw_score * w.weight / v_total_active_weight), 0)
    INTO v_weighted_score
    FROM dynamic_scoring_parameters p
    JOIN dynamic_parameter_weights w
      ON w.parameter_id = p.id
      AND w.valid_from <= v_period
      AND (w.valid_to IS NULL OR w.valid_to >= v_period)
    JOIN dynamic_entity_scores s
      ON s.parameter_id = p.id
      AND s.entity_type = p_entity_type
      AND s.entity_id = p_entity_id
      AND s.period_month = v_period
    WHERE p.entity_type = p_entity_type
      AND p.is_active = true;
  END IF;

  v_result := jsonb_build_object(
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'period_month', v_period,
    'weighted_score', ROUND(v_weighted_score::numeric, 6),
    'total_active_weight', v_total_active_weight,
    'params_active', v_params_active,
    'params_evaluated', COALESCE(v_params_evaluated, 0),
    'breakdown', COALESCE(v_breakdown, '[]'::jsonb)
  );

  -- D8-4 (migration 272): attach the band. This MERGES extra keys onto the
  -- result and touches none of the arithmetic above -- weighted_score and every
  -- other field are produced by exactly the same code as before. The band is
  -- resolved against v_period, so a score from three months ago shows the label
  -- it had then, not today's.
  v_result := v_result || public.score_level_at(ROUND(v_weighted_score::numeric, 6), v_period);

  RETURN v_result;
END $function$;
