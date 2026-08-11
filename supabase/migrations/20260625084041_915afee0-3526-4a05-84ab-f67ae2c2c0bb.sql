create or replace function public.get_product_timeline(
  p_product_id uuid,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  event_time timestamptz,
  event_type text,
  actor_id uuid,
  actor_name text,
  description text,
  amount numeric,
  reference_id uuid,
  reference_type text
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.get_product_timeline(uuid, int, int) to authenticated;

create or replace function public.get_product_stats(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'inquiry_count_month', (
      select count(*) from inquiries
      where product_id = p_product_id
        and created_at >= date_trunc('month', current_date)
    ),
    'inquiry_count_total', (
      select count(*) from inquiries
      where product_id = p_product_id
    ),
    'avg_price', (
      select round(avg(ir.price)::numeric, 0)
      from inquiry_replies ir
      join inquiries i on i.id = ir.inquiry_id
      where i.product_id = p_product_id
        and ir.is_valid = true
    ),
    'last_price', (
      select ir.price
      from inquiry_replies ir
      join inquiries i on i.id = ir.inquiry_id
      where i.product_id = p_product_id
        and ir.is_valid = true
      order by ir.created_at desc
      limit 1
    ),
    'purchase_count', (
      select count(*) from purchase_requests
      where product_id = p_product_id
        and status in ('purchased', 'delivered')
    ),
    'last_purchase_date', (
      select created_at from purchase_requests
      where product_id = p_product_id
        and status in ('purchased', 'delivered')
      order by created_at desc
      limit 1
    )
  ) into v_result;
  return v_result;
end;
$$;

grant execute on function public.get_product_stats(uuid) to authenticated;