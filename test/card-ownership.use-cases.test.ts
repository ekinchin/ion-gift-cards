import test from 'node:test';
import assert from 'node:assert/strict';
import { CardOwnershipUseCases } from '../src/application/card-ownership.use-cases.ts';
import type {
  Card,
  CardOwner,
  CardTransferToken,
  Customer,
  CustomerIdentity,
  Transaction,
} from '../src/types/index.ts';

const now = new Date('2026-06-25T10:00:00.000Z');

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: overrides.id ?? 'card-1',
    code: overrides.code ?? 'CARD-1',
    balance: overrides.balance ?? 1000,
    initial_amount: overrides.initial_amount ?? 1000,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? now,
  };
}

function makeCustomer(id = 'customer-1'): Customer {
  return { id, created_at: now };
}

function makeIdentity(customerId = 'customer-1'): CustomerIdentity {
  return {
    id: 'identity-1',
    customer_id: customerId,
    provider: 'telegram',
    provider_user_id: '1001',
    username: null,
    display_name: null,
    created_at: now,
  };
}

function makeUseCases() {
  const cards = new Map<string, Card>();
  const owners = new Map<string, CardOwner>();
  const tokens = new Map<string, CardTransferToken>();
  const transfers: unknown[] = [];
  const transactions = new Map<string, Transaction[]>();

  const cardRepo = {
    async findByCode(code: string) {
      return [...cards.values()].find((card) => card.code === code && card.is_active) ?? null;
    },
    async findById(id: string) {
      return cards.get(id) ?? null;
    },
    async create(code: string, initialAmount: number) {
      const card = makeCard({
        id: `card-${cards.size + 1}`,
        code,
        balance: initialAmount,
        initial_amount: initialAmount,
      });
      cards.set(card.id, card);
      return card;
    },
  };
  const txRepo = {
    async findByCardId(cardId: string) {
      return transactions.get(cardId) ?? [];
    },
  };
  const customerRepo = {
    async resolveOrCreateIdentity() {
      const customer = makeCustomer();
      return { customer, identity: makeIdentity(customer.id) };
    },
  };
  const ownershipRepo = {
    async findOwnerByCardId(cardId: string) {
      return owners.get(cardId) ?? null;
    },
    async findOwnerByCardIdForUpdate(cardId: string) {
      return owners.get(cardId) ?? null;
    },
    async findCardsByCustomerId(customerId: string) {
      return [...owners.values()]
        .filter((owner) => owner.customer_id === customerId)
        .map((owner) => cards.get(owner.card_id)!)
        .filter((card) => card?.is_active);
    },
    async linkCard(cardId: string, customerId: string) {
      const owner = { card_id: cardId, customer_id: customerId, linked_at: now };
      owners.set(cardId, owner);
      return owner;
    },
    async updateOwner(cardId: string, customerId: string) {
      const owner = { card_id: cardId, customer_id: customerId, linked_at: now };
      owners.set(cardId, owner);
      return owner;
    },
    async unlinkCard(cardId: string) {
      owners.delete(cardId);
    },
    async createTransferToken(token: string, cardId: string, fromCustomerId: string, expiresAt: Date) {
      const transferToken = {
        id: `token-${tokens.size + 1}`,
        token,
        card_id: cardId,
        from_customer_id: fromCustomerId,
        expires_at: expiresAt,
        used_at: null,
        created_at: now,
      };
      tokens.set(token, transferToken);
      return transferToken;
    },
    async findTransferTokenForUpdate(token: string) {
      return tokens.get(token) ?? null;
    },
    async markTransferTokenUsed(id: string) {
      for (const token of tokens.values()) {
        if (token.id === id) {
          token.used_at = now;
        }
      }
    },
    async createTransferEvent(data: unknown) {
      transfers.push(data);
      return data;
    },
  };

  const useCases = new CardOwnershipUseCases(
    cardRepo,
    txRepo,
    customerRepo,
    ownershipRepo,
    async (callback) => callback({}),
    () => now,
    () => 'transfer-token',
    () => 'ION-PERSONAL0001'
  );

  return { useCases, cards, owners, tokens, transfers, transactions };
}

test('createPersonalCard creates a zero-balance card and links it to the customer', async () => {
  const { useCases, cards, owners, transfers } = makeUseCases();

  const result = await useCases.createPersonalCard('customer-1');
  const { card } = result;

  assert.equal(result.created, true);
  assert.equal(card.code, 'ION-PERSONAL0001');
  assert.equal(card.balance, 0);
  assert.equal(card.initial_amount, 0);
  assert.equal(cards.size, 1);
  assert.equal(owners.get(card.id)?.customer_id, 'customer-1');
  assert.deepEqual(transfers[0], {
    cardId: card.id,
    fromCustomerId: null,
    toCustomerId: 'customer-1',
    initiatedByCustomerId: 'customer-1',
    type: 'INITIAL_LINK',
  });
});

