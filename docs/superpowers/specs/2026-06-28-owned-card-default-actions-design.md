# Owned Card Default Actions Design

## Status

Implemented in `feature/owned-card-default-actions`.

## Context

The bot now supports provider-neutral customer ownership for gift cards. A Telegram account can have one current linked card, enforced by the `idx_card_owners_customer_id_unique` database index.

The current UX still treats several customer actions as public-code or QR-first flows. This is confusing after a card is already linked to the account:

- the menu balance action asks for a QR scan instead of showing the linked card balance;
- the menu history action asks for a QR scan instead of showing the linked card history;
- the link action asks for a QR scan even though the account cannot link another card while it already owns one;
- unlink requires the card code and only returns text, making accidental unlink harder to recover from.

## Decision

For an account with a linked card, customer-facing personal actions use that linked card by default.

This applies to:

- balance;
- history;
- my card;
- unlink;
- transfer;
- link.

Operator cash-register actions remain scan/code-first:

- debit;
- credit;
- creating a gift card.

This prevents an operator with a personal linked card from accidentally debiting or crediting their own card instead of the customer's card.

## Link Behavior

If the current account has no linked card, the link action may ask the user to scan a QR code or enter a code manually.

If the current account already has a linked card, the link action must not open the scanner. The bot should explain that the account already has a card and show that card's code and balance.

The bot should not offer "scan another card" from this state. The product model allows one current card per account, so scanning another card for link would only end in a rejection.

The domain layer already rejects linking a card that has an owner:

- `CardOwnershipUseCases.linkCard` locks the card ownership row with `findOwnerByCardIdForUpdate`;
- if the owner is the current customer, it throws `CardAlreadyLinkedToCustomerError`;
- if the owner is any other customer, it throws `CardAlreadyLinkedError`;
- `test/card-ownership.use-cases.test.ts` covers the "card owned by another customer" rejection.

## Unlink Behavior

The unlink action should default to the current account's linked card.

Successful unlink response must include enough data to recover from an accidental unlink:

- the unlinked card code as copyable text;
- the current balance;
- a QR code containing the same public card code.

After unlink, the card has no owner and can be linked again by scanning or entering that public code.

## Balance Behavior

For an account with a linked card, the menu balance action and `/balance` without a code should show the linked card balance directly.

Manual `/balance <code>` and scan-based balance lookup may remain public bearer-style balance checks. Balance is not treated as private in this design.

If the account has no linked card, the bot may ask for a QR scan or manual code input.

## History Behavior

History is private once a card has an owner.

Rules:

- If a card has no owner, history may be read by public code as before.
- If a card has an owner, history may be read only by the owner or by an operator.
- The menu history action and `/history` without a code should show the current account's linked card history directly.
- Manual `/history <code>` by a non-operator customer should succeed only when that customer owns the card.

This rule must be enforced in application/API-level behavior, not only in Telegram copy, because HTTP routes can read history by public code today.

## Error Handling

If a personal action requires a linked card and none exists, the bot should explain the state and offer the relevant command:

- create a personal card;
- link an existing unowned card by code or QR.

If a customer tries to read history for an owned card that belongs to another customer, the bot/API should return a permission error rather than leaking transaction data.

## Testing

Implementation should add or update tests for:

- link action does not open the scanner when the customer already has a linked card;
- unlink without a code unlinks the current card and replies with QR, text code, and balance;
- menu balance uses the linked card directly;
- menu history uses the linked card directly;
- public history by code is denied when the card has an owner and the requester is neither owner nor operator;
- history by code is allowed for the owner;
- history by code is allowed for an operator.

## Implementation Notes

The implementation keeps public balance lookup unchanged, routes public-code history reads through `CardOwnershipUseCases.getHistoryByCode`, and makes the bot's personal menu actions prefer the current linked card. The unlink success response uses the same generated card QR helper as card creation and "my card", so an accidental unlink can be recovered with the returned QR or text code.
