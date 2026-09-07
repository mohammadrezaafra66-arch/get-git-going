SET client_encoding='UTF8';

-- 512 · زیرساخت واردسازی CDR ایزابل (C-4 / C-5)
--
-- این مهاجرت هیچ ردیفی وارد نمی‌کند. فقط چهار چیزی را می‌سازد که importer
-- بدون آن‌ها نمی‌تواند درست کار کند، و هر چهار مورد از یک تصمیم مالک می‌آید:
--
--   D-56b · employee_id قابل NULL می‌شود، تا تماس بی‌پاسخ و تماس داخلی هم
--           وارد شوند و «حجم کل تماس» و «تعداد بی‌پاسخ» صادق بمانند.
--   D-40  · تاریخ go-live به‌صورت یک ردیف تنظیمات ذخیره می‌شود، نه ثابت در کد،
--           و importer در نبودش اجرا نمی‌شود (نگهبان جاروی ۱٬۸۶۵٬۲۴۸ ردیفی).
--   C-5   · تابع تطبیق شماره → شخص، که روی همان normalize_identifier موجود
--           سوار می‌شود و نرمال‌سازی موازی نمی‌سازد.
--   قاعده ۱۱ پروژه · ایندکس برای کوئری watermark همین importer.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ۱) D-56b — employee_id قابل NULL
-- ─────────────────────────────────────────────────────────────────────────────
-- اندازه‌گیری‌شده پیش از این تغییر: call_logs.employee_id NOT NULL بود و
-- call_log_extensions فقط یک ردیف داشت (داخلی 101) که employee_id اش NULL است
-- و در کل جدول cdr ایزابل حتی یک بار هم دیده نمی‌شود. یعنی با NOT NULL،
-- تعداد ردیف‌های قابل واردسازی دقیقاً صفر بود.
ALTER TABLE public.call_logs
  ALTER COLUMN employee_id DROP NOT NULL;

COMMENT ON COLUMN public.call_logs.employee_id IS
  'کارشناس مسئول تماس. از روی call_log_extensions و داخلیِ پاسخ‌دهنده پر می‌شود. '
  'NULL یعنی داخلیِ تماس هنوز به کارمندی نگاشت نشده، یا تماس در صف روی چند داخلی '
  'زنگ خورده و هیچ‌کس پاسخ نداده — که طبق D-56a یک تماس بی‌پاسخ است، نه چند تا.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ۲) D-40 — تاریخ go-live به‌عنوان تنظیمات، نه ثابت کد
-- ─────────────────────────────────────────────────────────────────────────────
-- shop_settings همان جدول کلید/مقدار عمومی‌ای است که این پروژه از قبل دارد
-- (کلید یکتا؛ امروز ۲۶ کلید از دامنه‌های نامرتبط: gamification، دیدار، حسابداری).
-- طبق قاعده ۱۴ پروژه جدول تنظیمات موازی ساخته نمی‌شود.
INSERT INTO public.shop_settings (key, value)
VALUES ('issabel_import_since_date', '2026-09-07')
ON CONFLICT (key) DO NOTHING;

-- پیشوند شماره‌گیری خط بیرون روی این مرکز تلفن.
-- ⚠️ این مقدار «۹» از روی فراوانی شکل شماره‌ها استنتاج شده، نه از extensions.conf
-- خوانده شده: در ۳۰ روز، ستون dst در dcontext='from-internal' با طول ۱۲ و
-- سه نویسهٔ اول «909» تکرار می‌شود که یعنی «9» + یک موبایل ۱۱ رقمی «09XXXXXXXXX».
-- اگر روزی ادمین مرکز تلفن پیشوند را عوض کند، همین ردیف باید عوض شود و
-- هیچ کدی نیاز به تغییر ندارد.
INSERT INTO public.shop_settings (key, value)
VALUES ('issabel_outbound_dial_prefix', '9')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- ۳) قاعده ۱۱ — ایندکس برای کوئری watermark
-- ─────────────────────────────────────────────────────────────────────────────
-- importer در هر اجرا می‌پرسد «آخرین تماسی که از ایزابل وارد کردم کِی بود؟».
-- با ~۸۸۷ تماس در روز این جدول سالانه ~۳۲۴ هزار ردیف می‌شود و آن کوئری
-- بدون ایندکس به seq scan می‌افتد.
CREATE INDEX IF NOT EXISTS idx_call_logs_source_started
  ON public.call_logs (source, started_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ۴) C-5 — تطبیق شمارهٔ خام CDR با شخص
-- ─────────────────────────────────────────────────────────────────────────────
-- روی normalize_identifier موجود سوار می‌شود؛ نرمال‌سازِ دومی ساخته نمی‌شود.
-- شرط status <> 'revoked' عیناً همان شرطی است که ایندکس یکتای
-- uq_person_identifiers_contact_global دارد، پس یک شماره حداکثر یک شخص می‌دهد.
CREATE OR REPLACE FUNCTION public.call_import_match_persons(_raw_numbers text[])
RETURNS TABLE (raw_number text, person_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT DISTINCT ON (r.raw_number)
         r.raw_number,
         pi.person_id
    FROM unnest(_raw_numbers) AS r(raw_number)
    JOIN public.person_identifiers pi
      ON pi.kind = 'mobile_e164'
     AND pi.status <> 'revoked'
     AND pi.value_normalized = public.normalize_identifier('mobile_e164', r.raw_number, false)
   WHERE r.raw_number IS NOT NULL
     AND r.raw_number <> ''
   ORDER BY r.raw_number, pi.is_primary DESC, pi.created_at;
$function$;

COMMENT ON FUNCTION public.call_import_match_persons(text[]) IS
  'C-5 · نگاشت شمارهٔ خام CDR به شخص، از راه normalize_identifier. '
  'شماره‌ای که تطبیق نخورد اصلاً در نتیجه نمی‌آید؛ فراخواننده باید آن را '
  'customer_id NULL و metadata.unknown_number=true ثبت کند. '
  'فقط service_role — importer سمت سرور تنها فراخوانندهٔ آن است.';

-- REVOKE در همین مهاجرت، طبق قاعدهٔ پروژه. مالک تابع supabase_admin است و
-- این مهاجرت هم با supabase_admin اجرا می‌شود، پس REVOKE واقعاً اثر دارد.
REVOKE ALL ON FUNCTION public.call_import_match_persons(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.call_import_match_persons(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.call_import_match_persons(text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.call_import_match_persons(text[]) TO service_role;

COMMIT;
