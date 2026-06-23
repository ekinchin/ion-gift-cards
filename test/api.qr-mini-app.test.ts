import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerRoutes } from '../src/api/routes.ts';
import { qrMiniAppHtml } from '../src/api/qr-mini-app.html.ts';

test('exports Telegram QR scanner Mini App HTML template', () => {
  assert.match(qrMiniAppHtml, /^<!doctype html>/);
  assert.match(qrMiniAppHtml, /Telegram\.WebApp\.showScanQrPopup/);
  assert.match(qrMiniAppHtml, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(qrMiniAppHtml, /tg\.sendData\(JSON\.stringify\(payload\)\)/);
});

test('serves Telegram QR scanner Mini App page', async () => {
  const app = Fastify();
  await registerRoutes(app);

  const response = await app.inject({
    method: 'GET',
    url: '/qr',
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'] ?? '', /text\/html/);
  assert.match(response.body, /Telegram\.WebApp\.showScanQrPopup/);
  assert.match(response.body, /\/api\/cards\/.*\/balance/);

  await app.close();
});
