-- 1. waybill_custom_fields table
CREATE TABLE IF NOT EXISTS public.waybill_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL UNIQUE,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','date','select')),
  field_options jsonb,
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waybill_custom_fields_key_format CHECK (field_key ~ '^[a-z][a-z0-9_]{0,29}$'),
  CONSTRAINT waybill_custom_fields_label_len CHECK (char_length(field_label) BETWEEN 1 AND 100)
);

ALTER TABLE public.waybill_custom_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wcf_select_authed ON public.waybill_custom_fields;
CREATE POLICY wcf_select_authed
  ON public.waybill_custom_fields FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS wcf_write_admin_accountant ON public.waybill_custom_fields;
CREATE POLICY wcf_write_admin_accountant
  ON public.waybill_custom_fields FOR ALL
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]));

DROP TRIGGER IF EXISTS trg_wcf_updated_at ON public.waybill_custom_fields;
CREATE TRIGGER trg_wcf_updated_at
  BEFORE UPDATE ON public.waybill_custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_wcf_active_sort ON public.waybill_custom_fields(is_active, sort_order);

-- 2. custom_data on waybills
ALTER TABLE public.waybills
  ADD COLUMN IF NOT EXISTS custom_data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. RPC: batch create waybills
CREATE OR REPLACE FUNCTION public.create_waybills_batch(
  p_invoice_id uuid,
  p_waybills jsonb,
  p_register boolean DEFAULT false
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_seq int;
  v_number text;
  v_status text;
  v_waybill_id uuid;
  v_ids uuid[] := '{}';
  v_w jsonb;
  v_item jsonb;
  v_existing uuid;
  v_total_qty numeric;
  v_invoice_qty numeric;
  v_rec record;
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

  IF jsonb_typeof(p_waybills) <> 'array' OR jsonb_array_length(p_waybills) = 0 THEN
    RAISE EXCEPTION 'no waybills provided';
  END IF;

  FOR v_rec IN
    SELECT (it->>'invoice_item_id')::uuid AS invoice_item_id,
           SUM((it->>'quantity')::numeric) AS total_qty
    FROM jsonb_array_elements(p_waybills) w
    CROSS JOIN LATERAL jsonb_array_elements(w->'items') it
    GROUP BY (it->>'invoice_item_id')::uuid
  LOOP
    SELECT quantity INTO v_invoice_qty FROM public.invoice_items
      WHERE id = v_rec.invoice_item_id AND invoice_id = p_invoice_id;
    IF v_invoice_qty IS NULL THEN
      RAISE EXCEPTION 'invoice item % not found in invoice', v_rec.invoice_item_id;
    END IF;
    IF v_rec.total_qty <> v_invoice_qty THEN
      RAISE EXCEPTION 'sum of split quantity (%) does not match invoice item quantity (%) for item %',
        v_rec.total_qty, v_invoice_qty, v_rec.invoice_item_id;
    END IF;
  END LOOP;

  v_status := CASE WHEN p_register THEN 'registered' ELSE 'draft' END;

  FOR v_w IN SELECT * FROM jsonb_array_elements(p_waybills) LOOP
    INSERT INTO public.waybill_number_counter(day, last_value)
      VALUES (v_today, 1)
      ON CONFLICT (day) DO UPDATE SET last_value = waybill_number_counter.last_value + 1
      RETURNING last_value INTO v_seq;

    v_number := 'WB-' || to_char(v_today, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');

    INSERT INTO public.waybills (
      invoice_id, waybill_number, sender_name, sender_phone,
      receiver_name, receiver_phone, customer_accounting_code,
      shipping_company, destination_city, destination_address,
      shipping_notes, status, created_by, custom_data
    ) VALUES (
      p_invoice_id, v_number,
      btrim(v_w->>'sender_name'), btrim(v_w->>'sender_phone'),
      btrim(v_w->>'receiver_name'), btrim(v_w->>'receiver_phone'),
      NULLIF(btrim(coalesce(v_w->>'customer_accounting_code','')), ''),
      btrim(v_w->>'shipping_company'), btrim(v_w->>'destination_city'),
      NULLIF(btrim(coalesce(v_w->>'destination_address','')), ''),
      NULLIF(btrim(coalesce(v_w->>'shipping_notes','')), ''),
      v_status, v_user,
      coalesce(v_w->'custom_data', '{}'::jsonb)
    )
    RETURNING id INTO v_waybill_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_w->'items') LOOP
      v_total_qty := (v_item->>'quantity')::numeric;
      IF v_total_qty IS NULL OR v_total_qty <= 0 THEN CONTINUE; END IF;
      INSERT INTO public.waybill_items (waybill_id, invoice_item_id, product_id, quantity)
      VALUES (
        v_waybill_id,
        (v_item->>'invoice_item_id')::uuid,
        (v_item->>'product_id')::uuid,
        v_total_qty
      );
    END LOOP;

    v_ids := array_append(v_ids, v_waybill_id);
  END LOOP;

  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  VALUES ('waybill', p_invoice_id::text, 'waybill_batch_created', v_user,
          jsonb_build_object('invoice_id', p_invoice_id, 'waybill_ids', to_jsonb(v_ids), 'count', array_length(v_ids,1)));

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.create_waybills_batch(uuid, jsonb, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_waybills_batch(uuid, jsonb, boolean) TO authenticated;
