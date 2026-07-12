ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS expected_settlement_date DATE,
  ADD COLUMN IF NOT EXISTS actual_settlement_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_amount NUMERIC(15,2);

CREATE INDEX IF NOT EXISTS idx_invoices_overdue_check
  ON public.invoices(customer_id, expected_settlement_date)
  WHERE actual_settlement_date IS NULL;

ALTER TABLE public.customer_credit_profile
  ADD COLUMN IF NOT EXISTS settlement_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_overdue BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS overdue_since DATE,
  ADD COLUMN IF NOT EXISTS last_overdue_check_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_credit_profile_overdue
  ON public.customer_credit_profile(has_overdue)
  WHERE has_overdue = true;