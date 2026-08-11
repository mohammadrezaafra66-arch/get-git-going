-- Generated schema DDL for missing tables (self-host bootstrap)
-- Sections: 1) ENUMs  2) Functions  3) Tables (topological)  4) Seed data
BEGIN;
SET client_min_messages = warning;

-- =====================================================================
-- SECTION 1 — ENUM TYPES
-- =====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='inquiry_status') THEN
    CREATE TYPE public.inquiry_status AS ENUM ('draft','pending','warning_5min','danger_8min','critical_10min','transfer_available','transferred','answered','completed_on_time','completed_late','expired','cancelled','rejected');
  END IF;
END $$;

-- =====================================================================
-- SECTION 2 — FUNCTIONS (21 definitions incl. overloads)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.audit_dynamic_entity_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    auth.uid(),
    'dynamic_entity_score',
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
  );
  RETURN COALESCE(NEW, OLD);
END $function$;

CREATE OR REPLACE FUNCTION public.audit_person_context_links_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'person.context_link.add', 'person_context_link', NEW.id::text, auth.uid(),
    jsonb_build_object(
      'person_id',    NEW.person_id,
      'context_kind', NEW.context_kind,
      'ref_table',    NEW.ref_table,
      'ref_id',       NEW.ref_id,
      'started_at',   NEW.started_at
    )
  );
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.audit_person_context_links_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_diff jsonb := '{}'::jsonb;
BEGIN
  -- Dedicated remove event when ended_at transitions from NULL to a value.
  IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES (
      'person.context_link.remove', 'person_context_link', NEW.id::text, auth.uid(),
      jsonb_build_object(
        'person_id',    NEW.person_id,
        'context_kind', NEW.context_kind,
        'ref_table',    NEW.ref_table,
        'ref_id',       NEW.ref_id,
        'ended_at',     NEW.ended_at
      )
    );
  END IF;

  IF NEW.context_kind IS DISTINCT FROM OLD.context_kind THEN v_diff := v_diff || jsonb_build_object('context_kind', jsonb_build_object('old', OLD.context_kind, 'new', NEW.context_kind)); END IF;
  IF NEW.ref_table    IS DISTINCT FROM OLD.ref_table    THEN v_diff := v_diff || jsonb_build_object('ref_table',    jsonb_build_object('old', OLD.ref_table,    'new', NEW.ref_table));    END IF;
  IF NEW.ref_id       IS DISTINCT FROM OLD.ref_id       THEN v_diff := v_diff || jsonb_build_object('ref_id',       jsonb_build_object('old', OLD.ref_id,       'new', NEW.ref_id));       END IF;
  IF NEW.note         IS DISTINCT FROM OLD.note         THEN v_diff := v_diff || jsonb_build_object('note',         jsonb_build_object('old', OLD.note,         'new', NEW.note));         END IF;
  IF NEW.started_at   IS DISTINCT FROM OLD.started_at   THEN v_diff := v_diff || jsonb_build_object('started_at',   jsonb_build_object('old', OLD.started_at,   'new', NEW.started_at));   END IF;
  IF NEW.ended_at     IS DISTINCT FROM OLD.ended_at     THEN v_diff := v_diff || jsonb_build_object('ended_at',     jsonb_build_object('old', OLD.ended_at,     'new', NEW.ended_at));     END IF;

  IF v_diff <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES ('person.context_link.update', 'person_context_link', NEW.id::text, auth.uid(), v_diff);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.audit_person_field_definitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'person_field_definition', NEW.id::text, 'create',
      jsonb_build_object(
        'name', NEW.name, 'label', NEW.label, 'field_type', NEW.field_type,
        'is_required', NEW.is_required, 'is_active', NEW.is_active,
        'applies_to_kind', NEW.applies_to_kind));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'person_field_definition', NEW.id::text, 'update',
      jsonb_strip_nulls(jsonb_build_object(
        'label',  CASE WHEN OLD.label IS DISTINCT FROM NEW.label THEN jsonb_build_object('from', OLD.label, 'to', NEW.label) END,
        'field_type', CASE WHEN OLD.field_type IS DISTINCT FROM NEW.field_type THEN jsonb_build_object('from', OLD.field_type, 'to', NEW.field_type) END,
        'is_required', CASE WHEN OLD.is_required IS DISTINCT FROM NEW.is_required THEN jsonb_build_object('from', OLD.is_required, 'to', NEW.is_required) END,
        'is_active', CASE WHEN OLD.is_active IS DISTINCT FROM NEW.is_active THEN jsonb_build_object('from', OLD.is_active, 'to', NEW.is_active) END,
        'applies_to_kind', CASE WHEN OLD.applies_to_kind IS DISTINCT FROM NEW.applies_to_kind THEN jsonb_build_object('from', OLD.applies_to_kind, 'to', NEW.applies_to_kind) END,
        'sort_order', CASE WHEN OLD.sort_order IS DISTINCT FROM NEW.sort_order THEN jsonb_build_object('from', OLD.sort_order, 'to', NEW.sort_order) END
      )));
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_person_field_values()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'person_field_value', NEW.id::text, 'create',
      jsonb_build_object('person_id', NEW.person_id, 'field_definition_id', NEW.field_definition_id, 'value', NEW.value));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.value IS DISTINCT FROM NEW.value THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'person_field_value', NEW.id::text, 'update',
        jsonb_build_object('person_id', NEW.person_id, 'field_definition_id', NEW.field_definition_id,
          'value', jsonb_build_object('from', OLD.value, 'to', NEW.value)));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_person_identifiers_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'person_identifier', NEW.id::text, 'person.identifier.add',
    jsonb_build_object(
      'person_id', NEW.person_id,
      'kind', NEW.kind,
      'value_normalized', NEW.value_normalized,
      'status', NEW.status,
      'is_primary', NEW.is_primary
    ));
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_person_identifiers_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  action_name text := 'person.identifier.update';
  diff_obj jsonb := '{}'::jsonb;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'revoked' THEN
    action_name := 'person.identifier.revoke';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    diff_obj := diff_obj || jsonb_build_object('status',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF OLD.value_normalized IS DISTINCT FROM NEW.value_normalized THEN
    diff_obj := diff_obj || jsonb_build_object('value_normalized',
      jsonb_build_object('from', OLD.value_normalized, 'to', NEW.value_normalized));
  END IF;
  IF OLD.kind IS DISTINCT FROM NEW.kind THEN
    diff_obj := diff_obj || jsonb_build_object('kind',
      jsonb_build_object('from', OLD.kind, 'to', NEW.kind));
  END IF;
  IF OLD.is_primary IS DISTINCT FROM NEW.is_primary THEN
    diff_obj := diff_obj || jsonb_build_object('is_primary',
      jsonb_build_object('from', OLD.is_primary, 'to', NEW.is_primary));
  END IF;

  IF diff_obj <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'person_identifier', NEW.id::text, action_name,
      diff_obj || jsonb_build_object('person_id', NEW.person_id));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_persons_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'person.create', 'person', NEW.id::text, auth.uid(),
    jsonb_build_object(
      'kind', NEW.kind,
      'display_name', NEW.display_name,
      'legal_name', NEW.legal_name,
      'visibility_scope', NEW.visibility_scope,
      'is_active', NEW.is_active
    )
  );
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.audit_persons_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_diff jsonb := '{}'::jsonb;
BEGIN
  -- Visibility scope changes get their own dedicated event for sensitivity.
  IF NEW.visibility_scope IS DISTINCT FROM OLD.visibility_scope THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES (
      'person.visibility_change', 'person', NEW.id::text, auth.uid(),
      jsonb_build_object('old', OLD.visibility_scope, 'new', NEW.visibility_scope)
    );
  END IF;

  IF NEW.kind         IS DISTINCT FROM OLD.kind         THEN v_diff := v_diff || jsonb_build_object('kind',         jsonb_build_object('old', OLD.kind,         'new', NEW.kind));         END IF;
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN v_diff := v_diff || jsonb_build_object('display_name', jsonb_build_object('old', OLD.display_name, 'new', NEW.display_name)); END IF;
  IF NEW.legal_name   IS DISTINCT FROM OLD.legal_name   THEN v_diff := v_diff || jsonb_build_object('legal_name',   jsonb_build_object('old', OLD.legal_name,   'new', NEW.legal_name));   END IF;
  IF NEW.is_active    IS DISTINCT FROM OLD.is_active    THEN v_diff := v_diff || jsonb_build_object('is_active',    jsonb_build_object('old', OLD.is_active,    'new', NEW.is_active));    END IF;
  IF NEW.notes        IS DISTINCT FROM OLD.notes        THEN v_diff := v_diff || jsonb_build_object('notes',        jsonb_build_object('old', OLD.notes,        'new', NEW.notes));        END IF;

  IF v_diff <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES ('person.update', 'person', NEW.id::text, auth.uid(), v_diff);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.award_inquiry_response_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_user uuid;
  v_response_seconds numeric;
  v_event_type text;
  v_score_value numeric;
BEGIN
  -- فقط زمانی که answered_at تازه set شده
  IF NEW.answered_at IS NULL OR OLD.answered_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_target_user := COALESCE(NEW.assigned_to, NEW.requested_by);
  IF v_target_user IS NULL THEN
    RETURN NEW;
  END IF;

  v_response_seconds := EXTRACT(EPOCH FROM (NEW.answered_at - NEW.created_at));

  IF v_response_seconds < 120 THEN
    v_event_type := 'inquiry_answered_fast';
    v_score_value := public.get_kpi_xp(v_event_type, 10);
  ELSIF v_response_seconds < 300 THEN
    v_event_type := 'inquiry_answered_normal';
    v_score_value := public.get_kpi_xp(v_event_type, 5);
  ELSIF v_response_seconds < 600 THEN
    v_event_type := 'inquiry_answered_slow';
    v_score_value := public.get_kpi_xp(v_event_type, 2);
  ELSE
    -- محدوده کارت قرمز — بدون event
    RETURN NEW;
  END IF;

  INSERT INTO public.employee_score_events (
    employee_id, event_type, source_table, source_id, triggered_at, payload
  ) VALUES (
    v_target_user,
    v_event_type,
    'inquiries',
    NEW.id::text,
    NEW.answered_at,
    jsonb_build_object(
      'response_seconds', v_response_seconds,
      'score_value', v_score_value,
      'inquiry_id', NEW.id
    )
  )
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_normalized_raw_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  p_min numeric;
  p_max numeric;
  p_direction text;
  v_norm numeric;
BEGIN
  IF NEW.actual_value IS NOT NULL THEN
    SELECT min_value, max_value, direction
      INTO p_min, p_max, p_direction
    FROM public.dynamic_scoring_parameters
    WHERE id = NEW.parameter_id;

    IF p_max IS NULL OR p_max = p_min THEN
      RAISE EXCEPTION 'پارامتر % دارای min/max معتبر نیست', NEW.parameter_id;
    END IF;

    NEW.is_clipped := (NEW.actual_value > p_max) OR (NEW.actual_value < p_min);
    v_norm := LEAST(1, GREATEST(0, (NEW.actual_value - p_min) / (p_max - p_min)));
    IF p_direction = 'negative' THEN
      v_norm := 1 - v_norm;
    END IF;
    NEW.raw_score := ROUND(v_norm::numeric, 3);
  ELSE
    NEW.is_clipped := false;
    IF NEW.raw_score IS NULL THEN
      RAISE EXCEPTION 'باید actual_value یا raw_score ارائه شود';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.get_kpi_xp(p_event_key text, p_default numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT xp_amount
       FROM public.gamification_kpi_rules
      WHERE event_key = p_event_key
        AND is_active = true
      LIMIT 1),
    p_default
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles)) $function$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.has_any_role(_user_id, _roles::text[]) $function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.has_role(_user_id, _role::text) $function$;

