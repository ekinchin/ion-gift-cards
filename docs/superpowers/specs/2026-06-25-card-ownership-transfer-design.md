# Card Ownership and Transfer Design

## Status

Accepted design for the next implementation step.

## Context

Gift cards currently have two identifiers:

- `cards.id` is the internal database identifier used by relations and transactions.
- `cards.code` is the public card code used in QR codes, manual input, bot commands, and API paths.

The public code works for bearer-style gift card usage, but it creates two product gaps:

- a customer can lose the code and lose convenient access to balance/history;
- a customer cannot ask the bot for their cards without providing a card code.

The accepted direction is a hybrid model: the card remains usable by public `code`, but it can also be linked to one customer account for recovery, balance, history, and showing the code back to an operator.

The customer model must not hard-code Telegram into table names or domain APIs. Telegram is only the first external identity provider.

## Decision

Add a provider-neutral customer ownership layer.

### Customers

`customers` represents an internal customer record. It is independent from any messenger or authentication provider.

Proposed fields:

- `id`: internal customer identifier.
- `created_at`: customer record creation timestamp.

### Customer Identities

`customer_identities` maps an internal customer to an external account.

Proposed fields:

- `id`: internal identity row identifier.
- `customer_id`: reference to `customers.id`.
- `provider`: external identity provider, initially `telegram`.
- `provider_user_id`: provider-specific user id stored as text.
- `username`: optional provider username.
- `display_name`: optional human-readable provider display name.
- `created_at`: identity creation timestamp.

Constraints:

- `UNIQUE (provider, provider_user_id)` so one external account maps to one customer.
- A customer may later have multiple identities, for example `telegram` and another messenger.

### Card Owners

`card_owners` stores the current owner of a card.

Proposed fields:

- `card_id`: reference to `cards.id`.
- `customer_id`: reference to `customers.id`.
- `linked_at`: timestamp when ownership was established.

Constraints:

- `card_id` is the primary key, so one card has at most one current owner.
- One customer may own multiple cards.

The ownership relation is optional. A card without an owner is still valid and can still be used by public code/QR.

### Transfer Tokens

`card_transfer_tokens` stores pending owner-initiated transfers.

Proposed fields:

- `id`: internal transfer token row identifier.
- `token`: unique short-lived transfer secret shared with the recipient.
- `card_id`: card being transferred.
- `from_customer_id`: current owner who initiated the transfer.
- `expires_at`: token expiration timestamp.
- `used_at`: timestamp when token was accepted; null means not used.
- `created_at`: token creation timestamp.

### Transfer Audit

`card_owner_transfers` stores completed ownership events.

Proposed fields:

- `id`: internal audit row identifier.
- `card_id`: affected card.
- `from_customer_id`: previous owner; null for initial link.
- `to_customer_id`: new owner; null for unlink.
- `initiated_by_customer_id`: customer who initiated the event.
- `type`: `INITIAL_LINK`, `OWNER_TRANSFER`, or `OWNER_UNLINK`.
- `created_at`: event timestamp.

This table is audit/history. The current owner is always read from `card_owners`.

## QR and Public Code

The public code remains a bearer-style card identifier:

- operators can scan or enter `cards.code`;
- existing API routes that take `:code` can continue to work;
- customer ownership does not replace public code usage.

Bot-generated QR images currently encode the plain text `cards.code`, so the same scanner and manual-entry workflows read the same value. Future QR payload versioning can be added independently if needed, while continuing to accept legacy plain `<code>`.

## Use Cases

### Resolve Current Customer From Provider Identity

Actor: Telegram bot adapter.

Flow:

1. Adapter reads provider data from the incoming message.
2. Adapter resolves or creates a `customer` through `customer_identities`.
3. Application use cases receive `customer.id`, not Telegram-specific data.

For Telegram:

- `provider = 'telegram'`
- `provider_user_id = String(ctx.from.id)`

### Link Card to Current Customer

Actor: customer.

Entry points:

- `/link <code>`
- QR scan with a link action

Flow:

1. Customer provides or scans a public card code.
2. System finds active card by `cards.code`.
3. If card has no owner, system inserts `card_owners`.
4. System writes `card_owner_transfers` with `type = 'INITIAL_LINK'`.
5. Bot confirms the link and can show balance/history from ownership.

Errors:

- card code is unknown or inactive;
- card is already linked to another customer;
- card is already linked to the same customer.

