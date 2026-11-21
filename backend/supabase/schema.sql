-- ==============================================================================
-- INVOICE MANAGEMENT SYSTEM - SUPABASE SCHEMA (PostgreSQL)
-- Follows supabase-postgres-best-practices guidelines
-- ==============================================================================

create extension if not exists "uuid-ossp";

create sequence if not exists public.invoice_number_seq as bigint start with 1 increment by 1;
create sequence if not exists public.purchase_order_number_seq as bigint start with 1 increment by 1;

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
  avg_delivery_days integer not null default 3 check (avg_delivery_days >= 0),
  price_per_kg numeric(8, 2) not null default 0.00 check (price_per_kg >= 0),
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
  invoice_number text unique not null default ('INV-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0'))
    check (invoice_number ~ '^INV-[0-9]{5,}$'),
  client_id text not null references public.clients(external_id) on update cascade on delete restrict,
  subtotal numeric(12, 2) not null default 0.00 check (subtotal >= 0),
  tax numeric(5, 2) not null default 0.00 check (tax >= 0),
  discount numeric(12, 2) not null default 0.00 check (discount >= 0),
  total numeric(12, 2) not null default 0.00 check (total >= 0),
  paid_amount numeric(12, 2) not null default 0.00 check (paid_amount >= 0 and paid_amount <= total),
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
  order_number text unique not null default ('PO-' || lpad(nextval('public.purchase_order_number_seq')::text, 5, '0'))
    check (order_number ~ '^PO-[0-9]{5,}$'),
  supplier text not null,
  supplier_contact text,
  subtotal numeric(12, 2) not null default 0.00 check (subtotal >= 0),
  total numeric(12, 2) not null default 0.00 check (total >= 0),
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

alter table public.users force row level security;
alter table public.clients force row level security;
alter table public.products force row level security;
alter table public.shipping_companies force row level security;
alter table public.invoices force row level security;
alter table public.invoice_items force row level security;
alter table public.invoice_payments force row level security;
alter table public.purchase_orders force row level security;
alter table public.purchase_order_items force row level security;
alter table public.expenses force row level security;

create or replace function public.enforce_invoice_paid_amount_limit()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.paid_amount < 0 or new.paid_amount > new.total then
    raise exception 'invoice overpayment' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists enforce_invoice_paid_amount_limit on public.invoices;
create trigger enforce_invoice_paid_amount_limit
before insert or update of paid_amount, total on public.invoices
for each row execute function public.enforce_invoice_paid_amount_limit();

create index if not exists idx_invoice_items_product on public.invoice_items(product_id);
create index if not exists idx_po_items_product on public.purchase_order_items(product_id);
create index if not exists idx_invoice_payments_date on public.invoice_payments(payment_date);

revoke all on public.users, public.clients, public.products, public.shipping_companies,
  public.invoices, public.invoice_items, public.invoice_payments,
  public.purchase_orders, public.purchase_order_items, public.expenses
  from public;
revoke all on all sequences in schema public from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.users, public.clients, public.products, public.shipping_companies,
      public.invoices, public.invoice_items, public.invoice_payments,
      public.purchase_orders, public.purchase_order_items, public.expenses from anon';
    execute 'revoke all on all sequences in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.users, public.clients, public.products, public.shipping_companies,
      public.invoices, public.invoice_items, public.invoice_payments,
      public.purchase_orders, public.purchase_order_items, public.expenses from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant select, insert, update, delete on public.users, public.clients, public.products,
      public.shipping_companies, public.invoices, public.invoice_items, public.invoice_payments,
      public.purchase_orders, public.purchase_order_items, public.expenses to service_role';
    execute 'grant usage, select on all sequences in schema public to service_role';
  end if;
end $$;

do $$
declare
  v_last bigint;
begin
  select coalesce(max((regexp_replace(invoice_number, '^INV-', '')::bigint)), 0)
  into v_last
  from public.invoices
  where invoice_number ~ '^INV-[0-9]{5,}$';
  if v_last > 0 then
    perform setval(
      'public.invoice_number_seq',
      greatest(
        v_last,
        coalesce(
          (select s.last_value
           from pg_sequences s
           where s.schemaname = 'public'
             and s.sequencename = 'invoice_number_seq'),
          1
        )
      ),
      true
    );
  end if;

  select coalesce(max((regexp_replace(order_number, '^PO-', '')::bigint)), 0)
  into v_last
  from public.purchase_orders
  where order_number ~ '^PO-[0-9]{5,}$';
  if v_last > 0 then
    perform setval(
      'public.purchase_order_number_seq',
      greatest(
        v_last,
        coalesce(
          (select s.last_value
           from pg_sequences s
           where s.schemaname = 'public'
             and s.sequencename = 'purchase_order_number_seq'),
          1
        )
      ),
      true
    );
  end if;