CREATE OR REPLACE FUNCTION public.is_messenger_group_member(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.messenger_group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$;

CREATE OR REPLACE FUNCTION public.validate_dynamic_entity_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.entity_type = 'customer' THEN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = NEW.entity_id) THEN
      RAISE EXCEPTION 'مشتری با شناسه % یافت نشد', NEW.entity_id;
    END IF;
  ELSIF NEW.entity_type = 'salesperson' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.entity_id) THEN
      RAISE EXCEPTION 'کارشناس با شناسه % یافت نشد', NEW.entity_id;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.validate_person_field_value()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_def_active boolean;
  v_def_kind text;
  v_person_kind text;
BEGIN
  SELECT is_active, applies_to_kind
    INTO v_def_active, v_def_kind
    FROM public.person_field_definitions
   WHERE id = NEW.field_definition_id;

  IF v_def_active IS NULL THEN
    RAISE EXCEPTION 'person_field_values: unknown field_definition_id %', NEW.field_definition_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_def_active = false THEN
    RAISE EXCEPTION 'person_field_values: field definition % is inactive', NEW.field_definition_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT kind INTO v_person_kind FROM public.persons WHERE id = NEW.person_id;
  IF v_person_kind IS NULL THEN
    RAISE EXCEPTION 'person_field_values: unknown person_id %', NEW.person_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_def_kind <> 'both' AND v_def_kind <> v_person_kind THEN
    RAISE EXCEPTION 'person_field_values: applies_to_kind (%) does not match person.kind (%)',
      v_def_kind, v_person_kind
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_person_identifier()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_primary = true AND NEW.status = 'revoked' THEN
    RAISE EXCEPTION 'A revoked identifier cannot be primary';
  END IF;
  RETURN NEW;
END;
$function$;

-- =====================================================================
-- SECTION 3 — TABLES (42) in topological FK order
-- =====================================================================

-- ---------- public.ai_generated_content ----------
CREATE TABLE IF NOT EXISTS public.ai_generated_content (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tool_type" text NOT NULL,
  "input_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "generated_variations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "selected_variation_index" integer,
  "edited_content" text,
  "created_by" uuid NOT NULL,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT ai_generated_content_pkey PRIMARY KEY (id),
  CONSTRAINT ai_generated_content_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id),
  CONSTRAINT ai_generated_content_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT ai_generated_content_tool_type_check CHECK ((tool_type = ANY (ARRAY['ad_copy'::text, 'buy_assistant'::text, 'banner_text'::text])))
);

CREATE INDEX IF NOT EXISTS idx_ai_generated_content_created_by ON public.ai_generated_content USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_ai_generated_content_tool_type ON public.ai_generated_content USING btree (tool_type);
DROP POLICY IF EXISTS ai_content_insert ON public.ai_generated_content;
CREATE POLICY ai_content_insert ON public.ai_generated_content
  FOR INSERT TO authenticated
  WITH CHECK ((created_by = auth.uid()));
DROP POLICY IF EXISTS ai_content_own ON public.ai_generated_content;
CREATE POLICY ai_content_own ON public.ai_generated_content
  FOR SELECT TO authenticated
  USING (((created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text)));

-- ---------- public.bot_api_key_audit_log ----------
CREATE TABLE IF NOT EXISTS public.bot_api_key_audit_log (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "key_id" uuid,
  "key_name" text,
  "action" text NOT NULL,
  "performed_by" uuid NOT NULL,
  "performed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT bot_api_key_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT bot_api_key_audit_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES profiles(id),
  CONSTRAINT bot_api_key_audit_log_action_check CHECK ((action = ANY (ARRAY['create'::text, 'delete'::text, 'view_key'::text, 'rotate'::text, 'deactivate'::text])))
);

DROP POLICY IF EXISTS audit_log_insert ON public.bot_api_key_audit_log;
CREATE POLICY audit_log_insert ON public.bot_api_key_audit_log
  FOR INSERT TO authenticated
  WITH CHECK ((performed_by = auth.uid()));
DROP POLICY IF EXISTS audit_log_select ON public.bot_api_key_audit_log;
CREATE POLICY audit_log_select ON public.bot_api_key_audit_log
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text)));

-- ---------- public.daily_capital_settings ----------
CREATE TABLE IF NOT EXISTS public.daily_capital_settings (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "capital_date" date NOT NULL,
  "total_capital" numeric NOT NULL,
  "scoring_mode" text DEFAULT 'manual'::text NOT NULL,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT daily_capital_settings_pkey PRIMARY KEY (id),
  CONSTRAINT daily_capital_settings_capital_date_key UNIQUE (capital_date),
  CONSTRAINT daily_capital_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT daily_capital_settings_scoring_mode_check CHECK ((scoring_mode = ANY (ARRAY['manual'::text, 'auto'::text]))),
  CONSTRAINT daily_capital_settings_total_capital_check CHECK ((total_capital > (0)::numeric))
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_capital_settings_capital_date_key ON public.daily_capital_settings USING btree (capital_date);
DROP POLICY IF EXISTS dcs_admin_accountant_all ON public.daily_capital_settings;
CREATE POLICY dcs_admin_accountant_all ON public.daily_capital_settings
  FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'accountant'::text)))
  WITH CHECK ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'accountant'::text)));
DROP POLICY IF EXISTS dcs_select_authenticated ON public.daily_capital_settings;
CREATE POLICY dcs_select_authenticated ON public.daily_capital_settings
  FOR SELECT TO authenticated
  USING (true);
DROP TRIGGER IF EXISTS trg_dcs_updated_at ON public.daily_capital_settings;
CREATE TRIGGER trg_dcs_updated_at BEFORE UPDATE ON public.daily_capital_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- public.dashboard_ticker_events ----------
CREATE TABLE IF NOT EXISTS public.dashboard_ticker_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_type" text NOT NULL,
  "message_fa" text NOT NULL,
  "actor_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT dashboard_ticker_events_pkey PRIMARY KEY (id),
  CONSTRAINT dashboard_ticker_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ticker_created ON public.dashboard_ticker_events USING btree (created_at DESC);
DROP POLICY IF EXISTS ticker_select_auth ON public.dashboard_ticker_events;
CREATE POLICY ticker_select_auth ON public.dashboard_ticker_events
  FOR SELECT TO authenticated
  USING (true);

-- ---------- public.delivery_receipts ----------
CREATE TABLE IF NOT EXISTS public.delivery_receipts (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "type" text NOT NULL,
  "invoice_id" uuid,
  "customer_id" uuid,
  "uploaded_by" uuid NOT NULL,
  "storage_path" text NOT NULL,
  "file_name" text NOT NULL,
  "file_size" bigint,
  "mime_type" text,
  "status" text DEFAULT 'pending_review'::text NOT NULL,
  "notes" text,
  "review_deadline" timestamp with time zone NOT NULL,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT delivery_receipts_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_receipts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT delivery_receipts_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT delivery_receipts_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id),
  CONSTRAINT delivery_receipts_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id),
  CONSTRAINT delivery_receipts_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'confirmed'::text, 'rejected'::text, 'expired'::text]))),
  CONSTRAINT delivery_receipts_type_check CHECK ((type = ANY (ARRAY['shipping_receipt'::text, 'delivery_receipt'::text])))
);

CREATE INDEX IF NOT EXISTS delivery_receipts_customer_id_idx ON public.delivery_receipts USING btree (customer_id);
CREATE INDEX IF NOT EXISTS delivery_receipts_invoice_id_idx ON public.delivery_receipts USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS delivery_receipts_pending_deadline_idx ON public.delivery_receipts USING btree (review_deadline) WHERE (status = 'pending_review'::text);
CREATE INDEX IF NOT EXISTS delivery_receipts_status_idx ON public.delivery_receipts USING btree (status);
CREATE INDEX IF NOT EXISTS delivery_receipts_type_idx ON public.delivery_receipts USING btree (type);
CREATE INDEX IF NOT EXISTS delivery_receipts_uploaded_by_idx ON public.delivery_receipts USING btree (uploaded_by);
DROP POLICY IF EXISTS manager and sales can upload ON public.delivery_receipts;
CREATE POLICY manager and sales can upload ON public.delivery_receipts
  FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'sales'::app_role)));
DROP POLICY IF EXISTS managers see all receipts ON public.delivery_receipts;
CREATE POLICY managers see all receipts ON public.delivery_receipts
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS reviewer can update ON public.delivery_receipts;
CREATE POLICY reviewer can update ON public.delivery_receipts
  FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'sales'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'sales'::app_role)));
DROP POLICY IF EXISTS sales sees pending review ON public.delivery_receipts;
CREATE POLICY sales sees pending review ON public.delivery_receipts
  FOR SELECT TO authenticated
  USING (((status = 'pending_review'::text) AND has_role(auth.uid(), 'sales'::app_role)));
DROP POLICY IF EXISTS uploader sees own receipts ON public.delivery_receipts;
CREATE POLICY uploader sees own receipts ON public.delivery_receipts
  FOR SELECT TO authenticated
  USING ((uploaded_by = auth.uid()));
DROP TRIGGER IF EXISTS set_delivery_receipts_updated_at ON public.delivery_receipts;
CREATE TRIGGER set_delivery_receipts_updated_at BEFORE UPDATE ON public.delivery_receipts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- public.didar_activities ----------
CREATE TABLE IF NOT EXISTS public.didar_activities (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "didar_id" text NOT NULL,
  "customer_id" uuid,
  "activity_type" text,
  "subject" text,
  "description" text,
  "occurred_at" timestamp with time zone,
  "created_by_name" text,
  "raw_data" jsonb,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT didar_activities_pkey PRIMARY KEY (id),
  CONSTRAINT didar_activities_didar_id_key UNIQUE (didar_id),
  CONSTRAINT didar_activities_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS didar_activities_didar_id_key ON public.didar_activities USING btree (didar_id);
DROP POLICY IF EXISTS didar_activities_read ON public.didar_activities;
CREATE POLICY didar_activities_read ON public.didar_activities
  FOR SELECT TO authenticated
  USING (true);

-- ---------- public.didar_import_log ----------
CREATE TABLE IF NOT EXISTS public.didar_import_log (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "didar_id" text NOT NULL,
  "action" text,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "error_message" text,
  "raw_data" jsonb,
  CONSTRAINT didar_import_log_pkey PRIMARY KEY (id),
  CONSTRAINT didar_import_log_entity_type_didar_id_key UNIQUE (entity_type, didar_id),
  CONSTRAINT didar_import_log_action_check CHECK ((action = ANY (ARRAY['created'::text, 'updated'::text, 'skipped'::text, 'error'::text]))),
  CONSTRAINT didar_import_log_entity_type_check CHECK ((entity_type = ANY (ARRAY['contact'::text, 'activity'::text, 'preinvoice'::text])))
);

CREATE UNIQUE INDEX IF NOT EXISTS didar_import_log_entity_type_didar_id_key ON public.didar_import_log USING btree (entity_type, didar_id);
DROP POLICY IF EXISTS didar_log_admin ON public.didar_import_log;
CREATE POLICY didar_log_admin ON public.didar_import_log
  FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text)))
  WITH CHECK ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text)));

-- ---------- public.documents ----------
CREATE TABLE IF NOT EXISTS public.documents (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "type" text NOT NULL,
  "reference_id" uuid,
  "reference_type" text,
  "uploaded_by" uuid NOT NULL,
  "storage_path" text NOT NULL,
  "file_name" text NOT NULL,
  "file_size" bigint,
  "mime_type" text,
  "status" text DEFAULT 'pending_review'::text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "review_deadline" timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  CONSTRAINT documents_pkey PRIMARY KEY (id),
  CONSTRAINT documents_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id),
  CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id),
  CONSTRAINT documents_reference_type_check CHECK (((reference_type = ANY (ARRAY['inquiry'::text, 'purchase_request'::text])) OR (reference_type IS NULL))),
  CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'confirmed'::text, 'rejected'::text, 'expired'::text]))),
  CONSTRAINT documents_type_check CHECK ((type = ANY (ARRAY['bijak'::text, 'invoice'::text, 'havale'::text])))
);

