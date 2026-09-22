SET client_encoding TO 'UTF8';

-- 558 — Torob Ops Path A correlation id on report logs
ALTER TABLE public.torob_ops_report_logs
  ADD COLUMN IF NOT EXISTS correlation_id text;

CREATE INDEX IF NOT EXISTS idx_torob_ops_report_logs_correlation
  ON public.torob_ops_report_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;
