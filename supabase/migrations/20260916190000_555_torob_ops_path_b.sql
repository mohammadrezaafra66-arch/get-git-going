SET client_encoding TO 'UTF8';

-- ============================================================================
-- 555 — Torob Ops Path B (ماژول عملیات ترب)
-- ============================================================================
-- قفل رمز جدا، اسکن رقابتی، صف بررسی طعمه، لاگ گزارش دستی.
-- بدون ارسال خودکار گزارش در ترب.
--
-- Reverse (copy/staging only): docs/verification/555-down.sql
-- ============================================================================

SET lock_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 0) role_permissions module: torob-ops
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name,
       'torob-ops',
       r.role_name IN ('admin', 'manager', 'sales', 'accountant', 'viewer'),
       r.role_name IN ('admin', 'manager', 'sales'),
       r.role_name IN ('admin', 'manager', 'sales'),
       r.role_name IN ('admin', 'manager'),
       false,
       r.role_name IN ('admin', 'manager'),
       r.role_name IN ('admin', 'manager')
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'torob-ops'
 );

-- ---------------------------------------------------------------------------
-- 1) credentials (per-user module password; hash only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.torob_ops_credentials (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.torob_ops_credentials IS
  'Per-user Torob Ops module password (scrypt/bcrypt hash). Never store plaintext.';

DROP TRIGGER IF EXISTS trg_torob_ops_credentials_updated_at ON public.torob_ops_credentials;
CREATE TRIGGER trg_torob_ops_credentials_updated_at
  BEFORE UPDATE ON public.torob_ops_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.torob_ops_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS torob_ops_credentials_admin_all ON public.torob_ops_credentials;
CREATE POLICY torob_ops_credentials_admin_all ON public.torob_ops_credentials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.torob_ops_credentials FROM PUBLIC;
REVOKE ALL ON public.torob_ops_credentials FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.torob_ops_credentials TO authenticated;
GRANT ALL ON public.torob_ops_credentials TO service_role;

-- ---------------------------------------------------------------------------
-- 2) module sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.torob_ops_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  revoked_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoke_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_torob_ops_sessions_token_hash
  ON public.torob_ops_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_torob_ops_sessions_user_active
  ON public.torob_ops_sessions (user_id)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.torob_ops_sessions IS
  'Opaque Torob Ops unlock sessions. Client keeps raw token in sessionStorage only.';

ALTER TABLE public.torob_ops_sessions ENABLE ROW LEVEL SECURITY;

-- No direct client policies: session create/validate via service_role server code.
DROP POLICY IF EXISTS torob_ops_sessions_admin_select ON public.torob_ops_sessions;
CREATE POLICY torob_ops_sessions_admin_select ON public.torob_ops_sessions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.torob_ops_sessions FROM PUBLIC;
REVOKE ALL ON public.torob_ops_sessions FROM anon;
GRANT SELECT ON public.torob_ops_sessions TO authenticated;
GRANT ALL ON public.torob_ops_sessions TO service_role;

-- ---------------------------------------------------------------------------
-- 3) own shops (exclude from competitor findings)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.torob_ops_own_shops (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name     text,
  domain        text,
  notes         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT torob_ops_own_shops_identity_chk
    CHECK (NULLIF(btrim(COALESCE(shop_name, '')), '') IS NOT NULL
        OR NULLIF(btrim(COALESCE(domain, '')), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_torob_ops_own_shops_active
  ON public.torob_ops_own_shops (is_active)
  WHERE is_active;

DROP TRIGGER IF EXISTS trg_torob_ops_own_shops_updated_at ON public.torob_ops_own_shops;
CREATE TRIGGER trg_torob_ops_own_shops_updated_at
  BEFORE UPDATE ON public.torob_ops_own_shops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.torob_ops_own_shops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS torob_ops_own_shops_select ON public.torob_ops_own_shops;
CREATE POLICY torob_ops_own_shops_select ON public.torob_ops_own_shops
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
  );

DROP POLICY IF EXISTS torob_ops_own_shops_write ON public.torob_ops_own_shops;
CREATE POLICY torob_ops_own_shops_write ON public.torob_ops_own_shops
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[]));

REVOKE ALL ON public.torob_ops_own_shops FROM PUBLIC;
REVOKE ALL ON public.torob_ops_own_shops FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.torob_ops_own_shops TO authenticated;
GRANT ALL ON public.torob_ops_own_shops TO service_role;

