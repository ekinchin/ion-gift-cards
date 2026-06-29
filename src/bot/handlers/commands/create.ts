import type { CommandContext } from 'grammy';
import { userCopy } from '../../../copy.ts';
import { cardService } from '../../../services/index.ts';
import { replyWithCardQr } from '../../card-qr.ts';
import { parseCreateCardAmount } from '../../create-card-command.ts';
import type { MyContext } from '../../context.ts';
import { formatBotErrorMessage } from '../../error-copy.ts';
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
    await ctx.reply(userCopy.bot.usage.createGiftCard);
    return;
  }

  if (!amount.ok) {
    await ctx.reply(userCopy.bot.replies.invalidAmount);
    return;
  }

  try {
    const result = await cardService.createCard(amount.amount, operatorId);
    await replyWithCardQr(ctx, userCopy.bot.cardQr.giftCreated, result.card);
    await promptForReceiptAttachment(ctx, telegramConfig, {
      transactionId: result.transaction.id,
      operationType: result.transaction.type,
    });
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
  };
}

export const createGiftCardCommandHandler = createGiftCardCommandHandlerWithConfig({
  mode: 'polling',
  botToken: '',
});
