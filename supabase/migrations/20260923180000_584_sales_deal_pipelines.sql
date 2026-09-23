SET client_encoding='UTF8';

-- ============================================================================
-- 584 — deal pipelines, stages, history, close/delete columns, permissions
-- ============================================================================
-- Extends sales_interactions (kind='request'). No new deals table.
-- Seed: کاریز افراکالا + three stages. Backfill existing requests.
-- ============================================================================

SET lock_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.sales_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.sales_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.sales_pipelines(id) ON DELETE RESTRICT,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  auto_event text NULL,
  CONSTRAINT sales_pipeline_stages_auto_event_check
    CHECK (auto_event IS NULL OR auto_event = ANY (ARRAY['quote_created'::text, 'quote_sent'::text]))
);

DO $uid$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_pipeline_stages_id_pipeline_uid'
      AND conrelid = 'public.sales_pipeline_stages'::regclass
  ) THEN
    ALTER TABLE public.sales_pipeline_stages
      ADD CONSTRAINT sales_pipeline_stages_id_pipeline_uid UNIQUE (id, pipeline_id);
  END IF;
END
$uid$;

CREATE UNIQUE INDEX IF NOT EXISTS sales_pipeline_stages_auto_event_uid
  ON public.sales_pipeline_stages (pipeline_id, auto_event)
  WHERE auto_event IS NOT NULL;

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS pipeline_id uuid NULL REFERENCES public.sales_pipelines(id),
  ADD COLUMN IF NOT EXISTS stage_id uuid NULL,
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS won_by uuid NULL REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS lost_by uuid NULL REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL REFERENCES public.profiles(id);

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_interactions_stage_pipeline_fk'
      AND conrelid = 'public.sales_interactions'::regclass
  ) THEN
    ALTER TABLE public.sales_interactions
      ADD CONSTRAINT sales_interactions_stage_pipeline_fk
      FOREIGN KEY (stage_id, pipeline_id)
      REFERENCES public.sales_pipeline_stages (id, pipeline_id);
  END IF;
END
$fk$;

CREATE TABLE IF NOT EXISTS public.sales_interaction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL REFERENCES public.sales_interactions(id) ON DELETE CASCADE,
  event text NOT NULL,
  from_value text NULL,
  to_value text NULL,
  actor_id uuid NULL,
  source text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_interaction_history_event_check
    CHECK (event = ANY (ARRAY['status'::text, 'stage'::text, 'pipeline'::text, 'delete'::text, 'restore'::text])),
  CONSTRAINT sales_interaction_history_source_check
    CHECK (source = ANY (ARRAY['user'::text, 'auto_quote_created'::text, 'auto_quote_sent'::text, 'auto_quote_accepted'::text]))
);

CREATE INDEX IF NOT EXISTS sales_interaction_history_interaction_created_idx
  ON public.sales_interaction_history (interaction_id, created_at);

-- Seed D4
INSERT INTO public.sales_pipelines (id, title, is_active, sort_order)
SELECT 'a0f1a0f1-0001-4000-8000-000000000001'::uuid,
       'کاریز افراکالا',
       true,
       1
WHERE NOT EXISTS (
  SELECT 1 FROM public.sales_pipelines WHERE title = 'کاریز افراکالا'
);

INSERT INTO public.sales_pipeline_stages (id, pipeline_id, title, sort_order, is_active, auto_event)
SELECT 'a0f1a0f1-0001-4000-8000-000000000011'::uuid,
       p.id,
       'ثبت درخواست',
       1,
       true,
       NULL
  FROM public.sales_pipelines p
 WHERE p.title = 'کاریز افراکالا'
   AND NOT EXISTS (
     SELECT 1 FROM public.sales_pipeline_stages s
      WHERE s.pipeline_id = p.id AND s.title = 'ثبت درخواست'
   );