end $$;

create or replace function public.create_invoice_with_stock(p_invoice jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_product_ids text[];
  v_product public.products%rowtype;
  v_item jsonb;
  v_product_id text;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_total numeric(12,2);
  v_i integer;
  v_paid numeric(12,2);
  v_invoice_total numeric(12,2);
begin
  if p_invoice is null or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid invoice payload' using errcode = '22023';
  end if;

  v_paid := coalesce((p_invoice->>'paid_amount')::numeric(12,2), 0);
  v_invoice_total := coalesce((p_invoice->>'total')::numeric(12,2), 0);
  if v_paid < 0 or v_paid > v_invoice_total then
    raise exception 'invoice overpayment' using errcode = 'P0001';
  end if;

  if nullif(p_invoice->>'client_id', '') is null
     or not exists (select 1 from public.clients c where c.external_id = p_invoice->>'client_id') then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct x.product_id order by x.product_id), '{}'::text[])
  into v_product_ids
  from (
    select v.value->>'product_id' as product_id
    from jsonb_array_elements(p_items) v
  ) x
  where x.product_id is not null;

  for v_product in
    select p.* from public.products p
    where p.external_id = any(v_product_ids)
    order by p.external_id
    for update
  loop
    null;
  end loop;

  for v_i in 1..coalesce(array_length(v_product_ids, 1), 0) loop
    if not exists (select 1 from public.products p where p.external_id = v_product_ids[v_i]) then
      raise exception 'product not found: %', v_product_ids[v_i] using errcode = 'P0002';
    end if;
  end loop;

  insert into public.invoices (
    external_id, client_id, subtotal, tax, discount, total, paid_amount, status,
    shipping_company_id, shipping_status, delivered_at, due_date, notes, created_by
  )
  values (
    coalesce(nullif(btrim(p_invoice->>'external_id'), ''),
             'inv_' || substr(md5(random()::text), 1, 8)),
    p_invoice->>'client_id',
    coalesce((p_invoice->>'subtotal')::numeric(12,2), 0),
    coalesce((p_invoice->>'tax')::numeric(5,2), 0),
    coalesce((p_invoice->>'discount')::numeric(12,2), 0),
    coalesce((p_invoice->>'total')::numeric(12,2), 0),
    coalesce((p_invoice->>'paid_amount')::numeric(12,2), 0),
    coalesce(p_invoice->>'status', 'draft'),
    nullif(p_invoice->>'shipping_company_id', ''),
    nullif(p_invoice->>'shipping_status', ''),
    nullif(p_invoice->>'delivered_at', '')::timestamptz,
    nullif(p_invoice->>'due_date', '')::timestamptz,
    nullif(p_invoice->>'notes', ''),
    nullif(p_invoice->>'created_by', '')
  )
  returning * into v_invoice;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id', '');
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric(12,2);
    v_total := (v_item->>'total')::numeric(12,2);

    if v_product_id is null or v_quantity is null or v_quantity <= 0
       or v_unit_price is null or v_unit_price < 0
       or v_total is null or v_total < 0 then
      raise exception 'invalid invoice item' using errcode = '22023';
    end if;

    select p.* into v_product
    from public.products p
    where p.external_id = v_product_id
    for update;

    if not found then
      raise exception 'product not found: %', v_product_id using errcode = 'P0002';
    end if;
    if v_product.quantity < v_quantity then
      raise exception 'insufficient stock: %', v_product_id using errcode = 'P0001';
    end if;

    update public.products
    set quantity = quantity - v_quantity, updated_at = now()
    where external_id = v_product_id;

    insert into public.invoice_items (
      invoice_id, product_id, product_name, quantity, unit_price, total
    )
    values (
      v_invoice.external_id,
      v_product_id,
      v_item->>'product_name',
      v_quantity,
      v_unit_price,
      v_total
    );
  end loop;

  select i.* into v_invoice
  from public.invoices i
  where i.external_id = v_invoice.external_id;

  return to_jsonb(v_invoice);
end $$;

