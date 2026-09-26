SET client_encoding='UTF8';

-- ============================================================================
-- 587 — Didar deal parity: additive columns, catalogs, 7 stages, seeds
-- Safe on production data: IF NOT EXISTS / WHERE NOT EXISTS. Does not move
-- auto_event. Does not fill won_at/lost_at. Does not add IsPaid.
-- ============================================================================

SET lock_timeout = '60s';

-- ---------- pipelines: probability + total-rotten ----------
ALTER TABLE public.sales_pipelines
  ADD COLUMN IF NOT EXISTS probability_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rotten_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS total_rotten_days integer NULL DEFAULT 45;

ALTER TABLE public.sales_pipelines
  DROP CONSTRAINT IF EXISTS sales_pipelines_total_rotten_days_check;
ALTER TABLE public.sales_pipelines
  ADD CONSTRAINT sales_pipelines_total_rotten_days_check
  CHECK (total_rotten_days IS NULL OR total_rotten_days >= 0);

-- ---------- stages: description, probability, idle/rotten ----------
ALTER TABLE public.sales_pipeline_stages
  ADD COLUMN IF NOT EXISTS description text NULL,
  ADD COLUMN IF NOT EXISTS probability integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS idle_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rotten_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS idle_days integer NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS rotten_days integer NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS warning_percent integer NULL DEFAULT 80;

ALTER TABLE public.sales_pipeline_stages
  DROP CONSTRAINT IF EXISTS sales_pipeline_stages_probability_check;
ALTER TABLE public.sales_pipeline_stages
  ADD CONSTRAINT sales_pipeline_stages_probability_check
  CHECK (probability >= 0 AND probability <= 100);

ALTER TABLE public.sales_pipeline_stages
  DROP CONSTRAINT IF EXISTS sales_pipeline_stages_idle_days_check;
ALTER TABLE public.sales_pipeline_stages
  ADD CONSTRAINT sales_pipeline_stages_idle_days_check
  CHECK (idle_days IS NULL OR idle_days >= 0);

ALTER TABLE public.sales_pipeline_stages
  DROP CONSTRAINT IF EXISTS sales_pipeline_stages_rotten_days_check;
ALTER TABLE public.sales_pipeline_stages
  ADD CONSTRAINT sales_pipeline_stages_rotten_days_check
  CHECK (rotten_days IS NULL OR rotten_days >= 0);

ALTER TABLE public.sales_pipeline_stages
  DROP CONSTRAINT IF EXISTS sales_pipeline_stages_warning_percent_check;
ALTER TABLE public.sales_pipeline_stages
  ADD CONSTRAINT sales_pipeline_stages_warning_percent_check
  CHECK (warning_percent IS NULL OR (warning_percent >= 0 AND warning_percent <= 100));

UPDATE public.sales_pipeline_stages
   SET idle_enabled = true,
       rotten_enabled = true,
       idle_days = COALESCE(idle_days, 7),
       rotten_days = COALESCE(rotten_days, 14),
       probability = COALESCE(probability, 100)
 WHERE idle_days IS DISTINCT FROM 7
    OR rotten_days IS DISTINCT FROM 14
    OR idle_enabled IS DISTINCT FROM true
    OR rotten_enabled IS DISTINCT FROM true
    OR probability IS DISTINCT FROM 100;

-- ---------- interactions: deal extras (nullable / safe defaults) ----------
ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS probability integer NULL,
  ADD COLUMN IF NOT EXISTS probability_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS register_time timestamptz NULL,
  ADD COLUMN IF NOT EXISTS expected_close_on date NULL,
  ADD COLUMN IF NOT EXISTS display_code integer NULL,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS acquaintance_id uuid NULL,
  ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NULL;

