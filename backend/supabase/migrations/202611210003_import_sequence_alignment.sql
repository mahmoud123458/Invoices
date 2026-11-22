create or replace function public.align_imported_number_sequences()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
end;
$$;

revoke all on function public.align_imported_number_sequences() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.align_imported_number_sequences() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.align_imported_number_sequences() from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.align_imported_number_sequences() to service_role';
  end if;
end $$;
