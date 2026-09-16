SET client_encoding TO 'UTF8';

-- Reverse 557 Torob Ops Path A (copy/staging only)
DROP TABLE IF EXISTS public.torob_ops_settings CASCADE;
DROP TABLE IF EXISTS public.torob_ops_accounts CASCADE;
DROP TABLE IF EXISTS public.torob_ops_report_templates CASCADE;

ALTER TABLE public.torob_ops_report_logs DROP COLUMN IF EXISTS account_id;
ALTER TABLE public.torob_ops_report_logs DROP CONSTRAINT IF EXISTS torob_ops_report_logs_mode_check;
ALTER TABLE public.torob_ops_report_logs DROP COLUMN IF EXISTS mode;

ALTER TABLE public.torob_ops_findings DROP CONSTRAINT IF EXISTS torob_ops_findings_status_check;
ALTER TABLE public.torob_ops_findings
  ADD CONSTRAINT torob_ops_findings_status_check
  CHECK (status IN (
    'cheaper_competitor',
    'suspected_bait',
    'manual_review',
    'confirmed_bait',
    'legitimate_competitor',
    'reported',
    'cancelled'
  ));

DROP INDEX IF EXISTS idx_torob_ops_findings_dedupe;
