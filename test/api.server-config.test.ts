import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiPort } from '../src/api/server-config.ts';

test('API port is read from PORT', () => {
  assert.equal(resolveApiPort({ PORT: '8080', API_PORT: '3000' }), 8080);
});

test('API port defaults to 3000 when PORT is absent', () => {
  assert.equal(resolveApiPort({ API_PORT: '8080' }), 3000);
});
