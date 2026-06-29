import type { TelegramConfig } from '../configuration/configuration-service.ts';
import type { ReceiptSkipReason, TransactionType } from '../types/index.ts';
import type { MyContext } from './context.ts';
import { replyScanPrompt } from './handlers/keyboards.ts';

const skipReasons = new Set<ReceiptSkipReason>([
  'qr_unreadable',
  'receipt_lost',
  'cash_register_without_qr',
  'technical_error',
  'other',
]);

export type ParsedReceiptSkipInput =
  | { ok: true; reason: ReceiptSkipReason; comment: string | undefined }
  | { ok: false; reason: 'invalid' };

export function parseReceiptSkipInput(text: string): ParsedReceiptSkipInput {
  const [reasonText, ...commentParts] = text.trim().split(/\s+/);
  if (!skipReasons.has(reasonText as ReceiptSkipReason)) {
    return { ok: false, reason: 'invalid' };
  }

  const comment = commentParts.join(' ') || undefined;
  return {
    ok: true,
    reason: reasonText as ReceiptSkipReason,
    comment,
  };
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
      '🧾 Отсканируйте QR чека для подтверждения операции.',
      'Чтобы пропустить чек, отправьте одну из причин:',
      'qr_unreadable, receipt_lost, cash_register_without_qr, technical_error, other <комментарий>',
    ].join('\n'),
    { action: 'receipt' },
    'Отправьте причину пропуска чека текстом.'
  );
}
