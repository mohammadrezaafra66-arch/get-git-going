-- ============================================================
-- Phase 2: Pricing Engine — Schema, RLS, Indexes, Audit, Seeds
-- ============================================================

-- 0) Extend suppliers (table exists). Add optional columns if missing.
alter table public.suppliers
  add column if not exists contact_name text,
  add column if not exists city text,
  add column if not exists notes text,
  add column if not exists trust_level text,
  add column if not exists is_active boolean not null default true;

-- 1) currency_rates ------------------------------------------------
do $$ begin
  create type public.currency_code as enum ('toman','usd','aed');
exception when duplicate_object then null; end $$;

create table if not exists public.currency_rates (
  id uuid primary key default gen_random_uuid(),
  currency public.currency_code not null check (currency in ('usd','aed')),
  rate_to_toman numeric not null check (rate_to_toman > 0),
  source_name text,
  effective_at timestamptz not null default now(),
  created_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_currency_rates_currency_eff on public.currency_rates (currency, effective_at desc);
create index if not exists idx_currency_rates_active on public.currency_rates (currency, is_active, effective_at desc);

-- 2) settlement_types ----------------------------------------------
create table if not exists public.settlement_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) shipping_cost_rules -------------------------------------------
do $$ begin
  create type public.shipping_cost_type as enum ('fixed','percent');
exception when duplicate_object then null; end $$;

create table if not exists public.shipping_cost_rules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cost_type public.shipping_cost_type not null,
  cost_value numeric not null check (cost_value >= 0),
  product_type public.product_type,
  category_id uuid,
  min_purchase_price numeric,
  max_purchase_price numeric,
  is_active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_shipping_rules_active_prio on public.shipping_cost_rules (is_active, priority);

-- 4) price_change_reasons ------------------------------------------
create table if not exists public.price_change_reasons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5) purchase_prices -----------------------------------------------
create table if not exists public.purchase_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_price numeric not null check (purchase_price >= 0),
  currency public.currency_code not null default 'toman',
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  reason_id uuid references public.price_change_reasons(id) on delete set null,
  private_note text,
  registered_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_purchase_prices_product_eff on public.purchase_prices (product_id, effective_at desc);
create index if not exists idx_purchase_prices_product_active on public.purchase_prices (product_id, is_active);

-- 6) pricing_rules: extend existing table --------------------------
do $$ begin
  create type public.margin_type as enum ('fixed','percent','mixed');
exception when duplicate_object then null; end $$;

alter table public.pricing_rules
  add column if not exists rule_name text,
  add column if not exists product_type public.product_type,
  add column if not exists category_id uuid,
  add column if not exists brand_id uuid,
  add column if not exists min_purchase_price_toman numeric,
  add column if not exists max_purchase_price_toman numeric,
  add column if not exists settlement_type_id uuid references public.settlement_types(id) on delete set null,
  add column if not exists margin_type public.margin_type,
  add column if not exists margin_value numeric,
  add column if not exists fixed_margin_value numeric,
  add column if not exists shipping_cost_rule_id uuid references public.shipping_cost_rules(id) on delete set null;

-- backfill rule_name from existing 'name' column
update public.pricing_rules set rule_name = name where rule_name is null and name is not null;

create index if not exists idx_pricing_rules_active_prio on public.pricing_rules (is_active, priority);
create index if not exists idx_pricing_rules_product_type on public.pricing_rules (product_type);
create index if not exists idx_pricing_rules_category on public.pricing_rules (category_id);
create index if not exists idx_pricing_rules_brand on public.pricing_rules (brand_id);

-- 7) price_calculation_snapshots -----------------------------------
create table if not exists public.price_calculation_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  purchase_price_id uuid references public.purchase_prices(id) on delete set null,
  pricing_rule_id uuid references public.pricing_rules(id) on delete set null,
  settlement_type_id uuid references public.settlement_types(id) on delete set null,
  input_purchase_price numeric not null,
  input_currency public.currency_code not null,
  currency_rate numeric not null,
  purchase_price_toman numeric not null,
  shipping_cost numeric not null default 0,
  margin_amount numeric not null default 0,
  final_sale_price numeric not null,
  rounded_sale_price numeric not null,
  calculation_details jsonb,
  calculated_by uuid,
  calculated_at timestamptz not null default now()
);
create index if not exists idx_snapshots_product_calc on public.price_calculation_snapshots (product_id, calculated_at desc);

