-- Auto-generate SKU for products in format AFK-YYYY-NNNNN
-- 1) Create a per-year sequence table to ensure uniqueness even under concurrency
create table if not exists public.product_sku_counters (
  year integer primary key,
  last_value integer not null default 0,
  updated_at timestamp with time zone not null default now()
);

alter table public.product_sku_counters enable row level security;

-- No client access; only SECURITY DEFINER functions touch this table.
-- (Intentionally no policies => deny by default for anon/authenticated.)

-- 2) Function to atomically allocate next SKU for a given year
create or replace function public.next_product_sku(_year integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _next integer;
  _sku text;
begin
  insert into public.product_sku_counters (year, last_value, updated_at)
  values (_year, 1, now())
  on conflict (year) do update
    set last_value = public.product_sku_counters.last_value + 1,
        updated_at = now()
  returning last_value into _next;

  _sku := 'AFK-' || _year::text || '-' || lpad(_next::text, 5, '0');
  return _sku;
end;
$$;

-- 3) Trigger function: assign sku on INSERT if NULL/empty; prevent changes on UPDATE
create or replace function public.products_assign_sku()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _year integer := extract(year from coalesce(new.created_at, now()))::integer;
  _attempts integer := 0;
begin
  if (tg_op = 'INSERT') then
    if new.sku is null or btrim(new.sku) = '' then
      loop
        new.sku := public.next_product_sku(_year);
        exit when not exists (select 1 from public.products where sku = new.sku);
        _attempts := _attempts + 1;
        if _attempts > 5 then
          raise exception 'could not allocate unique sku after % attempts', _attempts;
        end if;
      end loop;
    end if;
  elsif (tg_op = 'UPDATE') then
    -- Make SKU immutable
    if new.sku is distinct from old.sku then
      new.sku := old.sku;
    end if;
  end if;
  return new;
end;
$$;

-- 4) Drop existing triggers if any, recreate in correct order
drop trigger if exists trg_products_assign_sku on public.products;
create trigger trg_products_assign_sku
before insert or update on public.products
for each row execute function public.products_assign_sku();

-- 5) Backfill any existing NULL/empty SKUs
do $$
declare
  r record;
  _year integer;
begin
  for r in select id, created_at from public.products where sku is null or btrim(sku) = '' order by created_at loop
    _year := extract(year from coalesce(r.created_at, now()))::integer;
    update public.products set sku = public.next_product_sku(_year) where id = r.id;
  end loop;
end $$;

-- 6) Add unique constraint on sku (only if not present)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_sku_unique'
  ) then
    alter table public.products add constraint products_sku_unique unique (sku);
  end if;
end $$;
