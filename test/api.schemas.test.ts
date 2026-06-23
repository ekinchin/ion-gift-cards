import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cardCodeParamsSchema,
  createCardBodySchema,
  mutateCardBodySchema,
} from '../src/api/schemas.ts';

test('API schemas expose Zod parsers', () => {
  assert.equal(typeof cardCodeParamsSchema.safeParse, 'function');
  assert.equal(typeof createCardBodySchema.safeParse, 'function');
  assert.equal(typeof mutateCardBodySchema.safeParse, 'function');
});

test('create card body rejects trusted operatorId from request body', () => {
  const result = createCardBodySchema.safeParse({
    code: 'CARD-1',
    amount: 100,
    operatorId: '00000000-0000-0000-0000-000000000000',
  });

  assert.equal(result.success, false);
});

test('mutate card body rejects non-positive amounts', () => {
  const result = mutateCardBodySchema.safeParse({
    amount: 0,
  });

  assert.equal(result.success, false);
});