INSERT INTO public.sales_pipeline_stages (id, pipeline_id, title, sort_order, is_active, auto_event)
SELECT 'a0f1a0f1-0001-4000-8000-000000000012'::uuid,
       p.id,
       'اعتبار و قیمت دهی',
       2,
       true,
       'quote_created'
  FROM public.sales_pipelines p
 WHERE p.title = 'کاریز افراکالا'
   AND NOT EXISTS (
     SELECT 1 FROM public.sales_pipeline_stages s
      WHERE s.pipeline_id = p.id AND s.title = 'اعتبار و قیمت دهی'
   );

INSERT INTO public.sales_pipeline_stages (id, pipeline_id, title, sort_order, is_active, auto_event)
SELECT 'a0f1a0f1-0001-4000-8000-000000000013'::uuid,
       p.id,
       'پیگیری معامله و حساب رسانی',
       3,
       true,
       'quote_sent'
  FROM public.sales_pipelines p
 WHERE p.title = 'کاریز افراکالا'
   AND NOT EXISTS (
     SELECT 1 FROM public.sales_pipeline_stages s
      WHERE s.pipeline_id = p.id AND s.title = 'پیگیری معامله و حساب رسانی'
   );

-- Backfill existing request rows. Do not invent won_at / won_by.
UPDATE public.sales_interactions si
   SET pipeline_id = p.id,
       stage_id = st.id,
       stage_entered_at = COALESCE(si.stage_entered_at, si.created_at)
  FROM public.sales_pipelines p
  JOIN public.sales_pipeline_stages st
    ON st.pipeline_id = p.id AND st.title = 'ثبت درخواست'
 WHERE p.title = 'کاریز افراکالا'
   AND si.kind = 'request'
   AND si.pipeline_id IS NULL;

ALTER TABLE public.sales_interactions
  DROP CONSTRAINT IF EXISTS sales_interactions_status_check;

ALTER TABLE public.sales_interactions
  DROP CONSTRAINT IF EXISTS sales_interactions_status_by_kind_check;

ALTER TABLE public.sales_interactions
  ADD CONSTRAINT sales_interactions_status_by_kind_check
  CHECK (
    (kind = 'request' AND status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text]))
    OR
    (kind <> 'request' AND status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text, 'cancelled'::text, 'done'::text]))
  );

ALTER TABLE public.sales_interactions
  DROP CONSTRAINT IF EXISTS sales_interactions_request_pipeline_stage_check;

ALTER TABLE public.sales_interactions
  ADD CONSTRAINT sales_interactions_request_pipeline_stage_check
  CHECK (
    (kind = 'request' AND pipeline_id IS NOT NULL AND stage_id IS NOT NULL)
    OR
    (kind <> 'request' AND pipeline_id IS NULL AND stage_id IS NULL)
  );

