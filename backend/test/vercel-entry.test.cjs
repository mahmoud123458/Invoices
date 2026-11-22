const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

test('standalone backend Vercel deployment routes API requests to the Express handler', () => {
  const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));

  assert.deepEqual(config.rewrites, [{
    source: '/api/(.*)',
    destination: '/api/index.ts',
  }]);
  assert.equal(existsSync(join(process.cwd(), 'api', 'index.ts')), true);
});
