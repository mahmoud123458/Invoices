import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './config/supabase';

dotenv.config();

type SupabaseError = { message: string } | null;

async function assertResult(
  result: { error: SupabaseError },
  operation: string
): Promise<void> {
  if (result.error) {
    throw new Error(`${operation} failed: ${result.error.message}`);
  }
}

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) throw new Error('Supabase is not configured');
  return client;
}

export async function ensureInitialAdmin(
  client: SupabaseClient | null = supabase,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const db = requireClient(client);
  const { data: users, error: readError } = await db
    .from('users')
    .select('external_id')
    .limit(1);
  if (readError) throw new Error(`Unable to check for existing users: ${readError.message}`);
  if (users && users.length > 0) return false;

  const name = env.ADMIN_NAME?.trim();
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!name || !email || !password || password.length < 8) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 8 characters to initialize the production administrator');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await assertResult(
    await db.from('users').upsert({
      name,
      email,
      password_hash: passwordHash,
      role: 'admin',
    }, { onConflict: 'email', ignoreDuplicates: true }),
    'Unable to create the initial administrator'
  );
  console.log(`Initial administrator is ready for ${email}`);
  return true;
}

const demoUserIds = {
  admin: 'usr_admin_01',
  staff: 'usr_staff_02',
};

async function clearDemoDatabase(db: SupabaseClient): Promise<void> {
  const tables = [
    ['invoice_payments', 'invoice_id'],
    ['invoice_items', 'invoice_id'],
    ['invoices', 'external_id'],
    ['purchase_order_items', 'order_id'],
    ['purchase_orders', 'external_id'],
    ['expenses', 'external_id'],
    ['shipping_companies', 'external_id'],
    ['clients', 'external_id'],
    ['products', 'external_id'],
    ['users', 'external_id'],
  ] as const;

  for (const [table, key] of tables) {
    await assertResult(
      await db.from(table).delete().not(key, 'is', null),
      `Unable to clear ${table}`
    );
  }
}

