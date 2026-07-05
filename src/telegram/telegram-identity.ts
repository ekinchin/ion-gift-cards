import { createHmac } from 'node:crypto';

export function hashTelegramUserId(telegramUserId: number | string, secret: string): string {
  return createHmac('sha256', secret)
    .update(String(telegramUserId), 'utf8')
    .digest('hex');
}
