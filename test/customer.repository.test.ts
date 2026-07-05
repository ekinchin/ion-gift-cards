import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerRepository } from '../src/repositories/customer.repository.ts';
import { CardOwnershipRepository } from '../src/repositories/card-ownership.repository.ts';
import { CardRepository } from '../src/repositories/card.repository.ts';
import { resetDatabase, closeDatabase } from './helpers/db.ts';

const runDbTests = process.env.RUN_DB_TESTS === '1';

test.beforeEach({ skip: !runDbTests }, async () => {
  await resetDatabase();
});

test.after({ skip: !runDbTests }, async () => {
  await closeDatabase();
});

test('customer repository resolves the same provider identity to the same customer', { skip: !runDbTests }, async () => {
  const repository = new CustomerRepository();

  const first = await repository.resolveOrCreateIdentity({
    provider: 'telegram',
    telegramUserIdHash: 'hash-1001',
  });
  const second = await repository.resolveOrCreateIdentity({
    provider: 'telegram',
    telegramUserIdHash: 'hash-1001',
  });

  assert.equal(second.customer.id, first.customer.id);
  assert.equal(second.identity.id, first.identity.id);
  assert.equal(second.identity.telegram_user_id_hmac, 'hash-1001');
  assert.equal(second.identity.provider_user_id, 'hmac:hash-1001');
  assert.equal(second.identity.username, null);
  assert.equal(second.identity.display_name, null);
});

test('customer repository records and revokes Telegram personal data consent', { skip: !runDbTests }, async () => {
  const repository = new CustomerRepository();
  const { customer } = await repository.resolveOrCreateIdentity({
    provider: 'telegram',
    telegramUserIdHash: 'hash-consent',
  });

  assert.equal(await repository.findActiveConsent(customer.id, 'telegram'), null);

  const consented = await repository.recordConsent(customer.id, 'telegram');
  assert.equal(consented.personal_data_consent_revoked_at, null);
  assert.ok(consented.personal_data_consent_at);
  assert.ok(await repository.findActiveConsent(customer.id, 'telegram'));

  await repository.revokeConsent(customer.id, 'telegram');
  assert.equal(await repository.findActiveConsent(customer.id, 'telegram'), null);
});

test('card ownership repository links one card to one customer and lists owned cards', { skip: !runDbTests }, async () => {
  const customerRepository = new CustomerRepository();
  const ownershipRepository = new CardOwnershipRepository();
  const cardRepository = new CardRepository();
  const { customer } = await customerRepository.resolveOrCreateIdentity({
    provider: 'telegram',
    telegramUserIdHash: 'hash-2002',
  });
  const card = await cardRepository.create('CARD-OWNED', 1000);

  await ownershipRepository.linkCard(card.id, customer.id);
  const owner = await ownershipRepository.findOwnerByCardId(card.id);
  const cards = await ownershipRepository.findCardsByCustomerId(customer.id);

  assert.equal(owner?.customer_id, customer.id);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.code, 'CARD-OWNED');
  await assert.rejects(
    () => ownershipRepository.linkCard(card.id, customer.id),
    /duplicate key|unique constraint|UNIQUE/i
  );
});