export async function seedData(
  clean = false,
  client: SupabaseClient | null = supabase
): Promise<void> {
  const db = requireClient(client);
  if (clean && process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to clean Supabase data in production');
  }

  if (clean) {
    await clearDemoDatabase(db);
  } else {
    const { data: users, error } = await db.from('users').select('external_id').limit(1);
    if (error) throw new Error(`Unable to check for existing users: ${error.message}`);
    if (users && users.length > 0) {
      console.log('Database already has data. Skipping automatic seed.');
      return;
    }
  }

  const adminPassword = await bcrypt.hash('admin123', 10);
  const staffPassword = await bcrypt.hash('user123', 10);
  const now = new Date();
  const dbInDays = (days: number): string =>
    new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const users = [
    {
      external_id: demoUserIds.admin,
      name: 'Admin User',
      email: 'admin@invoices.com',
      password_hash: adminPassword,
      role: 'admin',
    },
    {
      external_id: demoUserIds.staff,
      name: 'Sales Staff',
      email: 'user@invoices.com',
      password_hash: staffPassword,
      role: 'user',
    },
  ];
  await assertResult(
    await db.from('users').upsert(users, { onConflict: 'external_id' }),
    'Unable to seed users'
  );

  const shippingCompanies = [
    {
      external_id: 'shp_01',
      name: 'Aramex Express',
      phone: '+20 2 3338 9700',
      email: 'support@aramex.com',
      address: 'Cairo Logistics Hub, Egypt',
      avg_delivery_days: 2,
      price_per_kg: 3.5,
      notes: 'Next-day delivery inside major metropolitan zones.',
      is_active: true,
    },
    {
      external_id: 'shp_02',
      name: 'DHL Global Express',
      phone: '+20 2 16345',
      email: 'express@dhl.com',
      address: 'Cairo Airport Cargo Village',
      avg_delivery_days: 1,
      price_per_kg: 6,
      notes: 'Priority express international & domestic shipping.',
      is_active: true,
    },
    {
      external_id: 'shp_03',
      name: 'Bosta Delivery',
      phone: '+20 109 999 8888',
      email: 'hello@bosta.co',
      address: 'Smart Village, Giza',
      avg_delivery_days: 3,
      price_per_kg: 2.5,
      notes: 'E-commerce and cash-on-delivery specialist.',
      is_active: true,
    },
  ];
  await assertResult(
    await db.from('shipping_companies').upsert(shippingCompanies, { onConflict: 'external_id' }),
    'Unable to seed shipping companies'
  );

  const products = [
    {
      external_id: 'prd_01',
      name: 'Dell XPS 15 Laptop',
      sku: 'DELL-XPS-15',
      description: '15.6 inch 4K OLED, 32GB RAM, 1TB SSD',
      quantity: 15,
      price: 1850,
      low_stock_alert: 5,
      category: 'Electronics',
    },
    {
      external_id: 'prd_02',
      name: 'Logitech MX Master 3S',
      sku: 'LOGI-MX3S',
      description: 'Ergonomic wireless productivity mouse',
      quantity: 45,
      price: 99,
      low_stock_alert: 10,
      category: 'Accessories',
    },
    {
      external_id: 'prd_03',
      name: 'Keychron Q1 Pro Mechanical Keyboard',
      sku: 'KEY-Q1-PRO',
      description: 'Custom wireless mechanical keyboard',
      quantity: 4,
      price: 199,
      low_stock_alert: 8,
      category: 'Accessories',
    },
    {
      external_id: 'prd_04',
      name: 'LG UltraFine 27" 4K Monitor',
      sku: 'LG-27-4K',
      description: 'IPS display with USB-C 90W PD',
      quantity: 12,
      price: 499,
      low_stock_alert: 5,
      category: 'Monitors',
    },
  ];
  await assertResult(
    await db.from('products').upsert(products, { onConflict: 'external_id' }),
    'Unable to seed products'
  );

  const clients = [
    {
      external_id: 'cli_01',
      name: 'Ahmed Mansour',
      company: 'Mansour Trading Co.',
      email: 'ahmed@mansour.com',
      phone: '+20 100 555 1234',
      address: '45 Nasr City, Cairo, Egypt',
      notes: 'VIP customer, preferred payment net-30.',
    },
    {
      external_id: 'cli_02',
      name: 'Sarah Khaled',
      company: 'Nile Creative Agency',
      email: 'sarah@nilecreative.com',
      phone: '+20 111 888 7766',
      address: '12 Zamalek, Cairo, Egypt',
      notes: null,
    },
    {
      external_id: 'cli_03',
      name: 'Modern Tech Solutions',
      company: 'MTS Enterprise',
      email: 'procurement@mts.org',
      phone: '+20 122 333 4455',
      address: 'New Cairo Technology Park',
      notes: 'Enterprise account',
    },
  ];
  await assertResult(
    await db.from('clients').upsert(clients, { onConflict: 'external_id' }),
    'Unable to seed clients'
  );

  const invoices = [
    {
      external_id: 'inv_01',
      invoice_number: 'INV-00001',
      client_id: 'cli_01',
      subtotal: 3898,
      tax: 14,
      discount: 100,
      total: 4343.72,
      paid_amount: 4343.72,
      status: 'paid',
      shipping_company_id: 'shp_01',
      shipping_status: 'delivered',
      delivered_at: dbInDays(-2),
      created_by: demoUserIds.admin,
    },
    {
      external_id: 'inv_02',
      invoice_number: 'INV-00002',
      client_id: 'cli_02',
      subtotal: 698,
      tax: 14,
      discount: 0,
      total: 795.72,
      paid_amount: 0,
      status: 'sent',
      shipping_company_id: 'shp_02',
      shipping_status: 'shipped',
      created_by: demoUserIds.staff,
    },
  ];
  await assertResult(
    await db.from('invoices').upsert(invoices, { onConflict: 'external_id' }),
    'Unable to seed invoices'
  );

  const invoiceItems = [
    { invoice_id: 'inv_01', product_id: 'prd_01', product_name: 'Dell XPS 15 Laptop', quantity: 2, unit_price: 1850, total: 3700 },
    { invoice_id: 'inv_01', product_id: 'prd_02', product_name: 'Logitech MX Master 3S', quantity: 2, unit_price: 99, total: 198 },
    { invoice_id: 'inv_02', product_id: 'prd_04', product_name: 'LG UltraFine 27" 4K Monitor', quantity: 1, unit_price: 499, total: 499 },
    { invoice_id: 'inv_02', product_id: 'prd_03', product_name: 'Keychron Q1 Pro Mechanical Keyboard', quantity: 1, unit_price: 199, total: 199 },
  ];
  await assertResult(
    await db.from('invoice_items').delete().in('invoice_id', invoices.map((invoice) => invoice.external_id)),
    'Unable to replace demo invoice items'
  );
  await assertResult(
    await db.from('invoice_items').insert(invoiceItems),
    'Unable to seed invoice items'
  );

  const purchaseOrders = [{
    external_id: 'po_01',
    order_number: 'PO-00001',
    supplier: 'TechSource Global Ltd.',
    supplier_contact: 'sales@techsource.com / +1 800 555 0199',
    subtotal: 4550,
    total: 4550,
    status: 'pending',
    notes: 'Urgent restocking order for upcoming month.',
    created_by: demoUserIds.staff,
  }];
  await assertResult(
    await db.from('purchase_orders').upsert(purchaseOrders, { onConflict: 'external_id' }),
    'Unable to seed purchase orders'
  );

  await assertResult(
    await db.from('purchase_order_items').delete().in('order_id', purchaseOrders.map((order) => order.external_id)),
    'Unable to replace demo purchase-order items'
  );
  await assertResult(
    await db.from('purchase_order_items').insert([
      { order_id: 'po_01', product_id: 'prd_03', product_name: 'Keychron Q1 Pro Mechanical Keyboard', quantity: 20, unit_price: 130, total: 2600 },
      { order_id: 'po_01', product_id: 'prd_02', product_name: 'Logitech MX Master 3S', quantity: 30, unit_price: 65, total: 1950 },
    ]),
    'Unable to seed purchase-order items'
  );

  console.log('Default Supabase demo data seeded successfully.');
}

if (require.main === module) {
  seedData(process.argv.includes('--clean')).catch((error: unknown) => {
    console.error('Supabase seeding failed:', error);
    process.exitCode = 1;
  });
}