### List My Cards

Actor: customer.

Flow:

1. Adapter resolves current customer.
2. System finds cards owned by that customer.
3. Bot shows a compact list with code and balance.

If the customer has no linked cards, bot suggests linking by code or QR scan.

### Show Balance Without Code

Actor: customer.

Flow:

1. Adapter resolves current customer.
2. If customer owns one card, bot shows that card balance.
3. If customer owns several cards, bot asks which card to use.
4. System reads balance by internal `cards.id` through ownership, not by public code.

### Show History Without Code

Actor: customer.

Flow:

1. Adapter resolves current customer.
2. Customer selects one owned card if needed.
3. System verifies ownership.
4. System returns recent transactions for that card.

### Show Code or QR to Operator

Actor: customer.

Flow:

1. Adapter resolves current customer.
2. Customer selects an owned card.
3. Bot shows a QR image generated from the public `cards.code`.
4. Bot keeps the public `cards.code` in the message caption so it can be copied or entered manually.

The public code remains enough for the operator to perform the existing scan/manual workflows.

### Start Transfer

Actor: current owner.

Flow:

1. Adapter resolves current customer.
2. Customer selects an owned card.
3. System verifies the customer is the current owner in `card_owners`.
4. System creates a `card_transfer_tokens` row with a short expiration window, for example 10-15 minutes.
5. Bot returns an accept command or deep link containing the token.
6. Owner sends that token/link to the recipient.

Errors:

- card is not owned by the current customer;
- card is inactive;
- there is already an active unused transfer token for the card, depending on implementation policy.

### Accept Transfer

Actor: recipient.

Entry point:

- `/accept_transfer <token>`

Flow:

1. Adapter resolves or creates the recipient customer.
2. System loads the token and locks the relevant transfer/card ownership rows inside a transaction.
3. System verifies:
   - token exists;
   - token is not expired;
   - token is not used;
   - card is active;
   - `from_customer_id` is still the current owner;
   - recipient is not the same as the current owner.
4. System updates `card_owners.customer_id` to the recipient customer.
5. System marks the token as used.
6. System writes `card_owner_transfers` with `type = 'OWNER_TRANSFER'`.
7. Bot confirms the transfer to the recipient.

Errors:

- invalid token;
- expired token;
- already used token;
- card owner changed after token creation;
- recipient is already the current owner.

### Unlink Card

Actor: current owner.

Entry point:

- `/unlink <code>`

Flow:

1. Adapter resolves current customer.
2. Customer provides a public card code.
3. System verifies the customer is the current owner in `card_owners`.
4. System deletes the current `card_owners` row.
5. System writes `card_owner_transfers` with `type = 'OWNER_UNLINK'` and `to_customer_id = null`.
6. Bot confirms the unlink.

Errors:

- card code is unknown or inactive;
- card is not owned by the current customer.

### Cancel Transfer

Actor: current owner.

Flow:

1. Adapter resolves current customer.
2. Customer selects card or active transfer.
3. System verifies the current customer owns the card and initiated the pending token.
4. System expires or invalidates the token.

This is optional for the first implementation if token expiration is short.

## Authorization Rules

Customer-facing ownership operations use the resolved `customer.id`.

Operator-facing card mutation operations continue to use operator authorization. Operator identity remains separate from customer identity even if both are currently backed by Telegram accounts.

Public-code balance lookup can remain available for existing behavior, but customer-specific "my cards" flows must use ownership checks.

## Transaction Boundaries

These operations should run inside database transactions:

- initial link;
- transfer token creation when enforcing one active token per card;
- transfer acceptance;
- transfer cancellation if implemented.

Transfer acceptance must lock enough state to prevent races between two recipients or between transfer and ownership changes.

## Testing Scope

Implementation should include focused tests for:

- provider identity resolve/create;
- linking an unowned card;
- rejecting link for a card owned by another customer;
- listing cards by customer;
- starting transfer only by current owner;
- accepting a valid transfer;
- rejecting expired/used/invalid transfer tokens;
- rejecting transfer acceptance after ownership changed;
- preserving existing code-based balance and operator flows.

## Deferred Decisions

- Whether to introduce a versioned QR payload format beyond the current plain `cards.code`.
- Whether to allow explicit transfer cancellation in the first implementation.
- Whether public code balance lookup should remain open long term or become rate-limited/protected.
