-- =====================================================================
-- AfraKala UAT — Reference Seed Data
-- =====================================================================
-- هدف: تولید «دادهٔ مرجع» موردنیاز بستهٔ تست پذیرش (products, suppliers,
-- persons, customers, currency rate). دادهٔ تراکنشی (پیش‌فاکتور/فاکتور)
-- را خودِ تسترها حین تست می‌سازند (RLS فروش مالکیت‌محور است).
--
-- نحوهٔ اجرا (روی کانتینر self-host):
--   docker exec -i -e PGPASSWORD="<PASS>" afrakala-lan-db \
--     psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 < docs/qa/seed-data.sql
--   docker restart afrakala-lan-rest
--
-- همهٔ ردیف‌ها نشانگر دارند تا پیش از تحویل به مشتری قابل‌حذف باشند:
--   products      → name LIKE 'QA-%'
--   suppliers     → notes = 'qa_seed'
--   customers     → notes = 'qa_seed'
--   persons       → notes = 'qa_seed'
--   currency_rates→ source_name = 'qa_seed'
-- بلوکِ حذف در انتهای همین فایل (کامنت‌شده) قرار دارد.
--
-- ⚠️ همهٔ این داده + حساب‌های test.* باید پیش از تحویل به مشتری حذف شوند.
-- اسکریپت re-runnable است: اول ردیف‌های qa_seed قبلی را پاک می‌کند.
-- =====================================================================

BEGIN;

-- ---------- 0) پاک‌سازی اجرای قبلی (idempotent) ----------
DELETE FROM public.currency_rates WHERE source_name = 'qa_seed';
DELETE FROM public.customers      WHERE notes = 'qa_seed';
DELETE FROM public.persons        WHERE notes = 'qa_seed';
DELETE FROM public.suppliers      WHERE notes = 'qa_seed';
DELETE FROM public.products       WHERE name LIKE 'QA-%';

-- ---------- 1) نرخ ارز فعال (usd) ----------
-- فقط اگر نرخ فعال usd وجود ندارد درج می‌شود تا با منطق «یک نرخ فعال» تداخل نکند.
INSERT INTO public.currency_rates (currency, rate_to_toman, source_name, is_active, effective_at)
SELECT 'usd', 60000, 'qa_seed', true, now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.currency_rates WHERE currency = 'usd' AND is_active = true
);

-- ---------- 2) پنج تأمین‌کننده ----------
INSERT INTO public.suppliers (name, phone, city, trust_level, is_active, status, notes)
VALUES
  ('QA- تأمین‌کننده الف', '02100000001', 'تهران',   'high',   true, 'active', 'qa_seed'),
  ('QA- تأمین‌کننده ب',  '02100000002', 'اصفهان',  'medium', true, 'active', 'qa_seed'),
  ('QA- تأمین‌کننده ج',  '02100000003', 'مشهد',    'medium', true, 'active', 'qa_seed'),
  ('QA- تأمین‌کننده د',  '02100000004', 'شیراز',   'low',    true, 'active', 'qa_seed'),
  ('QA- تأمین‌کننده ه',  '02100000005', 'تبریز',   'high',   true, 'active', 'qa_seed');

-- ---------- 3) ده شخص (با visibility_scope متفاوت برای تست RLS نقش+visibility) ----------
-- internal_general → همهٔ نقش‌ها می‌بینند
-- restricted_finance → admin/manager/accountant
-- restricted_executive → admin/manager
-- kind مجاز: 'individual' یا 'organization' (طبق persons_kind_check)
INSERT INTO public.persons (kind, display_name, legal_name, visibility_scope, is_active, notes)
VALUES
  ('individual',   'QA- شخص عمومی ۱',   NULL,                       'internal_general',     true, 'qa_seed'),
  ('individual',   'QA- شخص عمومی ۲',   NULL,                       'internal_general',     true, 'qa_seed'),
  ('individual',   'QA- شخص عمومی ۳',   NULL,                       'internal_general',     true, 'qa_seed'),
  ('organization', 'QA- شرکت عمومی ۱',  'QA- شرکت عمومی ۱ (ثبتی)',  'internal_general',     true, 'qa_seed'),
  ('organization', 'QA- شرکت عمومی ۲',  'QA- شرکت عمومی ۲ (ثبتی)',  'internal_general',     true, 'qa_seed'),
  ('individual',   'QA- شخص مالی ۱',    NULL,                       'restricted_finance',   true, 'qa_seed'),
  ('individual',   'QA- شخص مالی ۲',    NULL,                       'restricted_finance',   true, 'qa_seed'),
  ('organization', 'QA- شرکت مالی ۱',   'QA- شرکت مالی ۱ (ثبتی)',   'restricted_finance',   true, 'qa_seed'),
  ('individual',   'QA- شخص محرمانه ۱', NULL,                       'restricted_executive', true, 'qa_seed'),
  ('organization', 'QA- شرکت محرمانه ۱','QA- شرکت محرمانه ۱ (ثبتی)','restricted_executive', true, 'qa_seed');

