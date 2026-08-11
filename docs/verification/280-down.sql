-- Down script for migration 280. No BEGIN/COMMIT: the caller owns the transaction.
-- Order matters: the tables come first because four of the legacy functions declare
-- %ROWTYPE variables over them, and the triggers come last because they call those
-- functions. Both tables were empty, so there is no data to restore
-- (docs/asan/legacy-capital-data-backup.sql).
SET client_encoding='UTF8';

CREATE TABLE public.customer_capital_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    salesperson_allocation_id uuid NOT NULL,
    capital_snapshot_id uuid NOT NULL,
    capital_date date NOT NULL,
    salesperson_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    customer_score numeric DEFAULT 0 NOT NULL,
    score_source text DEFAULT 'customer_credit_profile.credit_score'::text NOT NULL,
    total_customer_score numeric DEFAULT 0 NOT NULL,
    system_suggested_amount numeric DEFAULT 0 NOT NULL,
    final_amount numeric DEFAULT 0 NOT NULL,
    override_reason text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    held_amount numeric DEFAULT 0 NOT NULL,
    consumed_amount numeric DEFAULT 0 NOT NULL,
    customer_person_id uuid NOT NULL,
    CONSTRAINT ccap_final_nonneg CHECK ((final_amount >= (0)::numeric)),
    CONSTRAINT ccap_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text]))),
    CONSTRAINT ccap_suggested_nonneg CHECK ((system_suggested_amount >= (0)::numeric)),
    CONSTRAINT customer_capital_allocations_consumed_amount_check CHECK ((consumed_amount >= (0)::numeric)),
    CONSTRAINT customer_capital_allocations_held_amount_check CHECK ((held_amount >= (0)::numeric))
);
ALTER TABLE public.customer_capital_allocations OWNER TO postgres;
COMMENT ON COLUMN public.customer_capital_allocations.customer_person_id IS 'Unified person behind customer_id. Derived by trg_customer_capital_allocations_derive_person (migration 237) - do not write directly. Credit arithmetic still keys on customer_id; see migration 237 header.';
CREATE TABLE public.salesperson_capital_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    capital_snapshot_id uuid NOT NULL,
    capital_date date NOT NULL,
    salesperson_id uuid NOT NULL,
    score numeric DEFAULT 0 NOT NULL,
    score_source text DEFAULT 'employee_scores.monthly_score'::text NOT NULL,
    total_score numeric DEFAULT 0 NOT NULL,
    system_suggested_amount numeric DEFAULT 0 NOT NULL,
    final_amount numeric DEFAULT 0 NOT NULL,
    override_reason text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    held_amount numeric DEFAULT 0 NOT NULL,
    consumed_amount numeric DEFAULT 0 NOT NULL,
    CONSTRAINT salesperson_capital_allocations_consumed_amount_check CHECK ((consumed_amount >= (0)::numeric)),
    CONSTRAINT salesperson_capital_allocations_held_amount_check CHECK ((held_amount >= (0)::numeric)),
    CONSTRAINT scap_final_nonneg CHECK ((final_amount >= (0)::numeric)),
    CONSTRAINT scap_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text]))),
    CONSTRAINT scap_suggested_nonneg CHECK ((system_suggested_amount >= (0)::numeric))
);
ALTER TABLE public.salesperson_capital_allocations OWNER TO postgres;
COMMENT ON COLUMN public.salesperson_capital_allocations.override_reason IS 'DEPRECATED 2026-08-03 (migration 268, owner decision D8-1): the per-salesperson ceiling override was closed. Existing rows are KEPT as history. Nothing new is written here.';
ALTER TABLE ONLY public.customer_capital_allocations
    ADD CONSTRAINT customer_capital_allocations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.salesperson_capital_allocations
    ADD CONSTRAINT salesperson_capital_allocations_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX ccap_alloc_customer_uniq ON public.customer_capital_allocations USING btree (salesperson_allocation_id, customer_id);
