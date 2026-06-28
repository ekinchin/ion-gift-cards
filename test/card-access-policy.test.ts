import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCanReadCardHistory,
  canOperateCards,
  canReadCardHistory,
} from '../src/application/card-access-policy.ts';
import { CardHistoryAccessDeniedError } from '../src/application/errors.ts';

test('canOperateCards allows actors with operator identity', () => {
  assert.equal(canOperateCards({ operatorId: 'operator-1' }), true);
  assert.equal(canOperateCards({ customerId: 'customer-1' }), false);
  assert.equal(canOperateCards({}), false);
});

test('canReadCardHistory allows public history for unowned cards', () => {
  assert.equal(canReadCardHistory({}, null), true);
});

test('canReadCardHistory allows card owners and operators', () => {
  const owner = { customer_id: 'customer-1' };

  assert.equal(canReadCardHistory({ customerId: 'customer-1' }, owner), true);
  assert.equal(canReadCardHistory({ operatorId: 'operator-1' }, owner), true);
});

test('assertCanReadCardHistory rejects non-owner customers for owned cards', () => {
  assert.throws(
    () => assertCanReadCardHistory({ customerId: 'customer-2' }, { customer_id: 'customer-1' }),
    CardHistoryAccessDeniedError
  );
});