-- Register company_person_id in live person_merge BEFORE the persons FK (328 gate).
-- Patch inside the database so Persian exception text is not re-encoded.
DO $reg$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef('public.person_merge(uuid,uuid,text)'::regprocedure) INTO def;
  IF def IS NULL THEN
    RAISE EXCEPTION 'person_merge missing';
  END IF;
  IF position('sales_interactions.company_person_id' in def) = 0 THEN
    IF position('sales_interactions.person_id' in def) = 0 THEN
      RAISE EXCEPTION 'live person_merge has no sales_interactions.person_id key';
    END IF;
    def := replace(
      def,
      '''sales_interactions.person_id'',                          ''generic'',',
      '''sales_interactions.person_id'',                          ''generic'','
      || E'\n    ''sales_interactions.company_person_id'',                  ''generic'','
    );
    EXECUTE def;
  END IF;
END
$reg$;

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS company_person_id uuid NULL REFERENCES public.persons(id);

CREATE UNIQUE INDEX IF NOT EXISTS sales_interactions_display_code_uid
  ON public.sales_interactions (display_code)
  WHERE display_code IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.sales_deal_display_code_seq
  AS integer
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  OWNED BY NONE;

-- ---------- catalogs ----------
CREATE TABLE IF NOT EXISTS public.deal_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  color text NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_tags_title_nonempty CHECK (btrim(title) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS deal_tags_title_uid ON public.deal_tags (title);

CREATE TABLE IF NOT EXISTS public.sales_interaction_tags (
  interaction_id uuid NOT NULL REFERENCES public.sales_interactions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.deal_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (interaction_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.acquaintance_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acquaintance_methods_title_nonempty CHECK (btrim(title) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS acquaintance_methods_title_uid
  ON public.acquaintance_methods (title);

DO $fk_acq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sales_interactions_acquaintance_fk'
       AND conrelid = 'public.sales_interactions'::regclass
  ) THEN
    ALTER TABLE public.sales_interactions
      ADD CONSTRAINT sales_interactions_acquaintance_fk
      FOREIGN KEY (acquaintance_id) REFERENCES public.acquaintance_methods(id);
  END IF;
END
$fk_acq$;

CREATE TABLE IF NOT EXISTS public.deal_related_users (
  interaction_id uuid NOT NULL REFERENCES public.sales_interactions(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (interaction_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.deal_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_field_definitions_title_nonempty CHECK (btrim(title) <> ''),
  CONSTRAINT deal_field_definitions_type_check
    CHECK (field_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'bool'::text, 'select'::text]))
);

CREATE TABLE IF NOT EXISTS public.deal_field_values (
  interaction_id uuid NOT NULL REFERENCES public.sales_interactions(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES public.deal_field_definitions(id) ON DELETE CASCADE,
  value_text text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (interaction_id, definition_id)
);

CREATE TABLE IF NOT EXISTS public.deal_field_stage_rules (
  definition_id uuid NOT NULL REFERENCES public.deal_field_definitions(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.sales_pipeline_stages(id) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT true,
  PRIMARY KEY (definition_id, stage_id)
);

-- ---------- seed 7 stages AFTER stage 3; do not touch auto_event ----------
INSERT INTO public.sales_pipeline_stages (id, pipeline_id, title, sort_order, is_active, auto_event, probability, idle_enabled, rotten_enabled, idle_days, rotten_days)
SELECT 'a0f1a0f1-0001-4000-8000-000000000014'::uuid, p.id, 'فیش چک', 4, true, NULL, 100, true, true, 7, 14
  FROM public.sales_pipelines p
 WHERE p.title = 'کاریز افراکالا'
   AND NOT EXISTS (
     SELECT 1 FROM public.sales_pipeline_stages s
      WHERE s.pipeline_id = p.id AND s.title = 'فیش چک'
   );

INSERT INTO public.sales_pipeline_stages (id, pipeline_id, title, sort_order, is_active, auto_event, probability, idle_enabled, rotten_enabled, idle_days, rotten_days)
SELECT 'a0f1a0f1-0001-4000-8000-000000000015'::uuid, p.id, 'خرید کالا و چک کالا', 5, true, NULL, 100, true, true, 7, 14
  FROM public.sales_pipelines p
 WHERE p.title = 'کاریز افراکالا'
   AND NOT EXISTS (
     SELECT 1 FROM public.sales_pipeline_stages s
      WHERE s.pipeline_id = p.id AND s.title = 'خرید کالا و چک کالا'
   );

INSERT INTO public.sales_pipeline_stages (id, pipeline_id, title, sort_order, is_active, auto_event, probability, idle_enabled, rotten_enabled, idle_days, rotten_days)
SELECT 'a0f1a0f1-0001-4000-8000-000000000016'::uuid, p.id, 'فاکتور لاین', 6, true, NULL, 100, true, true, 7, 14
  FROM public.sales_pipelines p
 WHERE p.title = 'کاریز افراکالا'
   AND NOT EXISTS (
     SELECT 1 FROM public.sales_pipeline_stages s
      WHERE s.pipeline_id = p.id AND s.title = 'فاکتور لاین'
   );

INSERT INTO public.sales_pipeline_stages (id, pipeline_id, title, sort_order, is_active, auto_event, probability, idle_enabled, rotten_enabled, idle_days, rotten_days)
SELECT 'a0f1a0f1-0001-4000-8000-000000000017'::uuid, p.id, 'ثبت در اکسل اجناس ارسال نشده', 7, true, NULL, 100, true, true, 7, 14
  FROM public.sales_pipelines p
 WHERE p.title = 'کاریز افراکالا'
   AND NOT EXISTS (
     SELECT 1 FROM public.sales_pipeline_stages s
      WHERE s.pipeline_id = p.id AND s.title = 'ثبت در اکسل اجناس ارسال نشده'
   );

INSERT INTO public.sales_pipeline_stages (id, pipeline_id, title, sort_order, is_active, auto_event, probability, idle_enabled, rotten_enabled, idle_days, rotten_days)
SELECT 'a0f1a0f1-0001-4000-8000-000000000018'::uuid, p.id, 'ارسال نهایی', 8, true, NULL, 100, true, true, 7, 14
  FROM public.sales_pipelines p
 WHERE p.title = 'کاریز افراکالا'
   AND NOT EXISTS (
     SELECT 1 FROM public.sales_pipeline_stages s
      WHERE s.pipeline_id = p.id AND s.title = 'ارسال نهایی'
   );

INSERT INTO public.sales_pipeline_stages (id, pipeline_id, title, sort_order, is_active, auto_event, probability, idle_enabled, rotten_enabled, idle_days, rotten_days)
SELECT 'a0f1a0f1-0001-4000-8000-000000000019'::uuid, p.id, 'ویدئو چک', 9, true, NULL, 100, true, true, 7, 14
  FROM public.sales_pipelines p
 WHERE p.title = 'کاریز افراکالا'
   AND NOT EXISTS (
     SELECT 1 FROM public.sales_pipeline_stages s
      WHERE s.pipeline_id = p.id AND s.title = 'ویدئو چک'
   );

INSERT INTO public.sales_pipeline_stages (id, pipeline_id, title, sort_order, is_active, auto_event, probability, idle_enabled, rotten_enabled, idle_days, rotten_days)
SELECT 'a0f1a0f1-0001-4000-8000-00000000001a'::uuid, p.id, 'بیجک رسانی', 10, true, NULL, 100, true, true, 7, 14
  FROM public.sales_pipelines p
 WHERE p.title = 'کاریز افراکالا'
   AND NOT EXISTS (
     SELECT 1 FROM public.sales_pipeline_stages s
      WHERE s.pipeline_id = p.id AND s.title = 'بیجک رسانی'
   );

-- ---------- acquaintance catalog ----------
INSERT INTO public.acquaintance_methods (title, is_active, sort_order)
SELECT v.title, true, v.sort_order
  FROM (VALUES
    ('نا مشخص', 1),
    ('ارسال موجودی و قیمت واتس اپ', 2),
    ('از طریق باربری', 3),
    ('استاتوس های روز', 4),
    ('اینستاگرام', 5),
    ('بازاریابی حضوری', 6),
    ('بانک اطلاعاتی', 7),
    ('تماس مکرر با رزومه ها', 8),
    ('تماس ورودی', 9),
    ('جستجو در گوگل', 10),
    ('فرم استعلام قیمت', 11),
    ('مراجعه حضوری به فروشگاهمان', 12),
    ('معرفی شدیم توسط همکاران', 13),
    ('وویس مکرردر واتس اپ', 14),
    ('کانال واتساپ', 15),
    ('سایر', 16),
    ('معرف', 17)
  ) AS v(title, sort_order)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.acquaintance_methods a WHERE a.title = v.title
 );

-- ---------- lost reasons (21 Didar titles; «سایر» already seeded) ----------
INSERT INTO public.deal_lost_reasons (title, is_active, sort_order)
SELECT v.title, true, v.sort_order
  FROM (VALUES
    ('مشتری قیمت پایین تر داشت', 1),
    ('عدم موجودی کالا', 2),
    ('عدم سلامت کالا یا کارتن', 3),
    ('بعد از 2تماس خروجی نا موفق', 4),
    ('رفتار ناشایست از طرف فروشنده به هر دلیلی', 5),
    ('پشت خط ماندن بیش از حد', 6),
    ('چکی یا قسطی میخواست', 7),
    ('دیر قیمت دادیم', 8),
    ('مشتری هنوز تصمیم نگرفته است', 9),
    ('استعلام گرفتم مشتری معتبر نبود و حساب باز میخواست', 10),
    ('نتوانستیم بخریم (نوسان قیمت)', 11),
    ('کلا مشتری نخرید', 12),
    ('پایین امدن قیمت ها', 13),
    ('مشتری دیر خبر داد و قیمت رفته بالا', 14),
    ('معامله داشت و فرم هم پر کرده', 15),
    ('پول نداشت و و مانده حساب از قبل داشت', 16),
    ('مشتری کد پیشنهادیه دیگری خرید .', 17),
    ('زمان تسویه', 18),
    ('دلخوری از نحوه مدیریت و یا خود مدیر', 19),
    ('عدم اعتماد', 20),
    ('زود پول میخواییم', 21)
  ) AS v(title, sort_order)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.deal_lost_reasons r WHERE r.title = v.title
 );

UPDATE public.deal_lost_reasons
   SET sort_order = 99
 WHERE title = 'سایر' AND sort_order IS DISTINCT FROM 99;

-- ---------- RLS + grants for new tables ----------
ALTER TABLE public.deal_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_interaction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acquaintance_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_related_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_field_stage_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_tags_select ON public.deal_tags;
CREATE POLICY deal_tags_select ON public.deal_tags
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deal_tags_write ON public.deal_tags;
CREATE POLICY deal_tags_write ON public.deal_tags
  FOR ALL TO authenticated
  USING (public.has_dynamic_permission(auth.uid(), 'deal-tags', 'update'))
  WITH CHECK (public.has_dynamic_permission(auth.uid(), 'deal-tags', 'update'));

DROP POLICY IF EXISTS sales_interaction_tags_select ON public.sales_interaction_tags;
CREATE POLICY sales_interaction_tags_select ON public.sales_interaction_tags
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_interactions si WHERE si.id = interaction_id
  ));
DROP POLICY IF EXISTS sales_interaction_tags_write ON public.sales_interaction_tags;
CREATE POLICY sales_interaction_tags_write ON public.sales_interaction_tags
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_interactions si WHERE si.id = interaction_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_interactions si WHERE si.id = interaction_id
  ));

