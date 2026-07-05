import test from 'node:test';
import assert from 'node:assert/strict';
import {
  backfillTelegramIdentityHmac,
  type TelegramIdentityBackfillDb,
} from '../src/scripts/backfill-telegram-identity-hmac.ts';

class FakeBackfillDb implements TelegramIdentityBackfillDb {
  customerIdentities = [
    { id: 'identity-1', provider_user_id: '1001', telegram_user_id_hmac: null as string | null },
    { id: 'identity-2', provider_user_id: '1002', telegram_user_id_hmac: 'already-hashed' },
  ];
  operators = [
    { id: 'operator-1', telegram_id: 2001, telegram_user_id_hmac: null as string | null },
    { id: 'operator-2', telegram_id: 2002, telegram_user_id_hmac: 'already-hashed' },
  ];

  async transaction<T>(callback: (trx: TelegramIdentityBackfillDb) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async listCustomerIdentitiesMissingTelegramHmac() {
    return this.customerIdentities
      .filter((row) => row.telegram_user_id_hmac === null)
      .map(({ id, provider_user_id }) => ({ id, provider_user_id }));
  }

  async updateCustomerIdentityTelegramHmac(id: string, telegramUserIdHmac: string) {
    const row = this.customerIdentities.find((identity) => identity.id === id);
    if (row && row.telegram_user_id_hmac === null) {
      row.telegram_user_id_hmac = telegramUserIdHmac;
    }
  }

  async listOperatorsMissingTelegramHmac() {
    return this.operators
      .filter((row) => row.telegram_user_id_hmac === null)
      .map(({ id, telegram_id }) => ({ id, telegram_id }));
  }

  async updateOperatorTelegramHmac(id: string, telegramUserIdHmac: string) {
    const row = this.operators.find((operator) => operator.id === id);
    if (row && row.telegram_user_id_hmac === null) {
      row.telegram_user_id_hmac = telegramUserIdHmac;
    }
  }
}

test('telegram identity backfill requires secret', async () => {
  await assert.rejects(
    () => backfillTelegramIdentityHmac({ db: new FakeBackfillDb(), identityHmacSecret: '' }),
    /TELEGRAM_ID_HMAC_SECRET/
  );
});

test('telegram identity backfill fills hashes idempotently without logging raw ids or secret', async () => {
  const db = new FakeBackfillDb();
  const logs: string[] = [];
  const secret = 'secret-secret-secret-secret-secret-1';

  const first = await backfillTelegramIdentityHmac({
    db,
    identityHmacSecret: secret,
    log: (message) => logs.push(message),
  });
  const second = await backfillTelegramIdentityHmac({
    db,
    identityHmacSecret: secret,
    log: (message) => logs.push(message),
  });

  assert.deepEqual(first, { customerIdentitiesUpdated: 1, operatorsUpdated: 1 });
  assert.deepEqual(second, { customerIdentitiesUpdated: 0, operatorsUpdated: 0 });
  assert.notEqual(db.customerIdentities[0]?.telegram_user_id_hmac, null);
  assert.notEqual(db.operators[0]?.telegram_user_id_hmac, null);
  assert.equal(logs.some((line) => line.includes('1001')), false);
  assert.equal(logs.some((line) => line.includes('2001')), false);
  assert.equal(logs.some((line) => line.includes(secret)), false);
});