test('createPersonalCard returns the current card when the customer already has one', async () => {
  const { useCases, cards, owners, transfers } = makeUseCases();
  const existingCard = makeCard();
  cards.set(existingCard.id, existingCard);
  owners.set(existingCard.id, { card_id: existingCard.id, customer_id: 'customer-1', linked_at: now });

  const result = await useCases.createPersonalCard('customer-1');
  const { card } = result;

  assert.equal(result.created, false);
  assert.equal(card.id, existingCard.id);
  assert.equal(cards.size, 1);
  assert.equal(transfers.length, 0);
});

test('linkCard rejects when the customer already owns another card', async () => {
  const { useCases, cards, owners } = makeUseCases();
  cards.set('card-1', makeCard({ id: 'card-1', code: 'CARD-1' }));
  cards.set('card-2', makeCard({ id: 'card-2', code: 'CARD-2' }));
  owners.set('card-1', { card_id: 'card-1', customer_id: 'customer-1', linked_at: now });

  await assert.rejects(
    () => useCases.linkCard('customer-1', 'CARD-2'),
    /Customer already has a linked card/
  );
});

test('acceptTransfer rejects when the recipient already owns a card', async () => {
  const { useCases, cards, owners, tokens } = makeUseCases();
  cards.set('card-1', makeCard({ id: 'card-1', code: 'CARD-1' }));
  cards.set('card-2', makeCard({ id: 'card-2', code: 'CARD-2' }));
  owners.set('card-1', { card_id: 'card-1', customer_id: 'customer-1', linked_at: now });
  owners.set('card-2', { card_id: 'card-2', customer_id: 'customer-2', linked_at: now });
  tokens.set('transfer-token', {
    id: 'token-1',
    token: 'transfer-token',
    card_id: 'card-1',
    from_customer_id: 'customer-1',
    expires_at: new Date('2026-06-25T10:15:00.000Z'),
    used_at: null,
    created_at: now,
  });

  await assert.rejects(
    () => useCases.acceptTransfer('customer-2', 'transfer-token'),
    /Customer already has a linked card/
  );
});

test('linkCard links an unowned card to the current customer', async () => {
  const { useCases, cards, owners, transfers } = makeUseCases();
  cards.set('card-1', makeCard());

  const card = await useCases.linkCard('customer-1', 'CARD-1');

  assert.equal(card.id, 'card-1');
  assert.equal(owners.get('card-1')?.customer_id, 'customer-1');
  assert.deepEqual(transfers[0], {
    cardId: 'card-1',
    fromCustomerId: null,
    toCustomerId: 'customer-1',
    initiatedByCustomerId: 'customer-1',
    type: 'INITIAL_LINK',
  });
});

test('linkCard rejects a card owned by another customer', async () => {
  const { useCases, cards, owners } = makeUseCases();
  cards.set('card-1', makeCard());
  owners.set('card-1', { card_id: 'card-1', customer_id: 'customer-2', linked_at: now });

  await assert.rejects(
    () => useCases.linkCard('customer-1', 'CARD-1'),
    /Card is already linked to another customer/
  );
});

test('unlinkCard removes current owner and records unlink event', async () => {
  const { useCases, cards, owners, transfers } = makeUseCases();
  cards.set('card-1', makeCard());
  owners.set('card-1', { card_id: 'card-1', customer_id: 'customer-1', linked_at: now });

  const card = await useCases.unlinkCard('customer-1', 'CARD-1');

  assert.equal(card.id, 'card-1');
  assert.equal(owners.has('card-1'), false);
  assert.deepEqual(transfers[0], {
    cardId: 'card-1',
    fromCustomerId: 'customer-1',
    toCustomerId: null,
    initiatedByCustomerId: 'customer-1',
    type: 'OWNER_UNLINK',
  });
});

test('unlinkCard rejects a card owned by another customer', async () => {
  const { useCases, cards, owners } = makeUseCases();
  cards.set('card-1', makeCard());
  owners.set('card-1', { card_id: 'card-1', customer_id: 'customer-2', linked_at: now });

  await assert.rejects(
    () => useCases.unlinkCard('customer-1', 'CARD-1'),
    /Card is not owned by this customer/
  );
});

test('getHistoryByCode allows public history for unowned cards', async () => {
  const { useCases, cards, transactions } = makeUseCases();
  cards.set('card-1', makeCard());
  transactions.set('card-1', [
    {
      id: 'tx-1',
      card_id: 'card-1',
      type: 'CREATE',
      amount: 1000,
      balance_after: 1000,
      description: 'Card created',
      operator_id: null,
      created_at: now,
    },
  ]);

  const result = await useCases.getHistoryByCode('CARD-1');

  assert.equal(result.card.id, 'card-1');
  assert.equal(result.transactions.length, 1);
});

