import { CardHistoryAccessDeniedError } from './errors.ts';

export interface Actor {
  customerId?: string;
  operatorId?: string;
}

export interface CardOwnerRef {
  customer_id: string;
}

export function canOperateCards(actor: Actor): actor is Actor & { operatorId: string } {
  return Boolean(actor.operatorId);
}

export function canReadCardHistory(actor: Actor, owner: CardOwnerRef | null): boolean {
  if (!owner) {
    return true;
  }

  return owner.customer_id === actor.customerId || canOperateCards(actor);
}

export function assertCanReadCardHistory(actor: Actor, owner: CardOwnerRef | null) {
  if (!canReadCardHistory(actor, owner)) {
    throw new CardHistoryAccessDeniedError();
  }
}
