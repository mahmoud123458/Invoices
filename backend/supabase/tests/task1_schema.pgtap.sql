begin;
select plan(40);

insert into public.users(external_id,name,email,password_hash,role)
values ('usr_pgtap','pgTAP User','pgtap@example.invalid','pgTAP-test-only','user')
on conflict (external_id) do update set name=excluded.name;

insert into public.clients(external_id,name,email)
values ('cli_pgtap_stock','pgTAP stock','pgtap-stock@example.invalid')
on conflict (external_id) do update set name=excluded.name;

insert into public.products(external_id,name,sku,quantity,price)
values ('prd_pgtap_stock','pgTAP stock','PGTAP-STOCK',1,10)
on conflict (external_id) do update set quantity=1;

insert into public.invoices(external_id,invoice_number,client_id,total,paid_amount,status)
values ('inv_pgtap_update','INV-99997','cli_pgtap_stock',100,0,'draft')
on conflict (external_id) do update set total=100,paid_amount=0,status='draft';

insert into public.purchase_orders(external_id,order_number,supplier,total,status)
values ('po_pgtap_double','PO-99998','pgTAP',10,'pending')
on conflict (external_id) do update set status='pending';

insert into public.purchase_order_items(order_id,product_id,product_name,quantity,unit_price,total)
values ('po_pgtap_double','prd_pgtap_stock','pgTAP stock',1,10,10)
on conflict do nothing;

select has_table('public', 'users', 'users table exists');
select has_table('public', 'clients', 'clients table exists');
select has_table('public', 'products', 'products table exists');
select has_table('public', 'shipping_companies', 'shipping companies table exists');
select has_table('public', 'invoices', 'invoices table exists');
select has_table('public', 'invoice_items', 'invoice items table exists');
select has_table('public', 'invoice_payments', 'invoice payments table exists');
select has_table('public', 'purchase_orders', 'purchase orders table exists');
select has_table('public', 'purchase_order_items', 'purchase order items table exists');
select has_table('public', 'expenses', 'expenses table exists');

select col_type_is('public', 'products', 'quantity', 'integer', 'product quantity is integer');
select col_is_pk('public', 'invoices', 'id', 'invoice primary key exists');
select col_is_fk('public', 'invoices', 'client_id', 'invoice client reference exists');
select col_is_fk('public', 'invoice_items', 'invoice_id', 'invoice item reference exists');
select col_is_fk('public', 'invoice_payments', 'invoice_id', 'invoice payment reference exists');
select col_is_fk('public', 'purchase_order_items', 'order_id', 'purchase order item reference exists');

select has_function('public', 'create_invoice_with_stock', array['jsonb','jsonb'], 'create invoice RPC exists');
select has_function('public', 'update_invoice_with_stock', array['text','jsonb','jsonb'], 'update invoice RPC exists');
select has_function('public', 'record_invoice_payment', array['text','jsonb'], 'invoice payment RPC exists');
select has_function('public', 'approve_purchase_order', array['text','text'], 'purchase order approval RPC exists');

select is(
  (select count(*)::integer
   from pg_policies
   where schemaname = 'public'
     and tablename in (
       'users','clients','products','shipping_companies','invoices','invoice_items',
       'invoice_payments','purchase_orders','purchase_order_items','expenses'
     )),
  0,
  'application tables have no public policies'
);

select is(
  (select count(*)::integer
   from pg_tables t
   where t.schemaname = 'public'
     and t.tablename in (
       'users','clients','products','shipping_companies','invoices','invoice_items',
       'invoice_payments','purchase_orders','purchase_order_items','expenses'
     )
     and not exists (
       select 1
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = t.tablename
         and c.relrowsecurity
     )),
  0,
  'RLS is enabled on every application table'
);

select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.invoices'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%invoice_number%INV-%'),
  1,
  'invoice numbers are format-constrained'
);

select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.invoices'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%paid_amount%total%'),
  1,
  'paid amount cannot exceed invoice total in the canonical constraint'
);

select is(
  (case
     when exists (select 1 from pg_roles where rolname = 'anon')
     then has_function_privilege(
       'anon',
       'public.create_invoice_with_stock(jsonb,jsonb)',
       'execute'
     )
     else false
   end),
  false,
  'anonymous role cannot execute transaction RPC'
);

