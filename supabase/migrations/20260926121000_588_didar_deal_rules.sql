SET client_encoding='UTF8';

-- ============================================================================
-- 588 — Didar deal rules: title, RLS all-deals for sales, capabilities,
-- idle/rotten view, derived paid, create extras, change-won-date.
-- Replaces functions only after matching live pg_get_functiondef (585/546).
-- Does not fill won_at on create. Does not add IsPaid. Does not force 100/0.
-- ============================================================================

SET lock_timeout = '60s';

-- ---------- title default = person name; server enforces; body stays optional ----------
CREATE OR REPLACE FUNCTION public.sales_interactions_require_deal_title()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  pname text;
BEGIN
  IF NEW.kind IS DISTINCT FROM 'request' THEN
    RETURN NEW;
  END IF;
  IF NULLIF(btrim(COALESCE(NEW.title, '')), '') IS NULL AND NEW.person_id IS NOT NULL THEN
    SELECT p.display_name INTO pname FROM public.persons p WHERE p.id = NEW.person_id;
    NEW.title := NULLIF(btrim(COALESCE(pname, '')), '');
  END IF;
  IF NULLIF(btrim(COALESCE(NEW.title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'عنوان معامله الزامی است.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_interactions_require_deal_title ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_require_deal_title
  BEFORE INSERT OR UPDATE OF title, person_id, kind ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_require_deal_title();

-- ---------- display_code / register_time / probability inherit / last touch ----------
CREATE OR REPLACE FUNCTION public.sales_interactions_deal_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  stage_prob integer;
  pipe_override boolean;
BEGIN
  IF NEW.kind IS DISTINCT FROM 'request' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.display_code IS NULL THEN
      NEW.display_code := nextval('public.sales_deal_display_code_seq')::integer;
    END IF;
    NEW.register_time := COALESCE(NEW.register_time, NEW.created_at, now());
    NEW.last_activity_at := COALESCE(NEW.last_activity_at, NEW.created_at, now());
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.deleted_at IS NULL
     AND (
       NEW.title IS DISTINCT FROM OLD.title
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.salesperson_id IS DISTINCT FROM OLD.salesperson_id
       OR NEW.person_id IS DISTINCT FROM OLD.person_id
       OR NEW.company_person_id IS DISTINCT FROM OLD.company_person_id
       OR NEW.expected_close_on IS DISTINCT FROM OLD.expected_close_on
       OR NEW.acquaintance_id IS DISTINCT FROM OLD.acquaintance_id
       OR NEW.probability IS DISTINCT FROM OLD.probability
       OR NEW.is_vip IS DISTINCT FROM OLD.is_vip
       OR NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id
       OR NEW.stage_id IS DISTINCT FROM OLD.stage_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.next_follow_up_at IS DISTINCT FROM OLD.next_follow_up_at
     ) THEN
    NEW.last_activity_at := now();
  END IF;

  IF NEW.stage_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR NEW.stage_id IS DISTINCT FROM OLD.stage_id
     ) THEN
    SELECT s.probability, COALESCE(p.probability_enabled, true)
      INTO stage_prob, pipe_override
      FROM public.sales_pipeline_stages s
      JOIN public.sales_pipelines p ON p.id = s.pipeline_id
     WHERE s.id = NEW.stage_id;
    IF TG_OP = 'INSERT' AND NEW.probability IS NULL THEN
      NEW.probability := stage_prob;
    ELSIF TG_OP = 'UPDATE'
          AND NEW.stage_id IS DISTINCT FROM OLD.stage_id
          AND COALESCE(NEW.probability_overridden, false) IS DISTINCT FROM true THEN
      NEW.probability := stage_prob;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_interactions_deal_defaults ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_deal_defaults
  BEFORE INSERT OR UPDATE ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_deal_defaults();

CREATE OR REPLACE FUNCTION public.sales_interactions_touch_parent_deal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.deal_id IS NOT NULL AND NEW.activity_type_id IS NOT NULL THEN
    UPDATE public.sales_interactions
       SET last_activity_at = now()
     WHERE id = NEW.deal_id
       AND kind = 'request'
       AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_interactions_touch_parent_deal ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_touch_parent_deal
  AFTER INSERT OR UPDATE OF done_at, due_at, title, body ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_touch_parent_deal();

-- company_person_id must be an organization when set
CREATE OR REPLACE FUNCTION public.sales_interactions_company_kind()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  k text;
BEGIN
  IF NEW.company_person_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT kind INTO k FROM public.persons WHERE id = NEW.company_person_id;
  IF k IS NULL THEN
    RAISE EXCEPTION 'شرکت پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;
  IF k IS DISTINCT FROM 'organization' THEN
    RAISE EXCEPTION 'شرکت مرتبط باید شخص حقوقی باشد.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_interactions_company_kind ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_company_kind
  BEFORE INSERT OR UPDATE OF company_person_id ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_company_kind();

-- required extra fields per stage (no-op until rules exist)
CREATE OR REPLACE FUNCTION public.sales_interactions_stage_field_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  missing text;
BEGIN
  IF NEW.kind IS DISTINCT FROM 'request' OR NEW.stage_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;
  SELECT d.title INTO missing
    FROM public.deal_field_stage_rules r
    JOIN public.deal_field_definitions d ON d.id = r.definition_id
    LEFT JOIN public.deal_field_values v
      ON v.definition_id = r.definition_id AND v.interaction_id = NEW.id
   WHERE r.stage_id = NEW.stage_id
     AND r.required
     AND d.is_active
     AND NULLIF(btrim(COALESCE(v.value_text, '')), '') IS NULL
   ORDER BY d.sort_order
   LIMIT 1;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'فیلد اجباری این مرحله خالی است: %', missing USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_interactions_stage_field_rules ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_stage_field_rules
  BEFORE INSERT OR UPDATE OF stage_id ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_stage_field_rules();

-- ---------- RLS: sales sees ALL deals (kind=request); manager/admin unchanged ----------
DROP POLICY IF EXISTS sales_interactions_select_staff ON public.sales_interactions;
CREATE POLICY sales_interactions_select_staff ON public.sales_interactions
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    OR (
      kind = 'request'
      AND public.has_any_role(auth.uid(), ARRAY['sales', 'admin', 'manager', 'accountant']::text[])
    )
    OR (
      public.has_any_role(auth.uid(), ARRAY['sales', 'admin', 'manager', 'accountant']::text[])
      AND (
        author_id = auth.uid()
        OR salesperson_id = auth.uid()
        OR customer_id IN (
          SELECT c.id FROM public.customers c WHERE c.responsible_id = auth.uid()
        )
      )
    )
  );

-- ---------- create: extra deal fields; title filled by trigger; create-as-won via p_status ----------
DROP FUNCTION IF EXISTS public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text);

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
  p_is_vip boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  IF _kind = 'request' AND _title IS NULL THEN
    SELECT NULLIF(btrim(display_name), '') INTO _title
      FROM public.persons WHERE id = p_person_id;
  END IF;

  INSERT INTO public.sales_interactions (
    person_id, customer_id, kind, title, body, status,
    salesperson_id, author_id, call_log_id, next_follow_up_at, source,
    pipeline_id, stage_id, expected_close_on, acquaintance_id,
    company_person_id, probability, probability_overridden, is_vip
  )
  VALUES (
    p_person_id, p_customer_id, _kind, _title,
    COALESCE(p_body, ''), _status,
    p_salesperson_id, _actor, p_call_log_id, p_next_follow_up_at,
    COALESCE(_source, 'manual'),
    p_pipeline_id, p_stage_id, p_expected_close_on, p_acquaintance_id,
    p_company_person_id, p_probability, (p_probability IS NOT NULL), p_is_vip
  )
  RETURNING id INTO _id;

  RETURN _id;
