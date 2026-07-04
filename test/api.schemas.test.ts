import test from 'node:test';
import assert from 'node:assert/strict';
import { cardCodeParamsSchema } from '../src/api/schemas.ts';

test('API schemas expose Zod parsers', () => {
  assert.equal(typeof cardCodeParamsSchema.safeParse, 'function');
});

test('card code params accept a public card code', () => {
  const result = cardCodeParamsSchema.safeParse({
    code: 'ION-TESTCARD01',
  });

  assert.equal(result.success, true);
});

test('card code params reject empty card code', () => {
  const result = cardCodeParamsSchema.safeParse({
    code: '',
  });

  assert.equal(result.success, false);
});
