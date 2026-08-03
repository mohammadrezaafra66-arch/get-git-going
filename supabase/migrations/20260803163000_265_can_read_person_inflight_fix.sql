SET client_encoding='UTF8';

-- =====================================================================
-- 265 — رفع رگرسیون مهاجرت ۲۶۴: ساخت شخص با INSERT ... RETURNING شکست می‌خورد
--
-- ── علامت ──────────────────────────────────────────────────────────────
-- پس از ۲۶۴، هر مسیر «ساخت شخص» در اپ با این خطا رد می‌شد:
--   ERROR: new row violates row-level security policy for table "persons"
-- هشت spec از e2e/persons که پیش از ۲۶۴ سبز بودند قرمز شدند
-- (person_create_full، CustomerForm، SupplierForm، ساخت درجای تأمین‌کننده، …).
--
-- ── علت ریشه‌ای ────────────────────────────────────────────────────────
-- INSERT ساده موفق است؛ INSERT ... RETURNING رد می‌شود. تفاوت همین‌جاست:
-- در PostgreSQL بندِ RETURNING سیاست **SELECT** را هم روی ردیف تازه اعمال می‌کند.
--
-- سیاست ۲۶۴ روی persons این بود:  USING (can_read_person(id))
-- و can_read_person تابعی STABLE است که خودش دوباره از جدول persons می‌خواند:
--   SELECT EXISTS (SELECT 1 FROM persons p WHERE p.id = p_person_id AND ...)
--
-- یک تابع STABLE با snapshot همان دستور اجرا می‌شود، و ردیفِ در حال درج هنوز
-- در آن snapshot نیست. پس زیرپرس‌وجو صفر ردیف می‌دهد، تابع false برمی‌گرداند،
-- و RETURNING رد می‌شود. این ربطی به نقش کاربر ندارد — برای admin هم رخ می‌دهد.
--
-- سیاست *قبل از* ۲۶۴ این مشکل را نداشت چون ستون visibility_scope را مستقیم روی
-- خودِ ردیف می‌خواند و اصلاً به جدول رجوع نمی‌کرد.
--
-- ── رفع ────────────────────────────────────────────────────────────────
-- قاعده به دو تابع تقسیم می‌شود، ولی همچنان **یک** منبع حقیقت دارد:
--
--   can_read_person_scoped(person_id, visibility_scope)
--     خودِ قاعده. scope را به‌عنوان ورودی می‌گیرد و هرگز از persons نمی‌خواند،
--     پس روی ردیفِ در حال درج هم درست کار می‌کند. سیاست persons از این استفاده
--     می‌کند و مقادیر را از ستون‌های همان ردیف می‌دهد.
--
--   can_read_person(person_id)
--     فقط یک پوشش: scope را از persons می‌خواند و به تابع بالا می‌سپارد.
--     سیاست‌های فرزند (person_identifiers، person_context_links) از این
--     استفاده می‌کنند، چون ردیف والدشان همیشه در دستوری *پیش‌تر* درج شده و در
--     snapshot دستور جاری دیده می‌شود.
--
-- منطق دسترسی عیناً همان ۲۶۴ است — هیچ نقشی چیز تازه‌ای نمی‌بیند و چیزی از دست
-- نمی‌دهد. تنها تغییر این است که scope از کجا خوانده می‌شود.
-- =====================================================================

-- ── قاعده: تنها منبع حقیقت ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_read_person_scoped(
  p_person_id        uuid,
  p_visibility_scope text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
       (p_visibility_scope = 'internal_general'
        AND public.has_any_role(auth.uid(),
              ARRAY['admin','manager','accountant','viewer']))
    OR (p_visibility_scope = 'restricted_finance'
        AND public.has_any_role(auth.uid(),
              ARRAY['admin','manager','accountant']))
    OR (p_visibility_scope = 'restricted_executive'
        AND public.has_any_role(auth.uid(),
              ARRAY['admin','manager']))
    -- sales: mirrors the customers ownership shape exactly (unchanged from 264)
    OR (p_visibility_scope = 'internal_general'
        AND public.has_role(auth.uid(), 'sales')
        AND EXISTS (
              SELECT 1
              FROM public.person_context_links pcl
              JOIN public.customers c ON c.id = pcl.ref_id
              WHERE pcl.person_id  = p_person_id
                AND pcl.ref_table  = 'customers'
                AND pcl.ended_at   IS NULL
                AND (c.responsible_id = auth.uid()
                     OR c.responsible_id IS NULL)
            ));
$$;

COMMENT ON FUNCTION public.can_read_person_scoped(uuid, text) IS
  'Single source of truth for person read access (migrations 264/265). Takes visibility_scope as an argument and never reads from persons, so it is correct for rows still being inserted (INSERT ... RETURNING applies the SELECT policy). Ownership shape mirrors the customers RLS policy; do not duplicate this logic inline.';

-- ── پوشش برای جدول‌های فرزند ─────────────────────────────────────────
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
      AND public.can_read_person_scoped(p.id, p.visibility_scope)
  );
$$;

COMMENT ON FUNCTION public.can_read_person(uuid) IS
  'Child-table wrapper over can_read_person_scoped (migration 265). Resolves visibility_scope from persons. Do NOT use this in the persons policy itself — it cannot see an in-flight row; use can_read_person_scoped(id, visibility_scope) there.';

REVOKE EXECUTE ON FUNCTION public.can_read_person_scoped(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_read_person_scoped(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_read_person(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_read_person(uuid) TO authenticated;

-- ── persons: قاعده روی ستون‌های خودِ ردیف ارزیابی می‌شود ─────────────
DROP POLICY IF EXISTS persons_select_by_visibility_scope ON public.persons;
CREATE POLICY persons_select_by_visibility_scope
  ON public.persons FOR SELECT TO authenticated
  USING (public.can_read_person_scoped(id, visibility_scope));

-- person_identifiers و person_context_links دست‌نخورده می‌مانند: همچنان
-- can_read_person(person_id) را صدا می‌زنند و این درست است، چون والدشان در
-- دستوری پیش‌تر درج شده و در snapshot دستور جاری قابل دیدن است.
