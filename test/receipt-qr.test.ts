import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFiscalFingerprint,
  buildReceiptUrl,
  parseFiscalReceiptQr,
} from '../src/application/receipt-qr.ts';

test('parseFiscalReceiptQr parses standard fiscal QR payload', () => {
  const parsed = parseFiscalReceiptQr('t=20260629T1200&s=500.00&fn=123&fd=456&fp=789&n=1&inn=1234567890');

  assert.deepEqual(parsed, {
    raw: 't=20260629T1200&s=500.00&fn=123&fd=456&fp=789&n=1&inn=1234567890',
    issuedAt: new Date('2026-06-29T12:00:00.000Z'),
    total: 500,
    fiscalFn: '123',
    fiscalFd: '456',
    fiscalFp: '789',
    operationType: '1',
    inn: '1234567890',
  });
});

test('parseFiscalReceiptQr accepts fd as i and URL encoded values', () => {
  const parsed = parseFiscalReceiptQr('https://example.test/?t=20260629T120000&s=1000.50&fn=987&i=654&fp=321&n=2');

  assert.equal(parsed.fiscalFd, '654');
  assert.equal(parsed.total, 1000.5);
  assert.equal(parsed.issuedAt.toISOString(), '2026-06-29T12:00:00.000Z');
});

test('parseFiscalReceiptQr rejects missing fiscal fields', () => {
  assert.throws(
    () => parseFiscalReceiptQr('t=20260629T1200&s=500.00&fn=123'),
    /Invalid fiscal receipt QR/
  );
});

test('buildFiscalFingerprint uses normalized fiscal fields', () => {
  const parsed = parseFiscalReceiptQr('t=20260629T1200&s=500.00&fn=00123&fd=00456&fp=00789&n=1');

  assert.equal(buildFiscalFingerprint(parsed), '00123:00456:00789');
});

test('buildReceiptUrl builds a browser link from fiscal fields', () => {
  const parsed = parseFiscalReceiptQr('t=20260629T1200&s=500.00&fn=123&fd=456&fp=789&n=1');

  assert.equal(
    buildReceiptUrl(parsed),
    'https://check.ofd.ru/rec/123/456/789'
  );
});
