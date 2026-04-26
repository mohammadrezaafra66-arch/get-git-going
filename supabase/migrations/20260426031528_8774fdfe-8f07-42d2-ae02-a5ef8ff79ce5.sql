-- enums
do $$ begin
  create type public.stock_alert_status as enum ('open','contacted','closed','canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stock_alert_priority as enum ('low','normal','high');
exception when duplicate_object then null; end $$;

-- table
create table if not exists public.stock_alert_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  customer_name text not null,
  customer_phone text not null,
  salesperson_id uuid,
  note text,
  status public.stock_alert_status not null default 'open',
  priority public.stock_alert_priority not null default 'normal',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_alert_requests_name_len check (char_length(btrim(customer_name)) >= 2 and char_length(customer_name) <= 200),
  constraint stock_alert_requests_phone_len check (char_length(btrim(customer_phone)) >= 4 and char_length(customer_phone) <= 40),
  constraint stock_alert_requests_note_len check (note is null or char_length(note) <= 500)
);

-- indexes
create index if not exists idx_stock_alert_requests_product on public.stock_alert_requests(product_id);
create index if not exists idx_stock_alert_requests_status on public.stock_alert_requests(status);
create index if not exists idx_stock_alert_requests_salesperson on public.stock_alert_requests(salesperson_id);
create index if not exists idx_stock_alert_requests_requested_at on public.stock_alert_requests(requested_at desc);
create index if not exists idx_stock_alert_requests_phone on public.stock_alert_requests(customer_phone);

-- prevent duplicate OPEN request for same (product, phone)
create unique index if not exists uq_stock_alert_open_per_product_phone
  on public.stock_alert_requests(product_id, customer_phone)
  where status = 'open';

-- updated_at trigger
drop trigger if exists trg_stock_alert_requests_set_updated_at on public.stock_alert_requests;
create trigger trg_stock_alert_requests_set_updated_at
before update on public.stock_alert_requests
for each row execute function public.set_updated_at();

-- audit trigger
create or replace function public.audit_stock_alert_requests()
returns trigger language plpgsql security definer set search_path = public as $$
declare _sku text;
begin
  if (tg_op = 'INSERT') then
    select sku into _sku from public.products where id = new.product_id;
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'stock_alert_requests', new.id::text, 'stock_alert_created',
      jsonb_build_object(
        'product_id', new.product_id,
        'sku', _sku,
        'customer_name', new.customer_name,
        'customer_phone', new.customer_phone,
        'salesperson_id', new.salesperson_id,
        'priority', new.priority
      ));
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.status is distinct from new.status) then
      insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      values (auth.uid(), 'stock_alert_requests', new.id::text, 'stock_alert_status_changed',
        jsonb_build_object(
          'old_status', old.status,
          'new_status', new.status,
          'resolved_by', new.resolved_by,
          'resolved_at', new.resolved_at
        ));
    end if;
    return new;
  end if;
  return null;
end; $$;

drop trigger if exists trg_audit_stock_alert_requests on public.stock_alert_requests;
create trigger trg_audit_stock_alert_requests
after insert or update on public.stock_alert_requests
for each row execute function public.audit_stock_alert_requests();

-- auto-set resolved_at/resolved_by when status moves to closed/canceled
create or replace function public.stock_alert_set_resolved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    if new.status in ('closed','canceled') then
      new.resolved_at := coalesce(new.resolved_at, now());
      new.resolved_by := coalesce(new.resolved_by, auth.uid());
    elsif new.status in ('open','contacted') then
      new.resolved_at := null;
      new.resolved_by := null;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_stock_alert_set_resolved on public.stock_alert_requests;
create trigger trg_stock_alert_set_resolved
before update on public.stock_alert_requests
for each row execute function public.stock_alert_set_resolved();

-- RLS
alter table public.stock_alert_requests enable row level security;

drop policy if exists "stock_alert_select" on public.stock_alert_requests;
create policy "stock_alert_select" on public.stock_alert_requests
for select using (
  public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[])
  or (public.has_role(auth.uid(), 'sales'::app_role) and salesperson_id = auth.uid())
);

drop policy if exists "stock_alert_insert" on public.stock_alert_requests;
create policy "stock_alert_insert" on public.stock_alert_requests
for insert with check (
  public.has_any_role(auth.uid(), array['admin','manager','accountant','sales']::app_role[])
  and salesperson_id = auth.uid()
);

drop policy if exists "stock_alert_update_privileged" on public.stock_alert_requests;
create policy "stock_alert_update_privileged" on public.stock_alert_requests
for update using (
  public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[])
) with check (
  public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[])
);

drop policy if exists "stock_alert_update_sales_own" on public.stock_alert_requests;
create policy "stock_alert_update_sales_own" on public.stock_alert_requests
for update using (
  public.has_role(auth.uid(), 'sales'::app_role) and salesperson_id = auth.uid()
) with check (
  public.has_role(auth.uid(), 'sales'::app_role) and salesperson_id = auth.uid()
  and status in ('open','contacted','canceled')
);
