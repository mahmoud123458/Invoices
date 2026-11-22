const assert = require('node:assert/strict');
const test = require('node:test');

const supabaseConfig = require('../dist/config/supabase');
const {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} = require('../dist/controllers/expenseController');

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

const installSupabase = (queryResults = []) => {
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
  };
  return calls;
};

const expenseRecord = (overrides = {}) => ({
  id: 11,
  external_id: 'exp_external',
  description: 'Office supplies',
  category: 'Office',
  amount: 25,
  expense_date: '2026-02-10T12:00:00.000Z',
  payment_method: 'cash',
  reference: 'RCPT-11',
  notes: '',
  created_by: 'usr_creator',
  createdBy: { external_id: 'usr_creator', name: 'Creator' },
  created_at: '2026-02-10T12:00:00.000Z',
  ...overrides,
});

test('expense listing applies filters and maps Supabase fields and actor', async () => {
  const calls = installSupabase([{ data: [expenseRecord()], error: null }]);
  const res = createResponse();

  await getExpenses({
    query: { from: '2026-02-01', to: '2026-02-28', category: 'Office' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.data[0]._id, 'exp_external');
  assert.equal(res.body.data[0].date, '2026-02-10T12:00:00.000Z');
  assert.equal(res.body.data[0].paymentMethod, 'cash');
  assert.equal(res.body.data[0].createdBy._id, 'usr_creator');
  assert.match(
    calls.find((call) => call.method === 'select').args[0],
    /createdBy:users!expenses_created_by_fkey\(external_id,/
  );
  assert.deepEqual(calls.filter((call) => ['eq', 'gte', 'lte'].includes(call.method)).map((call) => call.method), [
    'eq',
    'gte',
    'lte',
  ]);
  assert.equal(calls.some((call) => call.method === 'gte' && call.args[0] === 'expense_date'), true);
});

test('expense creation stores normalized values and returns the API shape', async () => {
  const calls = installSupabase([{ data: expenseRecord(), error: null }]);
  const res = createResponse();

  await createExpense({
    body: {
      description: ' Office supplies ',
      category: ' Office ',
      amount: '25',
      date: '2026-02-10T12:00:00.000Z',
      paymentMethod: 'cash',
      reference: ' RCPT-11 ',
      notes: '',
    },
    user: { _id: 'usr_creator', role: 'user' },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data._id, 'exp_external');
  assert.equal(res.body.data.createdBy.name, 'Creator');
  const insert = calls.find((call) => call.method === 'insert');
  assert.equal(insert.args[0].description, 'Office supplies');
  assert.equal(insert.args[0].expense_date, '2026-02-10T12:00:00.000Z');
  assert.equal(insert.args[0].created_by, 'usr_creator');
});

test('expense updates by external ID and returns the updated record', async () => {
  const calls = installSupabase([{ data: expenseRecord({ amount: 30 }), error: null }]);
  const res = createResponse();

  await updateExpense({
    params: { id: 'exp_external' },
    body: {
      description: 'Office supplies',
      category: 'Office',
      amount: '30',
      date: '2026-02-10T12:00:00.000Z',
      paymentMethod: 'cash',
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.amount, 30);
  assert.equal(calls.some((call) => call.method === 'eq' && call.args[0] === 'external_id'), true);
});

test('expense deletion reports a missing record', async () => {
  installSupabase([{ data: null, error: null }]);
  const res = createResponse();

  await deleteExpense({ params: { id: 'missing' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { success: false, message: 'Expense not found' });
});

test('invalid expense dates are rejected before reaching Supabase', async () => {
  const calls = installSupabase();
  const res = createResponse();

  await getExpenses({ query: { from: 'not-a-date' } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(calls, []);
});
