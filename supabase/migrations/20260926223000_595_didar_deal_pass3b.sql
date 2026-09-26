SET client_encoding='UTF8';

-- ============================================================================
-- 595 — Didar deals PASS 3b
-- Q1 client request key; Q10 won_at history; Q11 سایر note; Q12 one create row
-- ============================================================================

SET lock_timeout = '60s';

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS client_request_key text;

-- T5: new column is NULL on every existing row; unique partial index is safe.
DO $t5$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n
    FROM public.sales_interactions
   WHERE client_request_key IS NOT NULL;
  IF n > 0 THEN
    RAISE NOTICE '595 T5: % existing client_request_key rows (index still unique-safe if no dups)', n;
  END IF;
END;
$t5$;

CREATE UNIQUE INDEX IF NOT EXISTS sales_interactions_client_request_key_uidx
  ON public.sales_interactions (author_id, client_request_key)
  WHERE client_request_key IS NOT NULL;

DROP FUNCTION IF EXISTS public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean, numeric, uuid);

CREATE OR REPLACE FUNCTION public.sales_interaction_create(
  p_person_id uuid,
  p_kind text,
  p_body text DEFAULT '',
  p_title text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_salesperson_id uuid DEFAULT NULL,
  p_call_log_id uuid DEFAULT NULL,
  p_next_follow_up_at timestamptz DEFAULT NULL,
  p_source text DEFAULT 'manual',
  p_status text DEFAULT 'open',
  p_pipeline_id uuid DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL,
  p_expected_close_on date DEFAULT NULL,
  p_acquaintance_id uuid DEFAULT NULL,
  p_company_person_id uuid DEFAULT NULL,
  p_probability integer DEFAULT NULL,
  p_is_vip boolean DEFAULT false,
  p_estimated_amount numeric DEFAULT NULL,
  p_introducer_person_id uuid DEFAULT NULL,
  p_client_request_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _id    uuid;
  _kind  text := lower(btrim(COALESCE(p_kind, '')));
  _status text := lower(btrim(COALESCE(p_status, 'open')));
  _source text := NULLIF(btrim(COALESCE(p_source, 'manual')), '');
  _title text := NULLIF(btrim(COALESCE(p_title, '')), '');
  _key   text := NULLIF(btrim(COALESCE(p_client_request_key, '')), '');
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_actor, ARRAY['sales', 'admin', 'manager', 'accountant']::text[]) THEN
    RAISE EXCEPTION 'ثبت تعامل فروش فقط برای کارکنان مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  IF _key IS NOT NULL THEN
    SELECT id INTO _id
      FROM public.sales_interactions
     WHERE author_id = _actor
       AND client_request_key = _key;
    IF _id IS NOT NULL THEN
      RETURN _id;
    END IF;
  END IF;

  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'شناسه شخص الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF NOT (_kind = ANY (ARRAY['request', 'call', 'note'])) THEN
    RAISE EXCEPTION 'نوع تعامل نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  IF NOT (_status = ANY (ARRAY['open', 'won', 'lost', 'cancelled', 'done'])) THEN
    RAISE EXCEPTION 'وضعیت تعامل نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'شخص پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF p_customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'مشتری پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF p_salesperson_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_salesperson_id) THEN
    RAISE EXCEPTION 'پروفایل فروشنده پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF p_call_log_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.call_logs WHERE id = p_call_log_id) THEN
    RAISE EXCEPTION 'لاگ تماس پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF p_introducer_person_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_introducer_person_id) THEN
    RAISE EXCEPTION 'شخص پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF p_estimated_amount IS NOT NULL AND p_estimated_amount < 0 THEN
    RAISE EXCEPTION 'مبلغ معامله نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  IF _kind = 'request' AND _title IS NULL THEN
    SELECT NULLIF(btrim(display_name), '') INTO _title
      FROM public.persons WHERE id = p_person_id;
  END IF;

  BEGIN
    INSERT INTO public.sales_interactions (
      person_id, customer_id, kind, title, body, status,
      salesperson_id, author_id, call_log_id, next_follow_up_at, source,
      pipeline_id, stage_id, expected_close_on, acquaintance_id,
      company_person_id, probability, probability_overridden, is_vip,
      estimated_amount, introducer_person_id, client_request_key
    )
    VALUES (
      p_person_id, p_customer_id, _kind, _title,
      COALESCE(p_body, ''), _status,
      p_salesperson_id, _actor, p_call_log_id, p_next_follow_up_at,
      COALESCE(_source, 'manual'),
      p_pipeline_id, p_stage_id, p_expected_close_on, p_acquaintance_id,
      p_company_person_id, p_probability, (p_probability IS NOT NULL), p_is_vip,
      p_estimated_amount, p_introducer_person_id, _key
    )
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    IF _key IS NULL THEN
      RAISE;
    END IF;
    SELECT id INTO _id
      FROM public.sales_interactions
     WHERE author_id = _actor
       AND client_request_key = _key;
    IF _id IS NULL THEN
      RAISE;
    END IF;
  END;

  RETURN _id;