DROP POLICY IF EXISTS acquaintance_methods_select ON public.acquaintance_methods;
CREATE POLICY acquaintance_methods_select ON public.acquaintance_methods
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS acquaintance_methods_write ON public.acquaintance_methods;
CREATE POLICY acquaintance_methods_write ON public.acquaintance_methods
  FOR ALL TO authenticated
  USING (public.has_dynamic_permission(auth.uid(), 'acquaintance-methods', 'update'))
  WITH CHECK (public.has_dynamic_permission(auth.uid(), 'acquaintance-methods', 'update'));

DROP POLICY IF EXISTS deal_related_users_select ON public.deal_related_users;
CREATE POLICY deal_related_users_select ON public.deal_related_users
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_interactions si WHERE si.id = interaction_id
  ));
DROP POLICY IF EXISTS deal_related_users_write ON public.deal_related_users;
CREATE POLICY deal_related_users_write ON public.deal_related_users
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_interactions si WHERE si.id = interaction_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_interactions si WHERE si.id = interaction_id
  ));

DROP POLICY IF EXISTS deal_field_definitions_select ON public.deal_field_definitions;
CREATE POLICY deal_field_definitions_select ON public.deal_field_definitions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deal_field_definitions_write ON public.deal_field_definitions;
CREATE POLICY deal_field_definitions_write ON public.deal_field_definitions
  FOR ALL TO authenticated
  USING (public.has_dynamic_permission(auth.uid(), 'deal-fields', 'update'))
  WITH CHECK (public.has_dynamic_permission(auth.uid(), 'deal-fields', 'update'));

