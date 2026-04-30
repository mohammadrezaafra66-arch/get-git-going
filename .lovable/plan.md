
## H-7 — Promotion Suggestion Engine

### Scope (strict)

- No new tables.
- One batched migration: a Postgres RPC `compute_promotion_scores()` and a regular SQL view `v_promotion_suggestions`. (Regular view, not materialized — avoids a refresh job and keeps it simple. The RPC stays available for filtered/parametrized calls.)
- One new page `_app.marketing.suggestions.tsx`.
- Nav entry visible only to `admin`, `manager`, `accountant`.
- "Mark as used" writes a row to `audit_logs` only.

### Data sources reused

| Concept | Source |
|---|---|
| label_weight_sum (per product) | `product_label_links` join `product_labels.weight` (sum, internal labels included for admin/manager/accountant — same audience as the page) |
| channel_weight | `marketing_channels.weight` (only `is_active = true`) |
| stock_factor | `products.stock_status` mapped: `available`=1.0, `limited`=0.6, `unknown`=0.4, `unavailable`=0.0 |
| recency_factor | sales velocity in last 90 days from `invoice_items` join `invoices(issue_date, status<>'cancelled')`: `qty_90d`. Factor = `1 + ln(1 + qty_90d) / 5` (capped at 3.0). Products with no sales get 1.0. |

Final score: `label_weight_sum * channel_weight * stock_factor * recency_factor`.
Products with score = 0 (no labels, or unavailable stock, or no active channel) are excluded.

### Migration (single file)

```sql
-- 1. View: cross-product of (active products) x (active channels) with computed score.
create or replace view public.v_promotion_suggestions as
with label_sums as (
  select pll.product_id, coalesce(sum(pl.weight), 0)::numeric as label_weight_sum
  from public.product_label_links pll
  join public.product_labels pl on pl.id = pll.label_id and pl.is_active = true
  group by pll.product_id
),
sales_90d as (
  select ii.product_id, coalesce(sum(ii.quantity), 0)::numeric as qty_90d
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where i.issue_date >= (current_date - interval '90 days')
    and coalesce(i.status, '') <> 'cancelled'
  group by ii.product_id
)
select
  p.id as product_id,
  p.name as product_name,
  p.sku,
  p.stock_status,
  mc.id as channel_id,
  mc.name as channel_name,
  coalesce(ls.label_weight_sum, 0) as label_weight_sum,
  mc.weight as channel_weight,
  case p.stock_status
    when 'available' then 1.0 when 'limited' then 0.6
    when 'unknown' then 0.4 else 0.0 end as stock_factor,
  least(3.0, 1 + ln(1 + coalesce(s90.qty_90d, 0)) / 5)::numeric as recency_factor,
  (coalesce(ls.label_weight_sum,0)
    * mc.weight
    * (case p.stock_status when 'available' then 1.0 when 'limited' then 0.6 when 'unknown' then 0.4 else 0.0 end)
    * least(3.0, 1 + ln(1 + coalesce(s90.qty_90d, 0)) / 5)
  )::numeric as score,
  coalesce(s90.qty_90d, 0) as qty_90d
from public.products p
cross join public.marketing_channels mc
left join label_sums ls on ls.product_id = p.id
left join sales_90d s90 on s90.product_id = p.id
where p.is_active = true and mc.is_active = true;

-- RLS for the view: granted via underlying tables. Restrict with security_invoker.
alter view public.v_promotion_suggestions set (security_invoker = true);

-- 2. RPC with filters (used by the page).
create or replace function public.compute_promotion_scores(
  _channel_id uuid default null,
  _min_score numeric default 0,
  _limit int default 200
)
returns setof public.v_promotion_suggestions
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.v_promotion_suggestions
  where score > 0
    and (_channel_id is null or channel_id = _channel_id)
    and score >= coalesce(_min_score, 0)
  order by score desc
  limit greatest(_limit, 1);
$$;

-- 3. Restrict execution to the audience.
revoke all on function public.compute_promotion_scores(uuid, numeric, int) from public, anon;
grant execute on function public.compute_promotion_scores(uuid, numeric, int) to authenticated;
```

Notes:
- `security_invoker = true` makes the view honor the caller's RLS on `products` / `invoice_items` / `invoices` / `marketing_channels` / `product_labels` (all already restricted appropriately).
- No realtime, no triggers, no new tables.

### Frontend — `src/routes/_app.marketing.suggestions.tsx`

- Route guard via existing `RoleGuard` (`admin`, `manager`, `accountant`); fallback to `/unauthorized`.
- Filters bar (matches existing FiltersBar/Select pattern):
  - Channel: `<Select>` populated from `marketing_channels` (active only) + "همه کانال‌ها".
  - Minimum score: numeric input, default `0`, debounced 400ms.
  - Limit: fixed at 200 (no UI control).
- Data fetched with TanStack Query: `supabase.rpc('compute_promotion_scores', { _channel_id, _min_score, _limit: 200 })`. `staleTime: 30s`.
- Table columns (using existing `Table` primitives, RTL):
  - محصول (name + SKU)
  - کانال
  - وزن برچسب‌ها
  - وزن کانال
  - موجودی (badge from `stock_status`)
  - فروش ۹۰ روز
  - امتیاز (rounded to 2 decimals, bold)
  - عمل: «ثبت به‌عنوان استفاده‌شده»
- "Mark as used" handler:
  ```ts
  await supabase.from('audit_logs').insert({
    actor_id: user.id,
    entity_type: 'promotion_suggestion',
    entity_id: `${product_id}:${channel_id}`,
    action: 'promotion_suggestion_used',
    diff: { product_id, channel_id, score, channel_name, product_name } as never,
  });
  ```
  Show a toast on success; row stays visible (no client-side hide — keeps logic trivial).
- Empty state, loading skeleton, error fallback follow patterns from `_app.admin.marketing-channels.tsx`.
- No charts. No realtime.

### Navigation

In `src/components/layout/nav-items.ts` add one entry:
```ts
{ to: "/marketing/suggestions", label: "پیشنهادهای تبلیغاتی", icon: Megaphone, module: "reports", group: "operations" },
```
Visibility relies on existing `RoleGuard` inside the page; since `module: "reports"` is broadly visible, the page itself enforces the admin/manager/accountant restriction.

### Files touched

- **Created**: `supabase/migrations/<ts>_h7_promotion_suggestions.sql` (view + RPC + grants)
- **Created**: `src/routes/_app.marketing.suggestions.tsx`
- **Edited**: `src/components/layout/nav-items.ts` (one new line)

No edits to `types.ts` needed by hand — it regenerates from the migration. No edits to `routeTree.gen.ts` needed by hand — TanStack plugin regenerates.

### Out of scope (explicit)

- No new tables, no `promotion_uses` table.
- No materialized view / cron refresh.
- No edge functions.
- No realtime subscription.
- No charts / analytics dashboard.
- No bulk actions, no export.
- H-8, H-9, H-10 deferred.

### After implementation

I will stop and post a short summary listing: migration file, route file, nav line, and the score formula encoded in SQL.