revoke all on function public.create_invoice_with_stock(jsonb, jsonb) from public;
create or replace function public.update_invoice_with_stock(
  p_invoice_id text,
  p_invoice jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_product_ids text[];
  v_product public.products%rowtype;
  v_item jsonb;
  v_product_id text;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_total numeric(12,2);
  v_i integer;
begin
  if p_invoice_id is null or p_invoice is null or p_items is null
     or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid invoice payload' using errcode = '22023';
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.external_id = p_invoice_id
  for update;
  if not found then
    raise exception 'invoice not found: %', p_invoice_id using errcode = 'P0002';
  end if;

  if coalesce((p_invoice->>'paid_amount')::numeric(12,2), v_invoice.paid_amount)
       > coalesce((p_invoice->>'total')::numeric(12,2), v_invoice.total)
     or coalesce((p_invoice->>'paid_amount')::numeric(12,2), v_invoice.paid_amount) < 0
  then
    raise exception 'invoice overpayment' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct x.product_id order by x.product_id), '{}'::text[])
  into v_product_ids
  from (
    select ii.product_id
    from public.invoice_items ii
    where ii.invoice_id = p_invoice_id
      and ii.product_id is not null
    union
    select v.value->>'product_id'
    from jsonb_array_elements(p_items) v
  ) x
  where x.product_id is not null;

  for v_product in
    select p.* from public.products p
    where p.external_id = any(v_product_ids)
    order by p.external_id
    for update
  loop
    null;
  end loop;

  for v_i in 1..coalesce(array_length(v_product_ids, 1), 0) loop
    if not exists (select 1 from public.products p where p.external_id = v_product_ids[v_i]) then
      raise exception 'product not found: %', v_product_ids[v_i] using errcode = 'P0002';
    end if;
  end loop;

  update public.products p
  set quantity = p.quantity + coalesce((
        select sum(ii.quantity)::integer
        from public.invoice_items ii
        where ii.invoice_id = p_invoice_id
          and ii.product_id = p.external_id
      ), 0),
      updated_at = now()
  where p.external_id = any(v_product_ids);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id', '');
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric(12,2);
    v_total := (v_item->>'total')::numeric(12,2);

    if v_product_id is null or v_quantity is null or v_quantity <= 0
       or v_unit_price is null or v_unit_price < 0
       or v_total is null or v_total < 0 then
      raise exception 'invalid invoice item' using errcode = '22023';
    end if;

    select p.* into v_product
    from public.products p
    where p.external_id = v_product_id
    for update;
    if not found then
      raise exception 'product not found: %', v_product_id using errcode = 'P0002';
    end if;

    if v_product.quantity < v_quantity then
      raise exception 'insufficient stock: %', v_product_id using errcode = 'P0001';
    end if;

    update public.products
    set quantity = quantity - v_quantity, updated_at = now()
    where external_id = v_product_id;
  end loop;

  delete from public.invoice_items where invoice_id = p_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.invoice_items (
      invoice_id, product_id, product_name, quantity, unit_price, total
    )
    values (
      p_invoice_id,
      nullif(v_item->>'product_id', ''),
      v_item->>'product_name',
      (v_item->>'quantity')::integer,
      (v_item->>'unit_price')::numeric(12,2),
      (v_item->>'total')::numeric(12,2)
    );
  end loop;

  update public.invoices i
  set
    client_id = coalesce(nullif(p_invoice->>'client_id', ''), i.client_id),
    subtotal = coalesce((p_invoice->>'subtotal')::numeric(12,2), i.subtotal),
    tax = coalesce((p_invoice->>'tax')::numeric(5,2), i.tax),
    discount = coalesce((p_invoice->>'discount')::numeric(12,2), i.discount),
    total = coalesce((p_invoice->>'total')::numeric(12,2), i.total),
    paid_amount = coalesce((p_invoice->>'paid_amount')::numeric(12,2), i.paid_amount),
    status = coalesce(nullif(p_invoice->>'status', ''), i.status),
    shipping_company_id = coalesce(nullif(p_invoice->>'shipping_company_id', ''), i.shipping_company_id),
    shipping_status = coalesce(nullif(p_invoice->>'shipping_status', ''), i.shipping_status),
    delivered_at = coalesce(nullif(p_invoice->>'delivered_at', '')::timestamptz, i.delivered_at),
    due_date = coalesce(nullif(p_invoice->>'due_date', '')::timestamptz, i.due_date),
    notes = coalesce(nullif(p_invoice->>'notes', ''), i.notes),
    created_by = coalesce(nullif(p_invoice->>'created_by', ''), i.created_by),
    updated_at = now()
  where i.external_id = p_invoice_id
  returning * into v_invoice;

  if v_invoice.paid_amount > v_invoice.total then
    raise exception 'invoice overpayment' using errcode = 'P0001';
  end if;

  return to_jsonb(v_invoice);
end $$;

