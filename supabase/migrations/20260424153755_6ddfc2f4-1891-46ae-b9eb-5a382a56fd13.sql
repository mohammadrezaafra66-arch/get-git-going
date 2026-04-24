
-- =========================================================
-- Phase 1: Products module — full schema
-- =========================================================

-- 1) Enums
do $$ begin
  create type public.product_type as enum ('iranian', 'foreign');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.base_currency as enum ('toman', 'usd', 'aed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stock_status as enum ('available', 'unavailable', 'limited', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.product_status as enum ('active', 'inactive', 'discontinued');
exception when duplicate_object then null; end $$;

-- =========================================================
-- 2) brands
-- =========================================================
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brands_name_idx on public.brands (name);
create index if not exists brands_active_idx on public.brands (is_active);

alter table public.brands enable row level security;

drop policy if exists "all authenticated read brands" on public.brands;
create policy "all authenticated read brands" on public.brands
  for select using (auth.role() = 'authenticated');

drop policy if exists "manager admin write brands" on public.brands;
create policy "manager admin write brands" on public.brands
  for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));

drop trigger if exists brands_set_updated_at on public.brands;
create trigger brands_set_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

-- =========================================================
-- 3) categories (with parent_id)
-- =========================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid references public.categories(id) on delete set null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists categories_parent_idx on public.categories (parent_id);
create index if not exists categories_name_idx on public.categories (name);

alter table public.categories enable row level security;

drop policy if exists "all authenticated read categories" on public.categories;
create policy "all authenticated read categories" on public.categories
  for select using (auth.role() = 'authenticated');

drop policy if exists "manager admin write categories" on public.categories;
create policy "manager admin write categories" on public.categories
  for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- =========================================================
-- 4) product_labels
-- =========================================================
create table if not exists public.product_labels (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  color text not null default '#0ea5e9',
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_labels_active_idx on public.product_labels (is_active);

alter table public.product_labels enable row level security;

drop policy if exists "all authenticated read product_labels" on public.product_labels;
create policy "all authenticated read product_labels" on public.product_labels
  for select using (auth.role() = 'authenticated');

drop policy if exists "manager admin write product_labels" on public.product_labels;
create policy "manager admin write product_labels" on public.product_labels
  for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));

drop trigger if exists product_labels_set_updated_at on public.product_labels;
create trigger product_labels_set_updated_at before update on public.product_labels
  for each row execute function public.set_updated_at();

-- =========================================================
-- 5) products — extend existing table
-- =========================================================
alter table public.products
  add column if not exists brand_id uuid references public.brands(id) on delete set null,
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists product_type public.product_type not null default 'iranian',
  add column if not exists base_currency public.base_currency not null default 'toman',
  add column if not exists stock_status public.stock_status not null default 'unknown',
  add column if not exists status public.product_status not null default 'active',
  add column if not exists technical_notes text,
  add column if not exists updated_by uuid;

create index if not exists products_brand_idx on public.products (brand_id);
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_status_idx on public.products (status);
create index if not exists products_stock_idx on public.products (stock_status);
create index if not exists products_type_idx on public.products (product_type);
create index if not exists products_name_idx on public.products (name);
create index if not exists products_sku_idx on public.products (sku);

-- ensure trigger for updated_at
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- =========================================================
-- 6) product_label_links (m2m)
-- =========================================================
create table if not exists public.product_label_links (
  product_id uuid not null references public.products(id) on delete cascade,
  label_id uuid not null references public.product_labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, label_id)
);
create index if not exists product_label_links_label_idx on public.product_label_links (label_id);

alter table public.product_label_links enable row level security;

drop policy if exists "all authenticated read product_label_links" on public.product_label_links;
create policy "all authenticated read product_label_links" on public.product_label_links
  for select using (auth.role() = 'authenticated');

drop policy if exists "manager admin write product_label_links" on public.product_label_links;
create policy "manager admin write product_label_links" on public.product_label_links
  for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));

-- =========================================================
-- 7) product_owner_assignments
-- =========================================================
create table if not exists public.product_owner_assignments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null,
  assigned_by uuid,
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index if not exists product_owner_product_idx on public.product_owner_assignments (product_id);
create index if not exists product_owner_user_idx on public.product_owner_assignments (user_id);

alter table public.product_owner_assignments enable row level security;

drop policy if exists "all authenticated read product_owners" on public.product_owner_assignments;
create policy "all authenticated read product_owners" on public.product_owner_assignments
  for select using (auth.role() = 'authenticated');

drop policy if exists "manager admin write product_owners" on public.product_owner_assignments;
create policy "manager admin write product_owners" on public.product_owner_assignments
  for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));

-- =========================================================
-- 8) Audit triggers for products
-- =========================================================
create or replace function public.audit_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'products', new.id::text, 'product_created',
            jsonb_build_object('name', new.name, 'sku', new.sku, 'status', new.status));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'products', new.id::text, 'product_updated',
            jsonb_build_object(
              'old', to_jsonb(old) - 'created_at' - 'updated_at',
              'new', to_jsonb(new) - 'created_at' - 'updated_at'
            ));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'products', old.id::text, 'product_deleted',
            jsonb_build_object('name', old.name, 'sku', old.sku));
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists products_audit on public.products;
create trigger products_audit
  after insert or update or delete on public.products
  for each row execute function public.audit_products();

-- Audit for owner assignments
create or replace function public.audit_product_owners()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'product_owner_assignments', new.product_id::text, 'product_owner_assigned',
            jsonb_build_object('user_id', new.user_id, 'assigned_by', new.assigned_by));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'product_owner_assignments', old.product_id::text, 'product_owner_revoked',
            jsonb_build_object('user_id', old.user_id));
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists product_owners_audit on public.product_owner_assignments;
create trigger product_owners_audit
  after insert or delete on public.product_owner_assignments
  for each row execute function public.audit_product_owners();

-- Audit for label links (لاگ سبک‌تر)
create or replace function public.audit_product_label_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'product_label_links', new.product_id::text, 'product_label_added',
            jsonb_build_object('label_id', new.label_id));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'product_label_links', old.product_id::text, 'product_label_removed',
            jsonb_build_object('label_id', old.label_id));
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists product_label_links_audit on public.product_label_links;
create trigger product_label_links_audit
  after insert or delete on public.product_label_links
  for each row execute function public.audit_product_label_links();

-- =========================================================
-- 9) Auto-stamp created_by/updated_by on products
-- =========================================================
create or replace function public.products_stamp_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
  elsif (tg_op = 'UPDATE') then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists products_stamp_user on public.products;
create trigger products_stamp_user
  before insert or update on public.products
  for each row execute function public.products_stamp_user();
