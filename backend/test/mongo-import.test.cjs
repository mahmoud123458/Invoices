const assert = require('node:assert/strict');
const test = require('node:test');

const {
  TABLES,
  mapId,
  mapSourceDocuments,
} = require('../scripts/mongoImportMapping.cjs');
const { importMongoData, main } = require('../scripts/migrateMongoToSupabase.cjs');

const objectId = (value) => ({ toHexString: () => value, toString: () => value });

class MemorySupabase {
  constructor(initial = {}) {
    this.rows = Object.fromEntries(Object.entries(initial).map(([table, rows]) => [table, [...rows]]));
    this.calls = [];
    this.failTable = null;
    this.failMessage = 'write failed';
    this.rpcCalls = [];
  }

  from(table) {
    const query = { table, action: 'select', filters: [] };
    const chain = {
      select: () => chain,
      in: (column, values) => {
        query.filters.push({ column, values });
        return chain;
      },
      upsert: (rows, options) => {
        query.action = 'upsert';
        query.rows = rows;
        query.options = options;
        return execute();
      },
      delete: () => {
        query.action = 'delete';
        return chain;
      },
      insert: (rows) => {
        query.action = 'insert';
        query.rows = rows;
        return execute();
      },
      then: (resolve, reject) => Promise.resolve(execute()).then(resolve, reject),
    };

    const execute = () => {
      this.calls.push({ ...query, filters: [...query.filters] });
      if (this.failTable === query.table && query.action !== 'select') {
        return Promise.resolve({ data: null, error: { message: this.failMessage } });
      }
      const rows = this.rows[query.table] || (this.rows[query.table] = []);
      if (query.action === 'select') {
        const filter = query.filters[0];
        const data = filter
          ? rows.filter((row) => filter.values.includes(row[filter.column]))
          : rows;
        return Promise.resolve({ data: data.map((row) => ({ external_id: row.external_id })), error: null });
      }
      if (query.action === 'delete') {
        for (const filter of query.filters) {
          this.rows[query.table] = rows.filter((row) => !filter.values.includes(row[filter.column]));
        }
        return Promise.resolve({ data: null, error: null });
      }
      if (query.action === 'upsert') {
        for (const incoming of query.rows) {
          const index = rows.findIndex((row) => row.external_id === incoming.external_id);
          if (index < 0) rows.push({ ...incoming });
          else rows[index] = { ...rows[index], ...incoming };
        }
      } else {
        rows.push(...query.rows.map((row) => ({ ...row })));
      }
      return Promise.resolve({ data: query.rows, error: null });
    };

    return chain;
  }

  async rpc(name, args) {
    this.rpcCalls.push({ name, args });
    return { data: null, error: null };
  }
}

const collectionDb = (collections) => ({
  collection(name) {
    return {
      find() {
        const rows = collections[name] || [];
        let index = 0;
        const cursor = {
          batchSize: () => cursor,
          hasNext: async () => index < rows.length,
          next: async () => rows[index++],
          close: async () => {},
        };
        return cursor;
      },
    };
  },
});

const quietLogger = { log() {}, error() {} };