DROP POLICY IF EXISTS deal_field_values_select ON public.deal_field_values;
CREATE POLICY deal_field_values_select ON public.deal_field_values
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_interactions si WHERE si.id = interaction_id
  ));
DROP POLICY IF EXISTS deal_field_values_write ON public.deal_field_values;
CREATE POLICY deal_field_values_write ON public.deal_field_values
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_interactions si WHERE si.id = interaction_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_interactions si WHERE si.id = interaction_id
  ));

DROP POLICY IF EXISTS deal_field_stage_rules_select ON public.deal_field_stage_rules;
CREATE POLICY deal_field_stage_rules_select ON public.deal_field_stage_rules
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deal_field_stage_rules_write ON public.deal_field_stage_rules;
CREATE POLICY deal_field_stage_rules_write ON public.deal_field_stage_rules
  FOR ALL TO authenticated
  USING (public.has_dynamic_permission(auth.uid(), 'deal-fields', 'update'))
  WITH CHECK (public.has_dynamic_permission(auth.uid(), 'deal-fields', 'update'));

REVOKE ALL ON TABLE public.deal_tags FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sales_interaction_tags FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.acquaintance_methods FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.deal_related_users FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.deal_field_definitions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.deal_field_values FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.deal_field_stage_rules FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deal_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_interaction_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.acquaintance_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deal_related_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deal_field_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deal_field_values TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deal_field_stage_rules TO authenticated;
GRANT ALL ON TABLE public.deal_tags TO service_role;
GRANT ALL ON TABLE public.sales_interaction_tags TO service_role;
GRANT ALL ON TABLE public.acquaintance_methods TO service_role;
GRANT ALL ON TABLE public.deal_related_users TO service_role;
GRANT ALL ON TABLE public.deal_field_definitions TO service_role;
GRANT ALL ON TABLE public.deal_field_values TO service_role;
GRANT ALL ON TABLE public.deal_field_stage_rules TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.sales_deal_display_code_seq TO authenticated, service_role;

-- ---------- explicit role_permissions (never rely on fallback) ----------
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name, m.module,
       r.role_name IN ('admin', 'manager', 'sales'),
       r.role_name IN ('admin', 'manager'),
       r.role_name IN ('admin', 'manager'),
       false, false, false, false
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
  CROSS JOIN (VALUES
    ('deal-tags'),
    ('deal-fields'),
    ('acquaintance-methods'),
    ('deal-view-price')
  ) AS m(module)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = m.module
 );

UPDATE public.role_permissions
   SET can_view = true,
       can_update = (role_name IN ('admin', 'manager', 'sales'))
 WHERE module = 'deal-view-price'
   AND role_name IN ('admin', 'manager', 'sales');
