SET client_encoding TO 'UTF8';

-- ============================================================================
-- 557 — Torob Ops Path A extensions
-- Report templates, Torob reporter accounts, settings/kill-switch,
-- finding status expansion, report log mode/account.
-- Reverse (copy/staging): docs/verification/557-down.sql
-- ============================================================================

SET lock_timeout = '60s';

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

CREATE TABLE IF NOT EXISTS public.torob_ops_report_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  body        text NOT NULL,
  is_default  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_torob_ops_report_templates_one_default
  ON public.torob_ops_report_templates ((is_default))
  WHERE is_default AND is_active;

DROP TRIGGER IF EXISTS trg_torob_ops_report_templates_updated_at ON public.torob_ops_report_templates;
CREATE TRIGGER trg_torob_ops_report_templates_updated_at
  BEFORE UPDATE ON public.torob_ops_report_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.torob_ops_report_templates ENABLE ROW LEVEL SECURITY;

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

REVOKE ALL ON public.torob_ops_report_templates FROM PUBLIC;
REVOKE ALL ON public.torob_ops_report_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.torob_ops_report_templates TO authenticated;
GRANT ALL ON public.torob_ops_report_templates TO service_role;

INSERT INTO public.torob_ops_report_templates (name, body, is_default, is_active)
SELECT
  'قالب پیش‌فرض طعمه',
  E'سلام\nاین فروشنده با قیمت غیرواقعی/طعمه در ترب دیده می‌شود. لطفاً بررسی فرمایید.\nلینک کالا: {{torob_url}}\nنام کالا: {{product_name}}\nقیمت ما: {{our_price}}\nقیمت اعلام‌شده: {{their_price}}\nسیگنال‌ها: {{bait_signals}}',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.torob_ops_report_templates WHERE is_default
);

CREATE TABLE IF NOT EXISTS public.torob_ops_accounts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label              text NOT NULL,
  status             text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'quarantine', 'disabled')),
  session_ciphertext text,
  session_iv         text,
  last_used_at       timestamptz,
  last_error         text,
  reports_today      integer NOT NULL DEFAULT 0,
  reports_day        date,
  daily_cap          integer NOT NULL DEFAULT 20,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_torob_ops_accounts_status
  ON public.torob_ops_accounts (status, last_used_at NULLS FIRST);

DROP TRIGGER IF EXISTS trg_torob_ops_accounts_updated_at ON public.torob_ops_accounts;
CREATE TRIGGER trg_torob_ops_accounts_updated_at
  BEFORE UPDATE ON public.torob_ops_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.torob_ops_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS torob_ops_accounts_admin_all ON public.torob_ops_accounts;
CREATE POLICY torob_ops_accounts_admin_all ON public.torob_ops_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.torob_ops_accounts FROM PUBLIC;
REVOKE ALL ON public.torob_ops_accounts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.torob_ops_accounts TO authenticated;
GRANT ALL ON public.torob_ops_accounts TO service_role;

CREATE TABLE IF NOT EXISTS public.torob_ops_settings (
  id                            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_report_enabled           boolean NOT NULL DEFAULT false,
  kill_switch                   boolean NOT NULL DEFAULT false,
  require_human_confirm_first_n integer NOT NULL DEFAULT 5,
  max_reports_per_hour          integer NOT NULL DEFAULT 10,
  dedupe_window_hours           integer NOT NULL DEFAULT 72,
  updated_by                    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_torob_ops_settings_updated_at ON public.torob_ops_settings;
CREATE TRIGGER trg_torob_ops_settings_updated_at
  BEFORE UPDATE ON public.torob_ops_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.torob_ops_settings ENABLE ROW LEVEL SECURITY;

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

REVOKE ALL ON public.torob_ops_settings FROM PUBLIC;
REVOKE ALL ON public.torob_ops_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.torob_ops_settings TO authenticated;
GRANT ALL ON public.torob_ops_settings TO service_role;

INSERT INTO public.torob_ops_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

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
