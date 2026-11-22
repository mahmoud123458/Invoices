alter table public.invoice_items
  add column if not exists external_id text;
update public.invoice_items
set external_id = 'iit_' || id::text
where external_id is null;
alter table public.invoice_items
  alter column external_id set default 'iit_' || substr(md5(random()::text), 1, 16),
  alter column external_id set not null;
create unique index if not exists idx_invoice_items_external_id
  on public.invoice_items(external_id);

alter table public.invoice_payments
  add column if not exists external_id text;
update public.invoice_payments
set external_id = 'pay_' || id::text
where external_id is null;
alter table public.invoice_payments
  alter column external_id set default 'pay_' || substr(md5(random()::text), 1, 16),
  alter column external_id set not null;
create unique index if not exists idx_invoice_payments_external_id
  on public.invoice_payments(external_id);

alter table public.purchase_order_items
  add column if not exists external_id text;
update public.purchase_order_items
set external_id = 'poi_' || id::text
where external_id is null;
alter table public.purchase_order_items
  alter column external_id set default 'poi_' || substr(md5(random()::text), 1, 16),
  alter column external_id set not null;
create unique index if not exists idx_po_items_external_id
  on public.purchase_order_items(external_id);
