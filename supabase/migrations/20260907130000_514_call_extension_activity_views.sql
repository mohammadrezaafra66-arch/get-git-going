SET client_encoding='UTF8';

-- 514 · گزارش فعالیت تلفنی به تفکیک داخلی (C-8)
--
-- دو view، نه دو مسیر داده: view روزانه خودش روی view ساعتی سوار است، پس
-- منطق شمارش یک جا تعریف شده و صفحهٔ گزارش برای فیلتر ساعت و فیلتر روز از
-- همان تعریف می‌خواند.
--
-- روز و ساعت به وقت تهران محاسبه می‌شوند، دقیقاً با همان عبارتی که
-- `public.tehran_today()` استفاده می‌کند:
--     tehran_today() = (now() AT TIME ZONE 'Asia/Tehran')::date
-- هیچ‌جا CURRENT_DATE نیست. این مهم است چون یک تماس ساعت ۰۲:۰۰ تهران در UTC
-- به روز قبل می‌افتد و بدون این تبدیل در گزارش روز اشتباه می‌نشست.
--
-- ── گارد دسترسی ───────────────────────────────────────────────────────────
-- این viewها با اختیار مالکشان اجرا می‌شوند (security_invoker پیش‌فرض false)،
-- پس شرط WHERE پایین **خودِ گارد** است، نه یک فیلتر راحتی:
--   admin و manager همه چیز را می‌بینند؛
--   هر کاربر دیگر (از جمله sales) فقط داخلی‌هایی را که در call_log_extensions
--   به خودش نگاشت شده‌اند.
-- کاربری که هیچ داخلی‌ای به او نگاشت نشده هیچ ردیفی نمی‌بیند — نه «همه چیز».
-- security_barrier می‌گذاریم تا planner شرط کاربر را قبل از این گارد اجرا نکند.

BEGIN;

-- ایندکس پشتیبان فیلتر «داخلی + بازهٔ تاریخ» (قاعدهٔ ۱۱ پروژه).
-- امروز ۱۴۲۹ ردیف است ولی با ~۸۸۷ تماس در روز سالانه ~۳۲۴ هزار می‌شود.
CREATE INDEX IF NOT EXISTS idx_call_logs_extension_started
  ON public.call_logs (extension, started_at DESC)
  WHERE extension IS NOT NULL;

CREATE OR REPLACE VIEW public.v_call_extension_hourly
WITH (security_barrier = true) AS
  SELECT
    cl.extension,
    (cl.started_at AT TIME ZONE 'Asia/Tehran')::date              AS call_date,
    EXTRACT(hour FROM (cl.started_at AT TIME ZONE 'Asia/Tehran'))::int AS call_hour,
    COUNT(*)                                                       AS total_calls,
    COUNT(*) FILTER (WHERE cl.direction = 'inbound')               AS inbound_count,
    COUNT(*) FILTER (WHERE cl.direction = 'outbound')              AS outbound_count,
    COUNT(*) FILTER (WHERE cl.direction = 'internal')              AS internal_count,
    COUNT(*) FILTER (WHERE cl.is_missed)                           AS missed_count,
    ROUND(COALESCE(SUM(cl.duration_seconds), 0) / 60.0, 1)         AS talk_minutes
  FROM public.call_logs cl
  WHERE cl.extension IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR cl.extension IN (
        SELECT e.extension
          FROM public.call_log_extensions e
         WHERE e.employee_id = auth.uid()
      )
    )
  GROUP BY 1, 2, 3;

COMMENT ON VIEW public.v_call_extension_hourly IS
  'C-8 · فعالیت تلفنی هر داخلی، به تفکیک روز و ساعتِ تهران. '
  'گارد داخل خودِ view است: admin و manager همه را می‌بینند، بقیه فقط داخلی‌های '
  'نگاشت‌شده به خودشان در call_log_extensions.';

CREATE OR REPLACE VIEW public.v_call_extension_daily
WITH (security_barrier = true) AS
  SELECT
    h.extension,
    h.call_date,
    SUM(h.total_calls)::bigint    AS total_calls,
    SUM(h.inbound_count)::bigint  AS inbound_count,
    SUM(h.outbound_count)::bigint AS outbound_count,
    SUM(h.internal_count)::bigint AS internal_count,
    SUM(h.missed_count)::bigint   AS missed_count,
    ROUND(SUM(h.talk_minutes), 1) AS talk_minutes
  FROM public.v_call_extension_hourly h
  GROUP BY 1, 2;

COMMENT ON VIEW public.v_call_extension_daily IS
  'C-8 · جمع روزانهٔ همان تعریف ساعتی. منطق شمارش تکرار نشده — این view روی '
  'v_call_extension_hourly سوار است، پس گارد دسترسی هم همان یکی است.';

-- گرنت‌ها در همان مهاجرت. anon هیچ‌چیز نمی‌گیرد.
REVOKE ALL ON public.v_call_extension_hourly FROM PUBLIC;
REVOKE ALL ON public.v_call_extension_hourly FROM anon;
REVOKE ALL ON public.v_call_extension_daily  FROM PUBLIC;
REVOKE ALL ON public.v_call_extension_daily  FROM anon;

GRANT SELECT ON public.v_call_extension_hourly TO authenticated;
GRANT SELECT ON public.v_call_extension_hourly TO service_role;
GRANT SELECT ON public.v_call_extension_daily  TO authenticated;
GRANT SELECT ON public.v_call_extension_daily  TO service_role;

COMMIT;
