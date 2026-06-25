import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiListenOptions } from '../src/api/server-config.ts';

test('API listen options are resolved from typed API config', () => {
  assert.deepEqual(resolveApiListenOptions({
    host: '127.0.0.1',
    port: 8080,
  }), {
    host: '127.0.0.1',
    port: 8080,
  });
});
