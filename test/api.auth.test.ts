import test from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyRequest } from 'fastify';
import { requireOperator } from '../src/api/auth.ts';

test('requireOperator rejects requests without an operator header', async () => {
  const operator = await requireOperator({
    headers: {},
  } as FastifyRequest);

  assert.equal(operator, null);
});

test('requireOperator rejects non-numeric operator headers', async () => {
  const operator = await requireOperator({
    headers: {
      'x-operator-telegram-id': 'not-a-number',
    },
  } as unknown as FastifyRequest);

  assert.equal(operator, null);
});
