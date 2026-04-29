-- 1. waybills table
CREATE TABLE IF NOT EXISTS public.waybills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  waybill_number text NOT NULL UNIQUE,
  sender_name text NOT NULL CHECK (char_length(btrim(sender_name)) BETWEEN 2 AND 150),
  sender_phone text NOT NULL CHECK (char_length(btrim(sender_phone)) BETWEEN 4 AND 40),
  receiver_name text NOT NULL CHECK (char_length(btrim(receiver_name)) BETWEEN 2 AND 150),
  receiver_phone text NOT NULL CHECK (char_length(btrim(receiver_phone)) BETWEEN 4 AND 40),
  customer_accounting_code text,
  shipping_company text NOT NULL CHECK (char_length(btrim(shipping_company)) BETWEEN 1 AND 200),
  destination_city text NOT NULL CHECK (char_length(btrim(destination_city)) BETWEEN 1 AND 200),
  destination_address text,
  shipping_notes text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','registered','delivered_to_carrier','sent','delivered_to_customer','canceled')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waybills_invoice ON public.waybills(invoice_id);
CREATE INDEX IF NOT EXISTS idx_waybills_status ON public.waybills(status);

ALTER TABLE public.waybills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waybills_select ON public.waybills;
CREATE POLICY waybills_select ON public.waybills
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','sales','accountant','viewer']::app_role[]));

DROP POLICY IF EXISTS waybills_write ON public.waybills;
CREATE POLICY waybills_write ON public.waybills
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::app_role[]));

-- 2. waybill_items
CREATE TABLE IF NOT EXISTS public.waybill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waybill_id uuid NOT NULL REFERENCES public.waybills(id) ON DELETE CASCADE,
  invoice_item_id uuid NOT NULL REFERENCES public.invoice_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (waybill_id, invoice_item_id)
);

CREATE INDEX IF NOT EXISTS idx_waybill_items_waybill ON public.waybill_items(waybill_id);
CREATE INDEX IF NOT EXISTS idx_waybill_items_invoice_item ON public.waybill_items(invoice_item_id);

ALTER TABLE public.waybill_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waybill_items_select ON public.waybill_items;
CREATE POLICY waybill_items_select ON public.waybill_items
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','sales','accountant','viewer']::app_role[]));

DROP POLICY IF EXISTS waybill_items_write ON public.waybill_items;
CREATE POLICY waybill_items_write ON public.waybill_items
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::app_role[]));

-- 3. Counter for daily sequential numbers
CREATE TABLE IF NOT EXISTS public.waybill_number_counter (
  day date PRIMARY KEY,
  last_value int NOT NULL DEFAULT 0
);

ALTER TABLE public.waybill_number_counter ENABLE ROW LEVEL SECURITY;
-- No policies; only SECURITY DEFINER functions touch it.

-- 4. RPC: create waybill for invoice (transactional)
CREATE OR REPLACE FUNCTION public.create_waybill_for_invoice(
  p_invoice_id uuid,
  p_sender_name text,
  p_sender_phone text,
  p_receiver_name text,
  p_receiver_phone text,
  p_shipping_company text,
  p_destination_city text,
  p_customer_accounting_code text DEFAULT NULL,
  p_destination_address text DEFAULT NULL,
  p_shipping_notes text DEFAULT NULL,
  p_register boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_seq int;
  v_number text;
  v_waybill_id uuid;
  v_existing uuid;
  v_status text;
BEGIN
  IF NOT public.has_any_role(v_user, ARRAY['admin','manager','sales']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = p_invoice_id) THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  SELECT id INTO v_existing FROM public.waybills
    WHERE invoice_id = p_invoice_id AND status <> 'canceled' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'a waybill already exists for this invoice';
  END IF;

  -- Get next sequence for today
  INSERT INTO public.waybill_number_counter(day, last_value)
    VALUES (v_today, 1)
    ON CONFLICT (day) DO UPDATE SET last_value = waybill_number_counter.last_value + 1
    RETURNING last_value INTO v_seq;

  v_number := 'WB-' || to_char(v_today, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  v_status := CASE WHEN p_register THEN 'registered' ELSE 'draft' END;

  INSERT INTO public.waybills (
    invoice_id, waybill_number, sender_name, sender_phone,
    receiver_name, receiver_phone, customer_accounting_code,
    shipping_company, destination_city, destination_address,
    shipping_notes, status, created_by
  ) VALUES (
    p_invoice_id, v_number,
    btrim(p_sender_name), btrim(p_sender_phone),
    btrim(p_receiver_name), btrim(p_receiver_phone),
    NULLIF(btrim(p_customer_accounting_code), ''),
    btrim(p_shipping_company), btrim(p_destination_city),
    NULLIF(btrim(p_destination_address), ''),
    NULLIF(btrim(p_shipping_notes), ''),
    v_status, v_user
  )
  RETURNING id INTO v_waybill_id;

  -- Copy all invoice items
  INSERT INTO public.waybill_items (waybill_id, invoice_item_id, product_id, quantity)
  SELECT v_waybill_id, ii.id, ii.product_id, ii.quantity
  FROM public.invoice_items ii
  WHERE ii.invoice_id = p_invoice_id;

  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  VALUES ('waybill', v_waybill_id::text, 'waybill_created', v_user,
          jsonb_build_object('invoice_id', p_invoice_id, 'waybill_number', v_number, 'status', v_status));

  RETURN v_waybill_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_waybill_for_invoice(uuid,text,text,text,text,text,text,text,text,text,boolean) TO authenticated;

-- 5. RPC: update waybill status
CREATE OR REPLACE FUNCTION public.update_waybill_status(p_waybill_id uuid, p_new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_old text;
BEGIN
  IF NOT public.has_any_role(v_user, ARRAY['admin','manager','sales']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_new_status NOT IN ('draft','registered','delivered_to_carrier','sent','delivered_to_customer','canceled') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  SELECT status INTO v_old FROM public.waybills WHERE id = p_waybill_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'waybill not found'; END IF;
  IF v_old = p_new_status THEN RETURN; END IF;

  UPDATE public.waybills SET status = p_new_status, updated_at = now() WHERE id = p_waybill_id;

  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  VALUES ('waybill', p_waybill_id::text, 'waybill_status_changed', v_user,
          jsonb_build_object('old_status', v_old, 'new_status', p_new_status));
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_waybill_status(uuid, text) TO authenticated;