select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.users'::regclass
     and contype = 'c'
     and conname = 'users_role_check'),
  1,
  'user role is constrained to admin or user'
);

select throws_ok(
  $sql$insert into public.users(external_id,name,email,password_hash,role)
    values ('usr_pgtap_bad_role','Invalid Role','pgtap-invalid@example.invalid','pgTAP-test-only','invalid');$sql$,
  '23514',
  null,
  'disallowed user role is rejected'
);

select throws_ok(
  $sql$select public.record_invoice_payment(
    'missing-invoice',
    '{"amount":1,"method":"cash"}'::jsonb
  );$sql$,
  'P0002',
  'invoice not found: missing-invoice',
  'missing payment parent fails atomically'
);

select throws_ok(
  $sql$select public.create_invoice_with_stock(
    '{"external_id":"inv_pgtap_stock","client_id":"cli_pgtap_stock","total":20,"paid_amount":0}'::jsonb,
    '[{"product_id":"prd_pgtap_stock","product_name":"pgTAP stock","quantity":2,"unit_price":10,"total":20}]'::jsonb
  );$sql$,
  'P0001',
  'insufficient stock: prd_pgtap_stock',
  'negative inventory is rejected'
);

select is(
  (select quantity from public.products where external_id='prd_pgtap_stock'),
  1,
  'insufficient-stock rollback leaves inventory unchanged'
);

select is(
  (select count(*)::integer
   from public.invoices
   where external_id='inv_pgtap_stock'),
  0,
  'insufficient-stock rollback leaves no invoice'
);

select is(
  (select count(*)::integer
   from public.invoice_items
   where invoice_id='inv_pgtap_stock'),
  0,
  'insufficient-stock rollback leaves no invoice items'
);

select throws_ok(
  $sql$select public.create_invoice_with_stock(
    '{"external_id":"inv_pgtap_overpay","client_id":"cli_pgtap_stock","total":100,"paid_amount":101}'::jsonb,
    '[]'::jsonb
  );$sql$,
  'P0001',
  'invoice overpayment',
  'invoice creation rejects overpayment'
);

select is(
  (select count(*)::integer
   from public.invoices
   where external_id='inv_pgtap_overpay'),
  0,
  'overpayment rollback leaves no invoice'
);

select throws_ok(
  $sql$insert into public.invoices(external_id,invoice_number,client_id,total,paid_amount,status)
    values ('inv_pgtap_direct_overpay','INV-99996','cli_pgtap_stock',100,101,'draft');$sql$,
  'P0001',
  'invoice overpayment',
  'direct paid amount overpayment is rejected'
);

select throws_ok(
  $sql$select public.update_invoice_with_stock(
    'inv_pgtap_update',
    '{"total":100,"paid_amount":101}'::jsonb,
    '[]'::jsonb
  );$sql$,
  'P0001',
  'invoice overpayment',
  'invoice update rejects overpayment atomically'
);

select lives_ok(
  $sql$select public.approve_purchase_order('po_pgtap_double','usr_pgtap');$sql$,
  'purchase order can be approved once'
);

select throws_ok(
  $sql$select public.approve_purchase_order('po_pgtap_double','usr_pgtap');$sql$,
  'P0001',
  'invalid purchase order state: approved',
  'double purchase order approval is rejected'
);

do $$
begin
  perform setval('public.invoice_number_seq', 10, true);
  perform setval(
    'public.invoice_number_seq',
    greatest(
      2,
      (select s.last_value
       from pg_sequences s
       where s.schemaname='public'
         and s.sequencename='invoice_number_seq')
    ),
    true
  );
end $$;

select is(
  (nextval('public.invoice_number_seq')::integer),
  11,
  'invoice seed rerun preserves an ahead sequence state'
);

do $$
begin
  perform setval('public.purchase_order_number_seq', 5, true);
  perform setval(
    'public.purchase_order_number_seq',
    greatest(
      1,
      (select s.last_value
       from pg_sequences s
       where s.schemaname='public'
         and s.sequencename='purchase_order_number_seq')
    ),
    true
  );
end $$;

select is(
  (nextval('public.purchase_order_number_seq')::integer),
  6,
  'purchase-order seed rerun preserves an ahead sequence state'
);

select * from finish();
rollback;
