import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { registerRoutes } from '../src/api/routes.ts';
import { qrMiniAppHtml } from '../src/api/qr-mini-app.html.ts';
import { userCopy } from '../src/copy.ts';

test('exports Telegram QR scanner Mini App HTML template', () => {
  const template = readFileSync(new URL('../src/api/qr-mini-app.html', import.meta.url), 'utf-8');
  assert.notEqual(qrMiniAppHtml, template);
  assert.match(qrMiniAppHtml, /^<!doctype html>/);
  assert.match(qrMiniAppHtml, /Telegram\.WebApp\.showScanQrPopup/);
  assert.match(qrMiniAppHtml, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(qrMiniAppHtml, /tg\.sendData\(JSON\.stringify\(payload\)\)/);
  assert.match(qrMiniAppHtml, /const action = params\.get\('action'\) \|\| 'balance'/);
  assert.match(qrMiniAppHtml, new RegExp(userCopy.qrMiniApp.title));
  assert.doesNotMatch(qrMiniAppHtml, /__QR_MINI_APP_COPY__/);
  assert.doesNotMatch(qrMiniAppHtml, /fetch\('/);
  assert.doesNotMatch(qrMiniAppHtml, /\/api\/cards\//);
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
  assert.match(response.body, /tg\.sendData\(JSON\.stringify\(payload\)\)/);
  assert.doesNotMatch(response.body, /\/api\/cards\//);

  await app.close();
});

test('release workflow uploads rendered QR Mini App HTML, not the raw template', () => {
  const workflow = readFileSync(new URL('../.github/workflows/release-polling-vm.yml', import.meta.url), 'utf-8');

  assert.match(workflow, /node --experimental-strip-types src\/api\/render-qr-mini-app\.ts/);
  assert.match(workflow, /yc storage s3 cp "\$QR_MINI_APP_HTML"/);
  assert.doesNotMatch(workflow, /yc storage s3 cp src\/api\/qr-mini-app\.html/);
});
