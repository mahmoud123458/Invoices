create or replace function public.create_purchase_order_with_items(
  p_order jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.purchase_orders%rowtype;
  v_item jsonb;
  v_product_id text;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_status text;
begin
  if p_order is null
    or jsonb_typeof(p_order) <> 'object'
    or p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 50
  then
    raise exception 'invalid purchase order payload' using errcode = '22023';
  end if;

  if nullif(btrim(p_order->>'supplier'), '') is null then
    raise exception 'supplier is required' using errcode = '22023';
  end if;

  v_status := coalesce(nullif(p_order->>'status', ''), 'pending');
  if v_status not in ('pending', 'approved', 'rejected', 'received') then
    raise exception 'invalid purchase order status: %', v_status using errcode = '22023';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items) as items(value)
  loop
    v_product_id := nullif(v_item->>'product_id', '');
    if jsonb_typeof(v_item) <> 'object'
      or v_product_id is null
      or nullif(btrim(v_item->>'product_name'), '') is null
    then
      raise exception 'invalid purchase order item' using errcode = '22023';
    end if;

    begin
      v_quantity := (v_item->>'quantity')::integer;
      v_unit_price := (v_item->>'unit_price')::numeric(12,2);
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'invalid purchase order item quantity or unit price' using errcode = '22023';
    end;

    if v_quantity < 1 or v_unit_price < 0 then
      raise exception 'invalid purchase order item quantity or unit price' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.products where external_id = v_product_id
    ) then
      raise exception 'product not found: %', v_product_id using errcode = 'P0002';
    end if;

    v_subtotal := v_subtotal + (v_quantity * v_unit_price);
  end loop;

  insert into public.purchase_orders (
    external_id,
    order_number,
    supplier,
    supplier_contact,
    subtotal,
    total,
    status,
    notes,
    approved_by,
    approved_at,
    created_by
  )
  values (
    coalesce(nullif(p_order->>'external_id', ''), 'po_' || substr(md5(random()::text), 1, 8)),
    coalesce(
      nullif(p_order->>'order_number', ''),
      'PO-' || lpad(nextval('public.purchase_order_number_seq')::text, 5, '0')
    ),
    btrim(p_order->>'supplier'),
    nullif(p_order->>'supplier_contact', ''),
    v_subtotal,
    v_subtotal,
    v_status,
    p_order->>'notes',
    nullif(p_order->>'approved_by', ''),
    nullif(p_order->>'approved_at', '')::timestamptz,
    nullif(p_order->>'created_by', '')
  )
  returning * into v_order;

  for v_item in
    select value from jsonb_array_elements(p_items) as items(value)
  loop
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric(12,2);

    insert into public.purchase_order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      total
    )
    values (
      v_order.external_id,
      nullif(v_item->>'product_id', ''),
      btrim(v_item->>'product_name'),
      v_quantity,
      v_unit_price,
      v_quantity * v_unit_price
    );
  end loop;

  return to_jsonb(v_order);
end $$;

revoke all on function public.create_purchase_order_with_items(jsonb, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.create_purchase_order_with_items(jsonb, jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.create_purchase_order_with_items(jsonb, jsonb) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_purchase_order_with_items(jsonb, jsonb) to service_role';
  end if;
end $$;