CREATE INDEX IF NOT EXISTS documents_pending_deadline_idx ON public.documents USING btree (review_deadline) WHERE (status = 'pending_review'::text);
CREATE INDEX IF NOT EXISTS documents_reference_id_idx ON public.documents USING btree (reference_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON public.documents USING btree (status);
CREATE INDEX IF NOT EXISTS documents_type_idx ON public.documents USING btree (type);
CREATE INDEX IF NOT EXISTS documents_uploaded_by_idx ON public.documents USING btree (uploaded_by);
DROP POLICY IF EXISTS accountant can insert documents ON public.documents;
CREATE POLICY accountant can insert documents ON public.documents
  FOR INSERT TO public
  WITH CHECK (((uploaded_by = auth.uid()) AND (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
DROP POLICY IF EXISTS managers see all documents ON public.documents;
CREATE POLICY managers see all documents ON public.documents
  FOR SELECT TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS reviewer can update document status ON public.documents;
CREATE POLICY reviewer can update document status ON public.documents
  FOR UPDATE TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS uploader sees own documents ON public.documents;
CREATE POLICY uploader sees own documents ON public.documents
  FOR SELECT TO public
  USING ((uploaded_by = auth.uid()));
DROP TRIGGER IF EXISTS set_documents_updated_at ON public.documents;
CREATE TRIGGER set_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- public.dynamic_scoring_parameters ----------
CREATE TABLE IF NOT EXISTS public.dynamic_scoring_parameters (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "code" text NOT NULL,
  "label_fa" text NOT NULL,
  "direction" text DEFAULT 'positive'::text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "input_type" text DEFAULT 'score_100'::text NOT NULL,
  "min_value" numeric DEFAULT 0 NOT NULL,
  "max_value" numeric DEFAULT 100 NOT NULL,
  "unit_label" text,
  "input_hint" text,
  CONSTRAINT dynamic_scoring_parameters_pkey PRIMARY KEY (id),
  CONSTRAINT dyn_scoring_params_entity_code_uniq UNIQUE (entity_type, code),
  CONSTRAINT dynamic_scoring_parameters_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT dyn_scoring_params_min_max_chk CHECK ((max_value > min_value)),
  CONSTRAINT dynamic_scoring_parameters_direction_check CHECK ((direction = ANY (ARRAY['positive'::text, 'negative'::text]))),
  CONSTRAINT dynamic_scoring_parameters_entity_type_check CHECK ((entity_type = ANY (ARRAY['customer'::text, 'salesperson'::text]))),
  CONSTRAINT dynamic_scoring_parameters_input_type_check CHECK ((input_type = ANY (ARRAY['score_100'::text, 'toman'::text, 'months'::text, 'boolean'::text])))
);

CREATE UNIQUE INDEX IF NOT EXISTS dyn_scoring_params_entity_code_uniq ON public.dynamic_scoring_parameters USING btree (entity_type, code);
DROP POLICY IF EXISTS dyn_scoring_params_admin_write ON public.dynamic_scoring_parameters;
CREATE POLICY dyn_scoring_params_admin_write ON public.dynamic_scoring_parameters
  FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text)))
  WITH CHECK ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text)));
DROP POLICY IF EXISTS dyn_scoring_params_read_authenticated ON public.dynamic_scoring_parameters;
CREATE POLICY dyn_scoring_params_read_authenticated ON public.dynamic_scoring_parameters
  FOR SELECT TO authenticated
  USING (true);
DROP TRIGGER IF EXISTS dyn_scoring_params_set_updated_at ON public.dynamic_scoring_parameters;
CREATE TRIGGER dyn_scoring_params_set_updated_at BEFORE UPDATE ON public.dynamic_scoring_parameters FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- public.employee_profiles ----------
CREATE TABLE IF NOT EXISTS public.employee_profiles (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "employment_start_date" date,
  "department" text,
  "direct_manager_id" uuid,
  "bio" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT employee_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT employee_profiles_user_id_key UNIQUE (user_id),
  CONSTRAINT employee_profiles_direct_manager_id_fkey FOREIGN KEY (direct_manager_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT employee_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_profiles_user_id_key ON public.employee_profiles USING btree (user_id);
DROP POLICY IF EXISTS ep_select_auth ON public.employee_profiles;
CREATE POLICY ep_select_auth ON public.employee_profiles
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS ep_write_own ON public.employee_profiles;
CREATE POLICY ep_write_own ON public.employee_profiles
  FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text) OR (user_id = auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text) OR (user_id = auth.uid())));
DROP TRIGGER IF EXISTS trg_employee_profiles_updated_at ON public.employee_profiles;
CREATE TRIGGER trg_employee_profiles_updated_at BEFORE UPDATE ON public.employee_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- public.inquiry_price_cache ----------
CREATE TABLE IF NOT EXISTS public.inquiry_price_cache (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "price" bigint NOT NULL,
  "valid_until" timestamp with time zone NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT inquiry_price_cache_pkey PRIMARY KEY (id),
  CONSTRAINT inquiry_price_cache_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT inquiry_price_cache_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_inquiry_price_cache ON public.inquiry_price_cache USING btree (product_id, valid_until);
DROP POLICY IF EXISTS inquiry_price_cache_select ON public.inquiry_price_cache;
CREATE POLICY inquiry_price_cache_select ON public.inquiry_price_cache
  FOR SELECT TO authenticated
  USING (true);

-- ---------- public.messenger_groups ----------
CREATE TABLE IF NOT EXISTS public.messenger_groups (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  CONSTRAINT messenger_groups_pkey PRIMARY KEY (id),
  CONSTRAINT messenger_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT messenger_groups_type_check CHECK ((type = ANY (ARRAY['private'::text, 'group'::text, 'operational'::text])))
);

CREATE INDEX IF NOT EXISTS idx_messenger_groups_is_active ON public.messenger_groups USING btree (is_active);
DROP POLICY IF EXISTS messenger_groups_delete_creator ON public.messenger_groups;
CREATE POLICY messenger_groups_delete_creator ON public.messenger_groups
  FOR DELETE TO authenticated
  USING ((created_by = auth.uid()));
DROP POLICY IF EXISTS messenger_groups_insert_self ON public.messenger_groups;
CREATE POLICY messenger_groups_insert_self ON public.messenger_groups
  FOR INSERT TO authenticated
  WITH CHECK ((created_by = auth.uid()));
DROP POLICY IF EXISTS messenger_groups_select_members ON public.messenger_groups;
CREATE POLICY messenger_groups_select_members ON public.messenger_groups
  FOR SELECT TO authenticated
  USING ((is_messenger_group_member(id, auth.uid()) OR (created_by = auth.uid())));
DROP POLICY IF EXISTS messenger_groups_update_creator ON public.messenger_groups;
CREATE POLICY messenger_groups_update_creator ON public.messenger_groups
  FOR UPDATE TO authenticated
  USING ((created_by = auth.uid()))
  WITH CHECK ((created_by = auth.uid()));

-- ---------- public.person_field_definitions ----------
CREATE TABLE IF NOT EXISTS public.person_field_definitions (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "label" text NOT NULL,
  "field_type" text NOT NULL,
  "options" jsonb,
  "is_required" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 100 NOT NULL,
  "help_text" text,
  "validation_regex" text,
  "applies_to_kind" text DEFAULT 'both'::text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT person_field_definitions_pkey PRIMARY KEY (id),
  CONSTRAINT person_field_definitions_name_key UNIQUE (name),
  CONSTRAINT person_field_definitions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT person_field_definitions_applies_to_kind_chk CHECK ((applies_to_kind = ANY (ARRAY['individual'::text, 'organization'::text, 'both'::text]))),
  CONSTRAINT person_field_definitions_field_type_chk CHECK ((field_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'bool'::text, 'select'::text, 'multiselect'::text, 'jsonb'::text]))),
  CONSTRAINT person_field_definitions_label_not_blank CHECK ((length(btrim(label)) > 0)),
  CONSTRAINT person_field_definitions_name_not_blank CHECK ((length(btrim(name)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_pfd_applies_to_kind ON public.person_field_definitions USING btree (applies_to_kind);
CREATE INDEX IF NOT EXISTS idx_pfd_is_active ON public.person_field_definitions USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_pfd_sort_order ON public.person_field_definitions USING btree (sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS person_field_definitions_name_key ON public.person_field_definitions USING btree (name);
DROP POLICY IF EXISTS pfd_insert_admin_manager ON public.person_field_definitions;
CREATE POLICY pfd_insert_admin_manager ON public.person_field_definitions
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
DROP POLICY IF EXISTS pfd_select_active_all_authed ON public.person_field_definitions;
CREATE POLICY pfd_select_active_all_authed ON public.person_field_definitions
  FOR SELECT TO authenticated
  USING (((is_active = true) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])));
DROP POLICY IF EXISTS pfd_update_admin_manager ON public.person_field_definitions;
CREATE POLICY pfd_update_admin_manager ON public.person_field_definitions
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
DROP TRIGGER IF EXISTS trg_pfd_audit ON public.person_field_definitions;
CREATE TRIGGER trg_pfd_audit AFTER INSERT OR UPDATE ON public.person_field_definitions FOR EACH ROW EXECUTE FUNCTION audit_person_field_definitions();
DROP TRIGGER IF EXISTS trg_pfd_updated_at ON public.person_field_definitions;
CREATE TRIGGER trg_pfd_updated_at BEFORE UPDATE ON public.person_field_definitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- public.persons ----------
CREATE TABLE IF NOT EXISTS public.persons (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "kind" text DEFAULT 'individual'::text NOT NULL,
  "display_name" text NOT NULL,
  "legal_name" text,
  "visibility_scope" text DEFAULT 'internal_general'::text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT persons_pkey PRIMARY KEY (id),
  CONSTRAINT persons_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT persons_display_name_not_blank CHECK ((length(btrim(display_name)) > 0)),
  CONSTRAINT persons_kind_check CHECK ((kind = ANY (ARRAY['individual'::text, 'organization'::text]))),
  CONSTRAINT persons_visibility_scope_check CHECK ((visibility_scope = ANY (ARRAY['internal_general'::text, 'restricted_finance'::text, 'restricted_executive'::text])))
);

CREATE INDEX IF NOT EXISTS idx_persons_is_active ON public.persons USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_persons_kind ON public.persons USING btree (kind);
CREATE INDEX IF NOT EXISTS idx_persons_visibility_scope ON public.persons USING btree (visibility_scope);
DROP POLICY IF EXISTS persons_insert_admin_manager ON public.persons;
CREATE POLICY persons_insert_admin_manager ON public.persons
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
DROP POLICY IF EXISTS persons_select_by_visibility_scope ON public.persons;
CREATE POLICY persons_select_by_visibility_scope ON public.persons
  FOR SELECT TO authenticated
  USING ((((visibility_scope = 'internal_general'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role, 'viewer'::app_role])) OR ((visibility_scope = 'restricted_finance'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) OR ((visibility_scope = 'restricted_executive'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))));
DROP POLICY IF EXISTS persons_update_admin_manager ON public.persons;
CREATE POLICY persons_update_admin_manager ON public.persons
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
DROP TRIGGER IF EXISTS trg_persons_audit_insert ON public.persons;
CREATE TRIGGER trg_persons_audit_insert AFTER INSERT ON public.persons FOR EACH ROW EXECUTE FUNCTION audit_persons_insert();
DROP TRIGGER IF EXISTS trg_persons_audit_update ON public.persons;
CREATE TRIGGER trg_persons_audit_update AFTER UPDATE ON public.persons FOR EACH ROW EXECUTE FUNCTION audit_persons_update();
DROP TRIGGER IF EXISTS trg_persons_set_updated_at ON public.persons;
CREATE TRIGGER trg_persons_set_updated_at BEFORE UPDATE ON public.persons FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- public.presence_logs ----------
CREATE TABLE IF NOT EXISTS public.presence_logs (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "clock_in_at" timestamp with time zone DEFAULT now() NOT NULL,
  "clock_out_at" timestamp with time zone,
  "date" date DEFAULT CURRENT_DATE NOT NULL,
  "total_minutes" integer,
  "notes" text,
  CONSTRAINT presence_logs_pkey PRIMARY KEY (id),
  CONSTRAINT presence_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_presence_logs_user_date ON public.presence_logs USING btree (user_id, date);
DROP POLICY IF EXISTS pl_insert ON public.presence_logs;
CREATE POLICY pl_insert ON public.presence_logs
  FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS pl_select ON public.presence_logs;
CREATE POLICY pl_select ON public.presence_logs
  FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text)));
