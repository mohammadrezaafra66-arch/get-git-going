
-- =====================================================================
-- Phase 19.1 — Daily Capital data model & compute/save RPCs (backend only)
-- NO UI in this phase. UI is Phase 19.2. Allocation is Phase 20.
-- Formula v1 is intentionally simple, conservative, and human-explainable.
-- =====================================================================

-- ---------- Table: daily_capital_inputs ------------------------------
CREATE TABLE IF NOT EXISTS public.daily_capital_inputs (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capital_date                date NOT NULL,
  bank_balance                numeric NOT NULL DEFAULT 0,
  cash_balance                numeric NOT NULL DEFAULT 0,
  incoming_checks             numeric NOT NULL DEFAULT 0,
  outgoing_checks             numeric NOT NULL DEFAULT 0,
  external_receivables        numeric NOT NULL DEFAULT 0,
  external_payables           numeric NOT NULL DEFAULT 0,
  near_term_expenses          numeric NOT NULL DEFAULT 0,
  risk_reserve                numeric NOT NULL DEFAULT 0,
  blocked_funds               numeric NOT NULL DEFAULT 0,
  inventory_liquidity_value   numeric NOT NULL DEFAULT 0,
  manual_adjustment           numeric NOT NULL DEFAULT 0,
  notes                       text,
  created_by                  uuid,
  updated_by                  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_capital_inputs_date_uidx
  ON public.daily_capital_inputs(capital_date);

COMMENT ON TABLE public.daily_capital_inputs IS
  'Phase 19.1: manual daily inputs for "daily capital" computation. One row per capital_date.';

-- ---------- Table: daily_capital_snapshots ---------------------------
CREATE TABLE IF NOT EXISTS public.daily_capital_snapshots (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capital_date                  date NOT NULL,
  system_suggested_capital      numeric NOT NULL DEFAULT 0,
  final_capital                 numeric NOT NULL DEFAULT 0,
  total_receivables             numeric NOT NULL DEFAULT 0,
  overdue_receivables           numeric NOT NULL DEFAULT 0,
  due_today_receivables         numeric NOT NULL DEFAULT 0,
  future_receivables            numeric NOT NULL DEFAULT 0,
  total_payables                numeric NOT NULL DEFAULT 0,
  overdue_payables              numeric NOT NULL DEFAULT 0,
  due_today_payables            numeric NOT NULL DEFAULT 0,
  future_payables               numeric NOT NULL DEFAULT 0,
  input_id                      uuid REFERENCES public.daily_capital_inputs(id) ON DELETE SET NULL,
  formula_version               text NOT NULL DEFAULT 'v1',
  override_reason               text,
  approved_by                   uuid,
  created_by                    uuid,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_capital_snapshots_date_created_idx
  ON public.daily_capital_snapshots(capital_date, created_at DESC);

COMMENT ON TABLE public.daily_capital_snapshots IS
  'Phase 19.1: daily capital snapshots. Multiple per day (history). Latest per day = current truth.';

-- ---------- updated_at trigger for inputs ----------------------------
CREATE OR REPLACE FUNCTION public.tg_daily_capital_inputs_set_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.updated_by IS NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_capital_inputs_updated ON public.daily_capital_inputs;
CREATE TRIGGER trg_daily_capital_inputs_updated
BEFORE UPDATE ON public.daily_capital_inputs
FOR EACH ROW EXECUTE FUNCTION public.tg_daily_capital_inputs_set_updated();

-- ---------- Audit triggers ------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_daily_capital_inputs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (
    auth.uid(),
    'daily_capital_input',
    COALESCE(NEW.id, OLD.id)::text,
    LOWER(TG_OP),
    jsonb_build_object(
      'capital_date', COALESCE(NEW.capital_date, OLD.capital_date),
      'old', CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      'new', CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_daily_capital_inputs ON public.daily_capital_inputs;
CREATE TRIGGER trg_audit_daily_capital_inputs
AFTER INSERT OR UPDATE ON public.daily_capital_inputs
FOR EACH ROW EXECUTE FUNCTION public.audit_daily_capital_inputs();

CREATE OR REPLACE FUNCTION public.audit_daily_capital_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  v_action := CASE
    WHEN NEW.override_reason IS NOT NULL
      AND NEW.final_capital IS DISTINCT FROM NEW.system_suggested_capital
    THEN 'override' ELSE 'create'
  END;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (
    auth.uid(),
    'daily_capital_snapshot',
    NEW.id::text,
    v_action,
    jsonb_build_object(
      'capital_date', NEW.capital_date,
      'system_suggested_capital', NEW.system_suggested_capital,
      'final_capital', NEW.final_capital,
      'override_reason', NEW.override_reason,
      'formula_version', NEW.formula_version
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_daily_capital_snapshots ON public.daily_capital_snapshots;
CREATE TRIGGER trg_audit_daily_capital_snapshots
AFTER INSERT ON public.daily_capital_snapshots
FOR EACH ROW EXECUTE FUNCTION public.audit_daily_capital_snapshots();

-- ---------- RLS ------------------------------------------------------
ALTER TABLE public.daily_capital_inputs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_capital_snapshots ENABLE ROW LEVEL SECURITY;

-- inputs
DROP POLICY IF EXISTS dci_select ON public.daily_capital_inputs;
CREATE POLICY dci_select ON public.daily_capital_inputs
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]));

DROP POLICY IF EXISTS dci_insert ON public.daily_capital_inputs;
CREATE POLICY dci_insert ON public.daily_capital_inputs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]));

