-- ==============================================================================
-- INVOICE MANAGEMENT SYSTEM - INITIAL SEED DATA
-- ==============================================================================

-- 1. Insert Users (Password: admin123 and user123)
insert into public.users (external_id, name, email, password_hash, role) values
('usr_admin_01', 'Admin User', 'admin@invoices.com', '$2a$10$wTqKj1b0o9Jvx6o0Fm70xeQ5iHl1z39H3WzB32K3c3n7Jv2uM7C9S', 'admin'),
('usr_staff_02', 'Sales Staff', 'user@invoices.com', '$2a$10$wTqKj1b0o9Jvx6o0Fm70xeQ5iHl1z39H3WzB32K3c3n7Jv2uM7C9S', 'user')
on conflict (email) do nothing;

-- 2. Insert Clients
insert into public.clients (external_id, name, company, email, phone, address, notes) values
('cli_01', 'Ahmed Mansour', 'Mansour Trading Co.', 'ahmed@mansour.com', '+20 100 555 1234', '45 Nasr City, Cairo, Egypt', 'VIP customer, preferred payment net-30.'),
('cli_02', 'Sarah Khaled', 'Nile Creative Agency', 'sarah@nilecreative.com', '+20 111 888 7766', '12 Zamalek, Cairo, Egypt', ''),
('cli_03', 'Modern Tech Solutions', 'MTS Enterprise', 'procurement@mts.org', '+20 122 333 4455', 'New Cairo Technology Park', 'Enterprise account')
on conflict (external_id) do nothing;

-- 3. Insert Products
insert into public.products (external_id, name, sku, description, quantity, price, low_stock_alert, category) values
('prd_01', 'Dell XPS 15 Laptop', 'DELL-XPS-15', '15.6 inch 4K OLED, 32GB RAM, 1TB SSD', 15, 1850.00, 5, 'Electronics'),
('prd_02', 'Logitech MX Master 3S', 'LOGI-MX3S', 'Ergonomic wireless productivity mouse', 45, 99.00, 10, 'Accessories'),
('prd_03', 'Keychron Q1 Pro Mechanical Keyboard', 'KEY-Q1-PRO', 'Custom wireless mechanical keyboard', 4, 199.00, 8, 'Accessories'),
('prd_04', 'LG UltraFine 27" 4K Monitor', 'LG-27-4K', 'IPS display with USB-C 90W PD', 12, 499.00, 5, 'Monitors')
on conflict (sku) do nothing;

-- 4. Insert Shipping Companies
insert into public.shipping_companies (external_id, name, phone, email, address, avg_delivery_days, price_per_kg, notes, is_active) values
('shp_01', 'Aramex Express', '+20 2 3338 9700', 'support@aramex.com', 'Cairo Logistics Hub, Egypt', 2, 3.50, 'Next-day delivery inside major metropolitan zones.', true),
('shp_02', 'DHL Global Express', '+20 2 16345', 'express@dhl.com', 'Cairo Airport Cargo Village', 1, 6.00, 'Priority express international & domestic shipping.', true),
('shp_03', 'Bosta Delivery', '+20 109 999 8888', 'hello@bosta.co', 'Smart Village, Giza', 3, 2.50, 'E-commerce and cash-on-delivery specialist.', true)
on conflict (external_id) do nothing;

-- 5. Insert Sample Invoices
insert into public.invoices (external_id, invoice_number, client_id, subtotal, tax, discount, total, paid_amount, status, shipping_company_id, shipping_status, delivered_at, created_by) values
('inv_01', 'INV-00001', 'cli_01', 3898.00, 14.00, 100.00, 4343.72, 4343.72, 'paid', 'shp_01', 'delivered', now() - interval '2 days', 'usr_admin_01'),
('inv_02', 'INV-00002', 'cli_02', 698.00, 14.00, 0.00, 795.72, 0.00, 'sent', 'shp_02', 'shipped', null, 'usr_staff_02')
on conflict (invoice_number) do nothing;

-- 6. Insert Invoice Items
insert into public.invoice_items (invoice_id, product_id, product_name, quantity, unit_price, total) values
('inv_01', 'prd_01', 'Dell XPS 15 Laptop', 2, 1850.00, 3700.00),
('inv_01', 'prd_02', 'Logitech MX Master 3S', 2, 99.00, 198.00),
('inv_02', 'prd_04', 'LG UltraFine 27" 4K Monitor', 1, 499.00, 499.00),
('inv_02', 'prd_03', 'Keychron Q1 Pro Mechanical Keyboard', 1, 199.00, 199.00);

-- 7. Insert Purchase Orders
insert into public.purchase_orders (external_id, order_number, supplier, supplier_contact, subtotal, total, status, notes, created_by) values
('po_01', 'PO-00001', 'TechSource Global Ltd.', 'sales@techsource.com / +1 800 555 0199', 4550.00, 4550.00, 'pending', 'Urgent restocking order for upcoming month.', 'usr_staff_02')
on conflict (order_number) do nothing;

-- 8. Insert Purchase Order Items
insert into public.purchase_order_items (order_id, product_id, product_name, quantity, unit_price, total) values
('po_01', 'prd_03', 'Keychron Q1 Pro Mechanical Keyboard', 20, 130.00, 2600.00),
('po_01', 'prd_02', 'Logitech MX Master 3S', 30, 65.00, 1950.00);

-- Keep number sequences aligned with any explicit seed numbers.
do $$
declare
  v_last bigint;
begin
  select coalesce(max((regexp_replace(invoice_number, '^INV-', '')::bigint)), 0)
  into v_last
  from public.invoices
  where invoice_number ~ '^INV-[0-9]{5,}$';
  perform setval(
    'public.invoice_number_seq',
    greatest(
      v_last,
      coalesce(
        (select s.last_value
         from pg_sequences s
         where s.schemaname='public'
           and s.sequencename='invoice_number_seq'),
        1
      )
    ),
    true
  );

  select coalesce(max((regexp_replace(order_number, '^PO-', '')::bigint)), 0)
  into v_last
  from public.purchase_orders
  where order_number ~ '^PO-[0-9]{5,}$';
  perform setval(
    'public.purchase_order_number_seq',
    greatest(
      v_last,
      coalesce(
        (select s.last_value
         from pg_sequences s
         where s.schemaname='public'
           and s.sequencename='purchase_order_number_seq'),
        1
      )
    ),
    true
  );
end $$;

