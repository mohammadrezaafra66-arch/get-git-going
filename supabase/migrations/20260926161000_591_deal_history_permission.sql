SET client_encoding='UTF8';

-- ============================================================================
-- 591 — history-writing deal triggers must run as supabase_admin
--
-- 590's sales_interactions_deal_history_fields is SECURITY INVOKER and INSERTs
-- into sales_interaction_history. authenticated has SELECT only (584 REVOKE
-- INSERT). RPC create is DEFINER so INSERT succeeds; a later PATCH of amount
-- as the caller 403s. 585 write_history is already DEFINER; tighten search_path.
-- Other 587–590 triggers only mutate sales_interactions or validate — no extra
-- table the caller cannot write.
-- Do NOT GRANT INSERT on history to authenticated.
-- ============================================================================

SET lock_timeout = '60s';

ALTER FUNCTION public.sales_interactions_write_history()
  SECURITY DEFINER
  SET search_path = public, pg_temp;
ALTER FUNCTION public.sales_interactions_write_history()
  OWNER TO supabase_admin;

ALTER FUNCTION public.sales_interactions_deal_history_fields()
  SECURITY DEFINER
  SET search_path = public, pg_temp;
ALTER FUNCTION public.sales_interactions_deal_history_fields()
  OWNER TO supabase_admin;

REVOKE INSERT, UPDATE, DELETE ON public.sales_interaction_history FROM authenticated;
GRANT SELECT ON public.sales_interaction_history TO authenticated;

-- Create can persist amount + introducer in the same DEFINER INSERT (no PATCH).
DROP FUNCTION IF EXISTS public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text);
DROP FUNCTION IF EXISTS public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean);
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
  p_introducer_person_id uuid DEFAULT NULL
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
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_actor, ARRAY['sales', 'admin', 'manager', 'accountant']::text[]) THEN
    RAISE EXCEPTION 'ثبت تعامل فروش فقط برای کارکنان مجاز است.'
      USING ERRCODE = '42501';
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

  INSERT INTO public.sales_interactions (
    person_id, customer_id, kind, title, body, status,
    salesperson_id, author_id, call_log_id, next_follow_up_at, source,
    pipeline_id, stage_id, expected_close_on, acquaintance_id,
    company_person_id, probability, probability_overridden, is_vip,
    estimated_amount, introducer_person_id
  )
  VALUES (
    p_person_id, p_customer_id, _kind, _title,
    COALESCE(p_body, ''), _status,
    p_salesperson_id, _actor, p_call_log_id, p_next_follow_up_at,
    COALESCE(_source, 'manual'),
    p_pipeline_id, p_stage_id, p_expected_close_on, p_acquaintance_id,
    p_company_person_id, p_probability, (p_probability IS NOT NULL), p_is_vip,
    p_estimated_amount, p_introducer_person_id
  )
  RETURNING id INTO _id;

  RETURN _id;
END
$function$;

ALTER FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean, numeric, uuid)
  OWNER TO supabase_admin;

REVOKE ALL ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean, numeric, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean, numeric, uuid) TO service_role;

DO $assert$
DECLARE
  hist_definer boolean;
  hist_owner text;
  hist_path text;
  write_definer boolean;
  write_path text;
  insert_grant int;
BEGIN
  SELECT p.prosecdef, pg_get_userbyid(p.proowner), array_to_string(p.proconfig, ',')
    INTO hist_definer, hist_owner, hist_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'sales_interactions_deal_history_fields';
  SELECT p.prosecdef, array_to_string(p.proconfig, ',')
    INTO write_definer, write_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'sales_interactions_write_history';
  IF hist_definer IS DISTINCT FROM true OR hist_owner IS DISTINCT FROM 'supabase_admin'
     OR position('pg_temp' in coalesce(hist_path, '')) = 0 THEN
    RAISE EXCEPTION '591: deal_history_fields must be SECURITY DEFINER owned by supabase_admin with pg_temp search_path';
  END IF;
  IF write_definer IS DISTINCT FROM true
     OR position('pg_temp' in coalesce(write_path, '')) = 0 THEN
    RAISE EXCEPTION '591: write_history must stay DEFINER with pg_temp search_path';
  END IF;
  SELECT count(*) INTO insert_grant
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = 'sales_interaction_history'
     AND grantee = 'authenticated'
     AND privilege_type = 'INSERT';
  IF insert_grant > 0 THEN
    RAISE EXCEPTION '591: authenticated must not have INSERT on sales_interaction_history';
  END IF;
END
$assert$;
