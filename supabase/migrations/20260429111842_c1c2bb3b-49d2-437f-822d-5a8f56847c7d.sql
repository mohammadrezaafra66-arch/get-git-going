-- Add missing sort_order column
ALTER TABLE public.settlement_types
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill sort_order for existing rows
UPDATE public.settlement_types SET sort_order = 10 WHERE code = 'cash' AND sort_order = 0;
UPDATE public.settlement_types SET sort_order = 40 WHERE code = 'credit' AND sort_order = 0;
UPDATE public.settlement_types SET sort_order = 50 WHERE code = 'short_term' AND sort_order = 0;

-- Seed missing default rows (cheque, partner) — preserve any existing IDs
INSERT INTO public.settlement_types (code, title, description, sort_order)
VALUES
  ('cheque', 'چکی', 'پرداخت با چک', 20),
  ('partner', 'همکار', 'تسویه با همکار', 30)
ON CONFLICT (code) DO NOTHING;

-- Index for filtered listing
CREATE INDEX IF NOT EXISTS settlement_types_active_sort_idx
  ON public.settlement_types(is_active, sort_order);

-- Audit trigger function
CREATE OR REPLACE FUNCTION public.audit_settlement_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'settlement_types', NEW.id::text, 'insert', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'settlement_types', NEW.id::text, 'update',
      jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'settlement_types', OLD.id::text, 'delete', to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS settlement_types_audit ON public.settlement_types;
CREATE TRIGGER settlement_types_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.settlement_types
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_settlement_types();