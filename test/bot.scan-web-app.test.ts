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

test('parseScanWebAppData accepts scanned link payload without amount', () => {
  const payload = parseScanWebAppData(JSON.stringify({
    action: 'link',
    code: 'CARD-1',
  }));

  assert.deepEqual(payload, {
    action: 'link',
    code: 'CARD-1',
  });
});

test('parseScanWebAppData accepts scanned receipt payload', () => {
  const payload = parseScanWebAppData(JSON.stringify({
    action: 'receipt',
    code: 't=20260629T1200&s=500.00&fn=123&fd=456&fp=789&n=1',
  }));

  assert.deepEqual(payload, {
    action: 'receipt',
    code: 't=20260629T1200&s=500.00&fn=123&fd=456&fp=789&n=1',
  });
});

test('parseScanWebAppData rejects invalid scan payloads', () => {
  assert.equal(parseScanWebAppData('not-json'), null);
  assert.equal(parseScanWebAppData(JSON.stringify({ action: 'debit', code: 'CARD-1' })), null);
  assert.equal(parseScanWebAppData(JSON.stringify({ action: 'unknown', code: 'CARD-1' })), null);
});