create or replace function public.record_invoice_payment(
  p_invoice_id text,
  p_payment jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_amount numeric(12,2);
  v_new_paid numeric(12,2);
begin
  if p_invoice_id is null or p_payment is null then
    raise exception 'invalid payment payload' using errcode = '22023';
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.external_id = p_invoice_id
  for update;
  if not found then
    raise exception 'invoice not found: %', p_invoice_id using errcode = 'P0002';
  end if;
  if v_invoice.status = 'cancelled' then
    raise exception 'invalid invoice state: cancelled' using errcode = 'P0001';
  end if;
  if v_invoice.status = 'paid' or v_invoice.paid_amount >= v_invoice.total then
    raise exception 'invalid invoice state: already paid' using errcode = 'P0001';
  end if;

  v_amount := (p_payment->>'amount')::numeric(12,2);
  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid payment amount' using errcode = '22023';
  end if;
  v_new_paid := v_invoice.paid_amount + v_amount;
  if v_new_paid > v_invoice.total then
    raise exception 'invoice overpayment' using errcode = 'P0001';
  end if;

  insert into public.invoice_payments (
    invoice_id, amount, payment_date, method, reference, notes, recorded_by
  )
  values (
    p_invoice_id,
    v_amount,
    coalesce(nullif(p_payment->>'payment_date', '')::timestamptz, now()),
    p_payment->>'method',
    nullif(p_payment->>'reference', ''),
    nullif(p_payment->>'notes', ''),
    nullif(p_payment->>'recorded_by', '')
  );

  update public.invoices i
  set
    paid_amount = v_new_paid,
    status = case
      when v_new_paid >= i.total then 'paid'
      else case when i.status = 'paid' then 'sent' else i.status end
    end,
    updated_at = now()
  where i.external_id = p_invoice_id
  returning * into v_invoice;

  return to_jsonb(v_invoice);
end $$;

create or replace function public.approve_purchase_order(
  p_order_id text,
  p_approved_by text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.purchase_orders%rowtype;
  v_product_ids text[];
  v_product public.products%rowtype;
  v_item public.purchase_order_items%rowtype;
  v_i integer;
begin
  if p_order_id is null then
    raise exception 'invalid purchase order payload' using errcode = '22023';
  end if;

  select o.* into v_order
  from public.purchase_orders o
  where o.external_id = p_order_id
  for update;
  if not found then
    raise exception 'purchase order not found: %', p_order_id using errcode = 'P0002';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'invalid purchase order state: %', v_order.status using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct poi.product_id order by poi.product_id), '{}'::text[])
  into v_product_ids
  from public.purchase_order_items poi
  where poi.order_id = p_order_id
    and poi.product_id is not null;

  for v_product in
    select p.* from public.products p
    where p.external_id = any(v_product_ids)
    order by p.external_id
    for update
  loop
    null;
  end loop;

  for v_i in 1..coalesce(array_length(v_product_ids, 1), 0) loop
    if not exists (select 1 from public.products p where p.external_id = v_product_ids[v_i]) then
      raise exception 'product not found: %', v_product_ids[v_i] using errcode = 'P0002';
    end if;
  end loop;

  for v_item in
    select poi.*
    from public.purchase_order_items poi
    where poi.order_id = p_order_id
      and poi.product_id is not null
    order by poi.product_id
  loop
    update public.products
    set quantity = quantity + v_item.quantity, updated_at = now()
    where external_id = v_item.product_id;
  end loop;

  update public.purchase_orders o
  set status = 'approved',
      approved_by = nullif(p_approved_by, ''),
      approved_at = now(),
      updated_at = now()
  where o.external_id = p_order_id
  returning * into v_order;

  return to_jsonb(v_order);
end $$;

revoke all on function public.update_invoice_with_stock(text, jsonb, jsonb) from public;
revoke all on function public.record_invoice_payment(text, jsonb) from public;
revoke all on function public.approve_purchase_order(text, text) from public;

do $$
begin
  execute 'revoke all on function public.create_invoice_with_stock(jsonb, jsonb) from public';
  execute 'revoke all on function public.update_invoice_with_stock(text, jsonb, jsonb) from public';
  execute 'revoke all on function public.record_invoice_payment(text, jsonb) from public';
  execute 'revoke all on function public.approve_purchase_order(text, text) from public';

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.create_invoice_with_stock(jsonb, jsonb) from anon';
    execute 'revoke all on function public.update_invoice_with_stock(text, jsonb, jsonb) from anon';
    execute 'revoke all on function public.record_invoice_payment(text, jsonb) from anon';
    execute 'revoke all on function public.approve_purchase_order(text, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.create_invoice_with_stock(jsonb, jsonb) from authenticated';
    execute 'revoke all on function public.update_invoice_with_stock(text, jsonb, jsonb) from authenticated';
    execute 'revoke all on function public.record_invoice_payment(text, jsonb) from authenticated';
    execute 'revoke all on function public.approve_purchase_order(text, text) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_invoice_with_stock(jsonb, jsonb) to service_role';
    execute 'grant execute on function public.update_invoice_with_stock(text, jsonb, jsonb) to service_role';
    execute 'grant execute on function public.record_invoice_payment(text, jsonb) to service_role';
    execute 'grant execute on function public.approve_purchase_order(text, text) to service_role';
  end if;
end $$;