const basicFixtures = () => ({
  users: [{
    _id: objectId('user-1'),
    name: 'Admin',
    email: 'admin@example.com',
    password: 'stored-hash',
    role: 'admin',
  }],
  clients: [{ _id: 'client-1', name: 'Client', email: 'client@example.com' }],
  products: [{ _id: 'product-1', name: 'Widget', sku: 'W-1', quantity: 3, price: 4 }],
  shippingcompanies: [{ _id: 'ship-1', name: 'Carrier', phone: '555', isActive: true }],
  invoices: [{
    _id: 'invoice-1',
    invoiceNumber: 'INV-00001',
    client: 'client-1',
    createdBy: 'user-1',
    items: [{
      _id: objectId('invoice-item-1'),
      product: 'product-1',
      productName: 'Widget',
      quantity: 2,
      unitPrice: 4,
      total: 8,
    }],
    payments: [{
      _id: objectId('payment-1'),
      amount: 4,
      date: new Date('2026-01-02T00:00:00.000Z'),
      method: 'cash',
      recordedBy: 'user-1',
    }],
    subtotal: 8,
    total: 8,
    paidAmount: 4,
    status: 'sent',
  }],
  purchaseorders: [{
    _id: 'order-1',
    orderNumber: 'PO-00001',
    supplier: 'Supplier',
    createdBy: 'user-1',
    items: [{
      _id: objectId('order-item-1'),
      product: 'product-1',
      productName: 'Widget',
      quantity: 1,
      unitPrice: 4,
      total: 4,
    }],
    subtotal: 4,
    total: 4,
    status: 'pending',
  }],
  expenses: [{
    _id: 'expense-1',
    description: 'Delivery',
    category: 'Shipping',
    amount: 2,
    date: new Date('2026-01-02T00:00:00.000Z'),
    paymentMethod: 'cash',
    createdBy: 'user-1',
  }],
});

test('preserves Mongo IDs and maps all ten normalized tables', () => {
  const mapped = mapSourceDocuments(basicFixtures());

  assert.equal(mapId(objectId('object-id')), 'object-id');
  assert.deepEqual(Object.keys(mapped), TABLES);
  assert.equal(mapped.users[0].external_id, 'user-1');
  assert.equal(mapped.clients[0].external_id, 'client-1');
  assert.equal(mapped.products[0].external_id, 'product-1');
  assert.equal(mapped.shipping_companies[0].external_id, 'ship-1');
  assert.equal(mapped.invoices[0].external_id, 'invoice-1');
  assert.equal(mapped.invoice_items[0].external_id, 'invoice-item-1');
  assert.equal(mapped.invoice_items[0].invoice_id, 'invoice-1');
  assert.equal(mapped.invoice_payments[0].external_id, 'payment-1');
  assert.equal(mapped.invoice_payments[0].invoice_id, 'invoice-1');
  assert.equal(mapped.purchase_orders[0].external_id, 'order-1');
  assert.equal(mapped.purchase_order_items[0].external_id, 'order-item-1');
  assert.equal(mapped.purchase_order_items[0].order_id, 'order-1');
  assert.equal(mapped.expenses[0].external_id, 'expense-1');
});

test('maps nested records and preserves absent optional references as null', () => {
  const fixtures = basicFixtures();
  fixtures.invoices[0].shippingCompany = null;
  fixtures.invoices[0].createdBy = null;
  fixtures.invoices[0].items[0].product = null;
  fixtures.invoices[0].payments[0].recordedBy = null;

  const mapped = mapSourceDocuments(fixtures);

  assert.equal(mapped.invoices[0].shipping_company_id, null);
  assert.equal(mapped.invoices[0].created_by, null);
  assert.equal(mapped.invoice_items[0].product_id, null);
  assert.equal(mapped.invoice_payments[0].recorded_by, null);
  assert.equal(mapped.invoice_payments[0].payment_date, '2026-01-02T00:00:00.000Z');
  assert.equal(mapped.purchase_order_items[0].product_id, 'product-1');
});