DROP POLICY IF EXISTS pl_update ON public.presence_logs;
CREATE POLICY pl_update ON public.presence_logs
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));

-- ---------- public.product_images ----------
CREATE TABLE IF NOT EXISTS public.product_images (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "url" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "alt_text" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT product_images_pkey PRIMARY KEY (id),
  CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_one_primary ON public.product_images USING btree (product_id) WHERE (is_primary = true);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON public.product_images USING btree (product_id, sort_order);
DROP POLICY IF EXISTS product_images_select ON public.product_images;
CREATE POLICY product_images_select ON public.product_images
  FOR SELECT TO public
  USING (true);
DROP POLICY IF EXISTS product_images_write ON public.product_images;
CREATE POLICY product_images_write ON public.product_images
  FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text)))
  WITH CHECK ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text)));

-- ---------- public.workflow_settings ----------
CREATE TABLE IF NOT EXISTS public.workflow_settings (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "process_key" text NOT NULL,
  "process_name_fa" text NOT NULL,
  "uploader_role" text,
  "reviewer_role" text,
  "timer_minutes" integer DEFAULT 10 NOT NULL,
  "penalty_enabled" boolean DEFAULT true NOT NULL,
  "penalty_for" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT workflow_settings_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_settings_process_key_key UNIQUE (process_key),
  CONSTRAINT workflow_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id),
  CONSTRAINT workflow_settings_penalty_for_check CHECK ((penalty_for = ANY (ARRAY['uploader'::text, 'reviewer'::text, 'both'::text])))
);

CREATE INDEX IF NOT EXISTS workflow_settings_process_key_idx ON public.workflow_settings USING btree (process_key);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_settings_process_key_key ON public.workflow_settings USING btree (process_key);
DROP POLICY IF EXISTS all authenticated can read settings ON public.workflow_settings;
CREATE POLICY all authenticated can read settings ON public.workflow_settings
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS only admin and manager can update ON public.workflow_settings;
CREATE POLICY only admin and manager can update ON public.workflow_settings
  FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP TRIGGER IF EXISTS set_workflow_settings_updated_at ON public.workflow_settings;
CREATE TRIGGER set_workflow_settings_updated_at BEFORE UPDATE ON public.workflow_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- public.customer_capital_allocations_dynamic ----------
CREATE TABLE IF NOT EXISTS public.customer_capital_allocations_dynamic (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "capital_setting_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "salesperson_id" uuid,
  "weighted_score" numeric,
  "share_ratio" numeric,
  "raw_allocation" numeric,
  "final_limit" numeric,
  "binding_constraint" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_capital_allocations_dynamic_pkey PRIMARY KEY (id),
  CONSTRAINT uniq_ccad_setting_cust UNIQUE (capital_setting_id, customer_id),
  CONSTRAINT customer_capital_allocations_dynamic_capital_setting_id_fkey FOREIGN KEY (capital_setting_id) REFERENCES daily_capital_settings(id) ON DELETE CASCADE,
  CONSTRAINT customer_capital_allocations_dynamic_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT customer_capital_allocations_dynamic_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT customer_capital_allocations_dynamic_binding_constraint_check CHECK ((binding_constraint = ANY (ARRAY['formula'::text, 'credit_limit'::text, 'overdue'::text, 'floor'::text])))
);

CREATE INDEX IF NOT EXISTS idx_ccad_customer ON public.customer_capital_allocations_dynamic USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_ccad_salesperson ON public.customer_capital_allocations_dynamic USING btree (salesperson_id);
CREATE INDEX IF NOT EXISTS idx_ccad_setting ON public.customer_capital_allocations_dynamic USING btree (capital_setting_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ccad_setting_cust ON public.customer_capital_allocations_dynamic USING btree (capital_setting_id, customer_id);
DROP POLICY IF EXISTS ccad_admin_accountant_select ON public.customer_capital_allocations_dynamic;
CREATE POLICY ccad_admin_accountant_select ON public.customer_capital_allocations_dynamic
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'accountant'::text)));
DROP POLICY IF EXISTS ccad_owner_select ON public.customer_capital_allocations_dynamic;
CREATE POLICY ccad_owner_select ON public.customer_capital_allocations_dynamic
  FOR SELECT TO authenticated
  USING ((salesperson_id = auth.uid()));

-- ---------- public.salesperson_capital_allocations_dynamic ----------
CREATE TABLE IF NOT EXISTS public.salesperson_capital_allocations_dynamic (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "capital_setting_id" uuid NOT NULL,
  "salesperson_id" uuid NOT NULL,
  "weighted_score" numeric,
  "share_ratio" numeric,
  "allocated_capital" numeric,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT salesperson_capital_allocations_dynamic_pkey PRIMARY KEY (id),
  CONSTRAINT uniq_scad_setting_sp UNIQUE (capital_setting_id, salesperson_id),
  CONSTRAINT salesperson_capital_allocations_dynamic_capital_setting_id_fkey FOREIGN KEY (capital_setting_id) REFERENCES daily_capital_settings(id) ON DELETE CASCADE,
  CONSTRAINT salesperson_capital_allocations_dynamic_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scad_salesperson ON public.salesperson_capital_allocations_dynamic USING btree (salesperson_id);
CREATE INDEX IF NOT EXISTS idx_scad_setting ON public.salesperson_capital_allocations_dynamic USING btree (capital_setting_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_scad_setting_sp ON public.salesperson_capital_allocations_dynamic USING btree (capital_setting_id, salesperson_id);
DROP POLICY IF EXISTS scad_admin_accountant_select ON public.salesperson_capital_allocations_dynamic;
CREATE POLICY scad_admin_accountant_select ON public.salesperson_capital_allocations_dynamic
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'accountant'::text)));
DROP POLICY IF EXISTS scad_owner_select ON public.salesperson_capital_allocations_dynamic;
CREATE POLICY scad_owner_select ON public.salesperson_capital_allocations_dynamic
  FOR SELECT TO authenticated
  USING ((salesperson_id = auth.uid()));

-- ---------- public.delivery_receipt_status_history ----------
CREATE TABLE IF NOT EXISTS public.delivery_receipt_status_history (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "receipt_id" uuid NOT NULL,
  "from_status" text,
  "to_status" text NOT NULL,
  "changed_by" uuid,
  "note" text,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT delivery_receipt_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_receipt_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id),
  CONSTRAINT delivery_receipt_status_history_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES delivery_receipts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS delivery_receipt_status_history_receipt_idx ON public.delivery_receipt_status_history USING btree (receipt_id);
DROP POLICY IF EXISTS insert history ON public.delivery_receipt_status_history;
CREATE POLICY insert history ON public.delivery_receipt_status_history
  FOR INSERT TO authenticated
  WITH CHECK (((changed_by = auth.uid()) OR (changed_by IS NULL)));
DROP POLICY IF EXISTS see history of accessible receipts ON public.delivery_receipt_status_history;
CREATE POLICY see history of accessible receipts ON public.delivery_receipt_status_history
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM delivery_receipts dr
  WHERE ((dr.id = delivery_receipt_status_history.receipt_id) AND ((dr.uploaded_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'sales'::app_role))))));

-- ---------- public.document_status_history ----------
CREATE TABLE IF NOT EXISTS public.document_status_history (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL,
  "from_status" text,
  "to_status" text NOT NULL,
  "changed_by" uuid,
  "note" text,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT document_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT document_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id),
  CONSTRAINT document_status_history_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS document_status_history_document_idx ON public.document_status_history USING btree (document_id);
DROP POLICY IF EXISTS insert document history ON public.document_status_history;
CREATE POLICY insert document history ON public.document_status_history
  FOR INSERT TO public
  WITH CHECK (((changed_by = auth.uid()) OR (changed_by IS NULL)));
DROP POLICY IF EXISTS see history of accessible documents ON public.document_status_history;
CREATE POLICY see history of accessible documents ON public.document_status_history
  FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM documents d
  WHERE ((d.id = document_status_history.document_id) AND ((d.uploaded_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))))));

-- ---------- public.dynamic_parameter_weights ----------
CREATE TABLE IF NOT EXISTS public.dynamic_parameter_weights (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "parameter_id" uuid NOT NULL,
  "weight" numeric(4,3) NOT NULL,
  "valid_from" date DEFAULT CURRENT_DATE NOT NULL,
  "valid_to" date,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT dynamic_parameter_weights_pkey PRIMARY KEY (id),
  CONSTRAINT dynamic_parameter_weights_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT dynamic_parameter_weights_parameter_id_fkey FOREIGN KEY (parameter_id) REFERENCES dynamic_scoring_parameters(id) ON DELETE CASCADE,
  CONSTRAINT dynamic_parameter_weights_check CHECK (((valid_to IS NULL) OR (valid_to > valid_from))),
  CONSTRAINT dynamic_parameter_weights_weight_check CHECK (((weight >= (0)::numeric) AND (weight <= (1)::numeric))),
  CONSTRAINT dyn_param_weights_no_overlap EXCLUDE USING gist (parameter_id WITH =, daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[)'::text) WITH &&)
);

CREATE INDEX IF NOT EXISTS dyn_param_weights_no_overlap ON public.dynamic_parameter_weights USING gist (parameter_id, daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[)'::text));
CREATE INDEX IF NOT EXISTS dyn_param_weights_parameter_idx ON public.dynamic_parameter_weights USING btree (parameter_id, valid_from DESC);
DROP POLICY IF EXISTS dyn_param_weights_admin_write ON public.dynamic_parameter_weights;
CREATE POLICY dyn_param_weights_admin_write ON public.dynamic_parameter_weights
  FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text)))
  WITH CHECK ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text)));
DROP POLICY IF EXISTS dyn_param_weights_read_authenticated ON public.dynamic_parameter_weights;
CREATE POLICY dyn_param_weights_read_authenticated ON public.dynamic_parameter_weights
  FOR SELECT TO authenticated
  USING (true);

-- ---------- public.dynamic_entity_scores ----------
CREATE TABLE IF NOT EXISTS public.dynamic_entity_scores (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "parameter_id" uuid NOT NULL,
  "raw_score" numeric(4,3),
  "note" text,
  "scored_by" uuid,
  "scored_at" timestamp with time zone DEFAULT now() NOT NULL,
  "period_month" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actual_value" numeric,
  "is_clipped" boolean DEFAULT false NOT NULL,
  CONSTRAINT dynamic_entity_scores_pkey PRIMARY KEY (id),
  CONSTRAINT unique_score UNIQUE (entity_type, entity_id, parameter_id, period_month),
  CONSTRAINT dynamic_entity_scores_parameter_id_fkey FOREIGN KEY (parameter_id) REFERENCES dynamic_scoring_parameters(id) ON DELETE CASCADE,
  CONSTRAINT dynamic_entity_scores_scored_by_fkey FOREIGN KEY (scored_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT dynamic_entity_scores_entity_type_check CHECK ((entity_type = ANY (ARRAY['customer'::text, 'salesperson'::text]))),
  CONSTRAINT dynamic_entity_scores_period_month_check CHECK ((period_month = (date_trunc('month'::text, (period_month)::timestamp with time zone))::date)),
  CONSTRAINT dynamic_entity_scores_raw_score_check CHECK (((raw_score >= (0)::numeric) AND (raw_score <= (1)::numeric)))
);

CREATE INDEX IF NOT EXISTS idx_dyn_scores_entity ON public.dynamic_entity_scores USING btree (entity_type, entity_id, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_dyn_scores_period ON public.dynamic_entity_scores USING btree (period_month DESC, entity_type);
CREATE UNIQUE INDEX IF NOT EXISTS unique_score ON public.dynamic_entity_scores USING btree (entity_type, entity_id, parameter_id, period_month);
DROP POLICY IF EXISTS dyn_scores_read_authenticated ON public.dynamic_entity_scores;
CREATE POLICY dyn_scores_read_authenticated ON public.dynamic_entity_scores
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS dyn_scores_write_admin_accountant ON public.dynamic_entity_scores;
CREATE POLICY dyn_scores_write_admin_accountant ON public.dynamic_entity_scores
  FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'accountant'::text)))
  WITH CHECK ((has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'accountant'::text)));
