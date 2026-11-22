const assert = require('node:assert/strict');
const test = require('node:test');

const supabaseConfig = require('../dist/config/supabase');
const { getFinancialSummary } = require('../dist/controllers/financeController');

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

const installSupabase = (queryResults) => {
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

test('financial summary combines invoice dates, payment dates, expenses, and client names', async () => {
  const calls = installSupabase([
    {
      data: [
        {
          external_id: 'inv_sent',
          invoice_number: 'INV-00001',
          status: 'sent',
          total: 100,
          paid_amount: 30,
          created_at: '2026-01-10T00:00:00.000Z',
          due_date: '2026-02-15T00:00:00.000Z',
          client: { name: 'Client A' },
          payments: [{
            id: 1,
            external_id: 'payment-original-id',
            amount: 30,
            payment_date: '2026-01-15T00:00:00.000Z',
            method: 'cash',
            reference: 'PAY-1',
          }],
        },
        {
          external_id: 'inv_paid',
          invoice_number: 'INV-00002',
          status: 'paid',
          total: 50,
          paid_amount: 50,
          created_at: '2026-01-25T00:00:00.000Z',
          client: { name: 'Client B' },
          payments: [],
        },
        {
          external_id: 'inv_cancelled',
          invoice_number: 'INV-00003',
          status: 'cancelled',
          total: 500,
          paid_amount: 0,
          created_at: '2026-01-20T00:00:00.000Z',
          payments: [],
        },
      ],
      error: null,
    },
    {
      data: [
        {
          external_id: 'exp_feb',
          description: 'Rent',
          category: 'Office',
          amount: 10,
          expense_date: '2026-02-20T10:00:00.000Z',
          payment_method: 'bank_transfer',
          reference: 'RENT-1',
        },
        {
          external_id: 'exp_boundary',
          description: 'Supplies',
          category: 'Office',
          amount: 5,
          expense_date: '2026-02-28T23:59:59.999Z',
          payment_method: 'cash',
        },
      ],
      error: null,
    },
  ]);
  const res = createResponse();

  await getFinancialSummary({
    query: { from: '2026-01-01', to: '2026-02-28' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.totalInvoiced, 150);
  assert.equal(res.body.data.collected, 80);
  assert.equal(res.body.data.outstanding, 70);
  assert.equal(res.body.data.expenses, 15);
  assert.equal(res.body.data.netCashFlow, 65);
  assert.equal(res.body.data.outstandingInvoices[0].clientName, 'Client A');
  assert.equal(res.body.data.outstandingInvoices[0]._id, 'inv_sent');
  assert.equal(res.body.data.cashFlow[0].income, 80);
  assert.equal(res.body.data.cashFlow[1].expenses, 15);
  assert.equal(res.body.data.recentTransactions.length, 4);
  assert.equal(res.body.data.recentTransactions.some(
    (transaction) => transaction.id === 'inv_sent-payment-original-id'
  ), true);
  assert.match(
    calls.find((call) => call.method === 'select').args[0],
    /payments:invoice_payments\(external_id,/
  );
  assert.deepEqual(calls.filter((call) => call.method === 'from').map((call) => call.table), [
    'invoices',
    'expenses',
  ]);
  assert.equal(calls.some((call) =>
    call.method === 'gte' && call.args[0] === 'expense_date'
  ), true);
});

test('financial summary rejects a reversed date range', async () => {
  const calls = installSupabase([]);
  const res = createResponse();

  await getFinancialSummary({
    query: { from: '2026-03-01', to: '2026-02-01' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(calls, []);
});

test('financial summary reports Supabase failures', async () => {
  installSupabase([{ data: null, error: { message: 'database unavailable' } }]);
  const res = createResponse();

  await getFinancialSummary({ query: {} }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { success: false, message: 'Unable to load financial summary' });
});
