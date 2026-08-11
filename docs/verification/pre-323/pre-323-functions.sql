CREATE OR REPLACE FUNCTION public.audit_invoice_item_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

CREATE OR REPLACE FUNCTION public.create_waybill_for_invoice(p_invoice_id uuid, p_sender_name text, p_sender_phone text, p_receiver_name text, p_receiver_phone text, p_shipping_company text, p_destination_city text, p_customer_accounting_code text DEFAULT NULL::text, p_destination_address text DEFAULT NULL::text, p_shipping_notes text DEFAULT NULL::text, p_register boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_seq int;
  v_number text;
  v_waybill_id uuid;
  v_existing uuid;
  v_status text;
BEGIN
  IF NOT public.has_any_role(v_user, ARRAY['admin','manager','sales']::text[]) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_waybills_batch(p_invoice_id uuid, p_waybills jsonb, p_register boolean DEFAULT false)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT public.has_any_role(v_user, ARRAY['admin','manager','sales']::text[]) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_product_timeline(p_product_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(event_time timestamp with time zone, event_type text, actor_id uuid, actor_name text, description text, amount numeric, reference_id uuid, reference_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with events as (
    -- inquiries
    select
      i.created_at as event_time,
      'inquiry'::text as event_type,
      i.requested_by as actor_id,
      p.full_name as actor_name,
      'استعلام قیمت ثبت شد'::text as description,
      ir.price::numeric as amount,
      i.id as reference_id,
      'inquiry'::text as reference_type
    from inquiries i
    left join profiles p on p.id = i.requested_by
    left join lateral (
      select price
      from inquiry_replies
      where inquiry_id = i.id and is_valid = true
      order by created_at asc
      limit 1
    ) ir on true
    where i.product_id = p_product_id

    union all

    -- purchase_requests
    select
      pr.created_at,
      'purchase_request'::text,
      pr.requested_by,
      p.full_name,
      'درخواست خرید ثبت شد'::text,
      pr.final_price,
      pr.id,
      'purchase_request'::text
    from purchase_requests pr
    left join profiles p on p.id = pr.requested_by
    where pr.product_id = p_product_id

    union all

    -- documents (linked to inquiries on this product)
    select
      d.created_at,
      'document'::text,
      d.uploaded_by,
      p.full_name,
      case d.type
        when 'bijak' then 'بیجک آپلود شد'
        when 'invoice' then 'فاکتور آپلود شد'
        when 'havale' then 'حواله آپلود شد'
        else 'سند آپلود شد'
      end,
      null::numeric,
      d.id,
      'document'::text
    from documents d
    join inquiries i on i.id = d.reference_id
    left join profiles p on p.id = d.uploaded_by
    where d.reference_type = 'inquiry'
      and i.product_id = p_product_id

    union all

    -- documents linked directly to purchase_requests of this product
    select
      d.created_at,
      'document'::text,
      d.uploaded_by,
      p.full_name,
      case d.type
        when 'bijak' then 'بیجک آپلود شد'
        when 'invoice' then 'فاکتور آپلود شد'
        when 'havale' then 'حواله آپلود شد'
        else 'سند آپلود شد'
      end,
      null::numeric,
      d.id,
      'document'::text
    from documents d
    join purchase_requests pr on pr.id = d.reference_id
    left join profiles p on p.id = d.uploaded_by
    where d.reference_type = 'purchase_request'
      and pr.product_id = p_product_id

    union all

    -- delivery_receipts (linked via invoices->invoice_items->product)
    select distinct
      dr.created_at,
      'delivery_receipt'::text,
      dr.uploaded_by,
      p.full_name,
      case dr.type
        when 'shipping_receipt' then 'بیجک باربری آپلود شد'
        when 'delivery_receipt' then 'رسید تحویل ثبت شد'
        else 'رسید ثبت شد'
      end,
      null::numeric,
      dr.id,
      'delivery_receipt'::text
    from delivery_receipts dr
    join invoice_items ii on ii.invoice_id = dr.invoice_id
    left join profiles p on p.id = dr.uploaded_by
    where ii.product_id = p_product_id
  )
  select * from events
  order by event_time desc
  limit p_limit offset p_offset;
$function$
;

CREATE OR REPLACE FUNCTION public.update_waybill_status(p_waybill_id uuid, p_new_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_old text;
BEGIN
  IF NOT public.has_any_role(v_user, ARRAY['admin','manager','sales']::text[]) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.validate_invoice_item_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_bounds RECORD;
  v_product_name text;
  v_msg text;
BEGIN
  SELECT id, type, sale_price_type_id, customer_id
  INTO v_invoice
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  -- Only enforce on pre_invoice
  IF v_invoice.type IS DISTINCT FROM 'pre_invoice' THEN
    RETURN NEW;
  END IF;

  IF NEW.unit_price IS NULL OR NEW.unit_price <= 0 THEN
    RAISE EXCEPTION 'قیمت واحد ردیف معتبر نیست.' USING ERRCODE = 'P0001';
  END IF;

  SELECT name INTO v_product_name FROM public.products WHERE id = NEW.product_id;
  v_product_name := COALESCE(v_product_name, '—');

  SELECT * INTO v_bounds
  FROM public.get_product_price_bounds(NEW.product_id, v_invoice.sale_price_type_id);

  IF NOT v_bounds.has_any THEN
    v_msg := format('برای محصول «%s» هیچ قیمت فروشی ثبت نشده — ابتدا قیمت‌گذاری کنید.', v_product_name);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','no_price','product_id',NEW.product_id,'attempted',NEW.unit_price), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  IF NEW.unit_price < v_bounds.min_price THEN
    v_msg := format('قیمت ردیف «%s» (%s) از کمترین قیمت فروش ثبت‌شده (%s) کمتر است.',
      v_product_name, NEW.unit_price::text, v_bounds.min_price::text);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','below_min','product_id',NEW.product_id,
        'attempted',NEW.unit_price,'min',v_bounds.min_price,'max',v_bounds.max_price,
        'cap',v_bounds.cap_price,'selected',v_bounds.selected_price,
        'sale_price_type_id',v_invoice.sale_price_type_id), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  IF v_bounds.selected_price IS NOT NULL AND NEW.unit_price < v_bounds.selected_price THEN
    v_msg := format('قیمت ردیف «%s» (%s) از قیمت قانون نوع قیمت انتخاب‌شده (%s) کمتر است.',
      v_product_name, NEW.unit_price::text, v_bounds.selected_price::text);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','below_selected','product_id',NEW.product_id,
        'attempted',NEW.unit_price,'selected',v_bounds.selected_price,
        'sale_price_type_id',v_invoice.sale_price_type_id), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  IF NEW.unit_price > v_bounds.cap_price THEN
    v_msg := format('قیمت ردیف «%s» (%s) بیش از سقف مجاز (%s = ۱.۰۵×بالاترین قیمت) است.',
      v_product_name, NEW.unit_price::text, v_bounds.cap_price::text);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','above_cap','product_id',NEW.product_id,
        'attempted',NEW.unit_price,'cap',v_bounds.cap_price,'max',v_bounds.max_price), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$
;