DROP TRIGGER IF EXISTS trg_a_compute_raw_score ON public.dynamic_entity_scores;
CREATE TRIGGER trg_a_compute_raw_score BEFORE INSERT OR UPDATE ON public.dynamic_entity_scores FOR EACH ROW EXECUTE FUNCTION compute_normalized_raw_score();
DROP TRIGGER IF EXISTS trg_audit_dyn_score ON public.dynamic_entity_scores;
CREATE TRIGGER trg_audit_dyn_score AFTER INSERT OR DELETE OR UPDATE ON public.dynamic_entity_scores FOR EACH ROW EXECUTE FUNCTION audit_dynamic_entity_score();
DROP TRIGGER IF EXISTS trg_dyn_scores_set_updated_at ON public.dynamic_entity_scores;
CREATE TRIGGER trg_dyn_scores_set_updated_at BEFORE UPDATE ON public.dynamic_entity_scores FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_validate_dyn_score ON public.dynamic_entity_scores;
CREATE TRIGGER trg_validate_dyn_score BEFORE INSERT OR UPDATE ON public.dynamic_entity_scores FOR EACH ROW EXECUTE FUNCTION validate_dynamic_entity_score();

-- ---------- public.messenger_messages ----------
CREATE TABLE IF NOT EXISTS public.messenger_messages (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL,
  "sender_id" uuid,
  "content" text,
  "type" text DEFAULT 'text'::text NOT NULL,
  "reply_to" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "edited_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT messenger_messages_pkey PRIMARY KEY (id),
  CONSTRAINT messenger_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES messenger_groups(id) ON DELETE CASCADE,
  CONSTRAINT messenger_messages_reply_to_fkey FOREIGN KEY (reply_to) REFERENCES messenger_messages(id) ON DELETE SET NULL,
  CONSTRAINT messenger_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT messenger_messages_type_check CHECK ((type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'audio'::text, 'file'::text, 'system'::text, 'inquiry'::text])))
);

CREATE INDEX IF NOT EXISTS idx_messenger_messages_group_created ON public.messenger_messages USING btree (group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_sender ON public.messenger_messages USING btree (sender_id);
DROP POLICY IF EXISTS messenger_messages_delete_sender ON public.messenger_messages;
CREATE POLICY messenger_messages_delete_sender ON public.messenger_messages
  FOR DELETE TO authenticated
  USING ((sender_id = auth.uid()));
DROP POLICY IF EXISTS messenger_messages_insert_member ON public.messenger_messages;
CREATE POLICY messenger_messages_insert_member ON public.messenger_messages
  FOR INSERT TO authenticated
  WITH CHECK (((sender_id = auth.uid()) AND is_messenger_group_member(group_id, auth.uid())));
DROP POLICY IF EXISTS messenger_messages_select_members ON public.messenger_messages;
CREATE POLICY messenger_messages_select_members ON public.messenger_messages
  FOR SELECT TO authenticated
  USING (is_messenger_group_member(group_id, auth.uid()));
DROP POLICY IF EXISTS messenger_messages_update_sender ON public.messenger_messages;
CREATE POLICY messenger_messages_update_sender ON public.messenger_messages
  FOR UPDATE TO authenticated
  USING ((sender_id = auth.uid()))
  WITH CHECK ((sender_id = auth.uid()));

-- ---------- public.messenger_group_members ----------
CREATE TABLE IF NOT EXISTS public.messenger_group_members (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'member'::text NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT messenger_group_members_pkey PRIMARY KEY (id),
  CONSTRAINT messenger_group_members_group_id_user_id_key UNIQUE (group_id, user_id),
  CONSTRAINT messenger_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES messenger_groups(id) ON DELETE CASCADE,
  CONSTRAINT messenger_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT messenger_group_members_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text, 'viewer'::text, 'purchaser'::text])))
);

CREATE INDEX IF NOT EXISTS idx_messenger_group_members_group ON public.messenger_group_members USING btree (group_id);
CREATE INDEX IF NOT EXISTS idx_messenger_group_members_user ON public.messenger_group_members USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS messenger_group_members_group_id_user_id_key ON public.messenger_group_members USING btree (group_id, user_id);
DROP POLICY IF EXISTS messenger_members_delete_creator ON public.messenger_group_members;
CREATE POLICY messenger_members_delete_creator ON public.messenger_group_members
  FOR DELETE TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM messenger_groups g
  WHERE ((g.id = messenger_group_members.group_id) AND (g.created_by = auth.uid())))) OR (user_id = auth.uid())));
DROP POLICY IF EXISTS messenger_members_insert_creator ON public.messenger_group_members;
CREATE POLICY messenger_members_insert_creator ON public.messenger_group_members
  FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM messenger_groups g
  WHERE ((g.id = messenger_group_members.group_id) AND (g.created_by = auth.uid())))));
DROP POLICY IF EXISTS messenger_members_select_members ON public.messenger_group_members;
CREATE POLICY messenger_members_select_members ON public.messenger_group_members
  FOR SELECT TO authenticated
  USING (is_messenger_group_member(group_id, auth.uid()));

-- ---------- public.ai_conversations ----------
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "group_id" uuid,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "model" text,
  "tokens_in" integer,
  "tokens_out" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT ai_conversations_pkey PRIMARY KEY (id),
  CONSTRAINT ai_conversations_group_id_fkey FOREIGN KEY (group_id) REFERENCES messenger_groups(id) ON DELETE CASCADE,
  CONSTRAINT ai_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT ai_conversations_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);

CREATE INDEX IF NOT EXISTS ai_conversations_user_group_created_idx ON public.ai_conversations USING btree (user_id, group_id, created_at DESC);
DROP POLICY IF EXISTS ai_conversations_delete_own ON public.ai_conversations;
CREATE POLICY ai_conversations_delete_own ON public.ai_conversations
  FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS ai_conversations_insert_own ON public.ai_conversations;
CREATE POLICY ai_conversations_insert_own ON public.ai_conversations
  FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS ai_conversations_select_own ON public.ai_conversations;
CREATE POLICY ai_conversations_select_own ON public.ai_conversations
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

-- ---------- public.person_context_links ----------
CREATE TABLE IF NOT EXISTS public.person_context_links (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL,
  "context_kind" text NOT NULL,
  "ref_table" text,
  "ref_id" uuid,
  "note" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT person_context_links_pkey PRIMARY KEY (id),
  CONSTRAINT person_context_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT person_context_links_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE,
  CONSTRAINT person_context_links_context_kind_check CHECK ((context_kind = ANY (ARRAY['customer'::text, 'supplier'::text, 'driver'::text, 'sender'::text, 'receiver'::text, 'referrer'::text, 'marketer'::text, 'representative'::text, 'complainant'::text, 'returner'::text, 'staff_link'::text, 'credit_party'::text, 'accounting_party'::text, 'delivery_party'::text, 'purchase_owner'::text, 'sales_expert'::text, 'warehouse_owner'::text, 'other'::text]))),
  CONSTRAINT person_context_links_ref_pair_check CHECK ((((ref_table IS NULL) AND (ref_id IS NULL)) OR ((ref_table IS NOT NULL) AND (ref_id IS NOT NULL)))),
  CONSTRAINT person_context_links_time_range_check CHECK (((ended_at IS NULL) OR (ended_at >= started_at)))
);

CREATE INDEX IF NOT EXISTS idx_pcl_context_kind ON public.person_context_links USING btree (context_kind);
CREATE INDEX IF NOT EXISTS idx_pcl_ended_at ON public.person_context_links USING btree (ended_at);
CREATE INDEX IF NOT EXISTS idx_pcl_person_id ON public.person_context_links USING btree (person_id);
CREATE INDEX IF NOT EXISTS idx_pcl_ref ON public.person_context_links USING btree (ref_table, ref_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pcl_active_ref ON public.person_context_links USING btree (person_id, context_kind, ref_table, ref_id) WHERE ((ended_at IS NULL) AND (ref_table IS NOT NULL) AND (ref_id IS NOT NULL));
DROP POLICY IF EXISTS person_context_links_insert_admin_manager ON public.person_context_links;
CREATE POLICY person_context_links_insert_admin_manager ON public.person_context_links
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
DROP POLICY IF EXISTS person_context_links_select_via_person ON public.person_context_links;
CREATE POLICY person_context_links_select_via_person ON public.person_context_links
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM persons p
  WHERE ((p.id = person_context_links.person_id) AND (((p.visibility_scope = 'internal_general'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role, 'viewer'::app_role])) OR ((p.visibility_scope = 'restricted_finance'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) OR ((p.visibility_scope = 'restricted_executive'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])))))));
DROP POLICY IF EXISTS person_context_links_update_admin_manager ON public.person_context_links;
CREATE POLICY person_context_links_update_admin_manager ON public.person_context_links
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
DROP TRIGGER IF EXISTS trg_pcl_audit_insert ON public.person_context_links;
CREATE TRIGGER trg_pcl_audit_insert AFTER INSERT ON public.person_context_links FOR EACH ROW EXECUTE FUNCTION audit_person_context_links_insert();
DROP TRIGGER IF EXISTS trg_pcl_audit_update ON public.person_context_links;
CREATE TRIGGER trg_pcl_audit_update AFTER UPDATE ON public.person_context_links FOR EACH ROW EXECUTE FUNCTION audit_person_context_links_update();
DROP TRIGGER IF EXISTS trg_pcl_set_updated_at ON public.person_context_links;
CREATE TRIGGER trg_pcl_set_updated_at BEFORE UPDATE ON public.person_context_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- public.person_field_values ----------
CREATE TABLE IF NOT EXISTS public.person_field_values (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL,
  "field_definition_id" uuid NOT NULL,
  "value" jsonb NOT NULL,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT person_field_values_pkey PRIMARY KEY (id),
  CONSTRAINT person_field_values_person_id_field_definition_id_key UNIQUE (person_id, field_definition_id),
  CONSTRAINT person_field_values_field_definition_id_fkey FOREIGN KEY (field_definition_id) REFERENCES person_field_definitions(id) ON DELETE RESTRICT,
  CONSTRAINT person_field_values_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE,
  CONSTRAINT person_field_values_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_pfv_field_definition_id ON public.person_field_values USING btree (field_definition_id);
CREATE INDEX IF NOT EXISTS idx_pfv_person_id ON public.person_field_values USING btree (person_id);
CREATE UNIQUE INDEX IF NOT EXISTS person_field_values_person_id_field_definition_id_key ON public.person_field_values USING btree (person_id, field_definition_id);
DROP POLICY IF EXISTS pfv_insert_admin_manager ON public.person_field_values;
CREATE POLICY pfv_insert_admin_manager ON public.person_field_values
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
DROP POLICY IF EXISTS pfv_select_via_person ON public.person_field_values;
CREATE POLICY pfv_select_via_person ON public.person_field_values
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM persons p
  WHERE ((p.id = person_field_values.person_id) AND (((p.visibility_scope = 'internal_general'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role, 'viewer'::app_role])) OR ((p.visibility_scope = 'restricted_finance'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) OR ((p.visibility_scope = 'restricted_executive'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])))))));
DROP POLICY IF EXISTS pfv_update_admin_manager ON public.person_field_values;
CREATE POLICY pfv_update_admin_manager ON public.person_field_values
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
DROP TRIGGER IF EXISTS trg_pfv_audit ON public.person_field_values;
CREATE TRIGGER trg_pfv_audit AFTER INSERT OR UPDATE ON public.person_field_values FOR EACH ROW EXECUTE FUNCTION audit_person_field_values();
DROP TRIGGER IF EXISTS trg_pfv_updated_at ON public.person_field_values;
CREATE TRIGGER trg_pfv_updated_at BEFORE UPDATE ON public.person_field_values FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_pfv_validate ON public.person_field_values;
CREATE TRIGGER trg_pfv_validate BEFORE INSERT OR UPDATE ON public.person_field_values FOR EACH ROW EXECUTE FUNCTION validate_person_field_value();

