
-- ========================================
-- Afrakala Smart Assistant — Phase 1 Schema
-- ========================================

-- 1. Roles enum
create type public.app_role as enum ('admin','manager','sales','accountant','viewer');

-- 2. Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 3. User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  unique(user_id, role)
);
alter table public.user_roles enable row level security;

-- 4. has_role security definer
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

-- 5. has_any_role helper
create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.user_roles where user_id = _user_id and role = any(_roles)) $$;

-- 6. Auto-create profile + default viewer role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.user_roles (user_id, role) values (new.id, 'viewer');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7. updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- 8. Audit logs
create table public.audit_logs (
  id bigserial primary key,
  actor_id uuid references auth.users(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  diff jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);

-- ========================================
-- RLS POLICIES — profiles
-- ========================================
create policy "users read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "admins read all profiles" on public.profiles
  for select using (public.has_role(auth.uid(), 'admin'));
create policy "users update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "admins update all profiles" on public.profiles
  for update using (public.has_role(auth.uid(), 'admin'));

-- ========================================
-- RLS POLICIES — user_roles
-- ========================================
create policy "users read own roles" on public.user_roles
  for select using (auth.uid() = user_id);
create policy "admins read all roles" on public.user_roles
  for select using (public.has_role(auth.uid(), 'admin'));
create policy "admins manage roles" on public.user_roles
  for all using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ========================================
-- RLS POLICIES — audit_logs
-- ========================================
create policy "admins read audit logs" on public.audit_logs
  for select using (public.has_role(auth.uid(), 'admin'));
create policy "system inserts audit logs" on public.audit_logs
  for insert with check (auth.uid() = actor_id);

-- ========================================
-- STUB TABLES (module skeletons)
-- ========================================

-- Products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  description text,
  unit text,
  category text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();

-- Customers
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  tax_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customers enable row level security;
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();

-- Suppliers
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.suppliers enable row level security;
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();

-- Price lists
create table public.price_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'IRR',
  is_active boolean not null default true,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.price_lists enable row level security;
create trigger price_lists_updated_at before update on public.price_lists for each row execute function public.set_updated_at();

create table public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  unit_price numeric(18,2) not null,
  min_qty numeric(18,3) default 1,
  unique(price_list_id, product_id)
);
alter table public.price_list_items enable row level security;

-- Pricing rules (rule-based engine, versioned)
create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  priority integer not null default 100,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '{}'::jsonb,
  effective_from date,
  effective_to date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pricing_rules enable row level security;
create trigger pricing_rules_updated_at before update on public.pricing_rules for each row execute function public.set_updated_at();
create index pricing_rules_active_idx on public.pricing_rules(is_active, priority);

-- Purchases
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  supplier_id uuid references public.suppliers(id),
  status text not null default 'draft',
  total_amount numeric(18,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.purchases enable row level security;
create trigger purchases_updated_at before update on public.purchases for each row execute function public.set_updated_at();

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(18,3) not null,
  unit_price numeric(18,2) not null,
  line_total numeric(18,2) not null
);
alter table public.purchase_items enable row level security;

-- Sales / Invoices
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  customer_id uuid references public.customers(id),
  status text not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  discount_amount numeric(18,2) not null default 0,
  total_amount numeric(18,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.invoices enable row level security;
create trigger invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create index invoices_customer_idx on public.invoices(customer_id, issue_date desc);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(18,3) not null,
  unit_price numeric(18,2) not null,
  discount numeric(18,2) not null default 0,
  line_total numeric(18,2) not null
);
alter table public.invoice_items enable row level security;

-- Knowledge base
create table public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  content text,
  category text,
  is_published boolean not null default false,
  author_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.knowledge_articles enable row level security;
create trigger knowledge_updated_at before update on public.knowledge_articles for each row execute function public.set_updated_at();

-- Feedback
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  category text,
  subject text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;

-- Internal messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  subject text,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create index messages_recipient_idx on public.messages(recipient_id, is_read, created_at desc);

-- ========================================
-- RLS for stub tables — readable by all authenticated, write by role
-- ========================================

-- Products
create policy "all authenticated read products" on public.products for select using (auth.role() = 'authenticated');
create policy "manager admin write products" on public.products for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]));

-- Customers
create policy "all authenticated read customers" on public.customers for select using (auth.role() = 'authenticated');
create policy "sales manager admin write customers" on public.customers for all
  using (public.has_any_role(auth.uid(), array['admin','manager','sales']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager','sales']::public.app_role[]));

-- Suppliers
create policy "all authenticated read suppliers" on public.suppliers for select using (auth.role() = 'authenticated');
create policy "manager admin write suppliers" on public.suppliers for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]));

-- Price lists & items
create policy "all authenticated read price_lists" on public.price_lists for select using (auth.role() = 'authenticated');
create policy "manager admin write price_lists" on public.price_lists for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]));
create policy "all authenticated read price_list_items" on public.price_list_items for select using (auth.role() = 'authenticated');
create policy "manager admin write price_list_items" on public.price_list_items for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]));

-- Pricing rules
create policy "all authenticated read pricing_rules" on public.pricing_rules for select using (auth.role() = 'authenticated');
create policy "manager admin write pricing_rules" on public.pricing_rules for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]));

-- Purchases
create policy "all authenticated read purchases" on public.purchases for select using (auth.role() = 'authenticated');
create policy "manager admin write purchases" on public.purchases for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]));
create policy "all authenticated read purchase_items" on public.purchase_items for select using (auth.role() = 'authenticated');
create policy "manager admin write purchase_items" on public.purchase_items for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]));

-- Invoices
create policy "all authenticated read invoices" on public.invoices for select using (auth.role() = 'authenticated');
create policy "sales write invoices" on public.invoices for all
  using (public.has_any_role(auth.uid(), array['admin','manager','sales']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager','sales']::public.app_role[]));
create policy "all authenticated read invoice_items" on public.invoice_items for select using (auth.role() = 'authenticated');
create policy "sales write invoice_items" on public.invoice_items for all
  using (public.has_any_role(auth.uid(), array['admin','manager','sales']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager','sales']::public.app_role[]));

-- Knowledge
create policy "all authenticated read knowledge" on public.knowledge_articles for select using (auth.role() = 'authenticated');
create policy "manager admin write knowledge" on public.knowledge_articles for all
  using (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','manager']::public.app_role[]));

-- Feedback (own)
create policy "users read own feedback" on public.feedback for select using (auth.uid() = user_id);
create policy "admins read all feedback" on public.feedback for select using (public.has_role(auth.uid(), 'admin'));
create policy "users insert feedback" on public.feedback for insert with check (auth.uid() = user_id);
create policy "admins update feedback" on public.feedback for update using (public.has_role(auth.uid(), 'admin'));

-- Messages (sender or recipient)
create policy "users read own messages" on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "users send messages" on public.messages for insert with check (auth.uid() = sender_id);
create policy "recipient updates read flag" on public.messages for update
  using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
