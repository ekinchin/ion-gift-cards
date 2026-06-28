# Domain Events and Card Ledger

This document records the accepted direction for extending the application with promotions, loyalty bonuses, news publication, raffles, and similar product mechanics.

## Decision

Keep `transactions` as a narrow card ledger.

Add a separate domain event stream when the first cross-domain feature needs business facts outside the card balance ledger.

## Card Transactions

`transactions` exists to explain `cards.balance`.

It should answer these questions:

- Why does this card have its current balance?
- Can the balance be recalculated from the ledger?
- Was a debit or credit accidentally duplicated?
- What correction is needed if a card operation was entered incorrectly?

`transactions` should stay focused on balance-changing card operations, such as card creation, debit, credit, and future explicit card balance corrections.

It should not become the audit log for promotions, loyalty, news, raffles, or other product workflows.

## Domain Events

Domain events record business facts.

Examples:

- `card.created`
- `card.debited`
- `card.credited`
- `customer.card_linked`
- `promotion.reward_granted`
- `loyalty.points_earned`
- `raffle.entry_created`
- `news.published`

Events are useful for both goals:

- Audit and analytics: see what happened across the business.
- Reactive processing: let future modules respond to facts without coupling them directly to card use cases.

## Event Shape

A future `domain_events` table should be append-only and should identify the primary aggregate that produced or owns the fact.

Recommended shape:

```text
domain_events
- id
- event_type
- aggregate_type
- aggregate_id
- actor_type
- actor_id
- customer_id nullable
- card_id nullable
- operator_id nullable
- promotion_id nullable
- raffle_id nullable
- metadata jsonb
- occurred_at
```

`aggregate_type` and `aggregate_id` are the primary ownership fields. Denormalized references such as `customer_id` and `card_id` are lookup fields for support, reports, and feature handlers.

Example after a card debit:

```text
transactions
  card_id=123
  type=DEBIT
  amount=500
  balance_after=1500

domain_events
  event_type=card.debited
  aggregate_type=card
  aggregate_id=123
  card_id=123
  customer_id=456
  actor_type=operator
  actor_id=789
  metadata={ amount: 500, transaction_id: "..." }
```

## Reactive Processing

Reactive modules should not be called directly from `CardUseCases`.

When a feature needs reliable reactions, add an outbox or delivery table:

```text
event_deliveries
- id
- event_id
- handler
- status
- attempts
- last_error
- processed_at nullable
- created_at
```

This lets the system retry or replay feature-specific work without changing the card ledger.

Example handlers:

- `loyalty.on_card_debited`
- `raffles.on_card_debited`
- `notifications.on_news_published`

The first domain event implementation can be synchronous and simple: write the event in the same database transaction as the originating use case. Add asynchronous retries only when a real feature needs them.

## Boundaries

Card use cases may emit facts about card operations. They should not know which promotions, bonus rules, raffles, or notification flows consume those facts.

Promotions, loyalty, news, and raffles should own their own tables and ledgers. They may reference `domain_events`, `customers`, and `cards`, but they should not store their state in `transactions`.