-- ---------- public.person_identifiers ----------
CREATE TABLE IF NOT EXISTS public.person_identifiers (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "value_raw" text NOT NULL,
  "value_normalized" text NOT NULL,
  "status" text DEFAULT 'provisional'::text NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "verified_at" timestamp with time zone,
  "verified_by" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT person_identifiers_pkey PRIMARY KEY (id),
  CONSTRAINT person_identifiers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT person_identifiers_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE,
  CONSTRAINT person_identifiers_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id),
  CONSTRAINT person_identifiers_kind_check CHECK ((kind = ANY (ARRAY['mobile_e164'::text, 'landline'::text, 'national_id_ir'::text, 'tax_id_ir'::text, 'company_reg_id_ir'::text, 'email'::text, 'iban'::text, 'custom'::text]))),
  CONSTRAINT person_identifiers_status_check CHECK ((status = ANY (ARRAY['provisional'::text, 'confirmed'::text, 'revoked'::text]))),
  CONSTRAINT person_identifiers_value_normalized_not_blank CHECK ((length(btrim(value_normalized)) > 0)),
  CONSTRAINT person_identifiers_value_raw_not_blank CHECK ((length(btrim(value_raw)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_person_identifiers_kind ON public.person_identifiers USING btree (kind);
CREATE INDEX IF NOT EXISTS idx_person_identifiers_kind_value ON public.person_identifiers USING btree (kind, value_normalized);
CREATE INDEX IF NOT EXISTS idx_person_identifiers_person_id ON public.person_identifiers USING btree (person_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_active_kind_value ON public.person_identifiers USING btree (kind, value_normalized) WHERE (status = ANY (ARRAY['provisional'::text, 'confirmed'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_confirmed_kind_value ON public.person_identifiers USING btree (kind, value_normalized) WHERE (status = 'confirmed'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_primary_active ON public.person_identifiers USING btree (person_id, kind) WHERE ((is_primary = true) AND (status <> 'revoked'::text));
DROP POLICY IF EXISTS person_identifiers_insert_admin_manager ON public.person_identifiers;
CREATE POLICY person_identifiers_insert_admin_manager ON public.person_identifiers
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
DROP POLICY IF EXISTS person_identifiers_select_via_person ON public.person_identifiers;
CREATE POLICY person_identifiers_select_via_person ON public.person_identifiers
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM persons p
  WHERE ((p.id = person_identifiers.person_id) AND (((p.visibility_scope = 'internal_general'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role, 'viewer'::app_role])) OR ((p.visibility_scope = 'restricted_finance'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) OR ((p.visibility_scope = 'restricted_executive'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])))))));
DROP POLICY IF EXISTS person_identifiers_update_admin_manager ON public.person_identifiers;
CREATE POLICY person_identifiers_update_admin_manager ON public.person_identifiers
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
DROP TRIGGER IF EXISTS trg_person_identifiers_audit_insert ON public.person_identifiers;
CREATE TRIGGER trg_person_identifiers_audit_insert AFTER INSERT ON public.person_identifiers FOR EACH ROW EXECUTE FUNCTION audit_person_identifiers_insert();
DROP TRIGGER IF EXISTS trg_person_identifiers_audit_update ON public.person_identifiers;
CREATE TRIGGER trg_person_identifiers_audit_update AFTER UPDATE ON public.person_identifiers FOR EACH ROW EXECUTE FUNCTION audit_person_identifiers_update();
DROP TRIGGER IF EXISTS trg_person_identifiers_set_updated_at ON public.person_identifiers;
CREATE TRIGGER trg_person_identifiers_set_updated_at BEFORE UPDATE ON public.person_identifiers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_person_identifiers_validate ON public.person_identifiers;
CREATE TRIGGER trg_person_identifiers_validate BEFORE INSERT OR UPDATE ON public.person_identifiers FOR EACH ROW EXECUTE FUNCTION validate_person_identifier();

-- ---------- public.inquiries ----------
CREATE TABLE IF NOT EXISTS public.inquiries (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "requested_by" uuid NOT NULL,
  "assigned_to" uuid NOT NULL,
  "status" inquiry_status DEFAULT 'pending'::inquiry_status NOT NULL,
  "message_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "answered_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  CONSTRAINT inquiries_pkey PRIMARY KEY (id),
  CONSTRAINT inquiries_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id),
  CONSTRAINT inquiries_group_id_fkey FOREIGN KEY (group_id) REFERENCES messenger_groups(id) ON DELETE CASCADE,
  CONSTRAINT inquiries_message_id_fkey FOREIGN KEY (message_id) REFERENCES messenger_messages(id),
  CONSTRAINT inquiries_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT inquiries_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_inquiries_group_status ON public.inquiries USING btree (group_id, status);
CREATE INDEX IF NOT EXISTS idx_inquiries_product_open ON public.inquiries USING btree (product_id) WHERE (status = ANY (ARRAY['pending'::inquiry_status, 'warning_5min'::inquiry_status, 'danger_8min'::inquiry_status, 'critical_10min'::inquiry_status, 'transfer_available'::inquiry_status, 'transferred'::inquiry_status]));
DROP POLICY IF EXISTS inquiry_insert_rpc ON public.inquiries;
CREATE POLICY inquiry_insert_rpc ON public.inquiries
  FOR INSERT TO service_role
  WITH CHECK (true);
DROP POLICY IF EXISTS inquiry_select ON public.inquiries;
CREATE POLICY inquiry_select ON public.inquiries
  FOR SELECT TO authenticated
  USING (is_messenger_group_member(group_id, auth.uid()));
DROP POLICY IF EXISTS inquiry_update_rpc ON public.inquiries;
CREATE POLICY inquiry_update_rpc ON public.inquiries
  FOR UPDATE TO service_role
  USING (true);
DROP TRIGGER IF EXISTS trg_award_inquiry_response_score ON public.inquiries;
CREATE TRIGGER trg_award_inquiry_response_score AFTER UPDATE OF answered_at ON public.inquiries FOR EACH ROW EXECUTE FUNCTION award_inquiry_response_score();

-- ---------- public.messenger_attachments ----------
CREATE TABLE IF NOT EXISTS public.messenger_attachments (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "file_path" text NOT NULL,
  "file_name" text NOT NULL,
  "file_type" text NOT NULL,
  "file_size" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT messenger_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT messenger_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES messenger_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messenger_attachments_message ON public.messenger_attachments USING btree (message_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_messenger_attachments_file_path ON public.messenger_attachments USING btree (file_path);
DROP POLICY IF EXISTS messenger_attachments_delete_sender ON public.messenger_attachments;
CREATE POLICY messenger_attachments_delete_sender ON public.messenger_attachments
  FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM messenger_messages m
  WHERE ((m.id = messenger_attachments.message_id) AND (m.sender_id = auth.uid())))));
DROP POLICY IF EXISTS messenger_attachments_insert_sender ON public.messenger_attachments;
CREATE POLICY messenger_attachments_insert_sender ON public.messenger_attachments
  FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM messenger_messages m
  WHERE ((m.id = messenger_attachments.message_id) AND (m.sender_id = auth.uid())))));
DROP POLICY IF EXISTS messenger_attachments_select_members ON public.messenger_attachments;
CREATE POLICY messenger_attachments_select_members ON public.messenger_attachments
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM messenger_messages m
  WHERE ((m.id = messenger_attachments.message_id) AND is_messenger_group_member(m.group_id, auth.uid())))));

-- ---------- public.messenger_read_receipts ----------
CREATE TABLE IF NOT EXISTS public.messenger_read_receipts (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT messenger_read_receipts_pkey PRIMARY KEY (id),
  CONSTRAINT messenger_read_receipts_message_id_user_id_key UNIQUE (message_id, user_id),
  CONSTRAINT messenger_read_receipts_message_id_fkey FOREIGN KEY (message_id) REFERENCES messenger_messages(id) ON DELETE CASCADE,
  CONSTRAINT messenger_read_receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messenger_read_receipts_message ON public.messenger_read_receipts USING btree (message_id);
CREATE INDEX IF NOT EXISTS idx_messenger_read_receipts_user ON public.messenger_read_receipts USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS messenger_read_receipts_message_id_user_id_key ON public.messenger_read_receipts USING btree (message_id, user_id);
DROP POLICY IF EXISTS messenger_receipts_insert_self ON public.messenger_read_receipts;
CREATE POLICY messenger_receipts_insert_self ON public.messenger_read_receipts
  FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM messenger_messages m
  WHERE ((m.id = messenger_read_receipts.message_id) AND is_messenger_group_member(m.group_id, auth.uid()))))));
DROP POLICY IF EXISTS messenger_receipts_select_members ON public.messenger_read_receipts;
CREATE POLICY messenger_receipts_select_members ON public.messenger_read_receipts
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM messenger_messages m
  WHERE ((m.id = messenger_read_receipts.message_id) AND is_messenger_group_member(m.group_id, auth.uid())))));

-- ---------- public.message_embeddings ----------
CREATE TABLE IF NOT EXISTS public.message_embeddings (
  "message_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "embedding" vector(768) NOT NULL,
  "content_excerpt" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT message_embeddings_pkey PRIMARY KEY (message_id),
  CONSTRAINT message_embeddings_group_id_fkey FOREIGN KEY (group_id) REFERENCES messenger_groups(id) ON DELETE CASCADE,
  CONSTRAINT message_embeddings_message_id_fkey FOREIGN KEY (message_id) REFERENCES messenger_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS message_embeddings_group_idx ON public.message_embeddings USING btree (group_id);
CREATE INDEX IF NOT EXISTS message_embeddings_vec_idx ON public.message_embeddings USING hnsw (embedding vector_cosine_ops);
DROP POLICY IF EXISTS message_embeddings_insert_sender ON public.message_embeddings;
CREATE POLICY message_embeddings_insert_sender ON public.message_embeddings
  FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM messenger_messages mm
  WHERE ((mm.id = message_embeddings.message_id) AND (mm.sender_id = auth.uid())))));
DROP POLICY IF EXISTS message_embeddings_select_group_member ON public.message_embeddings;
CREATE POLICY message_embeddings_select_group_member ON public.message_embeddings
  FOR SELECT TO authenticated
  USING (is_messenger_group_member(group_id, auth.uid()));

-- ---------- public.inquiry_replies ----------
CREATE TABLE IF NOT EXISTS public.inquiry_replies (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "inquiry_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "price" bigint NOT NULL,
  "is_valid" boolean DEFAULT true NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT inquiry_replies_pkey PRIMARY KEY (id),
  CONSTRAINT inquiry_replies_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  CONSTRAINT inquiry_replies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

DROP POLICY IF EXISTS inquiry_replies_select ON public.inquiry_replies;
CREATE POLICY inquiry_replies_select ON public.inquiry_replies
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_replies.inquiry_id) AND is_messenger_group_member(i.group_id, auth.uid())))));

-- ---------- public.inquiry_status_history ----------
CREATE TABLE IF NOT EXISTS public.inquiry_status_history (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "inquiry_id" uuid NOT NULL,
  "from_status" inquiry_status,
  "to_status" inquiry_status NOT NULL,
  "changed_by" uuid,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reason" text,
  CONSTRAINT inquiry_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT inquiry_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id),
  CONSTRAINT inquiry_status_history_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inquiry_status_history ON public.inquiry_status_history USING btree (inquiry_id, changed_at);
DROP POLICY IF EXISTS inquiry_history_select ON public.inquiry_status_history;
CREATE POLICY inquiry_history_select ON public.inquiry_status_history
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_status_history.inquiry_id) AND is_messenger_group_member(i.group_id, auth.uid())))));

-- ---------- public.inquiry_transfers ----------
CREATE TABLE IF NOT EXISTS public.inquiry_transfers (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "inquiry_id" uuid NOT NULL,
  "from_user" uuid NOT NULL,
  "to_user" uuid NOT NULL,
  "transferred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT inquiry_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT inquiry_transfers_from_user_fkey FOREIGN KEY (from_user) REFERENCES auth.users(id),
  CONSTRAINT inquiry_transfers_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  CONSTRAINT inquiry_transfers_to_user_fkey FOREIGN KEY (to_user) REFERENCES auth.users(id)
);