-- 8) product_sale_price_history ------------------------------------
create table if not exists public.product_sale_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  snapshot_id uuid references public.price_calculation_snapshots(id) on delete set null,
  old_sale_price numeric,
  new_sale_price numeric not null,
  change_amount numeric,
  change_percent numeric,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_sale_price_history_product on public.product_sale_price_history (product_id, created_at desc);

-- ============================================================
-- updated_at triggers
-- ============================================================
do $$ begin
  perform 1 from pg_trigger where tgname = 'trg_currency_rates_updated_at';
  if not found then
    create trigger trg_currency_rates_updated_at before update on public.currency_rates
      for each row execute function public.set_updated_at();
  end if;
  perform 1 from pg_trigger where tgname = 'trg_settlement_types_updated_at';
  if not found then
    create trigger trg_settlement_types_updated_at before update on public.settlement_types
      for each row execute function public.set_updated_at();
  end if;
  perform 1 from pg_trigger where tgname = 'trg_shipping_rules_updated_at';
  if not found then
    create trigger trg_shipping_rules_updated_at before update on public.shipping_cost_rules
      for each row execute function public.set_updated_at();
  end if;
  perform 1 from pg_trigger where tgname = 'trg_change_reasons_updated_at';
  if not found then
    create trigger trg_change_reasons_updated_at before update on public.price_change_reasons
      for each row execute function public.set_updated_at();
  end if;
  perform 1 from pg_trigger where tgname = 'trg_purchase_prices_updated_at';
  if not found then
    create trigger trg_purchase_prices_updated_at before update on public.purchase_prices
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ============================================================
-- Audit triggers
-- ============================================================
create or replace function public.audit_currency_rates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'currency_rates', new.id::text, 'currency_rate_created',
      jsonb_build_object('currency', new.currency, 'rate_to_toman', new.rate_to_toman, 'effective_at', new.effective_at));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'currency_rates', new.id::text, 'currency_rate_updated',
      jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    return new;
  end if;
  return null;
end; $$;

create or replace function public.audit_purchase_prices() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _sku text;
begin
  if (tg_op = 'INSERT') then
    select sku into _sku from public.products where id = new.product_id;
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'purchase_prices', new.id::text, 'purchase_price_created',
      jsonb_build_object('product_id', new.product_id, 'sku', _sku, 'price', new.purchase_price, 'currency', new.currency, 'supplier_id', new.supplier_id));
    return new;
  elsif (tg_op = 'UPDATE') then
    select sku into _sku from public.products where id = new.product_id;
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'purchase_prices', new.id::text, 'purchase_price_updated',
      jsonb_build_object('product_id', new.product_id, 'sku', _sku,
        'old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    return new;
  end if;
  return null;
end; $$;

create or replace function public.audit_pricing_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'pricing_rules', new.id::text, 'pricing_rule_created',
      jsonb_build_object('rule_name', coalesce(new.rule_name, new.name), 'margin_type', new.margin_type, 'margin_value', new.margin_value, 'priority', new.priority));
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.is_active is true and new.is_active is false) then
      insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      values (auth.uid(), 'pricing_rules', new.id::text, 'pricing_rule_disabled',
        jsonb_build_object('rule_name', coalesce(new.rule_name, new.name)));
    else
      insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      values (auth.uid(), 'pricing_rules', new.id::text, 'pricing_rule_updated',
        jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    end if;
    return new;
  end if;
  return null;
end; $$;

create or replace function public.audit_shipping_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'shipping_cost_rules', new.id::text, 'shipping_rule_created',
      jsonb_build_object('title', new.title, 'cost_type', new.cost_type, 'cost_value', new.cost_value));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'shipping_cost_rules', new.id::text, 'shipping_rule_updated',
      jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    return new;
  end if;
  return null;
