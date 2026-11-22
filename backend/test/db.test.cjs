const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const probeConfiguration = (overrides) => {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  };
  const configuration = JSON.stringify({ ...overrides, NODE_ENV: 'production' });
  const modulePath = JSON.stringify(require.resolve('../dist/config/supabase'));
  return spawnSync(process.execPath, [
    '-e',
    `const module = require(${modulePath}); try { const config = module.createSupabaseConfiguration(${configuration}); process.stdout.write(String(config.configured)); } catch (error) { console.error(error.message); process.exitCode = 1; }`,
  ], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
};

test('requires a Supabase URL in production', () => {
  const result = probeConfiguration({
    SUPABASE_URL: null,
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SUPABASE_URL must be configured for production/);
});

test('requires the service-role key in production', () => {
  const result = probeConfiguration({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: null,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SUPABASE_SERVICE_ROLE_KEY must be configured for production/);
});

test('rejects invalid Supabase URLs', () => {
  const result = probeConfiguration({
    SUPABASE_URL: 'not-a-url',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid supabaseUrl/);
});

test('accepts a configured production Supabase client', () => {
  const result = probeConfiguration({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'true');
});
