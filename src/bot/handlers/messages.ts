import type { Bot } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import { cardService, transactionReceiptService } from '../../services/index.ts';
import type { MyContext } from '../context.ts';
import { parseScanWebAppData } from '../scan-web-app.ts';
import { parseReceiptSkipInput, promptForReceiptAttachment } from '../receipt-flow.ts';
import {
  linkCardToCurrentCustomer,
  replyBalance,
  replyHistory,
} from './card-replies.ts';
import { requireBotOperator } from './access.ts';
import { handleMenuButton, handlePendingMenuAction } from './menu-handlers.ts';

export function registerMessageHandlers(bot: Bot<MyContext>, telegramConfig: TelegramConfig) {
  bot.on('message:web_app_data', async (ctx) => {
    ctx.session.action = undefined;
    const payload = parseScanWebAppData(ctx.message.web_app_data.data);
    if (!payload) {
      await ctx.reply('❌ Не удалось прочитать данные сканирования');
      return;
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
        await ctx.reply('❌ Нет операции, ожидающей чек');
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
        await ctx.reply(`✅ Чек сохранен: ${receipt.verification_status}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ошибка';
        await ctx.reply(`❌ ${message}`);
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
        await ctx.reply(`✅ Списано: ${payload.amount} ₽\n💳 Карта: ${payload.code}\n💰 Остаток: ${result.card.balance} ₽`);
        await promptForReceiptAttachment(ctx, telegramConfig, {
          transactionId: result.transaction.id,
          operationType: result.transaction.type,
        });
        return;
      }

      const result = await cardService.credit(payload.code, payload.amount!, operatorId, payload.description);
      await ctx.reply(`✅ Пополнено: ${payload.amount} ₽\n💳 Карта: ${payload.code}\n💰 Баланс: ${result.card.balance} ₽`);
      await promptForReceiptAttachment(ctx, telegramConfig, {
        transactionId: result.transaction.id,
        operationType: result.transaction.type,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка';
      await ctx.reply(`❌ ${message}`);
    }
  });

  bot.on('message:text', async (ctx) => {
    const code = ctx.message.text.trim();
    if (code.startsWith('/')) return;
    if (await handleMenuButton(ctx, code, telegramConfig)) return;
    if (await handlePendingMenuAction(ctx, code, telegramConfig)) return;

    if (ctx.session.pendingReceipt) {
      const operatorId = await requireBotOperator(ctx);
      if (!operatorId) {
        return;
      }

      const parsed = parseReceiptSkipInput(code);
      if (!parsed.ok) {
        await ctx.reply('❌ Некорректная причина пропуска чека');
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
        await ctx.reply(`✅ Чек пропущен: ${receipt.skip_reason}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ошибка';
        await ctx.reply(`❌ ${message}`);
      }
      return;
    }

    try {
      const { balance } = await cardService.getBalance(code);
      await ctx.reply(`💳 Карта: ${code}\n💰 Баланс: ${balance} ₽`);
    } catch {
      await ctx.reply('❌ Карта не найдена. Проверьте код и попробуйте снова.');
    }
  });
}
