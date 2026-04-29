ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS settlement_type_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_settlement_type_id_fkey'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_settlement_type_id_fkey
      FOREIGN KEY (settlement_type_id)
      REFERENCES public.settlement_types(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invoices_settlement_type_id_idx
  ON public.invoices(settlement_type_id);