const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const supabaseConfig = require('../dist/config/supabase');
const { protect } = require('../dist/middleware/auth');

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

const installUserLookupResult = (result) => {
  const calls = [];
  supabaseConfig.supabase = {
    from(table) {
      calls.push({ method: 'from', table });
      let chain;
      chain = new Proxy({}, {
        get(_target, method) {
          if (method === 'then') {
            return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
          }
          if (method === 'maybeSingle') {
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

const createRequest = (id) => ({
  headers: { authorization: `Bearer ${jwt.sign({ id }, 'middleware-test-secret')}` },
});

test('protect resolves valid JWT external IDs from Supabase and sets the app user ID', async () => {
  const calls = installUserLookupResult({
    data: {
      external_id: 'usr_external',
      name: 'External User',
      email: 'user@example.com',
      role: 'admin',
      created_at: '2026-03-01T00:00:00Z',
    },
    error: null,
  });
  const req = createRequest('usr_external');
  const res = createResponse();
  let nextCalled = false;
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'middleware-test-secret';

  try {
    await protect(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(req.user._id, 'usr_external');
    assert.equal(req.user.role, 'admin');
    assert.equal(req.user.createdAt, '2026-03-01T00:00:00Z');
    assert.deepEqual(calls[0], { method: 'from', table: 'users' });
    assert.equal(calls.some((call) => call.method === 'eq' && call.args[0] === 'external_id' && call.args[1] === 'usr_external'), true);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('protect reports Supabase lookup failures as authentication service errors', async () => {
  installUserLookupResult({
    data: null,
    error: { code: 'PGRST000', message: 'database unavailable' },
  });
  const req = createRequest('usr_external');
  const res = createResponse();
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'middleware-test-secret';

  try {
    await protect(req, res, () => assert.fail('next must not be called on a lookup error'));

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { success: false, message: 'Unable to verify user' });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
