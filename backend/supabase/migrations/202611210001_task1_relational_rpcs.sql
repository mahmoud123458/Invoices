-- Task 1: relational constraints, RLS isolation, and atomic transaction RPCs
-- This migration upgrades the checked-in schema without deleting existing records.

create extension if not exists "uuid-ossp";

create sequence if not exists public.invoice_number_seq as bigint start with 1 increment by 1;
create sequence if not exists public.purchase_order_number_seq as bigint start with 1 increment by 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.users'::regclass and conname='users_role_check') then
    alter table public.users add constraint users_role_check check (role in ('admin','user')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_invoice_number_format_check'
  ) then
    alter table public.invoices
      add constraint invoices_invoice_number_format_check
      check (invoice_number ~ '^INV-[0-9]{5,}$') not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.purchase_orders'::regclass
      and conname = 'purchase_orders_order_number_format_check'
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_order_number_format_check
      check (order_number ~ '^PO-[0-9]{5,}$') not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_paid_amount_limit_check'
  ) then
    alter table public.invoices
      add constraint invoices_paid_amount_limit_check
      check (paid_amount <= total) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_quantity_nonnegative_check') then
    alter table public.products add constraint products_quantity_nonnegative_check check (quantity >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_price_nonnegative_check') then
    alter table public.products add constraint products_price_nonnegative_check check (price >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_low_stock_nonnegative_check') then
    alter table public.products add constraint products_low_stock_nonnegative_check check (low_stock_alert >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.shipping_companies'::regclass and conname='shipping_avg_delivery_nonnegative_check') then
    alter table public.shipping_companies add constraint shipping_avg_delivery_nonnegative_check check (avg_delivery_days >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.shipping_companies'::regclass and conname='shipping_price_per_kg_nonnegative_check') then
    alter table public.shipping_companies add constraint shipping_price_per_kg_nonnegative_check check (price_per_kg >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.invoices'::regclass and conname='invoices_subtotal_nonnegative_check') then
    alter table public.invoices add constraint invoices_subtotal_nonnegative_check check (subtotal >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.invoices'::regclass and conname='invoices_tax_nonnegative_check') then
    alter table public.invoices add constraint invoices_tax_nonnegative_check check (tax >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.invoices'::regclass and conname='invoices_discount_nonnegative_check') then
    alter table public.invoices add constraint invoices_discount_nonnegative_check check (discount >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.invoices'::regclass and conname='invoices_total_nonnegative_check') then
    alter table public.invoices add constraint invoices_total_nonnegative_check check (total >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.invoices'::regclass and conname='invoices_paid_amount_nonnegative_check') then
    alter table public.invoices add constraint invoices_paid_amount_nonnegative_check check (paid_amount >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.invoices'::regclass and conname='invoices_status_check') then
    alter table public.invoices add constraint invoices_status_check check (status in ('draft','sent','paid','cancelled')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.invoices'::regclass and conname='invoices_shipping_status_check') then
    alter table public.invoices add constraint invoices_shipping_status_check check (shipping_status is null or shipping_status in ('pending','shipped','delivered','returned')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.invoice_items'::regclass and conname='invoice_items_quantity_positive_check') then
    alter table public.invoice_items add constraint invoice_items_quantity_positive_check check (quantity > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.invoice_items'::regclass and conname='invoice_items_unit_price_nonnegative_check') then
    alter table public.invoice_items add constraint invoice_items_unit_price_nonnegative_check check (unit_price >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.invoice_items'::regclass and conname='invoice_items_total_nonnegative_check') then
    alter table public.invoice_items add constraint invoice_items_total_nonnegative_check check (total >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.invoice_payments'::regclass and conname='invoice_payments_amount_positive_check') then
    alter table public.invoice_payments add constraint invoice_payments_amount_positive_check check (amount > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.invoice_payments'::regclass and conname='invoice_payments_method_check') then
    alter table public.invoice_payments add constraint invoice_payments_method_check check (method in ('cash','bank_transfer','card','cheque','other')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.purchase_orders'::regclass and conname='purchase_orders_subtotal_nonnegative_check') then
    alter table public.purchase_orders add constraint purchase_orders_subtotal_nonnegative_check check (subtotal >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.purchase_orders'::regclass and conname='purchase_orders_total_nonnegative_check') then
    alter table public.purchase_orders add constraint purchase_orders_total_nonnegative_check check (total >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.purchase_orders'::regclass and conname='purchase_orders_status_check') then
    alter table public.purchase_orders add constraint purchase_orders_status_check check (status in ('pending','approved','rejected','received')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.purchase_order_items'::regclass and conname='purchase_order_items_quantity_positive_check') then
    alter table public.purchase_order_items add constraint purchase_order_items_quantity_positive_check check (quantity > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.purchase_order_items'::regclass and conname='purchase_order_items_unit_price_nonnegative_check') then
    alter table public.purchase_order_items add constraint purchase_order_items_unit_price_nonnegative_check check (unit_price >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.purchase_order_items'::regclass and conname='purchase_order_items_total_nonnegative_check') then
    alter table public.purchase_order_items add constraint purchase_order_items_total_nonnegative_check check (total >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.expenses'::regclass and conname='expenses_amount_positive_check') then
    alter table public.expenses add constraint expenses_amount_positive_check check (amount > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.expenses'::regclass and conname='expenses_payment_method_check') then
    alter table public.expenses add constraint expenses_payment_method_check check (payment_method in ('cash','bank_transfer','card','cheque','other')) not valid;
  end if;
end $$;

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
alter table public.invoices
  alter column invoice_number set default (
    'INV-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0')
  );
alter table public.purchase_orders
  alter column order_number set default (
    'PO-' || lpad(nextval('public.purchase_order_number_seq')::text, 5, '0')
  );

do $$
declare
  v_policy record;
  v_last bigint;
begin
  for v_policy in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'users','clients','products','shipping_companies','invoices','invoice_items',
        'invoice_payments','purchase_orders','purchase_order_items','expenses'
      )
  loop
    execute format('drop policy %I on public.%I', v_policy.policyname, v_policy.tablename);
  end loop;

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
create or replace function public.create_invoice_with_stock(p_invoice jsonb, p_items jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_product_ids text[];
  v_product public.products%rowtype;
  v_item jsonb;
  v_id text;
  v_quantity integer;
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
  from (select v.value->>'product_id' as product_id
        from jsonb_array_elements(p_items) v) x
  where x.product_id is not null;

  for v_product in
    select p.* from public.products p
    where p.external_id = any(v_product_ids)
    order by p.external_id for update
  loop null; end loop;

  for v_id in select unnest(v_product_ids) loop
    if not exists (select 1 from public.products p where p.external_id = v_id) then
      raise exception 'product not found: %', v_id using errcode = 'P0002';
    end if;
  end loop;

  insert into public.invoices (
    external_id, client_id, subtotal, tax, discount, total, paid_amount, status,
    shipping_company_id, shipping_status, delivered_at, due_date, notes, created_by
  ) values (
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
  ) returning * into v_invoice;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := nullif(v_item->>'product_id', '');
    v_quantity := (v_item->>'quantity')::integer;
    if v_id is null or v_quantity is null or v_quantity <= 0
       or nullif(v_item->>'unit_price', '') is null
       or nullif(v_item->>'total', '') is null
       or (v_item->>'unit_price')::numeric(12,2) < 0
       or (v_item->>'total')::numeric(12,2) < 0 then
      raise exception 'invalid invoice item' using errcode = '22023';
    end if;
    select p.* into v_product from public.products p
    where p.external_id = v_id for update;
    if not found then
      raise exception 'product not found: %', v_id using errcode = 'P0002';
    end if;
    if v_product.quantity < v_quantity then
      raise exception 'insufficient stock: %', v_id using errcode = 'P0001';
    end if;
    update public.products
    set quantity = quantity - v_quantity, updated_at = now()
    where external_id = v_id;
    insert into public.invoice_items (
      invoice_id, product_id, product_name, quantity, unit_price, total
    ) values (
      v_invoice.external_id, v_id, v_item->>'product_name', v_quantity,
      (v_item->>'unit_price')::numeric(12,2),
      (v_item->>'total')::numeric(12,2)
    );
  end loop;

  select i.* into v_invoice from public.invoices i
  where i.external_id = v_invoice.external_id;
  return to_jsonb(v_invoice);
end $$;

create or replace function public.update_invoice_with_stock(
  p_invoice_id text, p_invoice jsonb, p_items jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_product_ids text[];
  v_product public.products%rowtype;
  v_item jsonb;
  v_id text;
  v_quantity integer;
begin
  if p_invoice_id is null or p_invoice is null or p_items is null
     or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid invoice payload' using errcode = '22023';
  end if;
  select i.* into v_invoice from public.invoices i
  where i.external_id = p_invoice_id for update;
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
    select ii.product_id from public.invoice_items ii
    where ii.invoice_id = p_invoice_id and ii.product_id is not null
    union
    select v.value->>'product_id' from jsonb_array_elements(p_items) v
  ) x where x.product_id is not null;

  for v_product in
    select p.* from public.products p
    where p.external_id = any(v_product_ids)
    order by p.external_id for update
  loop null; end loop;

  for v_id in select unnest(v_product_ids) loop
    if not exists (select 1 from public.products p where p.external_id = v_id) then
      raise exception 'product not found: %', v_id using errcode = 'P0002';
    end if;
  end loop;

  update public.products p
  set quantity = p.quantity + coalesce((
    select sum(ii.quantity)::integer from public.invoice_items ii
    where ii.invoice_id = p_invoice_id and ii.product_id = p.external_id
  ), 0), updated_at = now()
  where p.external_id = any(v_product_ids);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := nullif(v_item->>'product_id', '');
    v_quantity := (v_item->>'quantity')::integer;
    if v_id is null or v_quantity is null or v_quantity <= 0
       or nullif(v_item->>'unit_price', '') is null
       or nullif(v_item->>'total', '') is null
       or (v_item->>'unit_price')::numeric(12,2) < 0
       or (v_item->>'total')::numeric(12,2) < 0 then
      raise exception 'invalid invoice item' using errcode = '22023';
    end if;
    select p.* into v_product from public.products p
    where p.external_id = v_id for update;
    if not found then
      raise exception 'product not found: %', v_id using errcode = 'P0002';
    end if;
    if v_product.quantity < v_quantity then
      raise exception 'insufficient stock: %', v_id using errcode = 'P0001';
    end if;
    update public.products
    set quantity = quantity - v_quantity, updated_at = now()
    where external_id = v_id;
  end loop;

  delete from public.invoice_items where invoice_id = p_invoice_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.invoice_items (
      invoice_id, product_id, product_name, quantity, unit_price, total
    ) values (
      p_invoice_id, nullif(v_item->>'product_id', ''),
      v_item->>'product_name', (v_item->>'quantity')::integer,
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
  p_invoice_id text, p_payment jsonb
) returns jsonb language plpgsql security definer
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
  select i.* into v_invoice from public.invoices i
  where i.external_id = p_invoice_id for update;
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
  ) values (
    p_invoice_id, v_amount,
    coalesce(nullif(p_payment->>'payment_date', '')::timestamptz, now()),
    p_payment->>'method',
    nullif(p_payment->>'reference', ''),
    nullif(p_payment->>'notes', ''),
    nullif(p_payment->>'recorded_by', '')
  );
  update public.invoices i
  set paid_amount = v_new_paid,
      status = case when v_new_paid >= i.total then 'paid'
                    else case when i.status = 'paid' then 'sent' else i.status end end,
      updated_at = now()
  where i.external_id = p_invoice_id
  returning * into v_invoice;
  return to_jsonb(v_invoice);
end $$;

create or replace function public.approve_purchase_order(
  p_order_id text, p_approved_by text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.purchase_orders%rowtype;
  v_product_ids text[];
  v_product public.products%rowtype;
  v_item public.purchase_order_items%rowtype;
begin
  if p_order_id is null then
    raise exception 'invalid purchase order payload' using errcode = '22023';
  end if;
  select o.* into v_order from public.purchase_orders o
  where o.external_id = p_order_id for update;
  if not found then
    raise exception 'purchase order not found: %', p_order_id using errcode = 'P0002';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'invalid purchase order state: %', v_order.status using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct poi.product_id order by poi.product_id), '{}'::text[])
  into v_product_ids
  from public.purchase_order_items poi
  where poi.order_id = p_order_id and poi.product_id is not null;

  for v_product in
    select p.* from public.products p
    where p.external_id = any(v_product_ids)
    order by p.external_id for update
  loop null; end loop;

  for v_item in
    select poi.* from public.purchase_order_items poi
    where poi.order_id = p_order_id and poi.product_id is not null
    order by poi.product_id
  loop
    if not exists (select 1 from public.products p where p.external_id = v_item.product_id) then
      raise exception 'product not found: %', v_item.product_id using errcode = 'P0002';
    end if;
    update public.products
    set quantity = quantity + v_item.quantity, updated_at = now()
    where external_id = v_item.product_id;
  end loop;

  update public.purchase_orders o
  set status = 'approved', approved_by = nullif(p_approved_by, ''),
      approved_at = now(), updated_at = now()
  where o.external_id = p_order_id
  returning * into v_order;
  return to_jsonb(v_order);
end $$;

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