import { randomInt } from 'node:crypto';

const CARD_CODE_PREFIX = 'ION';
const CARD_CODE_LENGTH = 12;
const CARD_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCardCode(): string {
  let suffix = '';

  for (let index = 0; index < CARD_CODE_LENGTH; index += 1) {
    suffix += CARD_CODE_ALPHABET[randomInt(CARD_CODE_ALPHABET.length)];
  }

  return `${CARD_CODE_PREFIX}-${suffix}`;
}