DROP POLICY IF EXISTS dci_update ON public.daily_capital_inputs;
CREATE POLICY dci_update ON public.daily_capital_inputs
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]));

-- snapshots
DROP POLICY IF EXISTS dcs_select ON public.daily_capital_snapshots;
CREATE POLICY dcs_select ON public.daily_capital_snapshots
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]));

DROP POLICY IF EXISTS dcs_insert ON public.daily_capital_snapshots;
CREATE POLICY dcs_insert ON public.daily_capital_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]));

-- DELETE intentionally not granted (no policy => denied).

-- ---------- RPC: compute_daily_capital -------------------------------
-- Formula v1 (conservative, human-explainable):
--   suggested =
--       bank_balance + cash_balance + incoming_checks
--     + due_today_receivables + external_receivables
--     + inventory_liquidity_value + manual_adjustment
--     - due_today_payables - outgoing_checks - external_payables
--     - near_term_expenses - risk_reserve - blocked_funds
--   Future receivables/payables are reported but NOT included today.
--   Negative result is clamped to 0.
CREATE OR REPLACE FUNCTION public.compute_daily_capital(
  p_capital_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  capital_date              date,
  formula_version           text,
  system_suggested_capital  numeric,
  total_receivables         numeric,
  overdue_receivables       numeric,
  due_today_receivables     numeric,
  future_receivables        numeric,
  total_payables            numeric,
  overdue_payables          numeric,
  due_today_payables        numeric,
  future_payables           numeric,
  input_id                  uuid,
  bank_balance              numeric,
  cash_balance              numeric,
  incoming_checks           numeric,
  outgoing_checks           numeric,
  external_receivables      numeric,
  external_payables         numeric,
  near_term_expenses        numeric,
  risk_reserve              numeric,
  blocked_funds             numeric,
  inventory_liquidity_value numeric,
  manual_adjustment         numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i public.daily_capital_inputs%ROWTYPE;
  r record; -- receivables summary
  p record; -- payables summary
  v_suggested numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO i FROM public.daily_capital_inputs WHERE capital_date = p_capital_date;

  -- Receivables: total/overdue (any due_date <= today), today, future
  SELECT * INTO r FROM public.get_receivables_summary(NULL, NULL, NULL);
  -- Payables similarly
  SELECT * INTO p FROM public.get_payables_summary(NULL, NULL, NULL);

  v_suggested :=
      COALESCE(i.bank_balance,0)
    + COALESCE(i.cash_balance,0)
    + COALESCE(i.incoming_checks,0)
    + COALESCE(r.due_today,0)
    + COALESCE(i.external_receivables,0)
    + COALESCE(i.inventory_liquidity_value,0)
    + COALESCE(i.manual_adjustment,0)
    - COALESCE(p.due_today,0)
    - COALESCE(i.outgoing_checks,0)
    - COALESCE(i.external_payables,0)
    - COALESCE(i.near_term_expenses,0)
    - COALESCE(i.risk_reserve,0)
    - COALESCE(i.blocked_funds,0);

  IF v_suggested < 0 THEN v_suggested := 0; END IF;

  capital_date              := p_capital_date;
  formula_version           := 'v1';
  system_suggested_capital  := v_suggested;
  total_receivables         := COALESCE(r.total_outstanding,0);
  overdue_receivables       := COALESCE(r.overdue_outstanding,0);
  due_today_receivables     := COALESCE(r.due_today,0);
  future_receivables        := COALESCE(r.future_outstanding,0);
  total_payables            := COALESCE(p.total_outstanding,0);
  overdue_payables          := COALESCE(p.overdue_outstanding,0);
  due_today_payables        := COALESCE(p.due_today,0);
  future_payables           := COALESCE(p.future_outstanding,0);
  input_id                  := i.id;
  bank_balance              := COALESCE(i.bank_balance,0);
  cash_balance              := COALESCE(i.cash_balance,0);
  incoming_checks           := COALESCE(i.incoming_checks,0);
  outgoing_checks           := COALESCE(i.outgoing_checks,0);
  external_receivables      := COALESCE(i.external_receivables,0);
  external_payables         := COALESCE(i.external_payables,0);
  near_term_expenses        := COALESCE(i.near_term_expenses,0);
  risk_reserve              := COALESCE(i.risk_reserve,0);
  blocked_funds             := COALESCE(i.blocked_funds,0);
  inventory_liquidity_value := COALESCE(i.inventory_liquidity_value,0);
  manual_adjustment         := COALESCE(i.manual_adjustment,0);

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_daily_capital(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_daily_capital(date) TO authenticated;

COMMENT ON FUNCTION public.compute_daily_capital(date) IS
  'Phase 19.1: read-only compute of daily capital (formula v1). Role-guarded.';

-- ---------- RPC: save_daily_capital_snapshot -------------------------
CREATE OR REPLACE FUNCTION public.save_daily_capital_snapshot(
  p_capital_date date,
  p_final_capital numeric,
  p_override_reason text DEFAULT NULL
)
RETURNS public.daily_capital_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  s public.daily_capital_snapshots;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_capital_date IS NULL THEN
    RAISE EXCEPTION 'capital_date is required' USING ERRCODE = '22023';
  END IF;
  IF p_final_capital IS NULL OR p_final_capital < 0 THEN
    RAISE EXCEPTION 'final_capital must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO c FROM public.compute_daily_capital(p_capital_date);

  IF p_final_capital <> c.system_suggested_capital
     AND (p_override_reason IS NULL OR length(btrim(p_override_reason)) = 0) THEN
    RAISE EXCEPTION 'override_reason is required when final differs from suggested'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.daily_capital_snapshots(
    capital_date, system_suggested_capital, final_capital,
    total_receivables, overdue_receivables, due_today_receivables, future_receivables,
    total_payables, overdue_payables, due_today_payables, future_payables,
    input_id, formula_version, override_reason, approved_by, created_by
  ) VALUES (
    p_capital_date, c.system_suggested_capital, p_final_capital,
    c.total_receivables, c.overdue_receivables, c.due_today_receivables, c.future_receivables,
    c.total_payables, c.overdue_payables, c.due_today_payables, c.future_payables,
    c.input_id, c.formula_version, NULLIF(btrim(p_override_reason),''), auth.uid(), auth.uid()
  )
  RETURNING * INTO s;

  RETURN s;
END;
$$;

REVOKE ALL ON FUNCTION public.save_daily_capital_snapshot(date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_daily_capital_snapshot(date, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.save_daily_capital_snapshot(date, numeric, text) IS
  'Phase 19.1: writes a daily capital snapshot. Requires override_reason if final != suggested.';