test('Mongo rows overwrite Supabase conflicts and repeated imports replace nested rows', async () => {
  const supabase = new MemorySupabase({
    clients: [{ external_id: 'client-1', name: 'stale name' }],
    invoices: [{ external_id: 'invoice-1', invoice_number: 'INV-OLD' }],
  });
  const db = collectionDb(basicFixtures());

  const first = await importMongoData({ db, supabase, batchSize: 2, logger: quietLogger });
  const second = await importMongoData({ db, supabase, batchSize: 2, logger: quietLogger });

  assert.equal(first.tables.clients.imported, 1);
  assert.equal(second.tables.clients.imported, 1);
  assert.equal(supabase.rows.clients.find((row) => row.external_id === 'client-1').name, 'Client');
  assert.equal(supabase.rows.invoices.find((row) => row.external_id === 'invoice-1').invoice_number, 'INV-00001');
  assert.equal(supabase.rows.invoice_items.length, 1);
  assert.equal(supabase.rows.invoice_items[0].external_id, 'invoice-item-1');
  assert.equal(supabase.rows.invoice_payments.length, 1);
  assert.equal(supabase.rows.invoice_payments[0].external_id, 'payment-1');
  assert.equal(supabase.rows.purchase_order_items[0].external_id, 'order-item-1');
  assert.equal(supabase.rpcCalls.length, 2);
  assert.equal(supabase.rpcCalls[0].name, 'align_imported_number_sequences');
  assert.equal(supabase.calls.some((call) =>
    call.action === 'upsert' && call.options.onConflict === 'external_id'
  ), true);
});

test('skips and reports invoices whose required client reference is missing', async () => {
  const fixtures = basicFixtures();
  fixtures.invoices[0].client = 'unknown-client';
  const supabase = new MemorySupabase();

  const result = await importMongoData({ db: collectionDb(fixtures), supabase, logger: quietLogger });

  assert.equal(result.tables.invoices.skipped, 1);
  assert.equal(result.tables.invoices.imported, 0);
  assert.equal(supabase.rows.invoices, undefined);
});

test('nulls and reports invalid optional expense creator references', async () => {
  const fixtures = basicFixtures();
  fixtures.expenses[0].createdBy = 'missing-user';
  const output = [];
  const supabase = new MemorySupabase();

  const result = await importMongoData({
    db: collectionDb(fixtures),
    supabase,
    logger: { log: (message) => output.push(message), error: (message) => output.push(message) },
  });

  assert.equal(result.tables.expenses.imported, 1);
  assert.equal(supabase.rows.expenses[0].created_by, null);
  assert.match(output.join('\n'), /Expense creator reference is missing/);
});

test('uses bounded write batches', async () => {
  const fixtures = basicFixtures();
  fixtures.clients = Array.from({ length: 5 }, (_, index) => ({
    _id: `client-${index}`,
    name: `Client ${index}`,
  }));
  const supabase = new MemorySupabase();

  await importMongoData({ db: collectionDb(fixtures), supabase, batchSize: 2, logger: quietLogger });

  assert.equal(Math.max(...supabase.calls.filter((call) => call.action === 'upsert')
    .map((call) => call.rows.length)), 2);
});

test('sanitizes credentials and password hashes from progress and error output', async () => {
  const mongoUri = 'mongodb://import-user:super-secret@mongo.example/db';
  const serviceKey = 'service-role-secret';
  const passwordHash = `$2b$10$${'a'.repeat(53)}`;
  const fixtures = basicFixtures();
  fixtures.users[0].password = passwordHash;
  const supabase = new MemorySupabase();
  supabase.failTable = 'users';
  supabase.failMessage = `write failed for ${passwordHash} using ${serviceKey} and ${mongoUri}`;
  const output = [];
  const logger = {
    log: (message) => output.push(String(message)),
    error: (message) => output.push(String(message)),
  };

  const result = await importMongoData({
    db: collectionDb(fixtures),
    supabase,
    logger,
    secrets: [mongoUri, serviceKey],
  });
  const text = output.join('\n');

  assert.match(text, /users/);
  assert.doesNotMatch(text, /super-secret|service-role-secret|\$2b\$10\$a{53}/);
  assert.equal(result.tables.users.failed, 1);
});

test('requires MongoDB and Supabase credentials before connecting', async () => {
  let connectCalled = false;
  await assert.rejects(() => main({
    env: {},
    dependencies: {
      MongoClient: { connect: async () => { connectCalled = true; } },
      createSupabaseClient: () => { connectCalled = true; },
    },
    logger: { log() {}, error() {} },
  }), /MONGODB_URI, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are required/);
  assert.equal(connectCalled, false);
});
