# Access Control

The application uses actor-based authorization for card access.

This layer is intentionally separate from adapters. Adapters resolve who is making the request, then application code decides whether that actor can perform an action on a resource.

## Terms

`Actor` is the application-level identity of the current request:

```ts
interface Actor {
  customerId?: string;
  operatorId?: string;
}
```

An actor can have no identity, a customer identity, an operator identity, or both. Telegram users are adapter-specific input; they should be converted to `Actor` before access decisions are made.

`operator` is a global permission source. Current operators can perform cash-register card operations such as debit, credit, gift-card creation, and owned-card history lookup.

`owner` is not a global role. Ownership is a relationship between a customer and a specific card, stored in `card_owners`. A customer can be an owner for one card and a non-owner for another card.

## Flow

1. Adapter parses and validates external input.
2. Adapter resolves identity into an `Actor`.
3. Use case loads the resource or the resource relationship needed for the decision.
4. Policy function checks `actor + action + resource`.
5. Use case continues with business logic or throws an application error.

For Telegram bot requests, `src/bot/handlers/access.ts` resolves operator identity and exposes helpers such as `requireBotOperator`.

The current HTTP card API exposes only public balance lookup and does not resolve an `Actor`.

Resource decisions live in `src/application/card-access-policy.ts`.

## Current Rules

`canOperateCards(actor)` allows actors with `operatorId`. Bot handlers use this for operator-only commands and menu actions before starting debit, credit, or gift-card creation flows.

`canReadCardHistory(actor, owner)` allows:

- anyone, when the card has no owner;
- the current owner, when the card is owned;
- any operator, when the card is owned.

The assertion form `assertCanReadCardHistory` throws `CardHistoryAccessDeniedError` so use cases keep consistent application errors.

## Boundaries

Adapters may authenticate external identities, resolve customers, find operators, and choose user-facing error messages.

Adapters should not duplicate resource authorization rules such as "owner or operator can read owned-card history".

Use cases own transaction boundaries, resource loading, business invariants, and calls to policy functions.

Repositories only load and persist data. They should not decide whether an actor is allowed to perform an action.

Database constraints protect invariants that must hold regardless of caller, such as foreign keys, balance constraints, and ownership uniqueness. They are not a replacement for application authorization.

## Extending

When adding a new permission:

1. Add or reuse an `Actor` field only if the identity is part of the application domain.
2. Add a policy function named after the action, for example `canRefundCard` or `assertCanTransferCardOwnership`.
3. Keep relation-based checks resource-specific. Do not model `owner` as a global role.
4. Use the policy from the use case that owns the business operation.
5. Add focused policy tests and at least one adapter/use-case regression test for the user-facing path.

If roles become richer than the current `operator` flag, introduce explicit capabilities on the operator side instead of adding scattered role checks in handlers.
