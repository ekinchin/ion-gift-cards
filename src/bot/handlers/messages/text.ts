import type { TelegramConfig } from '../../../configuration/configuration-service.ts';
import { userCopy } from '../../../copy.ts';
import { cardService, transactionReceiptService } from '../../../services/index.ts';
import type { MyContext } from '../../context.ts';
import { formatBotErrorMessage } from '../../error-copy.ts';
import {
  formatReceiptSkipReason,
  parseReceiptSkipInput,
  promptForReceiptAttachment,
} from '../../receipt-flow.ts';
import { requireBotOperator } from '../access.ts';
import { mainMenuKeyboard } from '../keyboards.ts';
import { handleMenuButton, handlePendingMenuAction } from '../menu-handlers.ts';

export function createTextMessageHandler(telegramConfig: TelegramConfig) {
  return async (ctx: MyContext) => {
    const code = ctx.message!.text!.trim();
    if (code.startsWith('/')) return;
    if (await handleMenuButton(ctx, code, telegramConfig)) return;
    if (await handlePendingMenuAction(ctx, code, telegramConfig)) return;

    if (ctx.session.pendingCardOperation) {
      const pendingOperation = ctx.session.pendingCardOperation;
      const operatorId = await requireBotOperator(ctx);
      if (!operatorId) {
        return;
      }

      try {
        const result = pendingOperation.action === 'debit'
          ? await cardService.debit(code, pendingOperation.amount, operatorId, pendingOperation.description)
          : await cardService.credit(code, pendingOperation.amount, operatorId, pendingOperation.description);
        ctx.session.pendingCardOperation = undefined;
        if (pendingOperation.action === 'debit') {
          await ctx.reply(`${userCopy.bot.operations.debited}: ${pendingOperation.amount} ₽\n${userCopy.bot.cards.card}: ${code}\n${userCopy.bot.operations.remaining}: ${result.card.balance} ₽`);
        } else {
          await ctx.reply(`${userCopy.bot.operations.credited}: ${pendingOperation.amount} ₽\n${userCopy.bot.cards.card}: ${code}\n${userCopy.bot.cards.balance}: ${result.card.balance} ₽`);
        }
        await promptForReceiptAttachment(ctx, telegramConfig, {
          transactionId: result.transaction.id,
          operationType: result.transaction.type,
        });
      } catch (error) {
        await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
      }
      return;
    }

    if (ctx.session.pendingReceipt) {
      const operatorId = await requireBotOperator(ctx);
      if (!operatorId) {
        return;
      }

      const parsed = parseReceiptSkipInput(code);
      if (!parsed.ok) {
        await ctx.reply(userCopy.bot.replies.invalidReceiptSkipReason);
        return;
      }

      try {
        const receipt = await transactionReceiptService.skipReceipt({
          transactionId: ctx.session.pendingReceipt.transactionId,
          reason: parsed.reason,
          comment: parsed.comment,
          operatorId,
        });
        ctx.session.pendingReceipt = undefined;
        await ctx.reply(
          `${userCopy.bot.receipts.skipped}: ${formatReceiptSkipReason(receipt.skip_reason!)}`,
          { reply_markup: mainMenuKeyboard(true) }
        );
      } catch (error) {
        await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
      }
      return;
    }

    try {
      const { balance } = await cardService.getBalance(code);
      await ctx.reply(`${userCopy.bot.cards.card}: ${code}\n${userCopy.bot.cards.balance}: ${balance} ₽`);
    } catch {
      await ctx.reply(userCopy.bot.replies.cardNotFoundWithHint);
    }
  };
}
