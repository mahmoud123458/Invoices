begin;
select plan(14);

insert into public.users(external_id,name,email,password_hash,role)
values ('usr_pgtap_po','pgTAP PO User','pgtap-po@example.invalid','pgTAP-test-only','admin')
on conflict (external_id) do update set role = 'admin';

insert into public.products(external_id,name,sku,quantity,price)
values ('prd_pgtap_po','pgTAP PO Product','PGTAP-PO',4,10)
on conflict (external_id) do update set quantity = 4;

select has_function(
  'public',
  'create_purchase_order_with_items',
  array['jsonb','jsonb'],
  'purchase order creation RPC exists'
);

select is(
  case when exists (select 1 from pg_roles where rolname = 'anon')
    then has_function_privilege('anon', 'public.create_purchase_order_with_items(jsonb,jsonb)', 'execute')
    else false
  end,
  false,
  'anonymous role cannot execute purchase order creation'
);

select is(
  case when exists (select 1 from pg_roles where rolname = 'service_role')
    then has_function_privilege('service_role', 'public.create_purchase_order_with_items(jsonb,jsonb)', 'execute')
    else false
  end,
  true,
  'service role can execute purchase order creation'
);

create temporary table pgtap_created_purchase_order as
select public.create_purchase_order_with_items(
  '{"supplier":"PGTAP Supplier","status":"pending","created_by":"usr_pgtap_po"}'::jsonb,
  '[{"product_id":"prd_pgtap_po","product_name":"PGTAP PO Product","quantity":3,"unit_price":10,"total":30}]'::jsonb
) as row;

select is(
  (select row->>'supplier' from pgtap_created_purchase_order),
  'PGTAP Supplier',
  'creation returns the inserted purchase order'
);

select ok(
  (select (row->>'order_number') ~ '^PO-[0-9]{5,}$' from pgtap_created_purchase_order),
  'creation allocates a sequence-backed order number'
);

select is(
  (select count(*)::integer
   from public.purchase_order_items
   where order_id = (select row->>'external_id' from pgtap_created_purchase_order)),
  1,
  'creation inserts purchase-order items'
);

select is(
  (select quantity from public.products where external_id = 'prd_pgtap_po'),
  4,
  'creation does not change inventory'
);

select throws_ok(
  $sql$select public.create_purchase_order_with_items(
    '{"external_id":"po_pgtap_missing_product","supplier":"Invalid","status":"pending","created_by":"usr_pgtap_po"}'::jsonb,
    '[{"product_id":"prd_pgtap_missing","product_name":"Missing","quantity":1,"unit_price":1,"total":1}]'::jsonb
  );$sql$,
  'P0002',
  'product not found: prd_pgtap_missing',
  'missing purchase-order product is rejected'
);

select is(
  (select count(*)::integer
   from public.purchase_orders
   where external_id = 'po_pgtap_missing_product'),
  0,
  'failed creation leaves no purchase order'
);

select lives_ok(
  $sql$select public.approve_purchase_order(
    (select row->>'external_id' from pgtap_created_purchase_order),
    'usr_pgtap_po'
  );$sql$,
  'pending purchase order can be approved'
);

select is(
  (select quantity from public.products where external_id = 'prd_pgtap_po'),
  7,
  'approval adds ordered quantities to inventory'
);

select is(
  (select status from public.purchase_orders
   where external_id = (select row->>'external_id' from pgtap_created_purchase_order)),
  'approved',
  'approval changes the order status'
);

select throws_ok(
  $sql$select public.approve_purchase_order(
    (select row->>'external_id' from pgtap_created_purchase_order),
    'usr_pgtap_po'
  );$sql$,
  'P0001',
  'invalid purchase order state: approved',
  'a purchase order cannot be approved twice'
);

select is(
  (select quantity from public.products where external_id = 'prd_pgtap_po'),
  7,
  'repeated approval does not change inventory'
);

select * from finish();
rollback;