DROP POLICY IF EXISTS inquiry_transfers_select ON public.inquiry_transfers;
CREATE POLICY inquiry_transfers_select ON public.inquiry_transfers
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_transfers.inquiry_id) AND is_messenger_group_member(i.group_id, auth.uid())))));

-- ---------- public.performance_penalties ----------
CREATE TABLE IF NOT EXISTS public.performance_penalties (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "inquiry_id" uuid,
  "type" text NOT NULL,
  "severity" text NOT NULL,
  "description" text,
  "created_by" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT performance_penalties_pkey PRIMARY KEY (id),
  CONSTRAINT performance_penalties_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT performance_penalties_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE SET NULL,
  CONSTRAINT performance_penalties_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT performance_penalties_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
  CONSTRAINT performance_penalties_type_check CHECK ((type = ANY (ARRAY['no_response_primary'::text, 'no_response_secondary'::text, 'no_confirm_store'::text, 'repeated_invalid_answer'::text, 'frequent_delay'::text, 'frequent_price_edit'::text, 'wrong_inquiry'::text, 'free_product_attempt'::text])))
);

CREATE INDEX IF NOT EXISTS idx_penalties_active ON public.performance_penalties USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_penalties_inquiry ON public.performance_penalties USING btree (inquiry_id);
CREATE INDEX IF NOT EXISTS idx_penalties_user_created ON public.performance_penalties USING btree (user_id, created_at DESC);
DROP POLICY IF EXISTS managers see all penalties ON public.performance_penalties;
CREATE POLICY managers see all penalties ON public.performance_penalties
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS user sees own penalties ON public.performance_penalties;
CREATE POLICY user sees own penalties ON public.performance_penalties
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

-- ---------- public.purchase_requests ----------
CREATE TABLE IF NOT EXISTS public.purchase_requests (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "inquiry_id" uuid,
  "product_id" uuid NOT NULL,
  "quantity" numeric NOT NULL,
  "unit" text DEFAULT 'عدد'::text NOT NULL,
  "requested_by" uuid NOT NULL,
  "assigned_to" uuid,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "notes" text,
  "expected_price" numeric,
  "final_price" numeric,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT purchase_requests_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_requests_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id),
  CONSTRAINT purchase_requests_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE SET NULL,
  CONSTRAINT purchase_requests_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT purchase_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id),
  CONSTRAINT purchase_requests_quantity_check CHECK ((quantity > (0)::numeric)),
  CONSTRAINT purchase_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'purchased'::text, 'delivered'::text, 'cancelled'::text])))
);

CREATE INDEX IF NOT EXISTS purchase_requests_assigned_to_idx ON public.purchase_requests USING btree (assigned_to);
CREATE INDEX IF NOT EXISTS purchase_requests_inquiry_id_idx ON public.purchase_requests USING btree (inquiry_id);
CREATE INDEX IF NOT EXISTS purchase_requests_product_id_idx ON public.purchase_requests USING btree (product_id);
CREATE INDEX IF NOT EXISTS purchase_requests_requested_by_idx ON public.purchase_requests USING btree (requested_by);
CREATE INDEX IF NOT EXISTS purchase_requests_status_idx ON public.purchase_requests USING btree (status);
DROP POLICY IF EXISTS assignee sees assigned requests ON public.purchase_requests;
CREATE POLICY assignee sees assigned requests ON public.purchase_requests
  FOR SELECT TO authenticated
  USING ((assigned_to = auth.uid()));
DROP POLICY IF EXISTS managers see all requests ON public.purchase_requests;
CREATE POLICY managers see all requests ON public.purchase_requests
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS requester sees own requests ON public.purchase_requests;
CREATE POLICY requester sees own requests ON public.purchase_requests
  FOR SELECT TO authenticated
  USING ((requested_by = auth.uid()));
DROP POLICY IF EXISTS sales and manager can insert ON public.purchase_requests;
CREATE POLICY sales and manager can insert ON public.purchase_requests
  FOR INSERT TO authenticated
  WITH CHECK (((requested_by = auth.uid()) AND (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))));
DROP POLICY IF EXISTS update by assignee or manager ON public.purchase_requests;
CREATE POLICY update by assignee or manager ON public.purchase_requests
  FOR UPDATE TO authenticated
  USING (((assigned_to = auth.uid()) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
DROP TRIGGER IF EXISTS trg_purchase_requests_updated_at ON public.purchase_requests;
CREATE TRIGGER trg_purchase_requests_updated_at BEFORE UPDATE ON public.purchase_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- public.penalty_appeals ----------
CREATE TABLE IF NOT EXISTS public.penalty_appeals (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "penalty_id" uuid NOT NULL,
  "appellant_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "deadline" timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
  "review_deadline" timestamp with time zone DEFAULT (now() + '72:00:00'::interval) NOT NULL,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone,
  CONSTRAINT penalty_appeals_pkey PRIMARY KEY (id),
  CONSTRAINT penalty_appeals_penalty_id_key UNIQUE (penalty_id),
  CONSTRAINT penalty_appeals_appellant_id_fkey FOREIGN KEY (appellant_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT penalty_appeals_penalty_id_fkey FOREIGN KEY (penalty_id) REFERENCES performance_penalties(id) ON DELETE CASCADE,
  CONSTRAINT penalty_appeals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])))
);

CREATE INDEX IF NOT EXISTS idx_appeals_appellant ON public.penalty_appeals USING btree (appellant_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON public.penalty_appeals USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS penalty_appeals_penalty_id_key ON public.penalty_appeals USING btree (penalty_id);
DROP POLICY IF EXISTS managers see all appeals ON public.penalty_appeals;
CREATE POLICY managers see all appeals ON public.penalty_appeals
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS reviewers see assigned appeals ON public.penalty_appeals;
CREATE POLICY reviewers see assigned appeals ON public.penalty_appeals
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM appeal_reviewers ar
  WHERE ((ar.appeal_id = penalty_appeals.id) AND (ar.reviewer_id = auth.uid())))));
DROP POLICY IF EXISTS user sees own appeals ON public.penalty_appeals;
CREATE POLICY user sees own appeals ON public.penalty_appeals
  FOR SELECT TO authenticated
  USING ((appellant_id = auth.uid()));

-- ---------- public.purchase_request_status_history ----------
CREATE TABLE IF NOT EXISTS public.purchase_request_status_history (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "from_status" text,
  "to_status" text NOT NULL,
  "changed_by" uuid NOT NULL,
  "note" text,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT purchase_request_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_request_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id),
  CONSTRAINT purchase_request_status_history_request_id_fkey FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS purchase_request_status_history_request_id_idx ON public.purchase_request_status_history USING btree (request_id);
DROP POLICY IF EXISTS insert history by participants ON public.purchase_request_status_history;
CREATE POLICY insert history by participants ON public.purchase_request_status_history
  FOR INSERT TO authenticated
  WITH CHECK ((changed_by = auth.uid()));
DROP POLICY IF EXISTS managers see all history ON public.purchase_request_status_history;
CREATE POLICY managers see all history ON public.purchase_request_status_history
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS see history of own requests ON public.purchase_request_status_history;
CREATE POLICY see history of own requests ON public.purchase_request_status_history
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM purchase_requests pr
  WHERE ((pr.id = purchase_request_status_history.request_id) AND ((pr.requested_by = auth.uid()) OR (pr.assigned_to = auth.uid()))))));

-- ---------- public.purchase_receipts ----------
CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "uploaded_by" uuid NOT NULL,
  "storage_path" text NOT NULL,
  "file_name" text NOT NULL,
  "file_size" bigint,
  "mime_type" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT purchase_receipts_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_receipts_request_id_fkey FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
  CONSTRAINT purchase_receipts_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS purchase_receipts_request_id_idx ON public.purchase_receipts USING btree (request_id);
DROP POLICY IF EXISTS assignee can upload receipt ON public.purchase_receipts;
CREATE POLICY assignee can upload receipt ON public.purchase_receipts
  FOR INSERT TO authenticated
  WITH CHECK ((uploaded_by = auth.uid()));
DROP POLICY IF EXISTS managers see all receipts ON public.purchase_receipts;
CREATE POLICY managers see all receipts ON public.purchase_receipts
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS participants see receipts ON public.purchase_receipts;
CREATE POLICY participants see receipts ON public.purchase_receipts
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM purchase_requests pr
  WHERE ((pr.id = purchase_receipts.request_id) AND ((pr.requested_by = auth.uid()) OR (pr.assigned_to = auth.uid()))))));
