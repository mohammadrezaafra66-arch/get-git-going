SET client_encoding='UTF8';

-- =====================================================================
-- 302 — platform_releases (user-facing release changelog)
--
-- Not an audit log. Only approved, published notes appear to users.
-- release_number is assigned on publish via sequence (never renumbered).
-- Down: docs/verification/302-down.sql
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS public.platform_release_number_seq;

CREATE TABLE IF NOT EXISTS public.platform_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_number bigint UNIQUE,
  version text,
  git_sha text,
  build_time timestamptz,
  title_fa text NOT NULL,
  summary_fa text NOT NULL,
  details_fa text,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT platform_releases_status_chk
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT platform_releases_category_chk
    CHECK (category IN (
      'قابلیت جدید',
      'بهبود',
      'رفع اشکال',
      'امنیت',
      'حسابداری',
      'فروش',
      'انبار',
      'اشخاص',
      'یکپارچه‌سازی',
      'زیرساخت'
    )),
  CONSTRAINT platform_releases_title_len_chk
    CHECK (char_length(btrim(title_fa)) BETWEEN 1 AND 200),
  CONSTRAINT platform_releases_summary_len_chk
    CHECK (char_length(btrim(summary_fa)) BETWEEN 1 AND 1000),
  CONSTRAINT platform_releases_details_len_chk
    CHECK (details_fa IS NULL OR char_length(details_fa) <= 8000),
  CONSTRAINT platform_releases_version_len_chk
    CHECK (version IS NULL OR char_length(version) <= 64),
  CONSTRAINT platform_releases_git_sha_chk
    CHECK (git_sha IS NULL OR git_sha ~ '^[0-9a-fA-F]{7,40}$'),
  CONSTRAINT platform_releases_items_array_chk
    CHECK (jsonb_typeof(items) = 'array'),
  CONSTRAINT platform_releases_published_shape_chk
    CHECK (
      (status = 'draft' AND release_number IS NULL AND published_at IS NULL)
      OR (status IN ('published', 'archived') AND release_number IS NOT NULL AND published_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.platform_releases IS
  'User-facing platform release notes. Drafts are admin-only; users see published only.';
COMMENT ON COLUMN public.platform_releases.release_number IS
  'Stable public sequential number assigned once at publish; never reused or renumbered.';
COMMENT ON COLUMN public.platform_releases.items IS
  'Ordered JSON array of {item_number, title_fa, description_fa, module_key?, route_path?, change_type?}';

CREATE INDEX IF NOT EXISTS idx_platform_releases_published_list
  ON public.platform_releases (release_number DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_platform_releases_admin_status
  ON public.platform_releases (status, updated_at DESC);

-- updated_at
CREATE OR REPLACE FUNCTION public.trg_platform_releases_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_releases_set_updated_at ON public.platform_releases;
CREATE TRIGGER platform_releases_set_updated_at
  BEFORE UPDATE ON public.platform_releases
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_platform_releases_set_updated_at();

-- Published rows are immutable except archive transition (status only).
CREATE OR REPLACE FUNCTION public.trg_platform_releases_protect_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IN ('published', 'archived') THEN
    IF NEW.status = 'archived' AND OLD.status = 'published'
       AND NEW.release_number IS NOT DISTINCT FROM OLD.release_number
       AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
       AND NEW.title_fa IS NOT DISTINCT FROM OLD.title_fa
       AND NEW.summary_fa IS NOT DISTINCT FROM OLD.summary_fa
       AND NEW.details_fa IS NOT DISTINCT FROM OLD.details_fa
       AND NEW.category IS NOT DISTINCT FROM OLD.category
       AND NEW.items IS NOT DISTINCT FROM OLD.items
       AND NEW.version IS NOT DISTINCT FROM OLD.version
       AND NEW.git_sha IS NOT DISTINCT FROM OLD.git_sha
       AND NEW.build_time IS NOT DISTINCT FROM OLD.build_time
    THEN
      RETURN NEW;
    END IF;
    IF OLD.status = 'archived' THEN
      RAISE EXCEPTION 'نسخهٔ بایگانی‌شده قابل ویرایش نیست'
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'نسخهٔ منتشرشده فقط قابل بایگانی است و متن آن تغییر نمی‌کند'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_releases_protect_published ON public.platform_releases;
CREATE TRIGGER platform_releases_protect_published
  BEFORE UPDATE ON public.platform_releases
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_platform_releases_protect_published();

-- Publish RPC: assign stable number + published_at
CREATE OR REPLACE FUNCTION public.publish_platform_release(p_id uuid)
RETURNS public.platform_releases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.platform_releases;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'فقط مدیر سامانه می‌تواند نسخه را منتشر کند'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.platform_releases WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'نسخه یافت نشد' USING ERRCODE = 'P0002';
  END IF;
  IF r.status <> 'draft' THEN
    RAISE EXCEPTION 'فقط پیش‌نویس قابل انتشار است' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(COALESCE(r.items, '[]'::jsonb)) < 1 THEN
    RAISE EXCEPTION 'حداقل یک مورد تغییر لازم است' USING ERRCODE = '22023';
  END IF;

  UPDATE public.platform_releases
     SET status = 'published',
         release_number = nextval('public.platform_release_number_seq'),
         published_at = COALESCE(published_at, now()),
         updated_by = auth.uid()
   WHERE id = p_id
  RETURNING * INTO r;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'platform_release_published',
    'platform_release',
    r.id,
    auth.uid(),
    jsonb_build_object(
      'release_number', r.release_number,
      'title_fa', r.title_fa,
      'category', r.category,
      'git_sha', r.git_sha
    )
  );

  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_platform_release(p_id uuid)
RETURNS public.platform_releases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.platform_releases;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'فقط مدیر سامانه می‌تواند نسخه را بایگانی کند'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.platform_releases WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'نسخه یافت نشد' USING ERRCODE = 'P0002';
  END IF;
  IF r.status <> 'published' THEN
    RAISE EXCEPTION 'فقط نسخهٔ منتشرشده قابل بایگانی است' USING ERRCODE = '22023';
  END IF;

  UPDATE public.platform_releases
     SET status = 'archived',
         updated_by = auth.uid()
   WHERE id = p_id
  RETURNING * INTO r;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'platform_release_archived',
    'platform_release',
    r.id,
    auth.uid(),
    jsonb_build_object('release_number', r.release_number)
  );

  RETURN r;
END;
$$;

-- FORCE RLS applies to the table owner; these DEFINER RPCs must bypass RLS
-- after their own has_role('admin') gate (otherwise publish/archive cannot UPDATE).
ALTER FUNCTION public.publish_platform_release(uuid) SET row_security TO off;
ALTER FUNCTION public.archive_platform_release(uuid) SET row_security TO off;

REVOKE ALL ON FUNCTION public.publish_platform_release(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_platform_release(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_platform_release(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_platform_release(uuid) TO authenticated;

-- RLS
ALTER TABLE public.platform_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_releases FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_releases_select ON public.platform_releases;
CREATE POLICY platform_releases_select ON public.platform_releases
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS platform_releases_insert_admin ON public.platform_releases;
CREATE POLICY platform_releases_insert_admin ON public.platform_releases
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND status = 'draft'
    AND release_number IS NULL
    AND published_at IS NULL
  );

DROP POLICY IF EXISTS platform_releases_update_admin_draft ON public.platform_releases;
CREATE POLICY platform_releases_update_admin_draft ON public.platform_releases
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND status = 'draft'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND status = 'draft'
    AND release_number IS NULL
    AND published_at IS NULL
  );

DROP POLICY IF EXISTS platform_releases_delete_admin_draft ON public.platform_releases;
CREATE POLICY platform_releases_delete_admin_draft ON public.platform_releases
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND status = 'draft'
  );

REVOKE ALL ON TABLE public.platform_releases FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_releases FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_releases TO authenticated;

-- Sequence is only consumed inside publish_platform_release (SECURITY DEFINER).
REVOKE ALL ON SEQUENCE public.platform_release_number_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.platform_release_number_seq FROM anon;
REVOKE ALL ON SEQUENCE public.platform_release_number_seq FROM authenticated;

-- Audit entity allowlist (replace full list + platform_release)
CREATE OR REPLACE FUNCTION public.is_valid_audit_entity_type(_entity_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _entity_type = ANY(ARRAY[
    'ai_provider',
    'inquiry','invoice','customer','product','profile','user_role','supplier',
    'purchase_request','purchase_receipt','document','workflow_setting',
    'delivery_receipt','scoring_parameter','parameter_weight',
    'dynamic_entity_score','daily_capital_setting',
    'salesperson_capital_allocation_dynamic','customer_capital_allocation_dynamic',
    'category','brand','price_list','pricing_rule','sale_list','sales_quote',
    'payment_receipt','journal_entry','task','knowledge_article','mission',
    'achievement','league_season','gamification_kpi','gamification_reward',
    'employee_score','penalty_appeal','performance_penalty','credit_request',
    'credit_scoring_rule','feedback','feedback_item','message','messenger_group',
    'notification_event','api_key','didar_activity','market_rate_source',
    'currency_source','currency_rate','academy_course','academy_lesson',
    'academy_quiz','bank_account','external_party','person','call_log',
    'price_alert_rule','stock_alert_request','shipping_cost_rule','settlement_type',
    'payment_term','validation_rule','price_change_reason','recent_purchase_setting',
    'shop_settings','pricing_board_setting','product_label','product_attribute',
    'dynamic_table','marketing_channel','knowledge_document','daily_capital_input',
    'daily_capital_snapshot','capital_allocation_ledger','platform_release'
  ]);
$$;

-- role_permissions for every role (open door if module missing)
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name, 'platform-releases',
       true,
       r.role_name = 'admin',
       r.role_name = 'admin',
       r.role_name = 'admin',
       false,
       false,
       r.role_name = 'admin'
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'platform-releases'
 );

-- Historical seed (published). Numbers 1..5 via sequence in order.
-- Dates from PROGRESS / known deploy commits — user-facing wording only.
DO $seed$
DECLARE
  n bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_releases LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO public.platform_releases (
    release_number, version, git_sha, title_fa, summary_fa, details_fa, category, status, items, published_at
  ) VALUES
  (
    nextval('public.platform_release_number_seq'),
    NULL,
    '1d294f1e',
    'بهبود پرونده و فهرست اشخاص',
    'فازهای یکپارچه‌سازی اشخاص: مشاهدهٔ امن پرونده، جستجو و فیلتر فهرست، و مدیریت نام‌های دیگر.',
    NULL,
    'اشخاص',
    'published',
    '[
      {"item_number":1,"title_fa":"پروندهٔ فقط‌خواندنی شخص","description_fa":"مشاهدهٔ پرونده از فهرست اشخاص با دسترسی مناسب.","module_key":"persons","route_path":"/persons","change_type":"feature"},
      {"item_number":2,"title_fa":"جستجو و فیلتر امن","description_fa":"جستجوی شناسه/نام و فیلترهای فهرست بدون افشای دادهٔ غیرمجاز.","module_key":"persons","route_path":"/persons","change_type":"improvement"},
      {"item_number":3,"title_fa":"نام‌های دیگر","description_fa":"مدیریت نام‌های دیگر روی پروندهٔ شخص.","module_key":"persons","route_path":"/persons","change_type":"feature"}
    ]'::jsonb,
    '2026-08-05 12:00:00+00'
  ),
  (
    nextval('public.platform_release_number_seq'),
    NULL,
    'ef0c64ad',
    'لینک ترب و خروجی اکسل محصولات',
    'افزودن لینک اختیاری ترب به کالا و دکمهٔ خروجی اکسل کاتالوگ از صفحهٔ محصولات.',
    NULL,
    'قابلیت جدید',
    'published',
    '[
      {"item_number":1,"title_fa":"لینک ترب","description_fa":"ثبت و نمایش آدرس صفحهٔ ترب برای هر کالا.","module_key":"products","route_path":"/products","change_type":"feature"},
      {"item_number":2,"title_fa":"خروجی اکسل کاتالوگ","description_fa":"دانلود فهرست محصولات با فیلترهای جاری صفحه.","module_key":"products","route_path":"/products","change_type":"feature"}
    ]'::jsonb,
    '2026-08-05 15:00:00+00'
  ),
  (
    nextval('public.platform_release_number_seq'),
    NULL,
    '1f9425e6',
    'خروجی گروهی فروش برای آسان',
    'انتخاب بازهٔ تاریخ و چند پیش‌فاکتور برای ساخت یک فایل خروجی آسان.',
    NULL,
    'یکپارچه‌سازی',
    'published',
    '[
      {"item_number":1,"title_fa":"بازهٔ تاریخ","description_fa":"اعمال و پاک‌کردن بازه برای فهرست اسناد.","module_key":"asan-export","route_path":"/admin/asan-export","change_type":"feature"},
      {"item_number":2,"title_fa":"انتخاب گروهی","description_fa":"انتخاب چند پیش‌فاکتور قابل‌خروجی با سقف ایمن.","module_key":"asan-export","route_path":"/admin/asan-export","change_type":"feature"},
      {"item_number":3,"title_fa":"پیش‌نمایش و دانلود","description_fa":"تأیید شماره‌گذاری و دانلود یک فایل اکسل گروهی.","module_key":"asan-export","route_path":"/admin/asan-export","change_type":"feature"}
    ]'::jsonb,
    '2026-08-05 18:00:00+00'
  ),
  (
    nextval('public.platform_release_number_seq'),
    NULL,
    'dda3c4c7',
    'نام پلتفرم myafrakala.ir',
    'یکسان‌سازی نام نمایشی سامانه در هدر، ورود، عنوان مرورگر و نصب PWA.',
    NULL,
    'زیرساخت',
    'published',
    '[
      {"item_number":1,"title_fa":"برند یکپارچه","description_fa":"نمایش myafrakala.ir به‌عنوان نام رسمی سامانه در رابط کاربری.","module_key":"dashboard","route_path":"/dashboard","change_type":"improvement"},
      {"item_number":2,"title_fa":"عنوان صفحات و PWA","description_fa":"عنوان تب مرورگر و نام برنامهٔ نصب‌شده هم‌راستا با برند جدید.","change_type":"improvement"}
    ]'::jsonb,
    '2026-08-05 22:00:00+00'
  );

  SELECT last_value INTO n FROM public.platform_release_number_seq;
  PERFORM setval('public.platform_release_number_seq', n, true);
END;
$seed$;

DO $chk$
DECLARE n integer; roles integer;
BEGIN
  SELECT count(DISTINCT role_name) INTO roles FROM public.role_permissions;
  SELECT count(*) INTO n FROM public.role_permissions WHERE module = 'platform-releases';
  IF n <> roles THEN
    RAISE EXCEPTION 'platform-releases must have a row for all % roles, found %', roles, n;
  END IF;

  SELECT count(*) INTO n FROM public.role_permissions
   WHERE module = 'platform-releases' AND can_create AND role_name <> 'admin';
  IF n <> 0 THEN RAISE EXCEPTION 'non-admin roles must not create platform-releases'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relname = 'platform_releases' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'platform_releases RLS must be enabled';
  END IF;
END;
$chk$;
