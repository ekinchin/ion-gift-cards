import type { Bot } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import { cardService } from '../../services/index.ts';
import type { MyContext } from '../context.ts';
import { parseScanWebAppData } from '../scan-web-app.ts';
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

    const operatorId = await requireBotOperator(ctx);
    if (!operatorId) {
      return;
    }

    try {
      if (payload.action === 'debit') {
        const card = await cardService.debit(payload.code, payload.amount!, operatorId, payload.description);
        await ctx.reply(`✅ Списано: ${payload.amount} ₽\n💳 Карта: ${payload.code}\n💰 Остаток: ${card.balance} ₽`);
        return;
      }

      const card = await cardService.credit(payload.code, payload.amount!, operatorId, payload.description);
      await ctx.reply(`✅ Пополнено: ${payload.amount} ₽\n💳 Карта: ${payload.code}\n💰 Баланс: ${card.balance} ₽`);
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

    try {
      const { balance } = await cardService.getBalance(code);
      await ctx.reply(`💳 Карта: ${code}\n💰 Баланс: ${balance} ₽`);
    } catch {
      await ctx.reply('❌ Карта не найдена. Проверьте код и попробуйте снова.');
    }
  });
}