END
$function$;

ALTER FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean, numeric, uuid, text)
  OWNER TO supabase_admin;

REVOKE ALL ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean, numeric, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean, numeric, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean, numeric, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.sales_interactions_write_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  actor uuid := auth.uid();
  src text := COALESCE(NULLIF(current_setting('afrakala.change_source', true), ''), 'user');
BEGIN
  IF NEW.kind IS DISTINCT FROM 'request' THEN
    RETURN NEW;
  END IF;
  IF src NOT IN ('user', 'auto_quote_created', 'auto_quote_sent', 'auto_quote_accepted') THEN
    src := 'user';
  END IF;

  -- Q12: creation writes exactly one history row (the 590 'create' event).
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, actor, src);
  END IF;
  IF NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'pipeline', OLD.pipeline_id::text, NEW.pipeline_id::text, actor, src);
  END IF;
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'stage', OLD.stage_id::text, NEW.stage_id::text, actor, src);
  END IF;
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'delete', 'active', 'deleted', actor, src);
  END IF;
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'restore', 'deleted', 'active', actor, src);
  END IF;
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION public.sales_interactions_write_history()
  OWNER TO supabase_admin;

CREATE OR REPLACE FUNCTION public.sales_interactions_deal_history_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  actor uuid;
BEGIN
  IF NEW.kind IS DISTINCT FROM 'request' THEN
    RETURN NEW;
  END IF;

  actor := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  IF actor IS NULL THEN
    BEGIN
      actor := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      actor := NULL;
    END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'create', NULL, NULL, NEW.title, actor, 'user');
    RETURN NEW;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'title', OLD.title, NEW.title, actor, 'user');
  END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'body', OLD.body, NEW.body, actor, 'user');
  END IF;
  IF NEW.salesperson_id IS DISTINCT FROM OLD.salesperson_id THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'owner', OLD.salesperson_id::text, NEW.salesperson_id::text, actor, 'user');
  END IF;
  IF NEW.estimated_amount IS DISTINCT FROM OLD.estimated_amount THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'amount', OLD.estimated_amount::text, NEW.estimated_amount::text, actor, 'user');
  END IF;
  IF NEW.introducer_person_id IS DISTINCT FROM OLD.introducer_person_id THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'introducer', OLD.introducer_person_id::text, NEW.introducer_person_id::text, actor, 'user');
  END IF;
  IF NEW.company_person_id IS DISTINCT FROM OLD.company_person_id THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'company', OLD.company_person_id::text, NEW.company_person_id::text, actor, 'user');
  END IF;
  IF NEW.expected_close_on IS DISTINCT FROM OLD.expected_close_on THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'expected_close', OLD.expected_close_on::text, NEW.expected_close_on::text, actor, 'user');
  END IF;
  IF NEW.register_time IS DISTINCT FROM OLD.register_time THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'register_time', OLD.register_time::text, NEW.register_time::text, actor, 'user');
  END IF;
  IF NEW.acquaintance_id IS DISTINCT FROM OLD.acquaintance_id THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'acquaintance', OLD.acquaintance_id::text, NEW.acquaintance_id::text, actor, 'user');
  END IF;
  IF NEW.won_at IS DISTINCT FROM OLD.won_at THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'won_at', OLD.won_at::text, NEW.won_at::text, actor, 'user');
  END IF;

  RETURN NEW;
END;
$fn$;

ALTER FUNCTION public.sales_interactions_deal_history_fields()
  OWNER TO supabase_admin;

CREATE OR REPLACE FUNCTION public.sales_interactions_lost_other_note()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  _title text;
BEGIN
  IF NEW.kind IS DISTINCT FROM 'request' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'lost' THEN
    RETURN NEW;
  END IF;
  IF NEW.lost_reason_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT title INTO _title FROM public.deal_lost_reasons WHERE id = NEW.lost_reason_id;
  IF _title = 'سایر'
     AND btrim(COALESCE(NEW.lost_reason_note, '')) = ''
     AND btrim(COALESCE(NEW.lost_reason_other, '')) = '' THEN
    RAISE EXCEPTION 'برای دلیل «سایر» نوشتن توضیح الزامی است' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_interactions_lost_other_note ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_lost_other_note
  BEFORE UPDATE ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_lost_other_note();
