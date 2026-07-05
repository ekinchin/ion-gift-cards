import { hashTelegramUserId } from '../telegram/telegram-identity.ts';

let identityHmacSecret = process.env.TELEGRAM_ID_HMAC_SECRET ?? 'local-test-telegram-identity-hmac-secret';

export function configureTelegramIdentity(secret: string) {
  identityHmacSecret = secret;
}

export function hashTelegramUserIdForBot(telegramUserId: number | string): string {
  return hashTelegramUserId(telegramUserId, identityHmacSecret);
}
