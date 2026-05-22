-- Add nullable settlement_type_id to sale_lists as PDF/metadata only.
-- Does NOT affect pricing engine, pricing_rules, invoices, or price_calculation_snapshots.
-- Branch sync touch: keeps the migration visible in the feature branch diff without changing schema behavior.
ALTER TABLE public.sale_lists
  ADD COLUMN IF NOT EXISTS settlement_type_id uuid NULL;

-- FK with ON DELETE SET NULL to match the convention used by
-- invoices.settlement_type_id and pricing_rules.settlement_type_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_lists_settlement_type_id_fkey'
  ) THEN
    ALTER TABLE public.sale_lists
      ADD CONSTRAINT sale_lists_settlement_type_id_fkey
      FOREIGN KEY (settlement_type_id)
      REFERENCES public.settlement_types(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- Lightweight B-tree index for filter/joins.
CREATE INDEX IF NOT EXISTS idx_sale_lists_settlement_type_id
  ON public.sale_lists (settlement_type_id);