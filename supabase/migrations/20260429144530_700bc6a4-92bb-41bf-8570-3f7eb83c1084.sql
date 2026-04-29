ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS accounting_code text;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_accounting_code_format
  CHECK (accounting_code IS NULL OR accounting_code ~ '^[A-Za-z0-9_-]{1,30}$');

CREATE UNIQUE INDEX IF NOT EXISTS customers_accounting_code_unique_idx
  ON public.customers (accounting_code)
  WHERE accounting_code IS NOT NULL;