END
$function$;

REVOKE ALL ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text, uuid, uuid, date, uuid, uuid, integer, boolean) TO service_role;

-- ---------- capabilities: add can_view_price on the same RPC ----------
DROP FUNCTION IF EXISTS public.sales_deal_capabilities(uuid[]);

CREATE OR REPLACE FUNCTION public.sales_deal_capabilities(p_ids uuid[])
RETURNS TABLE (
  id uuid,
  can_edit boolean,
  can_set_won boolean,
  can_set_lost boolean,
  can_reopen boolean,
  can_move boolean,
  can_delete boolean,
  can_restore boolean,
  can_view_price boolean,
  open_activity_count integer,
  latest_quote_id uuid,
  latest_quote_status text,
  show_rejected_quote_notice boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
  WITH actor AS (
    SELECT auth.uid() AS uid
  ),
  deals AS (
    SELECT si.*
      FROM public.sales_interactions si
     WHERE si.id = ANY (p_ids)
       AND si.kind = 'request'
  ),
  quotes AS (
    SELECT DISTINCT ON (q.interaction_id)
           q.interaction_id, q.id AS quote_id, q.status::text AS quote_status
      FROM public.sales_quotes q
     WHERE q.interaction_id = ANY (p_ids)
     ORDER BY q.interaction_id, q.created_at DESC
  ),
  acts AS (
    SELECT a.deal_id, count(*)::integer AS n
      FROM public.sales_interactions a
     WHERE a.deal_id = ANY (p_ids)
       AND a.activity_type_id IS NOT NULL
       AND a.done_at IS NULL
     GROUP BY a.deal_id
  )
  SELECT
    d.id,
    (d.deleted_at IS NULL AND d.status = 'open' AND (
       public.has_any_role((SELECT uid FROM actor), ARRAY['admin'::text, 'manager'::text])
       OR d.author_id = (SELECT uid FROM actor)
       OR d.salesperson_id = (SELECT uid FROM actor)
    )) AS can_edit,
    (d.deleted_at IS NULL AND d.status = 'open'
      AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-mark-won', 'update')) AS can_set_won,
    (d.deleted_at IS NULL AND d.status = 'open'
      AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-mark-lost', 'update')) AS can_set_lost,
    (d.deleted_at IS NULL AND (
       (d.status = 'won' AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-mark-won', 'update'))
       OR
       (d.status = 'lost' AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-mark-lost', 'update'))
    )) AS can_reopen,
    (d.deleted_at IS NULL AND d.status = 'open' AND (
       public.has_any_role((SELECT uid FROM actor), ARRAY['admin'::text, 'manager'::text])
       OR d.author_id = (SELECT uid FROM actor)
       OR d.salesperson_id = (SELECT uid FROM actor)
    )) AS can_move,
    (d.deleted_at IS NULL AND d.status = 'open'
      AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-delete', 'update')) AS can_delete,
    (d.deleted_at IS NOT NULL
      AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-delete', 'update')) AS can_restore,
    public.has_dynamic_permission((SELECT uid FROM actor), 'deal-view-price', 'view') AS can_view_price,
    COALESCE(acts.n, 0) AS open_activity_count,
    quotes.quote_id AS latest_quote_id,
    quotes.quote_status AS latest_quote_status,
    (d.deleted_at IS NULL AND d.status = 'open' AND quotes.quote_status = 'rejected')
      AS show_rejected_quote_notice
  FROM deals d
  LEFT JOIN quotes ON quotes.interaction_id = d.id
  LEFT JOIN acts ON acts.deal_id = d.id;
$fn$;

REVOKE ALL ON FUNCTION public.sales_deal_capabilities(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_deal_capabilities(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_deal_capabilities(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_deal_capabilities(uuid[]) TO service_role;

-- ---------- change won date (only while won) ----------
CREATE OR REPLACE FUNCTION public.sales_deal_set_won_at(p_id uuid, p_won_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _actor uuid := auth.uid();
  _row public.sales_interactions%ROWTYPE;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF p_won_at IS NULL THEN
    RAISE EXCEPTION 'تاریخ موفق شدن الزامی است.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _row FROM public.sales_interactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR _row.kind IS DISTINCT FROM 'request' THEN
    RAISE EXCEPTION 'تعامل فروش پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;
  IF _row.status IS DISTINCT FROM 'won' THEN
    RAISE EXCEPTION 'تغییر تاریخ موفق شدن فقط برای معامله موفق مجاز است.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.has_dynamic_permission(_actor, 'deal-mark-won', 'update') THEN
    RAISE EXCEPTION 'شما مجوز موفق کردن معاملات را ندارید.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.sales_interactions
     SET won_at = p_won_at
   WHERE id = p_id;
  RETURN p_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sales_deal_set_won_at(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_deal_set_won_at(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_deal_set_won_at(uuid, timestamptz) TO service_role;

-- ---------- health (idle / rotten / total-rotten). Does not block. ----------
CREATE OR REPLACE VIEW public.sales_deal_health AS
SELECT
  si.id,
  si.stage_id,
  si.pipeline_id,
  GREATEST(
    COALESCE(si.last_activity_at, si.updated_at, si.created_at),
    COALESCE(si.updated_at, si.created_at)
  ) AS last_touch_at,
  COALESCE(st.idle_enabled, false)
    AND COALESCE(st.idle_days, 0) > 0
    AND (now() - GREATEST(COALESCE(si.last_activity_at, si.updated_at, si.created_at), COALESCE(si.updated_at, si.created_at)))
        > (COALESCE(st.idle_days, 7) * interval '1 day') AS is_idle,
  COALESCE(st.rotten_enabled, false)
    AND COALESCE(st.rotten_days, 0) > 0
    AND si.stage_entered_at IS NOT NULL
    AND (now() - si.stage_entered_at) > (COALESCE(st.rotten_days, 14) * interval '1 day') AS is_rotten,
  COALESCE(p.rotten_enabled, false)
    AND COALESCE(p.total_rotten_days, 0) > 0
    AND (now() - COALESCE(si.register_time, si.created_at))
        > (COALESCE(p.total_rotten_days, 45) * interval '1 day') AS is_total_rotten,
  CASE
    WHEN (
      COALESCE(st.rotten_enabled, false)
      AND COALESCE(st.rotten_days, 0) > 0
      AND si.stage_entered_at IS NOT NULL
      AND (now() - si.stage_entered_at) > (COALESCE(st.rotten_days, 14) * interval '1 day')
    ) OR (
      COALESCE(p.rotten_enabled, false)
      AND COALESCE(p.total_rotten_days, 0) > 0
      AND (now() - COALESCE(si.register_time, si.created_at))
          > (COALESCE(p.total_rotten_days, 45) * interval '1 day')
    ) THEN 'red'
    WHEN (
      COALESCE(st.idle_enabled, false)
      AND COALESCE(st.idle_days, 0) > 0
      AND (now() - GREATEST(COALESCE(si.last_activity_at, si.updated_at, si.created_at), COALESCE(si.updated_at, si.created_at)))
          > (COALESCE(st.idle_days, 7) * interval '1 day')
    ) OR (
      COALESCE(st.warning_percent, 80) > 0
      AND si.stage_entered_at IS NOT NULL
      AND COALESCE(st.rotten_days, 0) > 0
      AND (now() - si.stage_entered_at)
          > (COALESCE(st.rotten_days, 14) * interval '1 day' * COALESCE(st.warning_percent, 80) / 100.0)
    ) THEN 'yellow'
    ELSE 'none'
  END AS health_circle,
  EXTRACT(DAY FROM (now() - COALESCE(si.last_activity_at, si.updated_at, si.created_at)))::integer AS last_activity_age_days,
  EXTRACT(DAY FROM (now() - COALESCE(si.register_time, si.created_at)))::integer AS opportunity_age_days,
  EXTRACT(DAY FROM (now() - COALESCE(si.last_activity_at, si.updated_at, si.created_at)))::integer AS idle_days_count
FROM public.sales_interactions si
LEFT JOIN public.sales_pipeline_stages st ON st.id = si.stage_id
LEFT JOIN public.sales_pipelines p ON p.id = si.pipeline_id
WHERE si.kind = 'request';

GRANT SELECT ON public.sales_deal_health TO authenticated, service_role;

-- ---------- derived paid from receipts linked to deal quotes (no IsPaid column) ----------
CREATE OR REPLACE VIEW public.sales_deal_paid AS
SELECT
  si.id,
  COALESCE(q.amount, 0)::numeric AS deal_amount,
  COALESCE(r.paid_amount, 0)::numeric AS paid_amount,
  (COALESCE(r.paid_amount, 0) > 0 AND COALESCE(r.paid_amount, 0) >= COALESCE(q.amount, 0) AND COALESCE(q.amount, 0) > 0) AS is_paid
FROM public.sales_interactions si
LEFT JOIN LATERAL (
  SELECT COALESCE(sq.final_amount, 0)::numeric AS amount
    FROM public.sales_quotes sq
   WHERE sq.interaction_id = si.id
   ORDER BY sq.created_at DESC
   LIMIT 1
) q ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(prl.amount), 0)::numeric AS paid_amount
    FROM public.sales_quotes sq
    JOIN public.payment_receipt_links prl ON prl.quote_id = sq.id
   WHERE sq.interaction_id = si.id
) r ON true
WHERE si.kind = 'request';

GRANT SELECT ON public.sales_deal_paid TO authenticated, service_role;

-- ---------- register_time edit (L19) ----------
CREATE OR REPLACE FUNCTION public.sales_deal_set_register_time(p_id uuid, p_register_time timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _actor uuid := auth.uid();
  _row public.sales_interactions%ROWTYPE;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _row FROM public.sales_interactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR _row.kind IS DISTINCT FROM 'request' THEN
    RAISE EXCEPTION 'تعامل فروش پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.has_any_role(_actor, ARRAY['admin', 'manager']::text[])
    OR _row.author_id = _actor
    OR _row.salesperson_id = _actor
  ) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ویرایش معامله را ندارید.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.sales_interactions
     SET register_time = COALESCE(p_register_time, register_time)
   WHERE id = p_id;
  RETURN p_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sales_deal_set_register_time(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_deal_set_register_time(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_deal_set_register_time(uuid, timestamptz) TO service_role;
