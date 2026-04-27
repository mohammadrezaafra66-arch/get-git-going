
-- Phase 6.1: Operational purchase entry
-- Extend purchases table with quick-entry fields (single-product purchases)

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS purchase_price numeric(18,2),
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS purchase_date date NOT NULL DEFAULT current_date;

-- currency check (toman/usd/aed) — allow null for legacy header rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchases_currency_check'
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_currency_check
      CHECK (currency IS NULL OR currency IN ('toman','usd','aed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchases_quantity_positive'
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_quantity_positive CHECK (quantity >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS purchases_product_id_idx     ON public.purchases(product_id);
CREATE INDEX IF NOT EXISTS purchases_supplier_id_idx    ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS purchases_created_by_idx     ON public.purchases(created_by);
CREATE INDEX IF NOT EXISTS purchases_purchase_date_idx  ON public.purchases(purchase_date DESC);

-- Audit log trigger for purchase creation
CREATE OR REPLACE FUNCTION public.audit_purchase_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff, created_at)
  VALUES (
    NEW.created_by,
    'purchase_created',
    'purchase',
    NEW.id::text,
    jsonb_build_object(
      'product_id',     NEW.product_id,
      'supplier_id',    NEW.supplier_id,
      'purchase_price', NEW.purchase_price,
      'currency',       NEW.currency,
      'quantity',       NEW.quantity,
      'purchase_date',  NEW.purchase_date
    ),
    now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchases_audit_insert ON public.purchases;
CREATE TRIGGER purchases_audit_insert
  AFTER INSERT ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_purchase_insert();
