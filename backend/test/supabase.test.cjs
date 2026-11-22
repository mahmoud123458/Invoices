const assert = require('node:assert/strict');
const test = require('node:test');
const { createSupabaseConfiguration } = require('../dist/config/supabase');

test('requires SUPABASE_URL in production', () => {
  assert.throws(
    () => createSupabaseConfiguration({
      NODE_ENV: 'production',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    }),
    /SUPABASE_URL must be configured for production/
  );
});

test('requires the service-role key in production even when anon key is set', () => {
  assert.throws(
    () => createSupabaseConfiguration({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
    }),
    /SUPABASE_SERVICE_ROLE_KEY must be configured for production/
  );
});

test('keeps Supabase disabled outside production when settings are missing', () => {
  const result = createSupabaseConfiguration({
    NODE_ENV: 'development',
  });

  assert.equal(result.configured, false);
  assert.equal(result.client, null);
});

test('initializes a service-role Supabase client outside production without a network call', () => {
  const result = createSupabaseConfiguration({
    NODE_ENV: 'development',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  });

  assert.equal(result.configured, true);
  assert.notEqual(result.client, null);
});