-- ---------------------------------------------------------------------------
-- 4) scan runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.torob_ops_scan_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  label_ids       uuid[] NOT NULL DEFAULT '{}',
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at      timestamptz,
  finished_at     timestamptz,
  products_total  int NOT NULL DEFAULT 0,
  findings_total  int NOT NULL DEFAULT 0,
  error_message   text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_torob_ops_scan_runs_status
  ON public.torob_ops_scan_runs (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_torob_ops_scan_runs_updated_at ON public.torob_ops_scan_runs;
CREATE TRIGGER trg_torob_ops_scan_runs_updated_at
  BEFORE UPDATE ON public.torob_ops_scan_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.torob_ops_scan_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS torob_ops_scan_runs_select ON public.torob_ops_scan_runs;
CREATE POLICY torob_ops_scan_runs_select ON public.torob_ops_scan_runs
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
  );

DROP POLICY IF EXISTS torob_ops_scan_runs_insert ON public.torob_ops_scan_runs;
CREATE POLICY torob_ops_scan_runs_insert ON public.torob_ops_scan_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales']::text[])
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS torob_ops_scan_runs_update ON public.torob_ops_scan_runs;
CREATE POLICY torob_ops_scan_runs_update ON public.torob_ops_scan_runs
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales']::text[])
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales']::text[])
  );

REVOKE ALL ON public.torob_ops_scan_runs FROM PUBLIC;
REVOKE ALL ON public.torob_ops_scan_runs FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.torob_ops_scan_runs TO authenticated;
GRANT ALL ON public.torob_ops_scan_runs TO service_role;

-- ---------------------------------------------------------------------------
-- 5) findings (Path B queue)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.torob_ops_findings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id           uuid NOT NULL REFERENCES public.torob_ops_scan_runs(id) ON DELETE CASCADE,
  product_id            uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name_snapshot text,
  torob_url             text,
  seller_name           text,
  seller_domain         text,
  seller_offer_url      text,
  our_price_toman       numeric,
  their_price_toman     numeric,
  price_source          text NOT NULL DEFAULT 'observatory'
                          CHECK (price_source IN ('observatory', 'extracted', 'manual', 'readonly_job')),
  status                text NOT NULL DEFAULT 'manual_review'
                          CHECK (status IN (
                            'cheaper_competitor',
                            'suspected_bait',
                            'manual_review',
                            'confirmed_bait',
                            'legitimate_competitor',
                            'reported',
                            'cancelled'
                          )),
  evidence              jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at           timestamptz,
  review_note           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_torob_ops_findings_status
  ON public.torob_ops_findings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_torob_ops_findings_run
  ON public.torob_ops_findings (scan_run_id);
CREATE INDEX IF NOT EXISTS idx_torob_ops_findings_product
  ON public.torob_ops_findings (product_id);

DROP TRIGGER IF EXISTS trg_torob_ops_findings_updated_at ON public.torob_ops_findings;
CREATE TRIGGER trg_torob_ops_findings_updated_at
  BEFORE UPDATE ON public.torob_ops_findings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.torob_ops_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS torob_ops_findings_select ON public.torob_ops_findings;
CREATE POLICY torob_ops_findings_select ON public.torob_ops_findings
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
  );

DROP POLICY IF EXISTS torob_ops_findings_write ON public.torob_ops_findings;
CREATE POLICY torob_ops_findings_write ON public.torob_ops_findings
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales']::text[]));

REVOKE ALL ON public.torob_ops_findings FROM PUBLIC;
REVOKE ALL ON public.torob_ops_findings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.torob_ops_findings TO authenticated;
GRANT ALL ON public.torob_ops_findings TO service_role;

-- ---------------------------------------------------------------------------
-- 6) manual report logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.torob_ops_report_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id      uuid NOT NULL REFERENCES public.torob_ops_findings(id) ON DELETE CASCADE,
  reported_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reported_at     timestamptz NOT NULL DEFAULT now(),
  report_text     text,
  result          text NOT NULL DEFAULT 'submitted'
                    CHECK (result IN ('submitted', 'failed', 'skipped')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_torob_ops_report_logs_finding
  ON public.torob_ops_report_logs (finding_id, reported_at DESC);

ALTER TABLE public.torob_ops_report_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS torob_ops_report_logs_select ON public.torob_ops_report_logs;
CREATE POLICY torob_ops_report_logs_select ON public.torob_ops_report_logs
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
  );

DROP POLICY IF EXISTS torob_ops_report_logs_insert ON public.torob_ops_report_logs;
CREATE POLICY torob_ops_report_logs_insert ON public.torob_ops_report_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales']::text[])
    AND reported_by = auth.uid()
  );

REVOKE ALL ON public.torob_ops_report_logs FROM PUBLIC;
REVOKE ALL ON public.torob_ops_report_logs FROM anon;
GRANT SELECT, INSERT ON public.torob_ops_report_logs TO authenticated;
GRANT ALL ON public.torob_ops_report_logs TO service_role;

-- ---------------------------------------------------------------------------
-- 7) audit entity allowlist + torob_ops
-- ---------------------------------------------------------------------------
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
    'daily_capital_snapshot','capital_allocation_ledger','platform_release',
    'torob_ops'
  ]);
$$;
