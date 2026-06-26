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
    WEB_APP_URL: 'https://example.test/qr',
  });

  assert.deepEqual(service.getTelegramConfig(), {
    mode: 'polling',
    botToken: 'test-token',
    webAppUrl: 'https://example.test/qr',
  });
});

test('configuration service requires webhook secret in webhook Telegram mode', () => {
  assert.throws(
    () => ConfigurationService.fromEnv({
      TELEGRAM_MODE: 'webhook',
      TELEGRAM_BOT_TOKEN: 'test-token',
    }).getTelegramConfig(),
    /TELEGRAM_WEBHOOK_SECRET/
  );

  const service = ConfigurationService.fromEnv({
    TELEGRAM_MODE: 'webhook',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_WEBHOOK_SECRET: 'expected-secret',
  });

  assert.deepEqual(service.getTelegramConfig(), {
    mode: 'webhook',
    botToken: 'test-token',
    webhookSecret: 'expected-secret',
  });
});

test('configuration service rejects unknown Telegram mode', () => {
  assert.throws(
    () => ConfigurationService.fromEnv({
      TELEGRAM_MODE: 'disabled',
      TELEGRAM_BOT_TOKEN: 'test-token',
    }).getTelegramConfig(),
    /TELEGRAM_MODE/
  );
});
