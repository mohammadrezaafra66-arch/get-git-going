SET client_encoding='UTF8';

-- =====================================================================
-- 264 — RLS مالکیت‌آگاه روی persons / person_identifiers / person_context_links
--
-- حفره (ممیزی ۲۲۰–۲۲۶، ریسک بحرانی D6-1، اثبات‌شده با فراخوان مستقیم PostgREST):
--   سیاست `customers` مالکیت‌محور است (responsible_id = uid())، ولی سیاست‌های
--   persons و فرزندانش فقط نقش‌محور بودند. نتیجه: فروشنده ردیف customers همکارش
--   را نمی‌دید، ولی شخصِ پشت آن و شناسه‌هایش (موبایل، ایمیل، کد ملی، شبا) را
--   کامل می‌خواند. شواهد پیش از رفع: docs/verification/pre-264-rls-evidence.json
--
-- قاعدهٔ جدید (تصمیم ۱۷ مالک):
--   admin / manager / accountant → همهٔ اشخاص (همچنان تابع visibility_scope)
--   viewer                       → بدون تغییر نسبت به امروز (پایین را ببینید)
--   sales                        → فقط اشخاصِ متصل به مشتریانِ تحت مسئولیت خودش
--   purchase_specialist          → بدون تغییر (پایین را ببینید)
--
-- شکل مالکیت عیناً از سیاست `customers` آینه شده است:
--   (c.responsible_id = auth.uid() OR c.responsible_id IS NULL)
-- هیچ مکانیزم مالکیت دومی اختراع نشده.
--
-- ── تصمیم‌های دامنه‌ای که عمداً گرفته شدند ──────────────────────────────
--
-- ۱) purchase_specialist: سند اجرا می‌گفت قاعده‌اش را «از مدل مالکیت موجود
--    تأمین‌کننده تأیید کن، اختراع نکن». چنین مدلی وجود ندارد — جدول suppliers
--    هیچ ستون مالکیتی ندارد (فقط created_by) و سیاست‌هایش کاملاً نقش‌محورند.
--    این نقش در سیاست قبلی persons اصلاً حضور نداشت، پس **اضافه هم نمی‌شود**:
--    افزودنش یک اعطای دسترسی تازه بود، نه رفع حفره. وضع موجود حفظ شد.
--    (تأیید مالک: ۲۰۲۶-۰۸-۰۳.)
--
-- ۲) viewer: تصمیم ۱۷ نقش viewer را در فهرست دریافت‌کنندگان دسترسی نام نبرده،
--    ولی سیاست فعلی به او همهٔ اشخاص internal_general را می‌دهد. تنگ‌کردن آن
--    یک تغییر رفتاری خارج از دامنهٔ این رفع است (۲ کاربر viewer فعال وجود دارد).
--    وضع موجود حفظ شد و به‌عنوان تصمیم باز به مالک گزارش می‌شود.
--
-- ۳) «شخص بتواند رکورد خودش را ببیند» در تصمیم ۱۷ خواسته شده ولی امروز
--    **پیاده‌شدنی نیست**: هیچ اتصالی از auth.users/profiles به persons وجود
--    ندارد. آن اتصال کار فاز ۴ (D8-3، ستون profiles.person_id) است. این بند
--    آگاهانه به فاز ۴ موکول شد.
--
-- روش: یک تابع SECURITY DEFINER به‌عنوان تنها منبع حقیقت قاعده، تا منطق در سه
-- سیاست تکرار نشود و بازگشت بی‌نهایت RLS هم رخ ندهد (سیاست‌های فرزند امروز
-- منطق را inline تکرار می‌کنند؛ همان تکرار عامل واگرایی است).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.can_read_person(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.persons p
    WHERE p.id = p_person_id
      AND (
            (p.visibility_scope = 'internal_general'
             AND public.has_any_role(auth.uid(),
                   ARRAY['admin','manager','accountant','viewer']))
         OR (p.visibility_scope = 'restricted_finance'
             AND public.has_any_role(auth.uid(),
                   ARRAY['admin','manager','accountant']))
         OR (p.visibility_scope = 'restricted_executive'
             AND public.has_any_role(auth.uid(),
                   ARRAY['admin','manager']))
         -- sales: mirrors the customers ownership shape exactly
         OR (p.visibility_scope = 'internal_general'
             AND public.has_role(auth.uid(), 'sales')
             AND EXISTS (
                   SELECT 1
                   FROM public.person_context_links pcl
                   JOIN public.customers c ON c.id = pcl.ref_id
                   WHERE pcl.person_id  = p.id
                     AND pcl.ref_table  = 'customers'
                     AND pcl.ended_at   IS NULL
                     AND (c.responsible_id = auth.uid()
                          OR c.responsible_id IS NULL)
                 ))
          )
  );
$$;

COMMENT ON FUNCTION public.can_read_person(uuid) IS
  'Single source of truth for person read access (migration 264). Ownership shape mirrors the customers RLS policy; do not duplicate this logic inline.';

REVOKE EXECUTE ON FUNCTION public.can_read_person(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_read_person(uuid) TO authenticated;

-- ── persons ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS persons_select_by_visibility_scope ON public.persons;
CREATE POLICY persons_select_by_visibility_scope
  ON public.persons FOR SELECT TO authenticated
  USING (public.can_read_person(id));

-- ── person_identifiers (this is where the mobile/national-id leak was) ──
DROP POLICY IF EXISTS person_identifiers_select_via_person ON public.person_identifiers;
CREATE POLICY person_identifiers_select_via_person
  ON public.person_identifiers FOR SELECT TO authenticated
  USING (public.can_read_person(person_id));

-- ── person_context_links ─────────────────────────────────────────────
DROP POLICY IF EXISTS person_context_links_select_via_person ON public.person_context_links;
CREATE POLICY person_context_links_select_via_person
  ON public.person_context_links FOR SELECT TO authenticated
  USING (public.can_read_person(person_id));

-- Supporting index: the ownership branch walks person -> context link -> customer.
-- idx_pcl_person_id and idx_pcl_ref already exist; this partial index targets the
-- exact predicate so the branch does not degrade to a seq scan as rows grow.
CREATE INDEX IF NOT EXISTS idx_pcl_person_customer_active
  ON public.person_context_links (person_id, ref_id)
  WHERE ref_table = 'customers' AND ended_at IS NULL;