test('getHistoryByCode allows history for the card owner', async () => {
  const { useCases, cards, owners, transactions } = makeUseCases();
  cards.set('card-1', makeCard());
  owners.set('card-1', { card_id: 'card-1', customer_id: 'customer-1', linked_at: now });
  transactions.set('card-1', [
    {
      id: 'tx-1',
      card_id: 'card-1',
      type: 'DEBIT',
      amount: 100,
      balance_after: 900,
      description: 'Purchase',
      operator_id: 'operator-1',
      created_at: now,
    },
  ]);

  const result = await useCases.getHistoryByCode('CARD-1', { customerId: 'customer-1' });

  assert.equal(result.card.id, 'card-1');
  assert.equal(result.transactions.length, 1);
});

test('getHistoryByCode rejects history for a non-owner customer', async () => {
  const { useCases, cards, owners } = makeUseCases();
  cards.set('card-1', makeCard());
  owners.set('card-1', { card_id: 'card-1', customer_id: 'customer-2', linked_at: now });

  await assert.rejects(
    () => useCases.getHistoryByCode('CARD-1', { customerId: 'customer-1' }),
    /Card history is available only to the owner or an operator/
  );
});

test('getHistoryByCode allows history for operators', async () => {
  const { useCases, cards, owners, transactions } = makeUseCases();
  cards.set('card-1', makeCard());
  owners.set('card-1', { card_id: 'card-1', customer_id: 'customer-2', linked_at: now });
  transactions.set('card-1', [
    {
      id: 'tx-1',
      card_id: 'card-1',
      type: 'CREDIT',
      amount: 100,
      balance_after: 1100,
      description: 'Deposit',
      operator_id: 'operator-1',
      created_at: now,
    },
  ]);

  const result = await useCases.getHistoryByCode('CARD-1', { operatorId: 'operator-1' });

  assert.equal(result.card.id, 'card-1');
  assert.equal(result.transactions.length, 1);
});

test('startTransfer creates a token only for the current owner', async () => {
  const { useCases, cards, owners, tokens } = makeUseCases();
  cards.set('card-1', makeCard());
  owners.set('card-1', { card_id: 'card-1', customer_id: 'customer-1', linked_at: now });

  const result = await useCases.startTransfer('customer-1', 'CARD-1');

  assert.equal(result.token, 'transfer-token');
  assert.equal(tokens.get('transfer-token')?.from_customer_id, 'customer-1');
  assert.equal(result.expiresAt.toISOString(), '2026-06-25T10:15:00.000Z');
});

test('startTransfer rejects a card owned by another customer', async () => {
  const { useCases, cards, owners } = makeUseCases();
  cards.set('card-1', makeCard());
  owners.set('card-1', { card_id: 'card-1', customer_id: 'customer-2', linked_at: now });

  await assert.rejects(
    () => useCases.startTransfer('customer-1', 'CARD-1'),
    /Card is not owned by this customer/
  );
});

test('acceptTransfer moves ownership and marks the token used', async () => {
  const { useCases, cards, owners, tokens, transfers } = makeUseCases();
  cards.set('card-1', makeCard());
  owners.set('card-1', { card_id: 'card-1', customer_id: 'customer-1', linked_at: now });
  tokens.set('transfer-token', {
    id: 'token-1',
    token: 'transfer-token',
    card_id: 'card-1',
    from_customer_id: 'customer-1',
    expires_at: new Date('2026-06-25T10:15:00.000Z'),
    used_at: null,
    created_at: now,
  });

  const card = await useCases.acceptTransfer('customer-2', 'transfer-token');

  assert.equal(card.id, 'card-1');
  assert.equal(owners.get('card-1')?.customer_id, 'customer-2');
  assert.equal(tokens.get('transfer-token')?.used_at, now);
  assert.deepEqual(transfers[0], {
    cardId: 'card-1',
    fromCustomerId: 'customer-1',
    toCustomerId: 'customer-2',
    initiatedByCustomerId: 'customer-1',
    type: 'OWNER_TRANSFER',
  });
});

test('acceptTransfer rejects when the card owner changed after token creation', async () => {
  const { useCases, cards, owners, tokens } = makeUseCases();
  cards.set('card-1', makeCard());
  owners.set('card-1', { card_id: 'card-1', customer_id: 'customer-3', linked_at: now });
  tokens.set('transfer-token', {
    id: 'token-1',
    token: 'transfer-token',
    card_id: 'card-1',
    from_customer_id: 'customer-1',
    expires_at: new Date('2026-06-25T10:15:00.000Z'),
    used_at: null,
    created_at: now,
  });

  await assert.rejects(
    () => useCases.acceptTransfer('customer-2', 'transfer-token'),
    /Card is not owned by this customer/
  );
});
