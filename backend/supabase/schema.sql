-- ==============================================================================
-- INVOICE MANAGEMENT SYSTEM - SUPABASE SCHEMA (PostgreSQL)
-- Follows supabase-postgres-best-practices guidelines
-- ==============================================================================

create extension if not exists "uuid-ossp";

-- 1. USERS TABLE
create table if not exists public.users (
  id bigint generated always as identity primary key,
  external_id text unique not null default 'usr_' || substr(md5(random()::text), 1, 8),
  name text not null,
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_external_id on public.users(external_id);

-- 2. CLIENTS TABLE
create table if not exists public.clients (
  id bigint generated always as identity primary key,
  external_id text unique not null default 'cli_' || substr(md5(random()::text), 1, 8),
  name text not null,
  email text,
  phone text,
  company text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_external_id on public.clients(external_id);
create index if not exists idx_clients_name on public.clients(name);
create index if not exists idx_clients_phone on public.clients(phone);

-- 3. PRODUCTS TABLE
create table if not exists public.products (
  id bigint generated always as identity primary key,
  external_id text unique not null default 'prd_' || substr(md5(random()::text), 1, 8),
  name text not null,
  sku text unique not null,
  description text,
  quantity integer not null default 0 check (quantity >= 0),
  price numeric(12, 2) not null default 0.00 check (price >= 0),
  low_stock_alert integer not null default 10 check (low_stock_alert >= 0),
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_external_id on public.products(external_id);
create index if not exists idx_products_sku on public.products(sku);
create index if not exists idx_products_low_stock on public.products(quantity, low_stock_alert);

-- 4. SHIPPING COMPANIES TABLE
create table if not exists public.shipping_companies (
  id bigint generated always as identity primary key,
  external_id text unique not null default 'shp_' || substr(md5(random()::text), 1, 8),
  name text not null,
  phone text not null,
  email text,
  address text,
  avg_delivery_days integer not null default 3,
  price_per_kg numeric(8, 2) default 0.00,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shipping_external_id on public.shipping_companies(external_id);
create index if not exists idx_shipping_active on public.shipping_companies(is_active);

-- 5. INVOICES TABLE
create table if not exists public.invoices (
  id bigint generated always as identity primary key,
  external_id text unique not null default 'inv_' || substr(md5(random()::text), 1, 8),
  invoice_number text unique not null,
  client_id text not null references public.clients(external_id) on update cascade on delete restrict,
  subtotal numeric(12, 2) not null default 0.00,
  tax numeric(5, 2) not null default 0.00,
  discount numeric(12, 2) not null default 0.00,
  total numeric(12, 2) not null default 0.00,
  paid_amount numeric(12, 2) not null default 0.00,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'cancelled')),
  shipping_company_id text references public.shipping_companies(external_id) on update cascade on delete set null,
  shipping_status text check (shipping_status is null or shipping_status in ('pending', 'shipped', 'delivered', 'returned')),
  delivered_at timestamptz,
  due_date timestamptz,
  notes text,
  created_by text references public.users(external_id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoices_external_id on public.invoices(external_id);
create index if not exists idx_invoices_number on public.invoices(invoice_number);
create index if not exists idx_invoices_client on public.invoices(client_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_shipping on public.invoices(shipping_company_id, shipping_status);

-- 6. INVOICE ITEMS TABLE
create table if not exists public.invoice_items (
  id bigint generated always as identity primary key,
  invoice_id text not null references public.invoices(external_id) on update cascade on delete cascade,
  product_id text references public.products(external_id) on update cascade on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  total numeric(12, 2) not null check (total >= 0)
);

create index if not exists idx_invoice_items_invoice on public.invoice_items(invoice_id);
create index if not exists idx_invoice_items_product on public.invoice_items(product_id);

-- 7. INVOICE PAYMENTS TABLE
create table if not exists public.invoice_payments (
  id bigint generated always as identity primary key,
  invoice_id text not null references public.invoices(external_id) on update cascade on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  payment_date timestamptz not null default now(),
  method text not null check (method in ('cash', 'bank_transfer', 'card', 'cheque', 'other')),
  reference text,
  notes text,
  recorded_by text references public.users(external_id) on update cascade on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_payments_invoice on public.invoice_payments(invoice_id);

-- 8. PURCHASE ORDERS TABLE
create table if not exists public.purchase_orders (
  id bigint generated always as identity primary key,
  external_id text unique not null default 'po_' || substr(md5(random()::text), 1, 8),
  order_number text unique not null,
  supplier text not null,
  supplier_contact text,
  subtotal numeric(12, 2) not null default 0.00,
  total numeric(12, 2) not null default 0.00,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'received')),
  notes text,
  approved_by text references public.users(external_id) on update cascade on delete set null,
  approved_at timestamptz,
  created_by text references public.users(external_id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_po_external_id on public.purchase_orders(external_id);
create index if not exists idx_po_status on public.purchase_orders(status);

-- 9. PURCHASE ORDER ITEMS TABLE
create table if not exists public.purchase_order_items (
  id bigint generated always as identity primary key,
  order_id text not null references public.purchase_orders(external_id) on update cascade on delete cascade,
  product_id text references public.products(external_id) on update cascade on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  total numeric(12, 2) not null check (total >= 0)
);

create index if not exists idx_po_items_order on public.purchase_order_items(order_id);

-- 10. EXPENSES TABLE
create table if not exists public.expenses (
  id bigint generated always as identity primary key,
  external_id text unique not null default 'exp_' || substr(md5(random()::text), 1, 8),
  description text not null,
  category text not null,
  amount numeric(12, 2) not null check (amount > 0),
  expense_date timestamptz not null default now(),
  payment_method text not null check (payment_method in ('cash', 'bank_transfer', 'card', 'cheque', 'other')),
  reference text,
  notes text,
  created_by text references public.users(external_id) on update cascade on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_expenses_date on public.expenses(expense_date);
create index if not exists idx_expenses_category on public.expenses(category);

-- RLS POLICIES
alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.shipping_companies enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.expenses enable row level security;

create policy "Service role full access on users" on public.users for all using (true) with check (true);
create policy "Service role full access on clients" on public.clients for all using (true) with check (true);
create policy "Service role full access on products" on public.products for all using (true) with check (true);
create policy "Service role full access on shipping_companies" on public.shipping_companies for all using (true) with check (true);
create policy "Service role full access on invoices" on public.invoices for all using (true) with check (true);
create policy "Service role full access on invoice_items" on public.invoice_items for all using (true) with check (true);
create policy "Service role full access on invoice_payments" on public.invoice_payments for all using (true) with check (true);
create policy "Service role full access on purchase_orders" on public.purchase_orders for all using (true) with check (true);
create policy "Service role full access on purchase_order_items" on public.purchase_order_items for all using (true) with check (true);
create policy "Service role full access on expenses" on public.expenses for all using (true) with check (true);
