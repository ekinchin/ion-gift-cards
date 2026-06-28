# Architecture

The project is a modular monolith.

HTTP API and Telegram bot are adapters. They parse external input, resolve an application `Actor`, and call application use cases.

API request validation is implemented with Zod in `src/api/schemas.ts`. Controller-level request body and params types are inferred from the same schemas with `z.infer`, so runtime validation and TypeScript types share one source of truth.

Application use cases own business operations and database transaction boundaries. Card mutations run inside `db.transaction(...)`; debit and credit lock the card row before calculating the new balance.

Authorization rules live in `src/application/card-access-policy.ts`. Adapters resolve identity, but resource access decisions are expressed as actor/action/resource checks in the application layer. This keeps global operator permissions and resource-relative ownership checks out of Telegram and HTTP handlers. The layer is described in `docs/access-control.md`.

Repositories own Knex queries and never decide business rules.

Database constraints protect critical invariants for balances, transaction amounts, and foreign keys.

Money is still represented as JavaScript `number` in application code. The current architecture protects basic amount invariants through Zod, use-case checks, and database constraints; a dedicated money value object remains a possible future improvement.

## Accepted Design: Card Ledger and Domain Events

`transactions` is the card ledger. Its purpose is to explain and verify `cards.balance`, support balance recalculation, and make duplicated debit or credit operations discoverable. It should stay focused on card balance mutations and should not become a general business activity log.

Future cross-domain product mechanics, such as promotions, loyalty bonuses, news publication, and raffles, should use a separate `domain_events` stream. Domain events record business facts and are indexed by their primary aggregate through `aggregate_type` and `aggregate_id`. Events may also duplicate useful lookup references, such as `customer_id`, `card_id`, `operator_id`, `promotion_id`, or `raffle_id`, so support and reporting can query activity by related entity.

Reactive features should not be called directly from card use cases. When a feature needs to react to a business fact, the system should add an outbox or delivery table that records which handlers have processed each event and whether retries are needed. The first implementation can write domain events synchronously in the same database transaction as the originating use case; asynchronous retries can be added when the first real reactive module needs them.

The detailed accepted design is documented in `docs/domain-events.md` and `docs/domain-events-ru.md`.

## Accepted Design: Customer Card Ownership

Gift cards keep the current split between the internal `cards.id` and public `cards.code`. The public code remains the QR/manual-entry identifier for operator workflows. Bot-generated QR images encode exactly the plain text `cards.code`; they are generated on demand with `qrcode` and are not stored in the database.

The next ownership model adds provider-neutral customers:

- `customers` stores internal customer records.
- `customer_identities` maps customers to external accounts with `provider` and `provider_user_id`; Telegram is only the first provider.
- `card_owners` stores the current owner of a card. The current product model allows one owner per card and one current card per customer.
- `card_transfer_tokens` and `card_owner_transfers` support owner-initiated transfers and audit history.

Application use cases should work with `customer.id`. Telegram-specific data should stay in the bot adapter and identity repository boundary.

For accounts with a linked card, personal bot actions use that card by default: balance, history, my card, unlink, transfer, and link status. Operator cash-register actions, such as debit and credit, still require an explicit QR scan or public code. Public balance lookup remains bearer-style, but history for an owned card is restricted to the owner or an operator.

The detailed accepted design is documented in `docs/superpowers/specs/2026-06-25-card-ownership-transfer-design.md`.
