import type { TelegramConfig } from '../configuration/configuration-service.ts';
import { userCopy } from '../copy.ts';
import type { ReceiptSkipReason, TransactionType } from '../types/index.ts';
import type { MyContext } from './context.ts';
import { replyScanPrompt } from './handlers/keyboards.ts';

const skipReasonAliases = new Map<string, ReceiptSkipReason>([
  ['qr_unreadable', 'qr_unreadable'],
  [userCopy.bot.receipts.skipReasonLabels.qr_unreadable.toLowerCase(), 'qr_unreadable'],
  ['receipt_lost', 'receipt_lost'],
  [userCopy.bot.receipts.skipReasonLabels.receipt_lost.toLowerCase(), 'receipt_lost'],
  ['cash_register_without_qr', 'cash_register_without_qr'],
  [userCopy.bot.receipts.skipReasonLabels.cash_register_without_qr.toLowerCase(), 'cash_register_without_qr'],
  ['technical_error', 'technical_error'],
  [userCopy.bot.receipts.skipReasonLabels.technical_error.toLowerCase(), 'technical_error'],
  ['other', 'other'],
  [userCopy.bot.receipts.skipReasonLabels.other.toLowerCase(), 'other'],
]);

export type ParsedReceiptSkipInput =
  | { ok: true; reason: ReceiptSkipReason; comment: string | undefined }
  | { ok: false; reason: 'invalid' };

export function parseReceiptSkipInput(text: string): ParsedReceiptSkipInput {
  const normalizedText = text.trim().toLowerCase();
  const matchedAlias = [...skipReasonAliases.entries()]
    .sort(([a], [b]) => b.length - a.length)
    .find(([alias]) => normalizedText === alias || normalizedText.startsWith(`${alias} `));
  if (!matchedAlias) {
    return { ok: false, reason: 'invalid' };
  }

  const [alias, reason] = matchedAlias;
  const comment = text.trim().slice(alias.length).trim() || undefined;
  return {
    ok: true,
    reason,
    comment,
  };
}

export function formatReceiptSkipReason(reason: ReceiptSkipReason) {
  return userCopy.bot.receipts.skipReasonLabels[reason];
}

export function formatReceiptVerificationStatus(status: keyof typeof userCopy.bot.receipts.statusLabels) {
  return userCopy.bot.receipts.statusLabels[status];
}

export async function promptForReceiptAttachment(
  ctx: MyContext,
  telegramConfig: TelegramConfig,
  operation: { transactionId: string; operationType: TransactionType }
) {
  ctx.session.pendingReceipt = operation;

  await replyScanPrompt(
    ctx,
    telegramConfig,
    [
      userCopy.bot.prompts.receiptScan,
      userCopy.bot.prompts.receiptSkipIntro,
      userCopy.bot.prompts.receiptSkipReasons,
    ].join('\n'),
    { action: 'receipt' },
    userCopy.bot.prompts.receiptManualFallback
  );
}