end; $$;

create or replace function public.audit_price_snapshots() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  values (auth.uid(), 'price_calculation_snapshots', new.id::text, 'price_calculated_snapshot_created',
    jsonb_build_object('product_id', new.product_id, 'final_sale_price', new.final_sale_price, 'rounded_sale_price', new.rounded_sale_price, 'pricing_rule_id', new.pricing_rule_id));
  return new;
end; $$;

create or replace function public.audit_sale_price_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  values (auth.uid(), 'product_sale_price_history', new.id::text, 'sale_price_history_created',
    jsonb_build_object('product_id', new.product_id, 'old', new.old_sale_price, 'new', new.new_sale_price, 'change_amount', new.change_amount, 'change_percent', new.change_percent));
  return new;
end; $$;

do $$ begin
  perform 1 from pg_trigger where tgname='trg_audit_currency_rates';
  if not found then
    create trigger trg_audit_currency_rates after insert or update on public.currency_rates
      for each row execute function public.audit_currency_rates();
  end if;
  perform 1 from pg_trigger where tgname='trg_audit_purchase_prices';
  if not found then
    create trigger trg_audit_purchase_prices after insert or update on public.purchase_prices
      for each row execute function public.audit_purchase_prices();
  end if;
  perform 1 from pg_trigger where tgname='trg_audit_pricing_rules';
  if not found then
    create trigger trg_audit_pricing_rules after insert or update on public.pricing_rules
      for each row execute function public.audit_pricing_rules();
  end if;
  perform 1 from pg_trigger where tgname='trg_audit_shipping_rules';
  if not found then
    create trigger trg_audit_shipping_rules after insert or update on public.shipping_cost_rules
      for each row execute function public.audit_shipping_rules();
  end if;
  perform 1 from pg_trigger where tgname='trg_audit_price_snapshots';
  if not found then
    create trigger trg_audit_price_snapshots after insert on public.price_calculation_snapshots
      for each row execute function public.audit_price_snapshots();
  end if;
  perform 1 from pg_trigger where tgname='trg_audit_sale_price_history';
  if not found then
    create trigger trg_audit_sale_price_history after insert on public.product_sale_price_history
      for each row execute function public.audit_sale_price_history();
  end if;
end $$;

-- ============================================================
-- Auto-stamp registered_by / created_by from auth.uid()
-- ============================================================
create or replace function public.stamp_registered_by() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    new.registered_by := coalesce(new.registered_by, auth.uid());
  end if;
  return new;
end; $$;

create or replace function public.stamp_created_by() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end; $$;

do $$ begin
  perform 1 from pg_trigger where tgname='trg_stamp_purchase_prices';
  if not found then
    create trigger trg_stamp_purchase_prices before insert on public.purchase_prices
      for each row execute function public.stamp_registered_by();
  end if;
  perform 1 from pg_trigger where tgname='trg_stamp_currency_rates';
  if not found then
    create trigger trg_stamp_currency_rates before insert on public.currency_rates
      for each row execute function public.stamp_created_by();
  end if;
end $$;

-- ============================================================
-- RLS enable + policies
-- ============================================================
alter table public.currency_rates enable row level security;
alter table public.settlement_types enable row level security;
alter table public.shipping_cost_rules enable row level security;
alter table public.price_change_reasons enable row level security;
alter table public.purchase_prices enable row level security;
alter table public.price_calculation_snapshots enable row level security;
alter table public.product_sale_price_history enable row level security;

-- currency_rates: read for admin/manager/accountant/sales (no viewer); write admin/manager/accountant
drop policy if exists "currency_rates_read" on public.currency_rates;
create policy "currency_rates_read" on public.currency_rates for select
  using (public.has_any_role(auth.uid(), array['admin','manager','accountant','sales']::app_role[]));
drop policy if exists "currency_rates_write" on public.currency_rates;
create policy "currency_rates_write" on public.currency_rates for all
  using (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]));

