SET client_encoding='UTF8';

-- 521 · بستنِ EXECUTEِ پیش‌فرض روی تابعِ تریگرِ ۵۲۰ (C-1)
--
-- ۵۲۰ برای هر تابعی که ساخت REVOKE نوشت، ولی `proacl` بعد از اجرا اندازه
-- گرفته شد و برای تابعِ تریگر این را نشان داد:
--
--   staff_call_metrics_manual_guard()
--     {postgres=X/supabase_admin,supabase_admin=X/supabase_admin,
--      authenticated=X/supabase_admin,service_role=X/supabase_admin}
--
-- هیچ GRANTی برای این تابع نوشته نشده بود؛ منبعش
-- `ALTER DEFAULT PRIVILEGES` است (pg_default_acl یک ردیف
-- `{postgres=X,authenticated=X,service_role=X}` برای توابع دارد). این همان
-- دلیلی است که قاعده می‌گوید **proacl را اندازه بگیر، به دستور REVOKE اعتماد
-- نکن**.
--
-- قابل بهره‌برداری نیست — خودِ PostgreSQL صدا زدنِ مستقیم را رد می‌کند:
--   ERROR:  trigger functions can only be called as triggers
-- ولی PostgREST هر تابعِ public با EXECUTE برای authenticated را به‌عنوان یک
-- endpointِ /rpc عرضه می‌کند، و کمینه‌سازیِ سطح یعنی این ردیف نباشد.
-- anon از ابتدا در فهرست نبود.

BEGIN;

REVOKE ALL ON FUNCTION public.staff_call_metrics_manual_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_call_metrics_manual_guard() FROM anon;
REVOKE ALL ON FUNCTION public.staff_call_metrics_manual_guard() FROM authenticated;

COMMIT;
