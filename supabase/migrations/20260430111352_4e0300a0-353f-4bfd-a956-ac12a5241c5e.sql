-- H-7: Promotion Suggestion Engine
-- View aggregating label weights, channel weights, stock status, and 90d sales velocity.
create or replace view public.v_promotion_suggestions as
with label_sums as (
  select pll.product_id,
         coalesce(sum(pl.weight), 0)::numeric as label_weight_sum
  from public.product_label_links pll
  join public.product_labels pl on pl.id = pll.label_id and pl.is_active = true
  group by pll.product_id
),
sales_90d as (
  select ii.product_id,
         coalesce(sum(ii.quantity), 0)::numeric as qty_90d
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where i.issue_date >= (current_date - interval '90 days')
    and coalesce(i.status, '') <> 'cancelled'
  group by ii.product_id
)
select
  p.id           as product_id,
  p.name         as product_name,
  p.sku          as sku,
  p.stock_status as stock_status,
  mc.id          as channel_id,
  mc.name        as channel_name,
  coalesce(ls.label_weight_sum, 0)::numeric as label_weight_sum,
  mc.weight::numeric as channel_weight,
  (case p.stock_status::text
     when 'available'   then 1.0
     when 'limited'     then 0.6
     when 'unknown'     then 0.4
     else 0.0
   end)::numeric as stock_factor,
  least(3.0, 1 + ln(1 + coalesce(s90.qty_90d, 0)) / 5)::numeric as recency_factor,
  (
    coalesce(ls.label_weight_sum, 0)
    * mc.weight
    * (case p.stock_status::text
         when 'available' then 1.0
         when 'limited'   then 0.6
         when 'unknown'   then 0.4
         else 0.0
       end)
    * least(3.0, 1 + ln(1 + coalesce(s90.qty_90d, 0)) / 5)
  )::numeric as score,
  coalesce(s90.qty_90d, 0)::numeric as qty_90d
from public.products p
cross join public.marketing_channels mc
left join label_sums ls on ls.product_id = p.id
left join sales_90d  s90 on s90.product_id = p.id
where p.is_active = true
  and mc.is_active = true;

alter view public.v_promotion_suggestions set (security_invoker = true);

-- RPC: filtered, sorted access for the page.
create or replace function public.compute_promotion_scores(
  _channel_id uuid default null,
  _min_score  numeric default 0,
  _limit      int default 200
)
returns setof public.v_promotion_suggestions
language sql
stable
security invoker
set search_path = public
as $$
  select *
  from public.v_promotion_suggestions
  where score > 0
    and (_channel_id is null or channel_id = _channel_id)
    and score >= coalesce(_min_score, 0)
  order by score desc
  limit greatest(coalesce(_limit, 200), 1);
$$;

revoke all on function public.compute_promotion_scores(uuid, numeric, int) from public, anon;
grant execute on function public.compute_promotion_scores(uuid, numeric, int) to authenticated;