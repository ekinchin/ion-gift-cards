import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerRoutes } from '../src/api/routes.ts';

test('HTTP API does not expose mutating card endpoints', async () => {
  const app = Fastify();
  await registerRoutes(app);

  const requests = [
    { method: 'POST', url: '/api/cards', payload: { amount: 100 } },
    { method: 'DELETE', url: '/api/admin/cards/CARD-1/owner' },
    { method: 'DELETE', url: '/api/me/card' },
    { method: 'POST', url: '/api/cards/CARD-1/debit', payload: { amount: 50 } },
    { method: 'POST', url: '/api/cards/CARD-1/credit', payload: { amount: 50 } },
    { method: 'GET', url: '/api/cards/CARD-1/history' },
  ] as const;

  try {
    for (const request of requests) {
      const response = await app.inject(request);
      assert.equal(response.statusCode, 404, `${request.method} ${request.url}`);
    }
  } finally {
    await app.close();
  }
});