-- ---------- 4) پنج مشتری ----------
-- responsible_id = NULL → طبق RLS، فروشندگان مشتریان بدون‌مسئول را هم می‌بینند
-- (دادهٔ مرجع مشترک). مشتریِ دارای مسئول را تسترها خودشان می‌سازند.
INSERT INTO public.customers (name, phone, city, responsible_id, is_active, notes)
VALUES
  ('QA- مشتری ۱', '09120000001', 'تهران',  NULL, true, 'qa_seed'),
  ('QA- مشتری ۲', '09120000002', 'کرج',    NULL, true, 'qa_seed'),
  ('QA- مشتری ۳', '09120000003', 'اصفهان', NULL, true, 'qa_seed'),
  ('QA- مشتری ۴', '09120000004', 'مشهد',   NULL, true, 'qa_seed'),
  ('QA- مشتری ۵', '09120000005', 'شیراز',  NULL, true, 'qa_seed');

-- ---------- 5) بیست محصول ----------
-- stock_status='available' تا در «جستجوی سریع فروش» ظاهر شوند.
-- brand_id/category_id عمداً NULL است (اختیاری‌اند)؛ اگر می‌خواهی به برند/دستهٔ
-- واقعی وصل شوند، ستون‌ها را با idهای معتبر پر کن.
INSERT INTO public.products (name, product_type, base_currency, stock_status, status, is_active)
SELECT
  'QA- محصول تست ' || gs,
  (CASE WHEN gs % 3 = 0 THEN 'foreign' ELSE 'iranian' END)::product_type,
  'toman',
  'available'::stock_status,
  'active'::product_status,
  true
FROM generate_series(1, 20) AS gs;

COMMIT;

-- ---------- گزارش شمارش پس از اجرا ----------
SELECT 'products(QA-)'  AS entity, count(*) FROM public.products  WHERE name LIKE 'QA-%'
UNION ALL SELECT 'suppliers(qa)', count(*) FROM public.suppliers  WHERE notes='qa_seed'
UNION ALL SELECT 'persons(qa)',   count(*) FROM public.persons    WHERE notes='qa_seed'
UNION ALL SELECT 'customers(qa)', count(*) FROM public.customers  WHERE notes='qa_seed'
UNION ALL SELECT 'currency(qa)',  count(*) FROM public.currency_rates WHERE source_name='qa_seed';

-- =====================================================================
-- ⚠️ بلوک حذف پیش از تحویل به مشتری (کامنت‌شده — دستی اجرا کن)
-- =====================================================================
-- BEGIN;
--   DELETE FROM public.products       WHERE name LIKE 'QA-%';
--   DELETE FROM public.suppliers      WHERE notes = 'qa_seed';
--   DELETE FROM public.persons        WHERE notes = 'qa_seed';
--   DELETE FROM public.customers      WHERE notes = 'qa_seed';
--   DELETE FROM public.currency_rates WHERE source_name = 'qa_seed';
--   -- و همچنین: حذف حساب‌های test.* از auth.users / user_roles
--   -- و حذف دادهٔ تراکنشیِ ساخته‌شده توسط تسترها (پیشوندهای ARM-/NIL-/HAN-/MRA-).
-- COMMIT;
-- =====================================================================
-- یادداشت‌ها:
--   • این اسکریپت فقط دادهٔ مرجع می‌سازد. برای تست کاملِ قیمت‌گذاری، هر محصول
--     به «قیمت خرید فعال» + «انتشار قیمت» نیاز دارد که تستر/توسعه‌دهنده جدا انجام می‌دهد.
--   • اگر جدول products تریگر شمارندهٔ SKU دارد، SKU به‌صورت خودکار تولید می‌شود.
--   • ⚠️ نیاز به تأیید توسعه‌دهنده: اگر برای تست باید محصولات به برند/دستهٔ خاص
--     یا قیمت خرید وصل باشند، این اسکریپت را گسترش بده.
-- =====================================================================
