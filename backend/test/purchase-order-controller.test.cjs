const assert = require('node:assert/strict');
const test = require('node:test');

const supabaseConfig = require('../dist/config/supabase');
const {
  getPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  approvePurchaseOrder,
  rejectPurchaseOrder,
} = require('../dist/controllers/purchaseOrderController');

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

const installSupabase = (queryResults = [], rpcResults = {}) => {
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

const purchaseOrderRecord = (overrides = {}) => ({
  id: 8,
  external_id: 'po_external',
  order_number: 'PO-00008',
  supplier: 'Supplier',
  supplier_contact: 'supplier@example.com',
  subtotal: 24,
  total: 24,
  status: 'pending',
  notes: '',
  created_by: 'usr_creator',
  approved_by: null,
  approved_at: null,
  createdBy: { external_id: 'usr_creator', name: 'Creator', email: 'creator@example.com' },
  approvedBy: null,
  items: [{
    id: 5,
    order_id: 'po_external',
    product_id: 'prd_external',
    external_id: 'order-item-mongo-id',
    product_name: 'Product',
    quantity: 2,
    unit_price: 12,
    total: 24,
    product: { external_id: 'prd_external', name: 'Product' },
  }],
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
  ...overrides,
});

test('purchase-order listing filters by status and maps related data', async () => {
  const calls = installSupabase([{
    data: [purchaseOrderRecord({
      items: [{
        id: 5,
        external_id: 'order-item-mongo-id',
        order_id: 'po_external',
        product_id: 'prd_external',
        product_name: 'Product',
        quantity: 2,
        unit_price: 12,
        total: 24,
      }],
    })],
    error: null,
  }]);
  const res = createResponse();

  await getPurchaseOrders({ query: { status: 'pending' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.data[0]._id, 'po_external');
  assert.equal(res.body.data[0].orderNumber, 'PO-00008');
  assert.equal(res.body.data[0].createdBy._id, 'usr_creator');
  assert.equal(res.body.data[0].items[0]._id, 'order-item-mongo-id');
  assert.equal(res.body.data[0].items[0].product, 'prd_external');
  const select = calls.find((call) => call.method === 'select').args[0];
  assert.match(select, /createdBy:users!purchase_orders_created_by_fkey\(external_id,/);
  assert.match(select, /approvedBy:users!purchase_orders_approved_by_fkey\(external_id,/);
  assert.equal(calls.some((call) => call.method === 'eq' && call.args[0] === 'status' && call.args[1] === 'pending'), true);
});

test('single purchase order maps populated product and user references', async () => {
  const calls = installSupabase([{ data: purchaseOrderRecord(), error: null }]);
  const res = createResponse();

  await getPurchaseOrder({ params: { id: 'po_external' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data._id, 'po_external');
  assert.equal(res.body.data.items[0]._id, 'order-item-mongo-id');
  assert.equal(res.body.data.items[0].product._id, 'prd_external');
  assert.equal(res.body.data.items[0].unitPrice, 12);
  assert.equal(res.body.data.createdBy.email, 'creator@example.com');
  const select = calls.find((call) => call.method === 'select').args[0];
  assert.match(select, /createdBy:users!purchase_orders_created_by_fkey\(external_id,/);
  assert.match(select, /approvedBy:users!purchase_orders_approved_by_fkey\(external_id,/);
});

test('purchase-order creation uses the atomic RPC and returns its nested record', async () => {
  const calls = installSupabase([{ data: purchaseOrderRecord({ external_id: 'po_created' }), error: null }], {
    create_purchase_order_with_items: {
      data: { external_id: 'po_created' },
      error: null,
    },
  });
  const res = createResponse();

  await createPurchaseOrder({
    body: {
      supplier: 'Supplier',
      supplierContact: 'supplier@example.com',
      notes: '',
      items: [{ product: 'prd_external', productName: 'Product', quantity: '2', unitPrice: '12' }],
    },
    user: { _id: 'usr_creator', role: 'user' },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data._id, 'po_created');
  assert.equal(res.body.data.items[0].total, 24);
  const rpc = calls.find((call) => call.method === 'rpc');
  assert.equal(rpc.name, 'create_purchase_order_with_items');
  assert.equal(rpc.args.p_order.created_by, 'usr_creator');
  assert.equal(rpc.args.p_items[0].total, 24);
});

test('purchase-order approval calls the atomic inventory RPC', async () => {
  const calls = installSupabase([{ data: purchaseOrderRecord({ status: 'approved' }), error: null }], {
    approve_purchase_order: {
      data: { external_id: 'po_external', status: 'approved' },
      error: null,
    },
  });
  const res = createResponse();

  await approvePurchaseOrder({
    params: { id: 'po_external' },
    user: { _id: 'usr_admin', role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'approved');
  assert.equal(calls.some((call) =>
    call.method === 'rpc'
    && call.name === 'approve_purchase_order'
    && call.args.p_order_id === 'po_external'
    && call.args.p_approved_by === 'usr_admin'
  ), true);
});

test('purchase-order rejection updates only pending records', async () => {
  const calls = installSupabase([{ data: purchaseOrderRecord({ status: 'rejected' }), error: null }]);
  const res = createResponse();

  await rejectPurchaseOrder({ params: { id: 'po_external' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'rejected');
  assert.equal(calls.some((call) =>
    call.method === 'update' && call.args[0].status === 'rejected'
  ), true);
  assert.equal(calls.some((call) =>
    call.method === 'eq' && call.args[0] === 'status' && call.args[1] === 'pending'
  ), true);
});

test('missing purchase order returns 404', async () => {
  installSupabase([{ data: null, error: null }]);
  const res = createResponse();

  await getPurchaseOrder({ params: { id: 'missing' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { success: false, message: 'Purchase order not found' });
});
