const assert = require('node:assert/strict');
const test = require('node:test');

const supabaseConfig = require('../dist/config/supabase');
const {
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getInvoiceStats,
  addInvoicePayment,
} = require('../dist/controllers/invoiceController');
const { getShippingStats } = require('../dist/controllers/shippingController');

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const installSupabase = (queryResults, rpcResults = {}) => {
  const calls = [];
  const results = [...queryResults];
  supabaseConfig.supabase = {
    from(table) {
      calls.push({ method: 'from', table });
      const result = results.shift() || { data: null, error: null };
      let chain;
      chain = new Proxy({}, {
        get(_target, method) {
          if (method === 'then') {
            return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
          }
          if (method === 'single' || method === 'maybeSingle') {
            return () => Promise.resolve(result);
          }
          return (...args) => {
            calls.push({ method, args });
            return chain;
          };
        },
      });
      return chain;
    },
    async rpc(name, args) {
      calls.push({ method: 'rpc', name, args });
      return rpcResults[name] || { data: null, error: null };
    },
  };
  return calls;
};

test('invoice listing reads Supabase and maps related records to the API shape', async () => {
  const calls = installSupabase([{
    data: [{
      id: 21,
      external_id: 'inv_external',
      invoice_number: 'INV-00021',
      client_id: 'cli_external',
      status: 'sent',
      total: 125,
      created_at: '2026-01-03T00:00:00Z',
      client: { external_id: 'cli_external', name: 'Client', email: 'client@example.com', phone: '123' },
      shippingCompany: { external_id: 'shp_external', name: 'Carrier', avg_delivery_days: 4 },
      createdBy: { external_id: 'usr_external', name: 'User' },
      items: [{
        id: 4,
        invoice_id: 'inv_external',
        product_id: 'prd_external',
        product_name: 'Product',
        quantity: 1,
        unit_price: 125,
        total: 125,
      }],
    }],
    error: null,
  }]);
  const res = createResponse();

  await getInvoices({ query: { status: 'sent', client: 'cli_external' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.data[0]._id, 'inv_external');
  assert.equal(res.body.data[0].invoiceNumber, 'INV-00021');
  assert.equal(res.body.data[0].client._id, 'cli_external');
  assert.equal(res.body.data[0].shippingCompany.avgDeliveryDays, 4);
  assert.equal(res.body.data[0].createdBy._id, 'usr_external');
  assert.equal(res.body.data[0].items[0].product, 'prd_external');
  const select = calls.find((call) => call.method === 'select').args[0];
  assert.match(select, /client:clients!invoices_client_id_fkey\(external_id,/);
  assert.match(select, /shippingCompany:shipping_companies!invoices_shipping_company_id_fkey\(external_id,/);
  assert.match(select, /createdBy:users!invoices_created_by_fkey\(external_id,/);
  assert.deepEqual(calls.filter((call) => call.method === 'eq'), [
    { method: 'eq', args: ['status', 'sent'] },
    { method: 'eq', args: ['client_id', 'cli_external'] },
  ]);
});

test('single invoice reads map nested items, payments, and related users', async () => {
  const calls = installSupabase([{
    data: {
      id: 21,
      external_id: 'inv_external',
      invoice_number: 'INV-00021',
      client_id: 'cli_external',
      total: 125,
      paid_amount: 25,
      status: 'sent',
      client: { external_id: 'cli_external', name: 'Client' },
      shippingCompany: { external_id: 'shp_external', name: 'Carrier' },
      createdBy: { external_id: 'usr_external', name: 'User', email: 'user@example.com' },
      items: [{
        id: 4,
        external_id: 'invoice-item-mongo-id',
        product_id: 'prd_external',
        product_name: 'Product',
        quantity: 1,
        unit_price: 125,
        total: 125,
        product: { external_id: 'prd_external', name: 'Product', sku: 'SKU-1' },
      }],
      payments: [{
        id: 7,
        external_id: 'payment-mongo-id',
        amount: 25,
        payment_date: '2026-02-01T00:00:00Z',
        method: 'cash',
        recorded_by: 'usr_external',
      }],
    },
    error: null,
  }]);
  const res = createResponse();

  await getInvoice({ params: { id: 'inv_external' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data._id, 'inv_external');
  assert.equal(res.body.data.client._id, 'cli_external');
  assert.equal(res.body.data.items[0]._id, 'invoice-item-mongo-id');
  assert.equal(res.body.data.items[0].product._id, 'prd_external');
  assert.equal(res.body.data.items[0].unitPrice, 125);
  assert.equal(res.body.data.payments[0]._id, 'payment-mongo-id');
  assert.equal(res.body.data.payments[0].date, '2026-02-01T00:00:00Z');
  assert.equal(res.body.data.payments[0].recordedBy, 'usr_external');
  const select = calls.find((call) => call.method === 'select').args[0];
  assert.match(select, /createdBy:users!invoices_created_by_fkey\(external_id,/);
});

test('invoice creation sends atomic stock RPC fields and returns camel-cased data', async () => {
  const calls = installSupabase([{
    data: {
      external_id: 'inv_created',
      invoice_number: 'INV-00022',
      client_id: 'cli_external',
      subtotal: 100,
      tax: 5,
      discount: 0,
      total: 105,
      paid_amount: 0,
      status: 'sent',
      client: { external_id: 'cli_external', name: 'Client' },
      shippingCompany: { external_id: 'shp_external', name: 'Carrier' },
      items: [],
    },
    error: null,
  }], {
    create_invoice_with_stock: {
      data: {
        external_id: 'inv_created',
        invoice_number: 'INV-00022',
        client_id: 'cli_external',
        subtotal: 100,
        tax: 5,
        discount: 0,
        total: 105,
        paid_amount: 0,
        status: 'sent',
      },
      error: null,
    },
  });
  const res = createResponse();

  await createInvoice({
    body: {
      client: 'cli_external',
      status: 'sent',
      shippingCompany: 'shp_external',
      items: [{ product: 'prd_external', productName: 'Product', quantity: '2', unitPrice: '50' }],
      tax: '5',
      discount: '0',
    },
    user: { _id: 'usr_external' },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data._id, 'inv_created');
  assert.equal(res.body.data.invoiceNumber, 'INV-00022');
  assert.equal(res.body.data.client._id, 'cli_external');
  assert.deepEqual(calls.find((call) => call.method === 'rpc'), {
    method: 'rpc',
    name: 'create_invoice_with_stock',
    args: {
      p_invoice: {
        client_id: 'cli_external',
        subtotal: 100,
        tax: 5,
        discount: 0,
        total: 105,
        paid_amount: 0,
        status: 'sent',
        shipping_company_id: 'shp_external',
        created_by: 'usr_external',
      },
      p_items: [{
        product_id: 'prd_external',
        product_name: 'Product',
        quantity: 2,
        unit_price: 50,
        total: 100,
      }],
    },
  });
});

test('invoice creation reports stock RPC errors with the existing validation response', async () => {
  installSupabase([{
    data: { name: 'Product', quantity: 1 },
    error: null,
  }], {
    create_invoice_with_stock: {
      data: null,
      error: { code: 'P0001', message: 'insufficient stock: prd_external' },
    },
  });
  const res = createResponse();

  await createInvoice({
    body: {
      client: 'cli_external',
      items: [{ product: 'prd_external', productName: 'Product', quantity: 2, unitPrice: 5 }],
    },
    user: { _id: 'usr_external' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Insufficient stock for Product. Available: 1');
});

test('invoice creation keeps missing-client validation at bad-request status', async () => {
  installSupabase([], {
    create_invoice_with_stock: {
      data: null,
      error: { code: 'P0002', message: 'client not found' },
    },
  });
  const res = createResponse();

  await createInvoice({
    body: {
      items: [{ product: 'prd_external', productName: 'Product', quantity: 1, unitPrice: 5 }],
    },
    user: { _id: 'usr_external' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Client not found');
});

test('invoice update sends text ID and mapped items to the atomic stock RPC', async () => {
  const calls = installSupabase([
    {
      data: {
        external_id: 'inv_external',
        client_id: 'cli_external',
        subtotal: 10,
        tax: 0,
        discount: 0,
        total: 10,
        paid_amount: 0,
        status: 'sent',
        shipping_status: null,
        items: [{ product_id: 'prd_external', quantity: 1 }],
      },
      error: null,
    },
    { data: [{ external_id: 'prd_external', name: 'Product' }], error: null },
  ], {
    update_invoice_with_stock: {
      data: null,
      error: { code: 'P0001', message: 'insufficient stock: prd_external' },
    },
  });
  const res = createResponse();

  await updateInvoice({
    params: { id: 'inv_external' },
    body: {
      items: [{ product: 'prd_external', quantity: 3, unitPrice: 10 }],
    },
    user: { _id: 'usr_external' },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, 'Insufficient stock for the updated invoice quantities');
  const rpcCall = calls.find((call) => call.method === 'rpc');
  assert.equal(rpcCall.name, 'update_invoice_with_stock');
  assert.equal(rpcCall.args.p_invoice_id, 'inv_external');
  assert.deepEqual(rpcCall.args.p_items, [{
    product_id: 'prd_external',
    product_name: 'Product',
    quantity: 3,
    unit_price: 10,
    total: 30,
  }]);
});

test('invoice update forwards explicit nullable clears and empty notes to the RPC', async () => {
  const calls = installSupabase([
    {
      data: {
        external_id: 'inv_external',
        client_id: 'cli_external',
        subtotal: 10,
        tax: 0,
        discount: 0,
        total: 10,
        paid_amount: 0,
        status: 'sent',
        shipping_status: 'delivered',
        delivered_at: '2026-01-03T00:00:00Z',
        notes: 'Keep these notes',
        items: [{ product_id: 'prd_external', quantity: 1 }],
      },
      error: null,
    },
    { data: [{ external_id: 'prd_external', name: 'Product' }], error: null },
    {
      data: {
        external_id: 'inv_external',
        client_id: 'cli_external',
        total: 10,
        status: 'sent',
        shipping_status: null,
        delivered_at: null,
        notes: '',
        items: [],
        payments: [],
      },
      error: null,
    },
  ], {
    update_invoice_with_stock: {
      data: { external_id: 'inv_external' },
      error: null,
    },
  });
  const res = createResponse();

  await updateInvoice({
    params: { id: 'inv_external' },
    body: {
      items: [{ product: 'prd_external', quantity: 1, unitPrice: 10 }],
      shippingStatus: null,
      deliveredAt: null,
      notes: '',
    },
    user: { _id: 'usr_external' },
  }, res);

  assert.equal(res.statusCode, 200);
  const payload = calls.find((call) => call.method === 'rpc').args.p_invoice;
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'shipping_status'), true);
  assert.equal(payload.shipping_status, null);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'delivered_at'), true);
  assert.equal(payload.delivered_at, null);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'notes'), true);
  assert.equal(payload.notes, '');
});

test('invoice payments call the RPC with schema keys and return mapped invoice data', async () => {
  const calls = installSupabase([{
    data: {
      external_id: 'inv_external',
      total: 100,
      paid_amount: 0,
      status: 'sent',
    },
    error: null,
  }, {
    data: {
      external_id: 'inv_external',
      invoice_number: 'INV-00021',
      total: 100,
      paid_amount: 25.56,
      status: 'sent',
      client: { external_id: 'cli_external', name: 'Client' },
      items: [],
      payments: [{
        id: 7,
        amount: 25.56,
        payment_date: '2026-03-04T00:00:00.000Z',
        method: 'card',
        reference: 'receipt',
        recorded_by: 'usr_external',
      }],
    },
    error: null,
  }], {
    record_invoice_payment: {
      data: {
        external_id: 'inv_external',
        paid_amount: 25.56,
        status: 'sent',
      },
      error: null,
    },
  });
  const res = createResponse();

  await addInvoicePayment({
    params: { id: 'inv_external' },
    body: { amount: 25.555, date: '2026-03-04', method: 'card', reference: ' receipt ' },
    user: { _id: 'usr_external' },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.paidAmount, 25.56);
  assert.equal(res.body.data.payments[0].date, '2026-03-04T00:00:00.000Z');
  assert.equal(res.body.data.payments[0].recordedBy, 'usr_external');
  assert.deepEqual(calls.find((call) => call.method === 'rpc'), {
    method: 'rpc',
    name: 'record_invoice_payment',
    args: {
      p_invoice_id: 'inv_external',
      p_payment: {
        amount: 25.56,
        payment_date: '2026-03-04T00:00:00.000Z',
        method: 'card',
        reference: 'receipt',
        notes: null,
        recorded_by: 'usr_external',
      },
    },
  });
});

test('invoice payment rejects an overpayment before calling the RPC', async () => {
  const calls = installSupabase([{
    data: { external_id: 'inv_external', total: 100, paid_amount: 80, status: 'sent' },
    error: null,
  }]);
  const res = createResponse();

  await addInvoicePayment({
    params: { id: 'inv_external' },
    body: { amount: 25, method: 'cash' },
    user: { _id: 'usr_external' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Payment cannot exceed the remaining invoice balance');
  assert.equal(calls.some((call) => call.method === 'rpc'), false);
});

test('invoice payment translates atomic overpayment errors to a conflict response', async () => {
  installSupabase([{
    data: { external_id: 'inv_external', total: 100, paid_amount: 0, status: 'sent' },
    error: null,
  }], {
    record_invoice_payment: {
      data: null,
      error: { code: 'P0001', message: 'invoice overpayment' },
    },
  });
  const res = createResponse();

  await addInvoicePayment({
    params: { id: 'inv_external' },
    body: { amount: 25, method: 'cash' },
    user: { _id: 'usr_external' },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, 'The invoice balance changed. Refresh and try again.');
});

test('invoice deletion checks unpaid status and deletes by text external ID', async () => {
  const calls = installSupabase([
    { data: { external_id: 'inv_external', paid_amount: 0, status: 'sent' }, error: null },
    { data: { external_id: 'inv_external' }, error: null },
  ]);
  const res = createResponse();

  await deleteInvoice({ params: { id: 'inv_external' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: 'Invoice deleted successfully' });
  assert.equal(calls.some((call) => call.method === 'delete'), true);
  assert.equal(calls.filter((call) => call.method === 'eq').every((call) =>
    call.args[0] === 'external_id' && call.args[1] === 'inv_external'), true);
});

test('invoice statistics retain the grouped response envelope and paid revenue total', async () => {
  installSupabase([{
    data: [
      { status: 'sent', total: 40 },
      { status: 'paid', total: 60 },
      { status: 'paid', total: 25 },
    ],
    error: null,
  }]);
  const res = createResponse();

  await getInvoiceStats({}, res);

  assert.deepEqual(res.body, {
    success: true,
    data: {
      byStatus: [
        { _id: 'sent', count: 1, total: 40 },
        { _id: 'paid', count: 2, total: 85 },
      ],
      totalRevenue: 85,
    },
  });
});

test('shipping statistics count Supabase invoices and surface count errors', async () => {
  const calls = installSupabase([
    {
      data: { external_id: 'shp_external', name: 'Carrier', avg_delivery_days: 4 },
      error: null,
    },
    { data: null, count: 5, error: null },
    { data: null, count: 3, error: null },
  ]);
  const res = createResponse();

  await getShippingStats({ params: { id: 'shp_external' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.stats, {
    totalInvoices: 5,
    deliveredInvoices: 3,
    deliveryRate: 60,
    avgDeliveryDays: 4,
  });
  assert.equal(calls.filter((call) => call.method === 'from' && call.table === 'invoices').length, 2);
  assert.equal(calls.some((call) =>
    call.method === 'eq' && call.args[0] === 'shipping_company_id' && call.args[1] === 'shp_external'), true);
  assert.equal(calls.some((call) =>
    call.method === 'eq' && call.args[0] === 'shipping_status' && call.args[1] === 'delivered'), true);

  installSupabase([
    { data: { external_id: 'shp_external', name: 'Carrier' }, error: null },
    { data: null, count: null, error: { message: 'database unavailable' } },
  ]);
  const failedResponse = createResponse();
  await getShippingStats({ params: { id: 'shp_external' } }, failedResponse);
  assert.equal(failedResponse.statusCode, 500);
  assert.deepEqual(failedResponse.body, { success: false, message: 'Server error' });
});
