-- ============== CUSTOMERS: extend ==============
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS customers_name_idx  ON public.customers (lower(name));
CREATE INDEX IF NOT EXISTS customers_phone_idx ON public.customers (phone);

-- ============== INVOICES: extend ==============
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'pre_invoice',
  ADD COLUMN IF NOT EXISTS sale_price_type_id uuid REFERENCES public.sale_price_types(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_type_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_type_check CHECK (type IN ('pre_invoice', 'invoice'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invoices_customer_id_idx ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS invoices_created_by_idx  ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS invoices_type_idx        ON public.invoices(type);
CREATE INDEX IF NOT EXISTS invoices_created_at_idx  ON public.invoices(created_at DESC);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_items_product_id_idx ON public.invoice_items(product_id);

-- ============== RPC: latest sale price ==============
CREATE OR REPLACE FUNCTION public.get_product_sale_price(
  _product_id uuid,
  _sale_price_type_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT new_sale_price
  FROM public.product_sale_price_history
  WHERE product_id = _product_id
    AND ( _sale_price_type_id IS NULL OR sale_price_type_id = _sale_price_type_id )
  ORDER BY created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_sale_price(uuid, uuid) TO authenticated;

-- ============== AUDIT: customers ==============
CREATE OR REPLACE FUNCTION public.audit_customer_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'customer_created', 'customer', NEW.id::text,
      jsonb_build_object('name', NEW.name, 'phone', NEW.phone, 'city', NEW.city), now());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'customer_updated', 'customer', NEW.id::text,
      jsonb_build_object(
        'name',  jsonb_build_object('old', OLD.name,  'new', NEW.name),
        'phone', jsonb_build_object('old', OLD.phone, 'new', NEW.phone),
        'city',  jsonb_build_object('old', OLD.city,  'new', NEW.city),
        'notes', jsonb_build_object('old', OLD.notes, 'new', NEW.notes),
        'is_active', jsonb_build_object('old', OLD.is_active, 'new', NEW.is_active)
      ), now());
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS customers_audit ON public.customers;
CREATE TRIGGER customers_audit
  AFTER INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.audit_customer_change();

-- ============== AUDIT: invoices ==============
CREATE OR REPLACE FUNCTION public.audit_invoice_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
  VALUES (
    COALESCE(NEW.created_by, auth.uid()),
    'invoice_created', 'invoice', NEW.id::text,
    jsonb_build_object(
      'customer_id',        NEW.customer_id,
      'type',               NEW.type,
      'sale_price_type_id', NEW.sale_price_type_id,
      'total_amount',       NEW.total_amount,
      'status',             NEW.status
    ),
    now()
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS invoices_audit_insert ON public.invoices;
CREATE TRIGGER invoices_audit_insert
  AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_invoice_insert();

-- ============== AUDIT: invoice_items ==============
CREATE OR REPLACE FUNCTION public.audit_invoice_item_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
  VALUES (
    auth.uid(),
    'invoice_item_added', 'invoice_item', NEW.id::text,
    jsonb_build_object(
      'invoice_id', NEW.invoice_id,
      'product_id', NEW.product_id,
      'quantity',   NEW.quantity,
      'unit_price', NEW.unit_price,
      'line_total', NEW.line_total
    ),
    now()
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS invoice_items_audit_insert ON public.invoice_items;
CREATE TRIGGER invoice_items_audit_insert
  AFTER INSERT ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_invoice_item_insert();