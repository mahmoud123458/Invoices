const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const supabaseConfig = require('../dist/config/supabase');
const { login, createUser, getUsers } = require('../dist/controllers/authController');
const { getClients, createClient } = require('../dist/controllers/clientController');
const { getProducts } = require('../dist/controllers/productController');
const { getShippingCompanies } = require('../dist/controllers/shippingController');

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

const installSupabaseResult = (result) => {
  const calls = [];
  const results = Array.isArray(result) ? result : [result];
  let resultIndex = 0;
  supabaseConfig.supabase = {
    from(table) {
      calls.push({ method: 'from', table });
      const currentResult = results[resultIndex++] || { data: null, error: null };
      let chain;
      chain = new Proxy({}, {
        get(_target, method) {
          if (method === 'then') {
            return (resolve, reject) => Promise.resolve(currentResult).then(resolve, reject);
          }
          if (method === 'single' || method === 'maybeSingle') {
            return () => Promise.resolve(currentResult);
          }
          return (...args) => {
            calls.push({ method, args });
            return chain;
          };
        },
      });
      return chain;
    },
  };
  return calls;
};

test('login reads the Supabase user by normalized email and verifies bcrypt password hash', async () => {
  const password = 'correct horse battery';
  const passwordHash = await bcrypt.hash(password, 10);
  const calls = installSupabaseResult({
    data: {
      external_id: 'usr_external',
      name: 'A User',
      email: 'person@example.com',
      role: 'admin',
      password_hash: passwordHash,
    },
    error: null,
  });
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  const res = createResponse();

  try {
    await login({ body: { email: ' PERSON@EXAMPLE.COM ', password } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data._id, 'usr_external');
    assert.equal(res.body.data.email, 'person@example.com');
    assert.equal(jwt.verify(res.body.data.token, process.env.JWT_SECRET).id, 'usr_external');
    assert.deepEqual(calls[0], { method: 'from', table: 'users' });
    assert.equal(calls.some((call) => call.method === 'eq' && call.args[0] === 'email'), true);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('client listing maps external IDs and reports Supabase query errors', async () => {
  installSupabaseResult({
    data: [{
      external_id: 'cli_external',
      name: 'Client',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    }],
    error: null,
  });
  const res = createResponse();

  await getClients({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0]._id, 'cli_external');
  assert.equal(res.body.data[0].createdAt, '2026-01-01T00:00:00Z');

  installSupabaseResult({ data: null, error: { message: 'database unavailable' } });
  const failedResponse = createResponse();
  await getClients({ query: {} }, failedResponse);

  assert.equal(failedResponse.statusCode, 500);
  assert.deepEqual(failedResponse.body, { success: false, message: 'Server error' });
});

test('product listing keeps low-stock filtering and camel-cased API fields', async () => {
  installSupabaseResult({
    data: [
      { external_id: 'prd_low', name: 'Low', quantity: 2, low_stock_alert: 3, created_at: '2026-01-01T00:00:00Z' },
      { external_id: 'prd_ok', name: 'Okay', quantity: 5, low_stock_alert: 3, created_at: '2026-01-02T00:00:00Z' },
    ],
    error: null,
  });
  const res = createResponse();

  await getProducts({ query: { lowStock: 'true' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.data[0]._id, 'prd_low');
  assert.equal(res.body.data[0].lowStockAlert, 3);
  assert.equal(res.body.data[0].isLowStock, true);
});

test('shipping list reads active Supabase companies and maps external IDs', async () => {
  const calls = installSupabaseResult({
    data: [{
      external_id: 'shp_external',
      name: 'Carrier',
      is_active: true,
      avg_delivery_days: 4,
      created_at: '2026-01-01T00:00:00Z',
    }],
    error: null,
  });
  const res = createResponse();

  await getShippingCompanies({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0]._id, 'shp_external');
  assert.equal(res.body.data[0].avgDeliveryDays, 4);
  assert.equal(calls.some((call) => call.method === 'eq' && call.args[0] === 'is_active' && call.args[1] === true), true);
});

test('creating a user hashes the password and returns no credential fields', async () => {
  const calls = installSupabaseResult([
    { data: null, error: null },
    {
      data: {
        external_id: 'usr_created',
        name: 'New User',
        email: 'new@example.com',
        role: 'user',
        created_at: '2026-02-01T00:00:00Z',
      },
      error: null,
    },
  ]);
  const res = createResponse();

  await createUser({
    body: { name: ' New User ', email: ' NEW@EXAMPLE.COM ', password: 'a-secure-password', role: 'user' },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data._id, 'usr_created');
  assert.equal(Object.prototype.hasOwnProperty.call(res.body.data, 'password'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(res.body.data, 'password_hash'), false);
  const insertCall = calls.find((call) => call.method === 'insert');
  assert.equal(insertCall.args[0].email, 'new@example.com');
  assert.equal(await bcrypt.compare('a-secure-password', insertCall.args[0].password_hash), true);
});

test('user listing never returns stored password hashes', async () => {
  installSupabaseResult({
    data: [{
      external_id: 'usr_safe',
      name: 'Safe User',
      email: 'safe@example.com',
      role: 'user',
      password_hash: 'must-not-be-selected',
    }],
    error: null,
  });
  const res = createResponse();

  await getUsers({}, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data[0], {
    _id: 'usr_safe',
    name: 'Safe User',
    email: 'safe@example.com',
    role: 'user',
  });
});

test('client creation translates app fields to database columns and preserves external ID', async () => {
  const calls = installSupabaseResult({
    data: {
      external_id: 'cli_created',
      name: 'Client',
      email: 'client@example.com',
      created_at: '2026-02-02T00:00:00Z',
    },
    error: null,
  });
  const res = createResponse();

  await createClient({
    body: { name: ' Client ', email: ' CLIENT@EXAMPLE.COM ', unknownField: 'ignored' },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data._id, 'cli_created');
  assert.equal(res.body.data.email, 'client@example.com');
  assert.deepEqual(calls.find((call) => call.method === 'insert').args[0], {
    name: 'Client',
    email: 'client@example.com',
  });
});
