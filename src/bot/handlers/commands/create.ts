import type { CommandContext } from 'grammy';
import { cardService } from '../../../services/index.ts';
import { replyWithCardQr } from '../../card-qr.ts';
import { parseCreateCardAmount } from '../../create-card-command.ts';
import type { MyContext } from '../../context.ts';
import { promptForReceiptAttachment } from '../../receipt-flow.ts';
import type { TelegramConfig } from '../../../configuration/configuration-service.ts';
import { requireBotOperator } from '../access.ts';

export function createGiftCardCommandHandlerWithConfig(telegramConfig: TelegramConfig) {
  return async function createGiftCardCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const operatorId = await requireBotOperator(ctx);
  if (!operatorId) {
    return;
  }
  const amount = parseCreateCardAmount(ctx.match);
  if (!amount.ok && amount.reason === 'missing') {
    await ctx.reply('❌ Использование: /create_gift_card <начальная_сумма>');
    return;
  }

  if (!amount.ok) {
    await ctx.reply('❌ Некорректная сумма');
    return;
  }

  try {
    const result = await cardService.createCard(amount.amount, operatorId);
    await replyWithCardQr(ctx, '✅ Подарочная карта создана', result.card);
    await promptForReceiptAttachment(ctx, telegramConfig, {
      transactionId: result.transaction.id,
      operationType: result.transaction.type,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
  };
}

export const createGiftCardCommandHandler = createGiftCardCommandHandlerWithConfig({
  mode: 'polling',
  botToken: '',
});
