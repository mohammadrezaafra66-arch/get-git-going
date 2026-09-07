SET client_encoding='UTF8';

-- 516 · باریک کردن دسترسی دو view گزارش تلفن به SELECT (اصلاح ۵۱۴)
--
-- ۵۱۴ فقط `GRANT SELECT ... TO authenticated` داشت و از `authenticated` چیزی
-- REVOKE نکرده بود. اثرش اندازه‌گیری شد، نه فرض:
--
--   v_call_extension_hourly :: ... | authenticated=arwdDxt/supabase_admin | ...
--
-- یعنی نقش authenticated روی هر دو view حق INSERT/UPDATE/DELETE/TRUNCATE هم
-- داشت. علتش این است که این پایگاه یک ALTER DEFAULT PRIVILEGES دارد که روی هر
-- جدول یا view تازه `arwdDxt` را به postgres و authenticated و service_role
-- می‌دهد:
--
--   supabase_admin|r|postgres=arwdDxt/... | authenticated=arwdDxt/... | service_role=arwdDxt/...
--
-- پس GRANT من افزودنی بود و چیزی را باریک نکرد. در عمل چون هر دو view
-- GROUP BY دارند auto-updatable نیستند و نوشتن رویشان خطا می‌دهد، ولی حق
-- نوشتنی که هرگز نباید وجود داشته باشد نباید در acl بماند.
--
-- ۵۱۴ ویرایش نمی‌شود؛ اصلاح در یک مهاجرت تازه می‌آید.
-- (REVOKE مربوط به anon در ۵۱۴ کار کرده بود — acl هیچ ردی از anon ندارد،
--  در حالی که viewهای قدیمی‌تر مثل employee_monthly_hours هنوز anon=arwdDxt دارند.)

BEGIN;

REVOKE ALL ON public.v_call_extension_hourly FROM authenticated;
REVOKE ALL ON public.v_call_extension_daily  FROM authenticated;

GRANT SELECT ON public.v_call_extension_hourly TO authenticated;
GRANT SELECT ON public.v_call_extension_daily  TO authenticated;

-- service_role هم فقط خواندن لازم دارد؛ این viewها گزارش‌اند.
REVOKE ALL ON public.v_call_extension_hourly FROM service_role;
REVOKE ALL ON public.v_call_extension_daily  FROM service_role;

GRANT SELECT ON public.v_call_extension_hourly TO service_role;
GRANT SELECT ON public.v_call_extension_daily  TO service_role;

COMMIT;
