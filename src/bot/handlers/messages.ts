import type { Bot } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import { userCopy } from '../../copy.ts';
import { cardService, transactionReceiptService } from '../../services/index.ts';
import type { MyContext } from '../context.ts';
import { formatBotErrorMessage } from '../error-copy.ts';
import { parseScanWebAppData } from '../scan-web-app.ts';
import {
  formatReceiptSkipReason,
  formatReceiptVerificationStatus,
  parseReceiptSkipInput,
  promptForReceiptAttachment,
} from '../receipt-flow.ts';
import {
  linkCardToCurrentCustomer,
  replyBalance,
  replyHistory,
} from './card-replies.ts';
import { requireBotOperator } from './access.ts';
import { mainMenuKeyboard } from './keyboards.ts';
import { handleMenuButton, handlePendingMenuAction } from './menu-handlers.ts';

export function registerMessageHandlers(bot: Bot<MyContext>, telegramConfig: TelegramConfig) {
  bot.on('message:web_app_data', async (ctx) => {
    ctx.session.action = undefined;
    const payload = parseScanWebAppData(ctx.message.web_app_data.data);
    if (!payload) {
      await ctx.reply(userCopy.bot.replies.scanDataUnreadable);
      return;
    }

    if (payload.action !== 'receipt') {
      ctx.session.pendingCardOperation = undefined;
    }

    if (payload.action === 'balance') {
      await replyBalance(ctx, payload.code);
      return;
    }

    if (payload.action === 'history') {
      await replyHistory(ctx, payload.code);
      return;
    }

    if (payload.action === 'link') {
      await linkCardToCurrentCustomer(ctx, payload.code);
      return;
    }

    if (payload.action === 'receipt') {
      const pendingReceipt = ctx.session.pendingReceipt;
      if (!pendingReceipt) {
        await ctx.reply(userCopy.bot.replies.noPendingReceipt);
        return;
      }

      const operatorId = await requireBotOperator(ctx);
      if (!operatorId) {
        return;
      }

      try {
        const receipt = await transactionReceiptService.attachReceipt({
          transactionId: pendingReceipt.transactionId,
          rawQrPayload: payload.code,
          operatorId,
        });
        ctx.session.pendingReceipt = undefined;
        await ctx.reply(
          `${userCopy.bot.receipts.saved}: ${formatReceiptVerificationStatus(receipt.verification_status)}`,
          { reply_markup: mainMenuKeyboard(true) }
        );
      } catch (error) {
        await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
      }
      return;
    }

    const operatorId = await requireBotOperator(ctx);
    if (!operatorId) {
      return;
    }

    try {
      if (payload.action === 'debit') {
        const result = await cardService.debit(payload.code, payload.amount!, operatorId, payload.description);
        await ctx.reply(`${userCopy.bot.operations.debited}: ${payload.amount} ₽\n${userCopy.bot.cards.card}: ${payload.code}\n${userCopy.bot.operations.remaining}: ${result.card.balance} ₽`);
        await promptForReceiptAttachment(ctx, telegramConfig, {
          transactionId: result.transaction.id,
          operationType: result.transaction.type,
        });
        return;
      }

      const result = await cardService.credit(payload.code, payload.amount!, operatorId, payload.description);
      await ctx.reply(`${userCopy.bot.operations.credited}: ${payload.amount} ₽\n${userCopy.bot.cards.card}: ${payload.code}\n${userCopy.bot.cards.balance}: ${result.card.balance} ₽`);
      await promptForReceiptAttachment(ctx, telegramConfig, {
        transactionId: result.transaction.id,
        operationType: result.transaction.type,
      });
    } catch (error) {
      await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
    }
  });

  bot.on('message:text', async (ctx) => {
    const code = ctx.message.text.trim();
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
  });
}