DROP POLICY IF EXISTS uploader or manager can delete receipt ON public.purchase_receipts;
CREATE POLICY uploader or manager can delete receipt ON public.purchase_receipts
  FOR DELETE TO authenticated
  USING (((uploaded_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

-- ---------- public.appeal_reviewers ----------
CREATE TABLE IF NOT EXISTS public.appeal_reviewers (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "appeal_id" uuid NOT NULL,
  "reviewer_id" uuid NOT NULL,
  "role" text NOT NULL,
  "vote" text,
  "vote_note" text,
  "voted_at" timestamp with time zone,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT appeal_reviewers_pkey PRIMARY KEY (id),
  CONSTRAINT appeal_reviewers_appeal_id_reviewer_id_key UNIQUE (appeal_id, reviewer_id),
  CONSTRAINT appeal_reviewers_appeal_id_fkey FOREIGN KEY (appeal_id) REFERENCES penalty_appeals(id) ON DELETE CASCADE,
  CONSTRAINT appeal_reviewers_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT appeal_reviewers_role_check CHECK ((role = ANY (ARRAY['manager'::text, 'representative'::text, 'neutral'::text]))),
  CONSTRAINT appeal_reviewers_vote_check CHECK ((vote = ANY (ARRAY['accept'::text, 'reject'::text])))
);

CREATE UNIQUE INDEX IF NOT EXISTS appeal_reviewers_appeal_id_reviewer_id_key ON public.appeal_reviewers USING btree (appeal_id, reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviewers_appeal ON public.appeal_reviewers USING btree (appeal_id);
CREATE INDEX IF NOT EXISTS idx_reviewers_reviewer ON public.appeal_reviewers USING btree (reviewer_id);
DROP POLICY IF EXISTS appellant sees reviewers of own appeal ON public.appeal_reviewers;
CREATE POLICY appellant sees reviewers of own appeal ON public.appeal_reviewers
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM penalty_appeals pa
  WHERE ((pa.id = appeal_reviewers.appeal_id) AND (pa.appellant_id = auth.uid())))));
DROP POLICY IF EXISTS managers see all reviewers ON public.appeal_reviewers;
CREATE POLICY managers see all reviewers ON public.appeal_reviewers
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS reviewer sees own row ON public.appeal_reviewers;
CREATE POLICY reviewer sees own row ON public.appeal_reviewers
  FOR SELECT TO authenticated
  USING ((reviewer_id = auth.uid()));

-- =====================================================================
-- SECTION 4 — SEED DATA (config tables)
-- =====================================================================

-- dynamic_scoring_parameters: 15 rows
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('a7c8d5e1-1a12-448e-9771-71deb64dd514'::uuid, 'salesperson'::text, 'salesperson_collection_quality'::text, 'کیفیت وصول مطالبات'::text, 'positive'::text, 'true'::boolean, '1'::integer, NULL, '2026-06-30 16:18:20.734532+00'::timestamp with time zone, '2026-06-30 16:18:20.734532+00'::timestamp with time zone, 'score_100'::text, '0'::numeric, '100'::numeric, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('7744f2e5-e638-4537-b8a1-6bcf05e239f0'::uuid, 'salesperson'::text, 'salesperson_call_in'::text, 'تماس ورودی'::text, 'positive'::text, 'true'::boolean, '2'::integer, NULL, '2026-06-30 16:18:20.734532+00'::timestamp with time zone, '2026-06-30 16:18:20.734532+00'::timestamp with time zone, 'score_100'::text, '0'::numeric, '100'::numeric, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('7de598c7-058d-41e4-8c6f-90e1e9120f23'::uuid, 'salesperson'::text, 'salesperson_call_out'::text, 'تماس خروجی'::text, 'positive'::text, 'true'::boolean, '3'::integer, NULL, '2026-06-30 16:18:20.734532+00'::timestamp with time zone, '2026-06-30 16:18:20.734532+00'::timestamp with time zone, 'score_100'::text, '0'::numeric, '100'::numeric, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('d85ea3fd-7cd2-4df5-994c-53e7bcc1a280'::uuid, 'salesperson'::text, 'salesperson_profit_ratio'::text, 'نسبت سود به فروش'::text, 'positive'::text, 'true'::boolean, '4'::integer, NULL, '2026-06-30 16:18:20.734532+00'::timestamp with time zone, '2026-06-30 16:18:20.734532+00'::timestamp with time zone, 'score_100'::text, '0'::numeric, '100'::numeric, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('b6479b75-9953-4ac6-8abc-e8b8a4929c35'::uuid, 'salesperson'::text, 'salesperson_growth'::text, 'رشد نسبت به ماه قبل'::text, 'positive'::text, 'true'::boolean, '5'::integer, NULL, '2026-06-30 16:18:20.734532+00'::timestamp with time zone, '2026-06-30 16:18:20.734532+00'::timestamp with time zone, 'score_100'::text, '0'::numeric, '100'::numeric, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('1134d87e-00bc-45c3-8128-55357218b847'::uuid, 'customer'::text, 'customer_payment_discipline'::text, 'انضباط در واریز و پرداخت'::text, 'positive'::text, 'true'::boolean, '10'::integer, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, 'boolean'::text, '0'::numeric, '1'::numeric, NULL, '۰ = خیر، ۱ = بله'::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('90d9520d-d173-4907-b120-e0e5a80fc27e'::uuid, 'customer'::text, 'customer_cooperation_months'::text, 'سابقه همکاری'::text, 'positive'::text, 'true'::boolean, '20'::integer, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, 'months'::text, '1'::numeric, '240'::numeric, 'ماه'::text, 'بین ۱ تا ۲۴۰ ماه'::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('9d9381d0-fade-4606-8eda-3eed3af48e53'::uuid, 'customer'::text, 'customer_profit_3m'::text, 'سود ۳ ماه گذشته'::text, 'positive'::text, 'true'::boolean, '30'::integer, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, 'toman'::text, '0'::numeric, '500000000'::numeric, 'تومان'::text, 'مبلغ به تومان'::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('0023bfa3-5ec7-4475-8bb9-fb9c44aa4280'::uuid, 'customer'::text, 'customer_purchase_3m'::text, 'خرید ۳ ماه گذشته'::text, 'positive'::text, 'true'::boolean, '40'::integer, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, 'toman'::text, '0'::numeric, '2000000000'::numeric, 'تومان'::text, 'مبلغ به تومان'::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('366b1591-b616-4281-a141-df896b0c3c6d'::uuid, 'customer'::text, 'customer_purchase_1y'::text, 'خرید ۱ سال گذشته'::text, 'positive'::text, 'true'::boolean, '50'::integer, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, 'toman'::text, '0'::numeric, '5000000000'::numeric, 'تومان'::text, 'مبلغ به تومان'::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('0eec5ac5-7a46-4a62-aa74-a1dda27d5a79'::uuid, 'customer'::text, 'customer_profit_1y'::text, 'سود ۱ سال گذشته'::text, 'positive'::text, 'true'::boolean, '60'::integer, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, 'toman'::text, '0'::numeric, '1000000000'::numeric, 'تومان'::text, 'مبلغ به تومان'::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('13a7de92-147b-4872-af25-397cac430d87'::uuid, 'customer'::text, 'customer_purchase_3y'::text, 'خرید ۳ سال گذشته'::text, 'positive'::text, 'true'::boolean, '70'::integer, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, 'toman'::text, '0'::numeric, '10000000000'::numeric, 'تومان'::text, 'مبلغ به تومان'::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('adbe1156-de4d-4773-a314-80c43eea9559'::uuid, 'customer'::text, 'customer_profit_3y'::text, 'سود ۳ سال گذشته'::text, 'positive'::text, 'true'::boolean, '80'::integer, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, 'toman'::text, '0'::numeric, '3000000000'::numeric, 'تومان'::text, 'مبلغ به تومان'::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('4d5a5eaa-1675-42b4-9760-bf5f6d54e41c'::uuid, 'customer'::text, 'customer_professional_behavior'::text, 'رفتار حرفه‌ای و احترام'::text, 'positive'::text, 'true'::boolean, '90'::integer, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, 'score_100'::text, '0'::numeric, '100'::numeric, 'امتیاز'::text, '۰ تا ۱۰۰'::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_scoring_parameters ("id", "entity_type", "code", "label_fa", "direction", "is_active", "display_order", "created_by", "created_at", "updated_at", "input_type", "min_value", "max_value", "unit_label", "input_hint") VALUES ('d3fab3a4-b686-4b2b-bade-c4066f292980'::uuid, 'customer'::text, 'customer_availability'::text, 'میزان در دسترس بودن'::text, 'positive'::text, 'true'::boolean, '100'::integer, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, '2026-07-03 06:07:34.865225+00'::timestamp with time zone, 'score_100'::text, '0'::numeric, '100'::numeric, 'امتیاز'::text, '۰ تا ۱۰۰'::text) ON CONFLICT (id) DO NOTHING;

-- dynamic_parameter_weights: 15 rows
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('fcdaf7cf-26be-4e52-bd31-7e3e0974ac6f'::uuid, 'a7c8d5e1-1a12-448e-9771-71deb64dd514'::uuid, '0.200'::numeric, '2026-06-30'::date, NULL, NULL, '2026-06-30 16:18:20.734532+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('4c059ecb-4468-410b-a980-ea3362121fa3'::uuid, 'b6479b75-9953-4ac6-8abc-e8b8a4929c35'::uuid, '0.200'::numeric, '2026-06-30'::date, NULL, NULL, '2026-06-30 16:18:20.734532+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('cf688a70-c598-4ce1-8f86-fcb07d64d0d0'::uuid, '7de598c7-058d-41e4-8c6f-90e1e9120f23'::uuid, '0.200'::numeric, '2026-06-30'::date, NULL, NULL, '2026-06-30 16:18:20.734532+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('90ee0adb-ec07-4d91-9dce-56da984a4a20'::uuid, 'd85ea3fd-7cd2-4df5-994c-53e7bcc1a280'::uuid, '0.200'::numeric, '2026-06-30'::date, NULL, NULL, '2026-06-30 16:18:20.734532+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('9127e569-210d-4981-b6d9-18d12b8badd9'::uuid, '7744f2e5-e638-4537-b8a1-6bcf05e239f0'::uuid, '0.200'::numeric, '2026-06-30'::date, NULL, NULL, '2026-06-30 16:18:20.734532+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('b8332ee2-0257-40ae-a815-59a8f840e01c'::uuid, 'd3fab3a4-b686-4b2b-bade-c4066f292980'::uuid, '0.050'::numeric, '2026-07-01'::date, NULL, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('589e6362-a776-4eb5-9d8e-cdb1dabeaf2d'::uuid, '90d9520d-d173-4907-b120-e0e5a80fc27e'::uuid, '0.100'::numeric, '2026-07-01'::date, NULL, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('85577cca-9c34-4593-a459-59b64a7cc8bb'::uuid, '1134d87e-00bc-45c3-8128-55357218b847'::uuid, '0.200'::numeric, '2026-07-01'::date, NULL, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('16699800-323f-44a6-b63c-770be9aaca0f'::uuid, '4d5a5eaa-1675-42b4-9760-bf5f6d54e41c'::uuid, '0.050'::numeric, '2026-07-01'::date, NULL, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('5a71fb2e-2ba7-4e21-b2d4-95819dc6062d'::uuid, '0eec5ac5-7a46-4a62-aa74-a1dda27d5a79'::uuid, '0.150'::numeric, '2026-07-01'::date, NULL, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('0c45e930-06f6-4261-87dd-2d1041a4edab'::uuid, '9d9381d0-fade-4606-8eda-3eed3af48e53'::uuid, '0.150'::numeric, '2026-07-01'::date, NULL, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('a2f8cdd2-ee55-4cbc-886c-ad688a2b026f'::uuid, 'adbe1156-de4d-4773-a314-80c43eea9559'::uuid, '0.050'::numeric, '2026-07-01'::date, NULL, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('8792625c-eba5-47a7-b8b4-f76eab0398c0'::uuid, '366b1591-b616-4281-a141-df896b0c3c6d'::uuid, '0.100'::numeric, '2026-07-01'::date, NULL, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('70111604-aa47-4595-bbcc-82a701e60059'::uuid, '0023bfa3-5ec7-4475-8bb9-fb9c44aa4280'::uuid, '0.100'::numeric, '2026-07-01'::date, NULL, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dynamic_parameter_weights ("id", "parameter_id", "weight", "valid_from", "valid_to", "created_by", "created_at") VALUES ('f4dd5392-d150-4e1d-a2cb-caeeacea2bd7'::uuid, '13a7de92-147b-4872-af25-397cac430d87'::uuid, '0.050'::numeric, '2026-07-01'::date, NULL, NULL, '2026-07-03 06:07:34.865225+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;

-- workflow_settings: 5 rows
INSERT INTO public.workflow_settings ("id", "process_key", "process_name_fa", "uploader_role", "reviewer_role", "timer_minutes", "penalty_enabled", "penalty_for", "is_active", "updated_by", "updated_at") VALUES ('782ec14f-0943-4c98-aed3-e8d4b9e80b56'::uuid, 'inquiry_response'::text, 'پاسخ استعلام قیمت'::text, NULL, 'manager'::text, '10'::integer, 'true'::boolean, 'reviewer'::text, 'true'::boolean, NULL, '2026-06-25 03:16:58.513487+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.workflow_settings ("id", "process_key", "process_name_fa", "uploader_role", "reviewer_role", "timer_minutes", "penalty_enabled", "penalty_for", "is_active", "updated_by", "updated_at") VALUES ('6deee26a-8319-41ea-9dcc-de54b146ea5c'::uuid, 'bijak_invoice_print'::text, 'بیجک و فاکتور چاپی'::text, 'accountant'::text, 'manager'::text, '10'::integer, 'true'::boolean, 'reviewer'::text, 'true'::boolean, NULL, '2026-06-25 03:16:58.513487+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.workflow_settings ("id", "process_key", "process_name_fa", "uploader_role", "reviewer_role", "timer_minutes", "penalty_enabled", "penalty_for", "is_active", "updated_by", "updated_at") VALUES ('f24df85b-4b53-45bf-a531-d16a795b68e3'::uuid, 'shipping_receipt'::text, 'بیجک باربری و رسید ارسال'::text, 'manager'::text, 'sales'::text, '360'::integer, 'true'::boolean, 'uploader'::text, 'true'::boolean, NULL, '2026-06-25 03:16:58.513487+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.workflow_settings ("id", "process_key", "process_name_fa", "uploader_role", "reviewer_role", "timer_minutes", "penalty_enabled", "penalty_for", "is_active", "updated_by", "updated_at") VALUES ('6b6ada85-f97f-42b9-9b44-c73bc201f35d'::uuid, 'delivery_receipt'::text, 'رسید تحویل به مشتری'::text, 'manager'::text, 'sales'::text, '180'::integer, 'true'::boolean, 'uploader'::text, 'true'::boolean, NULL, '2026-06-25 03:16:58.513487+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.workflow_settings ("id", "process_key", "process_name_fa", "uploader_role", "reviewer_role", "timer_minutes", "penalty_enabled", "penalty_for", "is_active", "updated_by", "updated_at") VALUES ('ef7c321d-2754-42c2-8b51-e6c815a62fac'::uuid, 'purchase_request'::text, 'درخواست خرید'::text, NULL, 'manager'::text, '10'::integer, 'true'::boolean, 'reviewer'::text, 'true'::boolean, NULL, '2026-06-25 03:16:58.513487+00'::timestamp with time zone) ON CONFLICT (id) DO NOTHING;

-- person_field_definitions: 0 rows


COMMIT;