CREATE INDEX ccap_customer_date_idx ON public.customer_capital_allocations USING btree (customer_id, capital_date);
CREATE INDEX ccap_salesperson_date_idx ON public.customer_capital_allocations USING btree (salesperson_id, capital_date);
CREATE INDEX ccap_snapshot_idx ON public.customer_capital_allocations USING btree (capital_snapshot_id);
CREATE INDEX customer_capital_allocations_customer_person_id_idx ON public.customer_capital_allocations USING btree (customer_person_id);
CREATE INDEX scap_capital_date_idx ON public.salesperson_capital_allocations USING btree (capital_date);
CREATE INDEX scap_salesperson_date_idx ON public.salesperson_capital_allocations USING btree (salesperson_id, capital_date);
CREATE UNIQUE INDEX scap_snapshot_salesperson_uniq ON public.salesperson_capital_allocations USING btree (capital_snapshot_id, salesperson_id);
ALTER TABLE ONLY public.customer_capital_allocations
    ADD CONSTRAINT customer_capital_allocations_capital_snapshot_id_fkey FOREIGN KEY (capital_snapshot_id) REFERENCES public.daily_capital_snapshots(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_capital_allocations
    ADD CONSTRAINT customer_capital_allocations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_capital_allocations
    ADD CONSTRAINT customer_capital_allocations_customer_person_id_fkey FOREIGN KEY (customer_person_id) REFERENCES public.persons(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.customer_capital_allocations
    ADD CONSTRAINT customer_capital_allocations_salesperson_allocation_id_fkey FOREIGN KEY (salesperson_allocation_id) REFERENCES public.salesperson_capital_allocations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.salesperson_capital_allocations
    ADD CONSTRAINT salesperson_capital_allocations_capital_snapshot_id_fkey FOREIGN KEY (capital_snapshot_id) REFERENCES public.daily_capital_snapshots(id) ON DELETE CASCADE;
CREATE POLICY ccap_read_privileged ON public.customer_capital_allocations FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]));
CREATE POLICY ccap_write_privileged ON public.customer_capital_allocations TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]));
ALTER TABLE public.customer_capital_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salesperson_capital_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY scap_insert ON public.salesperson_capital_allocations FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]));
CREATE POLICY scap_select ON public.salesperson_capital_allocations FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]));
CREATE POLICY scap_update ON public.salesperson_capital_allocations FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]));
GRANT SELECT ON TABLE public.customer_capital_allocations TO authenticated;
GRANT ALL ON TABLE public.customer_capital_allocations TO service_role;
GRANT SELECT ON TABLE public.salesperson_capital_allocations TO authenticated;
GRANT ALL ON TABLE public.salesperson_capital_allocations TO service_role;