-- settlement_types: read all authenticated; write admin/manager
drop policy if exists "settlement_types_read" on public.settlement_types;
create policy "settlement_types_read" on public.settlement_types for select using (auth.role() = 'authenticated');
drop policy if exists "settlement_types_write" on public.settlement_types;
create policy "settlement_types_write" on public.settlement_types for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));

-- shipping_cost_rules: read admin/manager/accountant; write admin/manager
drop policy if exists "shipping_rules_read" on public.shipping_cost_rules;
create policy "shipping_rules_read" on public.shipping_cost_rules for select
  using (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]));
drop policy if exists "shipping_rules_write" on public.shipping_cost_rules;
create policy "shipping_rules_write" on public.shipping_cost_rules for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));

-- price_change_reasons: read admin/manager/accountant; write admin/manager
drop policy if exists "change_reasons_read" on public.price_change_reasons;
create policy "change_reasons_read" on public.price_change_reasons for select
  using (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]));
drop policy if exists "change_reasons_write" on public.price_change_reasons;
create policy "change_reasons_write" on public.price_change_reasons for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));

-- purchase_prices: read admin/manager/accountant; write admin/manager/accountant
drop policy if exists "purchase_prices_read" on public.purchase_prices;
create policy "purchase_prices_read" on public.purchase_prices for select
  using (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]));
drop policy if exists "purchase_prices_write" on public.purchase_prices;
create policy "purchase_prices_write" on public.purchase_prices for all
  using (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]));

-- pricing_rules: existing policies remain (read all authenticated, write admin/manager) — keep as-is.

-- price_calculation_snapshots: read admin/manager/accountant; insert same set
drop policy if exists "snapshots_read" on public.price_calculation_snapshots;
create policy "snapshots_read" on public.price_calculation_snapshots for select
  using (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]));
drop policy if exists "snapshots_insert" on public.price_calculation_snapshots;
create policy "snapshots_insert" on public.price_calculation_snapshots for insert
  with check (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]));

-- product_sale_price_history: read admin/manager/accountant; insert same set
drop policy if exists "sale_history_read" on public.product_sale_price_history;
create policy "sale_history_read" on public.product_sale_price_history for select
  using (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]));
drop policy if exists "sale_history_insert" on public.product_sale_price_history;
create policy "sale_history_insert" on public.product_sale_price_history for insert
  with check (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]));

-- ============================================================
-- SEED data (idempotent)
-- ============================================================
insert into public.settlement_types (code, title, description) values
  ('cash', 'نقدی', 'پرداخت نقدی'),
  ('short_term', 'تسویه کوتاه‌مدت', 'تسویه ظرف چند روز'),
  ('credit', 'حساب‌باز / اعتباری', 'پرداخت اعتباری')
on conflict (code) do nothing;

insert into public.price_change_reasons (title)
select v from (values
  ('تغییر نرخ ارز'),
  ('تغییر قیمت تأمین‌کننده'),
  ('تغییر هزینه حمل'),
  ('اصلاح اشتباه'),
  ('تغییر شرایط بازار'),
  ('تغییر سیاست سود')
) as t(v)
where not exists (select 1 from public.price_change_reasons where title = t.v);

-- default shipping rule
insert into public.shipping_cost_rules (title, cost_type, cost_value, priority, is_active)
select 'هزینه حمل پیش‌فرض', 'fixed', 0, 1000, true
where not exists (select 1 from public.shipping_cost_rules where title = 'هزینه حمل پیش‌فرض');

-- default pricing rule
insert into public.pricing_rules (name, rule_name, margin_type, margin_value, priority, is_active, conditions, actions, version)
select 'قانون عمومی پیش‌فرض', 'قانون عمومی پیش‌فرض', 'percent'::public.margin_type, 10, 1000, true, '{}'::jsonb, '{}'::jsonb, 1
where not exists (select 1 from public.pricing_rules where rule_name = 'قانون عمومی پیش‌فرض' or name = 'قانون عمومی پیش‌فرض');
