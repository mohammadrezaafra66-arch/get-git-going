-- F-6: Add responsible_id to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS responsible_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_responsible_id ON public.customers (responsible_id);

-- Audit trigger: log responsible_id changes
CREATE OR REPLACE FUNCTION public.log_customer_responsible_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.responsible_id::text,'') IS DISTINCT FROM COALESCE(NEW.responsible_id::text,'') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (
      auth.uid(),
      'customer',
      NEW.id::text,
      'customer_responsible_changed',
      jsonb_build_object(
        'customer_id', NEW.id,
        'old_responsible_id', OLD.responsible_id,
        'new_responsible_id', NEW.responsible_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_log_responsible ON public.customers;
CREATE TRIGGER trg_customers_log_responsible
AFTER UPDATE OF responsible_id ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.log_customer_responsible_change();

-- RLS: restrict 'sales' role to seeing only their own customers (assigned to them OR with no responsible).
-- Admins/managers/accountants/viewers continue to see all (existing policy "all authenticated read customers").
-- Add an additional restrictive layer is risky; instead we adjust the existing permissive read policy
-- by replacing it with role-aware logic.
DROP POLICY IF EXISTS "all authenticated read customers" ON public.customers;
CREATE POLICY "read customers by role" ON public.customers
FOR SELECT
TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'viewer'::app_role])
  OR (
    has_role(auth.uid(), 'sales'::app_role)
    AND (responsible_id = auth.uid() OR responsible_id IS NULL)
  )
);

-- Restrict 'sales' from setting responsible_id to anyone other than themselves (or NULL).
-- Replace the existing write policy with stricter WITH CHECK.
DROP POLICY IF EXISTS "sales manager admin write customers" ON public.customers;
CREATE POLICY "manage customers by role" ON public.customers
FOR ALL
TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])
  OR (
    has_role(auth.uid(), 'sales'::app_role)
    AND (responsible_id = auth.uid() OR responsible_id IS NULL)
  )
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])
  OR (
    has_role(auth.uid(), 'sales'::app_role)
    AND (responsible_id = auth.uid() OR responsible_id IS NULL)
  )
);