CREATE OR REPLACE FUNCTION public._archive_prior_allocations_on_active()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active = true AND (TG_OP='INSERT' OR OLD.is_active = false) THEN
    UPDATE public.customer_capital_allocations
       SET status = 'archived', updated_at = now()
     WHERE capital_snapshot_id <> NEW.id AND status NOT IN ('archived');
    UPDATE public.salesperson_capital_allocations
       SET status = 'archived', updated_at = now()
     WHERE capital_snapshot_id <> NEW.id AND status NOT IN ('archived');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._validate_allocation_amounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.held_amount + NEW.consumed_amount > NEW.final_amount THEN
    RAISE EXCEPTION 'held_amount(%) + consumed_amount(%) از final_amount(%) بیشتر است',
      NEW.held_amount, NEW.consumed_amount, NEW.final_amount;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.compute_customer_capital_allocations(p_salesperson_allocation_id uuid)
 RETURNS TABLE(salesperson_allocation_id uuid, capital_snapshot_id uuid, capital_date date, salesperson_id uuid, salesperson_final_amount numeric, customer_id uuid, customer_score numeric, total_customer_score numeric, system_suggested_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alloc record;
  v_total numeric;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::text,'manager'::text,'accountant'::text]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.capital_snapshot_id, s.capital_date, s.salesperson_id, s.final_amount
    INTO v_alloc
  FROM public.salesperson_capital_allocations s
  WHERE s.id = p_salesperson_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'salesperson_allocation not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(COALESCE(ccp.credit_score,0)), 0) INTO v_total
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true;

  RETURN QUERY
  SELECT
    v_alloc.id,
    v_alloc.capital_snapshot_id,
    v_alloc.capital_date,
    v_alloc.salesperson_id,
    v_alloc.final_amount,
    c.id,
    COALESCE(ccp.credit_score, 0)::numeric,
    v_total,
    CASE
      WHEN v_total > 0 AND COALESCE(ccp.credit_score,0) > 0
        THEN ROUND(v_alloc.final_amount * COALESCE(ccp.credit_score,0)::numeric / v_total)
      ELSE 0
    END
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true
  ORDER BY COALESCE(ccp.credit_score,0) DESC, c.id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.compute_salesperson_capital_allocations(p_capital_snapshot_id uuid)
 RETURNS TABLE(capital_snapshot_id uuid, capital_date date, daily_final_capital numeric, salesperson_id uuid, score numeric, total_score numeric, system_suggested_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.daily_capital_snapshots WHERE id = p_capital_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily capital snapshot not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(es.monthly_score), 0)
    INTO v_total
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales';

  RETURN QUERY
  SELECT
    v_snap.id,
    v_snap.capital_date,
    v_snap.final_capital,
    es.employee_id AS salesperson_id,
    es.monthly_score AS score,
    v_total AS total_score,
    CASE
      WHEN v_total > 0 THEN ROUND(v_snap.final_capital * (es.monthly_score / v_total))
      ELSE 0
    END AS system_suggested_amount
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'
  ORDER BY es.monthly_score DESC NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_allocation_not_overridable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.final_amount IS DISTINCT FROM NEW.system_suggested_amount THEN
      RAISE EXCEPTION
        'سقف سرمایهٔ کارشناس قابل تغییر دستی نیست و باید برابر مقدار محاسبه‌شدهٔ سیستم (%) باشد.',
        NEW.system_suggested_amount
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- held_amount / consumed_amount / status must stay updatable: they are the
  -- day-to-day lifecycle of an allocation, not the allocation decision itself.
  IF NEW.system_suggested_amount IS DISTINCT FROM OLD.system_suggested_amount
     OR NEW.final_amount IS DISTINCT FROM OLD.final_amount THEN
    RAISE EXCEPTION
      'سقف محاسبه‌شدهٔ کارشناس پس از ثبت قابل ویرایش نیست (تصمیم D8-1).'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_customer_capital_allocations(p_salesperson_allocation_id uuid, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alloc record;
  v_total numeric;
  v_item jsonb;
  v_customer_id uuid;
  v_final numeric;
  v_reason text;
  v_score numeric;
  v_suggested numeric;
  v_existing record;
  v_action text;
  v_row_id uuid;
  v_count int := 0;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::text,'manager'::text,'accountant'::text]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'p_allocations must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.capital_snapshot_id, s.capital_date, s.salesperson_id, s.final_amount
    INTO v_alloc
  FROM public.salesperson_capital_allocations s
  WHERE s.id = p_salesperson_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'salesperson_allocation not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(COALESCE(ccp.credit_score,0)), 0) INTO v_total
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_customer_id := (v_item->>'customer_id')::uuid;
    v_final := COALESCE((v_item->>'final_amount')::numeric, 0);
    v_reason := NULLIF(btrim(COALESCE(v_item->>'override_reason','')), '');

    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'customer_id required' USING ERRCODE = '22023';
    END IF;
    IF v_final < 0 THEN
      RAISE EXCEPTION 'final_amount must be >= 0' USING ERRCODE = '22023';
    END IF;

    -- verify customer belongs to this salesperson (active); allow missing/zero score
    SELECT COALESCE(ccp.credit_score, 0)::numeric INTO v_score
    FROM public.customers c
    LEFT JOIN public.customer_credit_profile ccp
      ON ccp.customer_id = c.id AND ccp.is_active = true
    WHERE c.id = v_customer_id
      AND c.responsible_id = v_alloc.salesperson_id
      AND c.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer % is not eligible for this salesperson', v_customer_id USING ERRCODE = '22023';
    END IF;

    v_suggested := CASE
      WHEN v_total > 0 AND v_score > 0 THEN ROUND(v_alloc.final_amount * v_score / v_total)
      ELSE 0
    END;

    -- detect existing for action classification
    SELECT id INTO v_existing
    FROM public.customer_capital_allocations
    WHERE salesperson_allocation_id = v_alloc.id AND customer_id = v_customer_id;

    INSERT INTO public.customer_capital_allocations (
      salesperson_allocation_id, capital_snapshot_id, capital_date,
      salesperson_id, customer_id,
      customer_score, score_source, total_customer_score,
      system_suggested_amount, final_amount, override_reason,
      status, created_by, approved_by
    ) VALUES (
      v_alloc.id, v_alloc.capital_snapshot_id, v_alloc.capital_date,
      v_alloc.salesperson_id, v_customer_id,
      v_score, 'customer_credit_profile.credit_score', v_total,
      v_suggested, v_final, v_reason,
      'approved', auth.uid(), auth.uid()
    )
    ON CONFLICT (salesperson_allocation_id, customer_id) DO UPDATE
      SET customer_score = EXCLUDED.customer_score,
          total_customer_score = EXCLUDED.total_customer_score,
          system_suggested_amount = EXCLUDED.system_suggested_amount,
          final_amount = EXCLUDED.final_amount,
          override_reason = EXCLUDED.override_reason,
          status = 'approved',
          approved_by = auth.uid(),
          updated_at = now()
    RETURNING id INTO v_row_id;

    IF v_existing.id IS NULL THEN
      v_action := 'create';
    ELSIF ROUND(v_final) <> ROUND(v_suggested) THEN
      v_action := 'override';
    ELSE
      v_action := 'update';
    END IF;

    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (
      auth.uid(),
      'customer_capital_allocation',
      v_row_id::text,
      v_action,
      jsonb_build_object(
        'salesperson_allocation_id', v_alloc.id,
        'capital_snapshot_id', v_alloc.capital_snapshot_id,
        'capital_date', v_alloc.capital_date,
        'salesperson_id', v_alloc.salesperson_id,
        'customer_id', v_customer_id,
        'customer_score', v_score,
        'total_customer_score', v_total,
        'suggested', v_suggested,
        'final', v_final,
        'override_reason', v_reason
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('saved', v_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_salesperson_capital_allocations(p_capital_snapshot_id uuid, p_allocations jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
  v_actor uuid := auth.uid();
  v_count integer := 0;
  v_item jsonb;
  v_sp uuid;
  v_requested numeric;
  v_score numeric;
  v_suggested numeric;
  v_existing public.salesperson_capital_allocations%ROWTYPE;
  v_alloc_id uuid;
BEGIN
  -- NOTE: the previous definition cast to `public.text[]`, which is not a real
  -- type (text lives in pg_catalog), so this line raised
  -- `type "public.text[]" does not exist` on EVERY call. That is why
  -- salesperson_capital_allocations has 0 rows: this path never worked. Fixed
  -- to text[] here rather than faithfully reproducing a fatal typo.
  IF NOT public.has_any_role(v_actor, ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.daily_capital_snapshots WHERE id = p_capital_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily capital snapshot not found' USING ERRCODE = '22023';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'p_allocations must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(es.monthly_score), 0)
    INTO v_total
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_sp        := NULLIF(v_item->>'salesperson_id','')::uuid;
    v_requested := (v_item->>'final_amount')::numeric;   -- NULL when omitted

    IF v_sp IS NULL THEN
      RAISE EXCEPTION 'salesperson_id required' USING ERRCODE = '22023';
    END IF;

    SELECT es.monthly_score INTO v_score
    FROM public.employee_scores es
    JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'
    WHERE es.employee_id = v_sp;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'user % is not a salesperson with score', v_sp USING ERRCODE = '22023';
    END IF;

    v_suggested := CASE
      WHEN v_total > 0 THEN ROUND(v_snap.final_capital * (v_score / v_total))
      ELSE 0
    END;

    -- D8-1: a supplied amount that differs from the computed one is refused,
    -- not quietly replaced.
    IF v_requested IS NOT NULL AND ROUND(v_requested) <> v_suggested THEN
      RAISE EXCEPTION
        'سقف سرمایهٔ کارشناس قابل تغییر دستی نیست. مقدار محاسبه‌شدهٔ سیستم % است (مقدار ارسالی: %).',
        v_suggested, ROUND(v_requested)
        USING ERRCODE = '42501';
    END IF;

    IF (v_item ? 'override_reason') AND NULLIF(v_item->>'override_reason','') IS NOT NULL THEN
      RAISE EXCEPTION
        'ثبت «دلیل override» دیگر پذیرفته نمی‌شود؛ سقف سرمایه از تصمیم D8-1 به بعد فقط محاسبه‌شدنی است.'
        USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_existing
    FROM public.salesperson_capital_allocations
    WHERE capital_snapshot_id = p_capital_snapshot_id AND salesperson_id = v_sp;

    IF FOUND THEN
      UPDATE public.salesperson_capital_allocations
        SET score = v_score,
            total_score = v_total,
            system_suggested_amount = v_suggested,
            final_amount = v_suggested,
            override_reason = NULL,
            status = 'approved',
            approved_by = v_actor,
            updated_at = now()
        WHERE id = v_existing.id
        RETURNING id INTO v_alloc_id;
    ELSE
      INSERT INTO public.salesperson_capital_allocations(
        capital_snapshot_id, capital_date, salesperson_id,
        score, total_score, system_suggested_amount, final_amount,
        override_reason, status, created_by, approved_by
      ) VALUES (
        p_capital_snapshot_id, v_snap.capital_date, v_sp,
        v_score, v_total, v_suggested, v_suggested,
        NULL, 'approved', v_actor, v_actor
      ) RETURNING id INTO v_alloc_id;
    END IF;

    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (v_actor, 'salesperson_capital_allocation', v_alloc_id, 'allocation_saved',
            jsonb_build_object('salesperson_id', v_sp,
                               'system_suggested_amount', v_suggested,
                               'final_amount', v_suggested,
                               'capital_snapshot_id', p_capital_snapshot_id));

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_customer_capital_alloc_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF ROUND(NEW.final_amount) <> ROUND(NEW.system_suggested_amount)
     AND (NEW.override_reason IS NULL OR length(btrim(NEW.override_reason)) = 0) THEN
    RAISE EXCEPTION 'override_reason required when final_amount differs from system_suggested_amount'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER trg_allocation_not_overridable BEFORE INSERT OR UPDATE ON public.salesperson_capital_allocations FOR EACH ROW EXECUTE FUNCTION public.enforce_allocation_not_overridable();
CREATE TRIGGER trg_ccap_updated BEFORE UPDATE ON public.customer_capital_allocations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ccap_validate_override BEFORE INSERT OR UPDATE ON public.customer_capital_allocations FOR EACH ROW EXECUTE FUNCTION public.validate_customer_capital_alloc_override();
CREATE TRIGGER trg_customer_capital_allocations_derive_person BEFORE INSERT OR UPDATE OF customer_id ON public.customer_capital_allocations FOR EACH ROW EXECUTE FUNCTION public.tg_credit_derive_customer_person();
CREATE TRIGGER trg_scap_updated_at BEFORE UPDATE ON public.salesperson_capital_allocations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_validate_cca_amounts BEFORE INSERT OR UPDATE OF held_amount, consumed_amount, final_amount ON public.customer_capital_allocations FOR EACH ROW EXECUTE FUNCTION public._validate_allocation_amounts();
CREATE TRIGGER trg_validate_sca_amounts BEFORE INSERT OR UPDATE OF held_amount, consumed_amount, final_amount ON public.salesperson_capital_allocations FOR EACH ROW EXECUTE FUNCTION public._validate_allocation_amounts();

CREATE TRIGGER trg_archive_prior_allocations AFTER INSERT OR UPDATE OF is_active ON public.daily_capital_snapshots FOR EACH ROW EXECUTE FUNCTION _archive_prior_allocations_on_active();

DROP POLICY IF EXISTS cal_select_sales ON public.capital_allocation_ledger;
CREATE POLICY cal_select_sales ON public.capital_allocation_ledger
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'sales'::text)
    AND (
      (allocation_kind = 'salesperson'
       AND allocation_id IN (SELECT s.id FROM public.salesperson_capital_allocations s
                              WHERE s.salesperson_id = auth.uid()))
      OR
      (allocation_kind = 'customer'
       AND allocation_id IN (SELECT c.id FROM public.customer_capital_allocations c
                              WHERE c.salesperson_id = auth.uid()))
    )
  );

CREATE OR REPLACE FUNCTION public.person_merge(p_winner_id uuid, p_loser_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid        uuid := auth.uid();
  _winner     public.persons%ROWTYPE;
  _loser      public.persons%ROWTYPE;
  _repointed  jsonb := '{}'::jsonb;
  _ids_moved  integer := 0;
  _als_moved  integer := 0;
  _lnk_moved  integer := 0;
  _n          integer;
  _key        text;
  _mode       text;
  _r          record;
  _remaining  bigint;
  _log_id     uuid;

  -- POLICY REGISTRY -----------------------------------------------------------
  -- "table.column" -> handling mode.
  --   identity_root : the legacy mirror's own person_id. Repointed FIRST so the
  --                   derived *_person_id columns stay consistent with it.
  --   generic       : plain UPDATE ... SET col = winner WHERE col = loser.
  --   special_move  : person-owned child rows, moved with de-duplication below.
  --   special_keep  : deliberately keeps references to the loser.
  --   skip          : audit trail; must never be repointed.
  -- Anything in the catalog and NOT in this registry aborts the merge.
  _registry constant jsonb := jsonb_build_object(
    'customers.person_id',                                    'identity_root',
    'suppliers.person_id',                                    'identity_root',
    'external_parties.person_id',                             'identity_root',

    -- D8-3 (migration 271): profiles.person_id, added by 270. It is 'generic'
    -- and NOT 'identity_root': profiles.person_id has no unique constraint, so
    -- two user accounts may legitimately point at one person, and a profile
    -- carries no financial state -- unlike a customer or supplier file, merging
    -- two of them mixes nothing that needs an accounting decision first. A
    -- plain repoint is therefore correct and needs no both-sides guard.
    'profiles.person_id',                                     'generic',

    'credit_requests.customer_person_id',                     'generic',
    'credit_score_snapshots.customer_person_id',              'generic',
    'customer_capital_allocations.customer_person_id',        'generic',
    'customer_capital_allocations_dynamic.customer_person_id','generic',
    'customer_credit_balance.customer_person_id',             'generic',
    'customer_credit_ledger.customer_person_id',              'generic',
    'customer_credit_profile.customer_person_id',             'generic',
    'delivery_receipts.customer_person_id',                   'generic',
    'didar_activities.customer_person_id',                    'generic',
    'invoices.customer_person_id',                            'generic',
    'payment_receipts.customer_person_id',                    'generic',
    'payment_receipts.receiver_party_person_id',              'generic',
    'payment_vouchers.payee_person_id',                       'generic',
    'product_suppliers.supplier_person_id',                   'generic',
    'purchase_prices.supplier_person_id',                     'generic',
    'purchases.supplier_person_id',                           'generic',
    'sales_quotes.customer_person_id',                        'generic',

    'person_identifiers.person_id',                           'special_move',
    'person_aliases.person_id',                               'special_move',
    'person_context_links.person_id',                         'special_move',
    'person_field_values.person_id',                          'special_move',

    'person_merge_candidates.person_id_a',                    'special_keep',
    'person_merge_candidates.person_id_b',                    'special_keep',

    'person_merge_log.winner_id',                             'skip',
    'person_merge_log.loser_id',                              'skip'
  );
BEGIN
  ---------------------------------------------------------------------------
  -- Guard 1 + 2: authentication, role, existence, distinctness, active state.
  ---------------------------------------------------------------------------
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'ادغام اشخاص فقط برای مدیر سیستم یا مدیر مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  IF p_winner_id IS NULL OR p_loser_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ شخص برنده و بازنده هر دو الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_winner_id = p_loser_id THEN
    RAISE EXCEPTION 'نمی‌توان یک شخص را با خودش ادغام کرد.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _winner FROM public.persons WHERE id = p_winner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'شخص برندهٔ ادغام پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO _loser FROM public.persons WHERE id = p_loser_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'شخص بازندهٔ ادغام پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT _winner.is_active THEN
    RAISE EXCEPTION 'شخص برنده غیرفعال است و نمی‌تواند مقصد ادغام باشد.' USING ERRCODE = '22023';
  END IF;

  IF NOT _loser.is_active THEN
    RAISE EXCEPTION 'شخص بازنده از پیش غیرفعال است؛ احتمالاً قبلاً ادغام شده است.'
      USING ERRCODE = '22023';
  END IF;

  ---------------------------------------------------------------------------
  -- Guard 3: catalog completeness. Every FK column referencing persons must
  -- have a registered merge policy, or this merge does not run at all.
  ---------------------------------------------------------------------------
  FOR _r IN
    SELECT con.conrelid::regclass::text AS tbl, att.attname::text AS col
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid
                         AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.persons'::regclass
  LOOP
    _key := _r.tbl || '.' || _r.col;
    IF NOT (_registry ? _key) THEN
      RAISE EXCEPTION
        'ادغام متوقف شد: ستون «%» به جدول اشخاص ارجاع می‌دهد ولی سیاست ادغام برای آن تعریف نشده است. تا زمانی که این ستون در فهرست سیاست‌های تابع person_merge ثبت نشود، ادغام انجام نمی‌شود.',
        _key
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- Guard 7: cardinality. Two customer rows (or two supplier rows) is a
  -- business reconciliation, not an identity merge.
  ---------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.customers WHERE person_id = p_winner_id)
     AND EXISTS (SELECT 1 FROM public.customers WHERE person_id = p_loser_id) THEN
    RAISE EXCEPTION
      'هر دو شخص پروندهٔ مشتری دارند. ادغام هویت این دو، مانده‌ها و سابقهٔ اعتباری دو مشتری را در هم می‌آمیزد. ابتدا باید دو پروندهٔ مشتری به‌صورت حسابداری تعیین تکلیف شوند؛ این کار از عهدهٔ ادغام هویت خارج است.'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (SELECT 1 FROM public.suppliers WHERE person_id = p_winner_id)
     AND EXISTS (SELECT 1 FROM public.suppliers WHERE person_id = p_loser_id) THEN
    RAISE EXCEPTION
      'هر دو شخص پروندهٔ تأمین‌کننده دارند. ادغام هویت این دو، سابقهٔ خرید و پرداخت دو تأمین‌کننده را در هم می‌آمیزد. ابتدا باید دو پروندهٔ تأمین‌کننده تعیین تکلیف شوند؛ این کار از عهدهٔ ادغام هویت خارج است.'
      USING ERRCODE = '23505';
  END IF;

  -- D8-2 (migration 269): the same guard for external parties. It matters now
  -- that uq_external_parties_person_active exists: without this, merging two
  -- people who each have an ACTIVE external party would fail deep inside Step A
  -- with a raw unique_violation on the index instead of this explanation.
  -- Mirrors the customers/suppliers guards above exactly.
  IF EXISTS (SELECT 1 FROM public.external_parties WHERE person_id = p_winner_id AND is_active)
     AND EXISTS (SELECT 1 FROM public.external_parties WHERE person_id = p_loser_id AND is_active) THEN
    RAISE EXCEPTION
      'هر دو شخص طرف حساب خارجیِ فعال دارند. طبق تصمیم «یک شخص = یک طرف حساب فعال»، ادغام هویت این دو تا وقتی هر دو طرف حساب فعال‌اند انجام نمی‌شود. ابتدا یکی از دو طرف حساب را غیرفعال کنید و سپس ادغام را تکرار کنید.'
      USING ERRCODE = '23505';
  END IF;

  ---------------------------------------------------------------------------
  -- Step A: identity roots first, then every generic reference.
  ---------------------------------------------------------------------------
  FOR _mode IN SELECT unnest(ARRAY['identity_root','generic']) LOOP
    FOR _key IN
      SELECT k.key FROM jsonb_each_text(_registry) k
      WHERE k.value = _mode ORDER BY k.key
    LOOP
      _n := public._person_merge_repoint(
        split_part(_key, '.', 1), split_part(_key, '.', 2), p_winner_id, p_loser_id);
      IF _n > 0 THEN
        _repointed := _repointed || jsonb_build_object(_key, _n);
      END IF;
    END LOOP;
  END LOOP;

  ---------------------------------------------------------------------------
  -- Step B: identifiers. Drop the loser's exact duplicates first, then demote
  -- its is_primary flags where the winner already holds a primary of that kind
  -- (uq_person_identifiers_primary_active is (person_id, kind) WHERE is_primary
  -- AND status <> 'revoked'), then move the rest.
  ---------------------------------------------------------------------------
  DELETE FROM public.person_identifiers li
  WHERE li.person_id = p_loser_id
    AND EXISTS (
      SELECT 1 FROM public.person_identifiers wi
      WHERE wi.person_id = p_winner_id
        AND wi.kind = li.kind
        AND wi.value_normalized = li.value_normalized
    );

  UPDATE public.person_identifiers li
  SET is_primary = false
  WHERE li.person_id = p_loser_id
    AND li.is_primary
    AND EXISTS (
      SELECT 1 FROM public.person_identifiers wi
      WHERE wi.person_id = p_winner_id
        AND wi.kind = li.kind
        AND wi.is_primary
        AND wi.status <> 'revoked'
    );

  UPDATE public.person_identifiers SET person_id = p_winner_id WHERE person_id = p_loser_id;
  GET DIAGNOSTICS _ids_moved = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- Step C: aliases. Same de-duplication, plus the loser's display_name is
  -- preserved as an alias of the winner so search still finds the old name.
  -- alias_normalized is a GENERATED column, so it is never written directly.
  ---------------------------------------------------------------------------
  DELETE FROM public.person_aliases la
  WHERE la.person_id = p_loser_id
    AND EXISTS (
      SELECT 1 FROM public.person_aliases wa
      WHERE wa.person_id = p_winner_id
        AND wa.alias_normalized = la.alias_normalized
    );

  UPDATE public.person_aliases SET person_id = p_winner_id WHERE person_id = p_loser_id;
  GET DIAGNOSTICS _als_moved = ROW_COUNT;

  INSERT INTO public.person_aliases (person_id, alias, alias_kind, source, created_by)
  VALUES (p_winner_id, _loser.display_name, 'former', 'person_merge', _uid)
  ON CONFLICT DO NOTHING;

  ---------------------------------------------------------------------------
  -- Step D: context links, de-duplicated on the same key that
  -- uq_pcl_active_ref enforces.
  ---------------------------------------------------------------------------
  DELETE FROM public.person_context_links ll
  WHERE ll.person_id = p_loser_id
    AND EXISTS (
      SELECT 1 FROM public.person_context_links wl
      WHERE wl.person_id = p_winner_id
        AND wl.context_kind IS NOT DISTINCT FROM ll.context_kind
        AND wl.ref_table   IS NOT DISTINCT FROM ll.ref_table
        AND wl.ref_id      IS NOT DISTINCT FROM ll.ref_id
    );

  UPDATE public.person_context_links SET person_id = p_winner_id WHERE person_id = p_loser_id;
  GET DIAGNOSTICS _lnk_moved = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- Step E: custom field values. The winner's own value wins on collision
  -- (person_field_values is UNIQUE on (person_id, field_definition_id)).
  ---------------------------------------------------------------------------
  DELETE FROM public.person_field_values lv
  WHERE lv.person_id = p_loser_id
    AND EXISTS (
      SELECT 1 FROM public.person_field_values wv
      WHERE wv.person_id = p_winner_id
        AND wv.field_definition_id = lv.field_definition_id
    );

  UPDATE public.person_field_values SET person_id = p_winner_id WHERE person_id = p_loser_id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n > 0 THEN
    _repointed := _repointed || jsonb_build_object('person_field_values.person_id', _n);
  END IF;

  ---------------------------------------------------------------------------
  -- Step F: VERIFICATION SWEEP. SECURITY INVOKER means an RLS-filtered UPDATE
  -- matches nothing instead of raising. Prove no reference to the loser
  -- survived, or abort the whole merge.
  ---------------------------------------------------------------------------
  FOR _key, _mode IN SELECT k.key, k.value FROM jsonb_each_text(_registry) k ORDER BY k.key LOOP
    CONTINUE WHEN _mode IN ('special_keep', 'skip');
    _remaining := public._person_merge_count_refs(
      split_part(_key, '.', 1), split_part(_key, '.', 2), p_loser_id);

    IF _remaining > 0 THEN
      RAISE EXCEPTION
        'ادغام ناتمام ماند: % ردیف در ستون «%» هنوز به شخص بازنده ارجاع می‌دهد (احتمالاً به دلیل محدودیت سطح دسترسی). کل عملیات لغو شد.',
        _remaining, _key
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- Step G: deactivate the loser. Never hard-deleted — its id may appear in
  -- audit_logs and in person_merge_log itself.
  ---------------------------------------------------------------------------
  UPDATE public.persons
  SET is_active = false,
      notes = COALESCE(NULLIF(btrim(COALESCE(notes, '')), '') || E'\n', '')
              || 'ادغام‌شده در شخص ' || p_winner_id::text || ' در تاریخ ' || now()::date::text,
      updated_at = now()
  WHERE id = p_loser_id;

  ---------------------------------------------------------------------------
  -- Step H: audit + candidate queue.
  ---------------------------------------------------------------------------
  INSERT INTO public.person_merge_log (
    winner_id, loser_id, reason, repointed,
    identifiers_moved, aliases_moved, links_moved, merged_by
  )
  VALUES (
    p_winner_id, p_loser_id, NULLIF(btrim(COALESCE(p_reason, '')), ''), _repointed,
    _ids_moved, _als_moved, _lnk_moved, _uid
  )
  RETURNING id INTO _log_id;

  -- Only the exact pair is resolved. Other pending pairs that involve the loser
  -- are left untouched on purpose: marking them 'merged' would be false, and
  -- silently re-pointing them at the winner could collide with an existing pair.
  -- The merge UI filters those out by requiring both persons to be active.
  UPDATE public.person_merge_candidates
  SET status = 'merged', reviewed_by = _uid, reviewed_at = now(), updated_at = now()
  WHERE status = 'pending'
    AND ((person_id_a = p_winner_id AND person_id_b = p_loser_id)
      OR (person_id_a = p_loser_id  AND person_id_b = p_winner_id));

  RETURN jsonb_build_object(
    'winner_id',         p_winner_id,
    'loser_id',          p_loser_id,
    'merge_log_id',      _log_id,
    'repointed',         _repointed,
    'identifiers_moved', _ids_moved,
    'aliases_moved',     _als_moved,
    'links_moved',       _lnk_moved
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.person_fk_drift_report()
 RETURNS TABLE(table_name text, drifted_rows bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Phase 5 (migration 231)
  SELECT 'sales_quotes'::text, count(*)
    FROM public.sales_quotes q
    LEFT JOIN public.customers c ON c.id = q.customer_id
   WHERE q.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'purchases'::text, count(*)
    FROM public.purchases p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
   WHERE p.supplier_person_id IS DISTINCT FROM s.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'payment_vouchers'::text, count(*)
    FROM public.payment_vouchers v
    LEFT JOIN public.suppliers s ON s.id = v.payee_supplier_id
    LEFT JOIN public.customers c ON c.id = v.payee_customer_id
    LEFT JOIN public.external_parties ep ON ep.id = v.payee_party_id
   WHERE v.payee_person_id IS DISTINCT FROM coalesce(s.person_id, c.person_id, ep.person_id)
  HAVING count(*) > 0
  -- Phase 7.1 (Group A, migration 235)
  UNION ALL
  SELECT 'product_suppliers'::text, count(*)
    FROM public.product_suppliers ps
    LEFT JOIN public.suppliers s ON s.id = ps.supplier_id
   WHERE ps.supplier_person_id IS DISTINCT FROM s.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'purchase_prices'::text, count(*)
    FROM public.purchase_prices pp
    LEFT JOIN public.suppliers s ON s.id = pp.supplier_id
   WHERE pp.supplier_person_id IS DISTINCT FROM s.person_id
  HAVING count(*) > 0
  -- Phase 7.2 (Group B, migration 236)
  UNION ALL
  SELECT 'payment_receipts.customer'::text, count(*)
    FROM public.payment_receipts pr
    LEFT JOIN public.customers c ON c.id = pr.customer_id
   WHERE pr.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'payment_receipts.receiver_party'::text, count(*)
    FROM public.payment_receipts pr
    LEFT JOIN public.external_parties ep ON ep.id = pr.receiver_party_id
   WHERE pr.receiver_party_person_id IS DISTINCT FROM ep.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'delivery_receipts'::text, count(*)
    FROM public.delivery_receipts dr
    LEFT JOIN public.customers c ON c.id = dr.customer_id
   WHERE dr.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  -- Phase 7.3 (Group C, migration 237)
  UNION ALL
  SELECT 'credit_requests'::text, count(*)
    FROM public.credit_requests x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'credit_score_snapshots'::text, count(*)
    FROM public.credit_score_snapshots x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_capital_allocations'::text, count(*)
    FROM public.customer_capital_allocations x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_capital_allocations_dynamic'::text, count(*)
    FROM public.customer_capital_allocations_dynamic x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_credit_balance'::text, count(*)
    FROM public.customer_credit_balance x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_credit_ledger'::text, count(*)
    FROM public.customer_credit_ledger x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_credit_profile'::text, count(*)
    FROM public.customer_credit_profile x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  -- Phase 7.4 (Group D, this migration)
  UNION ALL
  SELECT 'invoices'::text, count(*)
    FROM public.invoices x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'didar_activities'::text, count(*)
    FROM public.didar_activities x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0;
$function$;
