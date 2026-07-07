import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCardTransferEnabled } from '../src/bot/handlers/commands/transfer.ts';

test('card transfer guard rejects disabled feature', async () => {
  await assert.rejects(
    () => assertCardTransferEnabled({
      featureFlags: { isEnabled: async () => false },
      actor: {},
    }),
    /Передача карты временно недоступна/
  );
});

test('card transfer guard allows enabled feature', async () => {
  await assert.doesNotReject(
    () => assertCardTransferEnabled({
      featureFlags: { isEnabled: async () => true },
      actor: {},
    })
  );
});
