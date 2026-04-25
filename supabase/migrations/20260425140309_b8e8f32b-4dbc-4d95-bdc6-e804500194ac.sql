-- 1) sale_price_types table
create table if not exists public.sale_price_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sale_price_types_active on public.sale_price_types(is_active);
create index if not exists idx_sale_price_types_sort on public.sale_price_types(sort_order);

alter table public.sale_price_types enable row level security;

create policy "sale_price_types_read"
  on public.sale_price_types for select
  using (public.has_any_role(auth.uid(), array['admin'::app_role,'manager'::app_role,'accountant'::app_role]));

create policy "sale_price_types_write"
  on public.sale_price_types for all
  using (public.has_any_role(auth.uid(), array['admin'::app_role,'manager'::app_role]))
  with check (public.has_any_role(auth.uid(), array['admin'::app_role,'manager'::app_role]));

create trigger trg_sale_price_types_updated_at
  before update on public.sale_price_types
  for each row execute function public.set_updated_at();

-- 2) seed default sale price types
insert into public.sale_price_types (code, title, sort_order) values
  ('cash_price','نقدی',10),
  ('cheque_price','چکی',20),
  ('partner_price','همکار',30)
on conflict (code) do nothing;

-- 3) link pricing_rules -> sale_price_types
alter table public.pricing_rules
  add column if not exists sale_price_type_id uuid references public.sale_price_types(id) on delete set null;
create index if not exists idx_pricing_rules_sale_price_type on public.pricing_rules(sale_price_type_id);

-- 4) link product_sale_price_history -> sale_price_types
alter table public.product_sale_price_history
  add column if not exists sale_price_type_id uuid references public.sale_price_types(id) on delete set null;
create index if not exists idx_sale_history_sale_price_type on public.product_sale_price_history(sale_price_type_id);

-- 5) link price_calculation_snapshots -> sale_price_types
alter table public.price_calculation_snapshots
  add column if not exists sale_price_type_id uuid references public.sale_price_types(id) on delete set null;
create index if not exists idx_snapshots_sale_price_type on public.price_calculation_snapshots(sale_price_type_id);

-- 6) audit trigger for sale_price_types
create or replace function public.audit_sale_price_types()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'sale_price_types', new.id::text, 'sale_price_type_created',
      jsonb_build_object('code', new.code, 'title', new.title, 'sort_order', new.sort_order));
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.is_active is true and new.is_active is false) then
      insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      values (auth.uid(), 'sale_price_types', new.id::text, 'sale_price_type_disabled',
        jsonb_build_object('code', new.code, 'title', new.title));
    else
      insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      values (auth.uid(), 'sale_price_types', new.id::text, 'sale_price_type_updated',
        jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    end if;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_sale_price_types on public.sale_price_types;
create trigger trg_audit_sale_price_types
  after insert or update on public.sale_price_types
  for each row execute function public.audit_sale_price_types();