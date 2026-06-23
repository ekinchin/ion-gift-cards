import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScanWebAppUrl,
  parseScanWebAppData,
} from '../src/bot/scan-web-app.ts';

test('buildScanWebAppUrl adds scan action parameters to Mini App URL', () => {
  const url = buildScanWebAppUrl('https://example.test/qr?source=bot', {
    action: 'debit',
    amount: 500,
    description: 'coffee',
  });

  assert.equal(url, 'https://example.test/qr?source=bot&action=debit&amount=500&description=coffee');
});

test('parseScanWebAppData accepts scanned debit payload', () => {
  const payload = parseScanWebAppData(JSON.stringify({
    action: 'debit',
    code: 'CARD-1',
    amount: 500,
    description: 'coffee',
  }));

  assert.deepEqual(payload, {
    action: 'debit',
    code: 'CARD-1',
    amount: 500,
    description: 'coffee',
  });
});

test('parseScanWebAppData rejects invalid scan payloads', () => {
  assert.equal(parseScanWebAppData('not-json'), null);
  assert.equal(parseScanWebAppData(JSON.stringify({ action: 'debit', code: 'CARD-1' })), null);
  assert.equal(parseScanWebAppData(JSON.stringify({ action: 'unknown', code: 'CARD-1' })), null);
});
