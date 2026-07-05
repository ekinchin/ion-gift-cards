# Telegram personal-data consent

## User-visible changes

- The Telegram bot asks for explicit personal-data consent before creating, linking, or accepting a personal card binding.
- Refusing consent blocks only personal-card binding in Telegram. Public balance checks by card code or QR remain available.
- Unlinking a card is now the user-visible withdrawal path for the card binding.
- Confirmed unlink deletes the card transaction history, revokes consent for the binding when no linked cards remain, and returns QR/code/balance for bearer-style access.

## Deployment notes

- `TELEGRAM_ID_HMAC_SECRET` must exist in Yandex Cloud Lockbox before release. Generate it with `openssl rand -hex 32`; do not commit or print it.
- Migration `005_telegram_personal_data_consent.sql` adds transition HMAC/consent columns and keeps raw Telegram identifier columns for backfill verification.
- Release workflows run `src/scripts/backfill-telegram-identity-hmac.ts` after SQL migrations and before runtime deployment.
- Later cleanup may add stricter constraints and remove raw Telegram identifier columns only after conversion has been verified.
- Backups containing raw identifiers remain personal-data artifacts and need a separate retention decision.
