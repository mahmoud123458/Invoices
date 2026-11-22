import assert from 'node:assert/strict';
import test from 'node:test';

import { isInvalidSessionResponse } from './sessionAuth.ts';

test('does not treat ordinary HTTP errors as an invalid session', () => {
  assert.equal(isInvalidSessionResponse(404, 'Not found'), false);
  assert.equal(isInvalidSessionResponse(500, 'Database unavailable'), false);
});

test('treats authentication 401 responses as an invalid session', () => {
  assert.equal(isInvalidSessionResponse(401, '/auth/me'), true);
});

test('does not logout when a protected resource returns 401', () => {
  assert.equal(isInvalidSessionResponse(401, '/clients'), false);
});

test('treats missing-user and invalid-token 401 responses as an invalid session', () => {
  assert.equal(isInvalidSessionResponse(401, '/invoices', 'User not found'), true);
  assert.equal(isInvalidSessionResponse(401, '/clients', 'Token invalid or expired'), true);
});