-- Default pipeline/stage for new request rows (create RPC has no pipeline args).
CREATE OR REPLACE FUNCTION public.sales_interactions_default_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.kind = 'request' THEN
    IF NEW.pipeline_id IS NULL THEN
      SELECT id INTO NEW.pipeline_id
        FROM public.sales_pipelines
       WHERE is_active
       ORDER BY sort_order, created_at
       LIMIT 1;
    END IF;
    IF NEW.stage_id IS NULL AND NEW.pipeline_id IS NOT NULL THEN
      SELECT id INTO NEW.stage_id
        FROM public.sales_pipeline_stages
       WHERE pipeline_id = NEW.pipeline_id
         AND is_active
       ORDER BY sort_order, created_at
       LIMIT 1;
      NEW.stage_entered_at := COALESCE(NEW.stage_entered_at, NEW.created_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_interactions_default_pipeline ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_default_pipeline
  BEFORE INSERT ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_default_pipeline();

CREATE OR REPLACE FUNCTION public.sales_pipeline_stages_refuse_busy_deactivate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  n integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.is_active = false
     AND OLD.is_active IS DISTINCT FROM false THEN
    SELECT count(*) INTO n
      FROM public.sales_interactions si
     WHERE si.stage_id = NEW.id
       AND si.kind = 'request'
       AND si.status = 'open'
       AND si.deleted_at IS NULL;
    IF n > 0 THEN
      RAISE EXCEPTION 'این مرحله معاملهٔ جاری دارد؛ ابتدا معاملات را منتقل کنید.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_pipeline_stages_refuse_busy_deactivate ON public.sales_pipeline_stages;
CREATE TRIGGER trg_sales_pipeline_stages_refuse_busy_deactivate
  BEFORE UPDATE ON public.sales_pipeline_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_pipeline_stages_refuse_busy_deactivate();

ALTER TABLE public.sales_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_interaction_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_pipelines_select ON public.sales_pipelines;
CREATE POLICY sales_pipelines_select ON public.sales_pipelines
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS sales_pipelines_insert ON public.sales_pipelines;
CREATE POLICY sales_pipelines_insert ON public.sales_pipelines
  FOR INSERT TO authenticated
  WITH CHECK (public.has_dynamic_permission(uid(), 'sales-pipelines', 'update'));

DROP POLICY IF EXISTS sales_pipelines_update ON public.sales_pipelines;
CREATE POLICY sales_pipelines_update ON public.sales_pipelines
  FOR UPDATE TO authenticated
  USING (public.has_dynamic_permission(uid(), 'sales-pipelines', 'update'))
  WITH CHECK (public.has_dynamic_permission(uid(), 'sales-pipelines', 'update'));

DROP POLICY IF EXISTS sales_pipeline_stages_select ON public.sales_pipeline_stages;
CREATE POLICY sales_pipeline_stages_select ON public.sales_pipeline_stages
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS sales_pipeline_stages_insert ON public.sales_pipeline_stages;
CREATE POLICY sales_pipeline_stages_insert ON public.sales_pipeline_stages
  FOR INSERT TO authenticated
  WITH CHECK (public.has_dynamic_permission(uid(), 'sales-pipelines', 'update'));

DROP POLICY IF EXISTS sales_pipeline_stages_update ON public.sales_pipeline_stages;
CREATE POLICY sales_pipeline_stages_update ON public.sales_pipeline_stages
  FOR UPDATE TO authenticated
  USING (public.has_dynamic_permission(uid(), 'sales-pipelines', 'update'))
  WITH CHECK (public.has_dynamic_permission(uid(), 'sales-pipelines', 'update'));

DROP POLICY IF EXISTS sales_interaction_history_select ON public.sales_interaction_history;
CREATE POLICY sales_interaction_history_select ON public.sales_interaction_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.sales_interactions si
       WHERE si.id = interaction_id
         AND (
           public.has_any_role(uid(), ARRAY['admin'::text, 'manager'::text])
           OR (
             public.has_any_role(uid(), ARRAY['sales'::text, 'admin'::text, 'manager'::text, 'accountant'::text])
             AND (
               si.author_id = uid()
               OR si.salesperson_id = uid()
               OR si.customer_id IN (
                 SELECT c.id FROM public.customers c WHERE c.responsible_id = uid()
               )
             )
           )
         )
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.sales_pipelines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales_pipeline_stages TO authenticated;
GRANT SELECT ON public.sales_interaction_history TO authenticated;
REVOKE DELETE ON public.sales_pipelines FROM authenticated;
REVOKE DELETE ON public.sales_pipeline_stages FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sales_interaction_history FROM authenticated;

INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name,
       'deal-mark-won',
       r.role_name IN ('admin', 'manager', 'sales'),
       false,
       r.role_name IN ('admin', 'manager', 'sales'),
       false, false, false, false
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'deal-mark-won'
 );

INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name,
       'deal-mark-lost',
       r.role_name IN ('admin', 'manager', 'sales'),
       false,
       r.role_name IN ('admin', 'manager', 'sales'),
       false, false, false, false
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'deal-mark-lost'
 );

INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name,
       'deal-delete',
       r.role_name IN ('admin', 'manager', 'sales'),
       false,
       r.role_name IN ('admin', 'manager', 'sales'),
       false, false, false, false
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'deal-delete'
 );

INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name,
       'sales-pipelines',
       r.role_name IN ('admin', 'manager', 'sales'),
       false,
       r.role_name = 'admin',
       false, false, false, false
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'sales-pipelines'
 );
