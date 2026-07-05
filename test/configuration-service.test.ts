import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigurationService } from '../src/configuration/configuration-service.ts';

test('configuration service groups API and database defaults', () => {
  const service = ConfigurationService.fromEnv({
    TELEGRAM_MODE: 'polling',
    TELEGRAM_BOT_TOKEN: 'test-token',
  });

  assert.deepEqual(service.getApiConfig(), {
    host: '0.0.0.0',
    port: 3000,
  });

  assert.deepEqual(service.getDatabaseConfig(), {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    name: 'ion_gift_card',
    ssl: false,
    pool: {
      min: 0,
      max: 2,
    },
  });
});

test('configuration service reads database SSL flag', () => {
  const service = ConfigurationService.fromEnv({
    TELEGRAM_MODE: 'polling',
    TELEGRAM_BOT_TOKEN: 'test-token',
    DB_SSL: 'true',
  });

  assert.equal(service.getDatabaseConfig().ssl, true);
});

test('configuration service accepts polling Telegram mode without webhook secret', () => {
  const service = ConfigurationService.fromEnv({
    TELEGRAM_MODE: 'polling',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_ID_HMAC_SECRET: '12345678901234567890123456789012',
    WEB_APP_URL: 'https://example.test/qr',
  });

  assert.deepEqual(service.getTelegramConfig(), {
    mode: 'polling',
    botToken: 'test-token',
    identityHmacSecret: '12345678901234567890123456789012',
    webAppUrl: 'https://example.test/qr',
  });
});

test('configuration service requires webhook secret in webhook Telegram mode', () => {
  assert.throws(
    () => ConfigurationService.fromEnv({
      TELEGRAM_MODE: 'webhook',
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_ID_HMAC_SECRET: '12345678901234567890123456789012',
    }).getTelegramConfig(),
    /TELEGRAM_WEBHOOK_SECRET/
  );

  const service = ConfigurationService.fromEnv({
    TELEGRAM_MODE: 'webhook',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_ID_HMAC_SECRET: '12345678901234567890123456789012',
    TELEGRAM_WEBHOOK_SECRET: 'expected-secret',
  });

  assert.deepEqual(service.getTelegramConfig(), {
    mode: 'webhook',
    botToken: 'test-token',
    identityHmacSecret: '12345678901234567890123456789012',
    webhookSecret: 'expected-secret',
  });
});

test('configuration service rejects unknown Telegram mode', () => {
  assert.throws(
    () => ConfigurationService.fromEnv({
      TELEGRAM_MODE: 'disabled',
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_ID_HMAC_SECRET: '12345678901234567890123456789012',
    }).getTelegramConfig(),
    /TELEGRAM_MODE/
  );
});

test('configuration service requires Telegram identity HMAC secret in active Telegram mode', () => {
  assert.throws(
    () => ConfigurationService.fromEnv({
      TELEGRAM_MODE: 'polling',
      TELEGRAM_BOT_TOKEN: 'test-token',
    }).getTelegramConfig(),
    /TELEGRAM_ID_HMAC_SECRET/
  );

  assert.throws(
    () => ConfigurationService.fromEnv({
      TELEGRAM_MODE: 'polling',
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_ID_HMAC_SECRET: 'short-secret',
    }).getTelegramConfig(),
    /TELEGRAM_ID_HMAC_SECRET/
  );

  const service = ConfigurationService.fromEnv({
    TELEGRAM_MODE: 'polling',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_ID_HMAC_SECRET: '12345678901234567890123456789012',
  });

  assert.equal(
    service.getTelegramConfig().identityHmacSecret,
    '12345678901234567890123456789012'
  );
});

test('configuration service uses receipt verification defaults', () => {
  const service = ConfigurationService.fromEnv({
    TELEGRAM_MODE: 'polling',
    TELEGRAM_BOT_TOKEN: 'test-token',
  });

  assert.deepEqual(service.getReceiptConfig(), {
    mode: 'soft',
    allowedInns: [],
    maxAgeMinutes: 60,
    onlineVerification: 'disabled',
    provider: 'none',
  });
});

test('configuration service reads receipt verification settings', () => {
  const service = ConfigurationService.fromEnv({
    TELEGRAM_MODE: 'polling',
    TELEGRAM_BOT_TOKEN: 'test-token',
    RECEIPT_MODE: 'required',
    RECEIPT_ALLOWED_INNS: '1234567890, 0987654321',
    RECEIPT_MAX_AGE_MINUTES: '90',
    RECEIPT_ONLINE_VERIFICATION: 'enabled',
    RECEIPT_PROVIDER: 'fns',
  });

  assert.deepEqual(service.getReceiptConfig(), {
    mode: 'required',
    allowedInns: ['1234567890', '0987654321'],
    maxAgeMinutes: 90,
    onlineVerification: 'enabled',
    provider: 'fns',
  });
});

test('configuration service rejects invalid receipt settings', () => {
  assert.throws(
    () => ConfigurationService.fromEnv({
      TELEGRAM_MODE: 'polling',
      TELEGRAM_BOT_TOKEN: 'test-token',
      RECEIPT_MODE: 'strict',
    }).getReceiptConfig(),
    /RECEIPT_MODE/
  );

  assert.throws(
    () => ConfigurationService.fromEnv({
      TELEGRAM_MODE: 'polling',
      TELEGRAM_BOT_TOKEN: 'test-token',
      RECEIPT_MAX_AGE_MINUTES: '0',
    }).getReceiptConfig(),
    /RECEIPT_MAX_AGE_MINUTES/
  );
});
