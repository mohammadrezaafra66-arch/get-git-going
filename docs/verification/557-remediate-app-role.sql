SET client_encoding TO 'UTF8';
SET lock_timeout = '60s';

-- Remediate Path B+A policies for app_role[] signature + finish 557 alters.

ALTER TABLE public.torob_ops_findings
  DROP CONSTRAINT IF EXISTS torob_ops_findings_status_check;

ALTER TABLE public.torob_ops_findings
  ADD CONSTRAINT torob_ops_findings_status_check
  CHECK (status IN (
    'cheaper_competitor',
    'suspected_bait',
    'manual_review',
    'confirmed_bait',
    'legitimate_competitor',
    'queued_for_report',
    'reporting',
    'reported',
    'report_failed',
    'cancelled'
  ));

ALTER TABLE public.torob_ops_report_logs
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.torob_ops_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.torob_ops_report_logs
  ADD COLUMN IF NOT EXISTS mode text;

UPDATE public.torob_ops_report_logs
   SET mode = 'manual'
 WHERE mode IS NULL;

ALTER TABLE public.torob_ops_report_logs
  ALTER COLUMN mode SET DEFAULT 'manual';

ALTER TABLE public.torob_ops_report_logs
  ALTER COLUMN mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'torob_ops_report_logs_mode_check'
  ) THEN
    ALTER TABLE public.torob_ops_report_logs
      ADD CONSTRAINT torob_ops_report_logs_mode_check
      CHECK (mode IN ('manual', 'dry_run', 'auto'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_torob_ops_findings_dedupe
  ON public.torob_ops_findings (product_id, seller_domain, status, created_at DESC);

-- credentials / sessions already use has_role(admin) — recreate any missing

DROP POLICY IF EXISTS torob_ops_own_shops_select ON public.torob_ops_own_shops;
CREATE POLICY torob_ops_own_shops_select ON public.torob_ops_own_shops
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::app_role[]
    )
  );

DROP POLICY IF EXISTS torob_ops_own_shops_write ON public.torob_ops_own_shops;
CREATE POLICY torob_ops_own_shops_write ON public.torob_ops_own_shops
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::app_role[]));

DROP POLICY IF EXISTS torob_ops_scan_runs_select ON public.torob_ops_scan_runs;
CREATE POLICY torob_ops_scan_runs_select ON public.torob_ops_scan_runs
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::app_role[]
    )
  );

DROP POLICY IF EXISTS torob_ops_scan_runs_insert ON public.torob_ops_scan_runs;
CREATE POLICY torob_ops_scan_runs_insert ON public.torob_ops_scan_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales']::app_role[])
  );

DROP POLICY IF EXISTS torob_ops_scan_runs_update ON public.torob_ops_scan_runs;
CREATE POLICY torob_ops_scan_runs_update ON public.torob_ops_scan_runs
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales']::app_role[])
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales']::app_role[])
  );

DROP POLICY IF EXISTS torob_ops_findings_select ON public.torob_ops_findings;
CREATE POLICY torob_ops_findings_select ON public.torob_ops_findings
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::app_role[]
    )
  );

DROP POLICY IF EXISTS torob_ops_findings_write ON public.torob_ops_findings;
CREATE POLICY torob_ops_findings_write ON public.torob_ops_findings
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales']::app_role[]));

DROP POLICY IF EXISTS torob_ops_report_logs_select ON public.torob_ops_report_logs;
CREATE POLICY torob_ops_report_logs_select ON public.torob_ops_report_logs
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::app_role[]
    )
  );

DROP POLICY IF EXISTS torob_ops_report_logs_insert ON public.torob_ops_report_logs;
CREATE POLICY torob_ops_report_logs_insert ON public.torob_ops_report_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales']::app_role[])
  );

DROP POLICY IF EXISTS torob_ops_report_templates_select ON public.torob_ops_report_templates;
CREATE POLICY torob_ops_report_templates_select ON public.torob_ops_report_templates
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::app_role[]
    )
  );

DROP POLICY IF EXISTS torob_ops_report_templates_write ON public.torob_ops_report_templates;
CREATE POLICY torob_ops_report_templates_write ON public.torob_ops_report_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS torob_ops_accounts_admin_all ON public.torob_ops_accounts;
CREATE POLICY torob_ops_accounts_admin_all ON public.torob_ops_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS torob_ops_settings_select ON public.torob_ops_settings;
CREATE POLICY torob_ops_settings_select ON public.torob_ops_settings
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::app_role[]
    )
  );

DROP POLICY IF EXISTS torob_ops_settings_admin ON public.torob_ops_settings;
CREATE POLICY torob_ops_settings_admin ON public.torob_ops_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
