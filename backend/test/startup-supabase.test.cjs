const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const test = require('node:test');

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const supabaseConfig = require('../dist/config/supabase');

const createSupabase = () => {
  const tables = {};
  const calls = [];
  return {
    tables,
    calls,
    from(table) {
      const state = { table, action: 'select', filters: [], options: null, rows: [] };
      const rows = () => tables[table] || (tables[table] = []);
      const query = {};
      const execute = () => {
        calls.push({ table, action: state.action, rows: state.rows, options: state.options });
        if (state.action === 'select') {
          const filter = state.filters[0];
          const selected = filter
            ? rows().filter((row) => filter.values.includes(row[filter.column]))
            : rows();
          return { data: selected, error: null };
        }
        if (state.action === 'delete') {
          const remaining = rows().filter((row) =>
            !state.filters.every((filter) => filter.values.includes(row[filter.column]))
          );
          tables[table] = remaining;
          return { data: null, error: null };
        }
        if (state.action === 'upsert') {
          const key = state.options.onConflict || 'external_id';
          for (const incoming of state.rows) {
            const index = rows().findIndex((row) => row[key] === incoming[key]);
            if (index < 0) rows().push({ ...incoming });
            else if (!state.options.ignoreDuplicates) rows()[index] = { ...rows()[index], ...incoming };
          }
          return { data: rows(), error: null };
        }
        rows().push(...state.rows.map((row) => ({ ...row })));
        return { data: state.rows, error: null };
      };
      Object.assign(query, {
        select() {
          state.action = 'select';
          return query;
        },
        limit(count) {
          return Promise.resolve({ ...execute(), data: rows().slice(0, count) });
        },
        delete() {
          state.action = 'delete';
          return query;
        },
        not(column, operator, value) {
          assert.equal(operator, 'is');
          assert.equal(value, null);
          state.filters.push({ column, values: [undefined, null] });
          return query;
        },
        in(column, values) {
          state.filters.push({ column, values });
          return query;
        },
        upsert(row, options) {
          state.action = 'upsert';
          state.rows = Array.isArray(row) ? row : [row];
          state.options = options;
          return Promise.resolve(execute());
        },
        insert(insertRows) {
          state.action = 'insert';
          state.rows = insertRows;
          return Promise.resolve(execute());
        },
        then(resolve, reject) {
          return Promise.resolve(execute()).then(resolve, reject);
        },
      });
      return query;
    },
  };
};

test('configured production startup bootstraps the initial administrator only once', async () => {
  const client = createSupabase();
  supabaseConfig.supabase = client;
  supabaseConfig.isSupabaseConfigured = true;
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_NAME = 'Initial Admin';
  process.env.ADMIN_EMAIL = 'admin@example.com';
  process.env.ADMIN_PASSWORD = 'a-secure-test-password';
  const { initializeDatabase } = require('../dist/startup');

  await initializeDatabase();
  await initializeDatabase();

  assert.equal(client.tables.users.length, 1);
  assert.equal(client.tables.users[0].name, 'Initial Admin');
  assert.equal(client.tables.users[0].email, 'admin@example.com');
  assert.equal(client.tables.users[0].role, 'admin');
  assert.equal(await bcrypt.compare('a-secure-test-password', client.tables.users[0].password_hash), true);
  assert.equal(client.calls.filter((call) => call.action === 'upsert').length, 1);
});

test('production startup refuses an unavailable Supabase client', async () => {
  supabaseConfig.supabase = null;
  supabaseConfig.isSupabaseConfigured = false;
  process.env.NODE_ENV = 'production';
  const { initializeDatabase } = require('../dist/startup');

  await assert.rejects(initializeDatabase(), /Supabase is not configured/);
});

test('development seed data is repeatable and retains demo records', async () => {
  const client = createSupabase();
  supabaseConfig.supabase = client;
  supabaseConfig.isSupabaseConfigured = true;
  process.env.NODE_ENV = 'development';
  const { seedData } = require('../dist/seed');

  await seedData(false);
  await seedData(false);

  assert.equal(client.tables.users.length, 2);
  assert.equal(client.tables.clients.length, 3);
  assert.equal(client.tables.products.length, 4);
  assert.equal(client.tables.shipping_companies.length, 3);
  assert.equal(client.tables.invoices.length, 2);
  assert.equal(client.tables.invoice_items.length, 4);
  assert.equal(client.tables.purchase_orders.length, 1);
  assert.equal(client.tables.purchase_order_items.length, 2);
  assert.equal(await bcrypt.compare('admin123', client.tables.users.find((user) =>
    user.email === 'admin@invoices.com'
  ).password_hash), true);
});
