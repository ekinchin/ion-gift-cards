# Architecture

The project is a modular monolith.

HTTP API and Telegram bot are adapters. Telegram parses external input, resolves an application `Actor` where identity matters, and calls application use cases. The current HTTP card API exposes only public balance lookup and does not resolve application identity.

API request validation is implemented with Zod in `src/api/schemas.ts`. Controller-level request body and params types are inferred from the same schemas with `z.infer`, so runtime validation and TypeScript types share one source of truth.

Application use cases own business operations and database transaction boundaries. Card mutations run inside `db.transaction(...)`; debit and credit lock the card row before calculating the new balance.

Authorization rules live in `src/application/card-access-policy.ts`. Adapters that handle identity resolve it, but resource access decisions are expressed as actor/action/resource checks in the application layer. This keeps global operator permissions and resource-relative ownership checks out of Telegram handlers. The layer is described in `docs/access-control.md`.

Repositories own Knex queries and never decide business rules.

Database constraints protect critical invariants for balances, transaction amounts, and foreign keys.

Money is still represented as JavaScript `number` in application code. The current architecture protects basic amount invariants through Zod, use-case checks, and database constraints; a dedicated money value object remains a possible future improvement.

## Accepted Design: Transaction Receipts

`transactions` remains the card balance ledger. Fiscal receipt confirmations live in `transaction_receipts` and attach to a specific `CREATE`, `DEBIT`, or `CREDIT` transaction.

In soft mode, the operator operation is applied to the card first, then the bot asks the operator to scan the fiscal receipt QR or provide a skip reason. Receipt statuses are `pending_verification`, `verified`, `failed`, and `skipped`. A `failed` receipt does not trigger automatic balance correction; the case is handled as an operational incident.

The receipt URL is not treated as the source of truth. The system stores the raw QR payload and normalized fiscal fields, and builds a browser URL from those fields when possible.

Card owner history shows receipt statuses and links for `DEBIT` and `CREDIT`. Skip reasons and operator comments are operator/admin-only. A gift-card `CREATE` receipt is stored for audit but hidden from the card owner because the card may have been bought by one person and gifted to another.

## Accepted Design: Card Ledger and Domain Events

`transactions` is the card ledger. Its purpose is to explain and verify `cards.balance`, support balance recalculation, and make duplicated debit or credit operations discoverable. It should stay focused on card balance mutations and should not become a general business activity log.

Future cross-domain product mechanics, such as promotions, loyalty bonuses, news publication, and raffles, should use a separate `domain_events` stream. Domain events record business facts and are indexed by their primary aggregate through `aggregate_type` and `aggregate_id`. Events may also duplicate useful lookup references, such as `customer_id`, `card_id`, `operator_id`, `promotion_id`, or `raffle_id`, so support and reporting can query activity by related entity.

Reactive features should not be called directly from card use cases. When a feature needs to react to a business fact, the system should add an outbox or delivery table that records which handlers have processed each event and whether retries are needed. The first implementation can write domain events synchronously in the same database transaction as the originating use case; asynchronous retries can be added when the first real reactive module needs them.

The detailed accepted design is documented in `docs/domain-events.md` and `docs/domain-events-ru.md`.

## Accepted Design: Customer Card Ownership

Gift cards keep the current split between the internal `cards.id` and public `cards.code`. The public code remains the QR/manual-entry identifier for operator workflows. Bot-generated QR images encode exactly the plain text `cards.code`; they are generated on demand with `qrcode` and are not stored in the database.

The next ownership model adds provider-neutral customers:

- `customers` stores internal customer records.
- `customer_identities` maps customers to external accounts with `provider` and `telegram_user_id_hmac`; Telegram raw user IDs are not stored for customers.
- `card_owners` stores the current owner of a card. The current product model allows one owner per card and one current card per customer.
- `card_transfer_tokens` and `card_owner_transfers` support owner-initiated transfers and audit history.

Application use cases should work with `customer.id`. Telegram-specific data should stay in the bot adapter and identity repository boundary.

For accounts with a linked card, personal bot actions use that card by default: balance, history, my card, unlink, transfer, and link status. Operator cash-register actions, such as debit and credit, still require an explicit QR scan or public code. Public balance lookup remains bearer-style, but history for an owned card is restricted to the owner or an operator.

The detailed accepted design is documented in `docs/superpowers/specs/2026-06-25-card-ownership-transfer-design.md`.
