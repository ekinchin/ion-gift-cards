import type { Bot } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import { cardOwnershipService, cardService } from '../../services/index.ts';
import { parseCreateCardAmount } from '../create-card-command.ts';
import type { MyContext } from '../context.ts';
import { parsePositiveAmount } from './amount.ts';
import {
  linkCardToCurrentCustomer,
  replyBalance,
  replyHistory,
  replyMyCards,
  replyOwnedBalance,
  replyOwnedHistory,
  resolveCurrentCustomer,
  unlinkCardFromCurrentCustomer,
} from './card-replies.ts';
import { mainMenuKeyboard, replyScanPrompt } from './keyboards.ts';
import { getOperator } from './operators.ts';

export const botCommands = [
  { command: 'start', description: 'Начало работы' },
  { command: 'balance', description: 'Проверить баланс' },
  { command: 'mycards', description: 'Мои привязанные карты' },
  { command: 'link', description: 'Привязать карту' },
  { command: 'unlink', description: 'Отвязать карту' },
  { command: 'transfer', description: 'Передать карту' },
  { command: 'accept_transfer', description: 'Принять карту' },
  { command: 'debit', description: 'Списать сумму' },
  { command: 'credit', description: 'Пополнить баланс' },
  { command: 'create', description: 'Создать карту' },
  { command: 'history', description: 'История операций' },
];

export function registerCommandHandlers(bot: Bot<MyContext>, telegramConfig: TelegramConfig) {
  bot.command('start', async (ctx) => {
    ctx.session.action = undefined;
    const operator = await getOperator(ctx.from?.id || 0);
    if (operator) {
      await ctx.reply(
        '👋 Добро пожаловать, оператор!\n\n' +
        'Выберите действие на клавиатуре ниже.',
        { reply_markup: mainMenuKeyboard() }
      );
    } else {
      await ctx.reply(
        '👋 Привет!\n\n' +
        'Отправьте код вашего сертификата, чтобы узнать баланс.\n' +
        'Для восстановления доступа привяжите карту командой /link <код>.\n' +
        'Или выберите действие на клавиатуре ниже.',
        { reply_markup: mainMenuKeyboard() }
      );
    }
  });

  bot.command('balance', async (ctx) => {
    ctx.session.action = undefined;
    const code = ctx.match?.trim();
    if (!code) {
      await replyOwnedBalance(ctx);
      return;
    }
    await replyBalance(ctx, code);
  });

  bot.command('mycards', async (ctx) => {
    ctx.session.action = undefined;
    await replyMyCards(ctx);
  });

  bot.command('link', async (ctx) => {
    ctx.session.action = undefined;
    const code = ctx.match?.trim();
    if (!code) {
      await replyScanPrompt(
        ctx,
        telegramConfig,
        'Отсканируйте QR-код карты для привязки:',
        { action: 'link' },
        'Укажите код вручную: /link <код>'
      );
      return;
    }

    await linkCardToCurrentCustomer(ctx, code);
  });

  bot.command('unlink', async (ctx) => {
    ctx.session.action = undefined;
    const code = ctx.match?.trim();
    if (!code) {
      await ctx.reply('❌ Использование: /unlink <код>');
      return;
    }

    await unlinkCardFromCurrentCustomer(ctx, code);
  });

  bot.command('transfer', async (ctx) => {
    ctx.session.action = undefined;
    const customer = await resolveCurrentCustomer(ctx);
    if (!customer) return;

    const code = ctx.match?.trim();
    if (!code) {
      await ctx.reply('❌ Использование: /transfer <код>');
      return;
    }

    try {
      const { card, token, expiresAt } = await cardOwnershipService.startTransfer(customer.id, code);
      await ctx.reply(
        `🔐 Передача карты: ${card.code}\n` +
        `Перешлите получателю команду:\n/accept_transfer ${token}\n\n` +
        `Код действует до ${expiresAt.toLocaleString('ru-RU')}.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка';
      await ctx.reply(`❌ ${message}`);
    }
  });

  bot.command('accept_transfer', async (ctx) => {
    ctx.session.action = undefined;
    const customer = await resolveCurrentCustomer(ctx);
    if (!customer) return;

    const token = ctx.match?.trim();
    if (!token) {
      await ctx.reply('❌ Использование: /accept_transfer <код_передачи>');
      return;
    }

    try {
      const card = await cardOwnershipService.acceptTransfer(customer.id, token);
      await ctx.reply(`✅ Карта принята\n💳 Карта: ${card.code}\n💰 Баланс: ${card.balance} ₽`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка';
      await ctx.reply(`❌ ${message}`);
    }
  });

  bot.command('debit', async (ctx) => {
    ctx.session.action = undefined;
    const operator = await getOperator(ctx.from?.id || 0);
    if (!operator) {
      await ctx.reply('❌ У вас нет прав для этой операции');
      return;
    }
    const parts = ctx.match?.trim().split(/\s+/);
    if (!parts || parts.length < 1) {
      await ctx.reply('❌ Использование: /debit <код> <сумма> [описание] или /debit <сумма> [описание] для сканирования QR');
      return;
    }

    const directAmount = parts.length >= 2 ? parsePositiveAmount(parts[1]) : null;
    if (parts.length >= 2 && directAmount !== null) {
      const [code, _amountStr, ...descParts] = parts;
      const description = descParts.join(' ') || undefined;
      try {
        const card = await cardService.debit(code, directAmount, operator.id, description);
        await ctx.reply(`✅ Списано: ${directAmount} ₽\n💳 Карта: ${code}\n💰 Остаток: ${card.balance} ₽`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ошибка';
        await ctx.reply(`❌ ${message}`);
      }
      return;
    }

    const scanAmount = parsePositiveAmount(parts[0]);
    if (scanAmount === null) {
      await ctx.reply('❌ Некорректная сумма');
      return;
    }

    await replyScanPrompt(
      ctx,
      telegramConfig,
      `Отсканируйте QR-код карты для списания ${scanAmount} ₽:`,
      { action: 'debit', amount: scanAmount, description: parts.slice(1).join(' ') || undefined },
      'Укажите код вручную: /debit <код> <сумма> [описание]'
    );
  });

  bot.command('credit', async (ctx) => {
    ctx.session.action = undefined;
    const operator = await getOperator(ctx.from?.id || 0);
    if (!operator) {
      await ctx.reply('❌ У вас нет прав для этой операции');
      return;
    }
    const parts = ctx.match?.trim().split(/\s+/);
    if (!parts || parts.length < 1) {
      await ctx.reply('❌ Использование: /credit <код> <сумма> [описание] или /credit <сумма> [описание] для сканирования QR');
      return;
    }

    const directAmount = parts.length >= 2 ? parsePositiveAmount(parts[1]) : null;
    if (parts.length >= 2 && directAmount !== null) {
      const [code, _amountStr, ...descParts] = parts;
      const description = descParts.join(' ') || undefined;
      try {
        const card = await cardService.credit(code, directAmount, operator.id, description);
        await ctx.reply(`✅ Пополнено: ${directAmount} ₽\n💳 Карта: ${code}\n💰 Баланс: ${card.balance} ₽`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ошибка';
        await ctx.reply(`❌ ${message}`);
      }
      return;
    }

    const scanAmount = parsePositiveAmount(parts[0]);
    if (scanAmount === null) {
      await ctx.reply('❌ Некорректная сумма');
      return;
    }

    await replyScanPrompt(
      ctx,
      telegramConfig,
      `Отсканируйте QR-код карты для пополнения на ${scanAmount} ₽:`,
      { action: 'credit', amount: scanAmount, description: parts.slice(1).join(' ') || undefined },
      'Укажите код вручную: /credit <код> <сумма> [описание]'
    );
  });

  bot.command('create', async (ctx) => {
    ctx.session.action = undefined;
    const operator = await getOperator(ctx.from?.id || 0);
    if (!operator) {
      await ctx.reply('❌ У вас нет прав для этой операции');
      return;
    }
    const amount = parseCreateCardAmount(ctx.match);
    if (!amount.ok && amount.reason === 'missing') {
      await ctx.reply('❌ Использование: /create <начальная_сумма>');
      return;
    }

    if (!amount.ok) {
      await ctx.reply('❌ Некорректная сумма');
      return;
    }

    try {
      const card = await cardService.createCard(amount.amount, operator.id);
      await ctx.reply(`✅ Карта создана!\n💳 Код: ${card.code}\n💰 Баланс: ${card.balance} ₽`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка';
      await ctx.reply(`❌ ${message}`);
    }
  });

  bot.command('history', async (ctx) => {
    ctx.session.action = undefined;
    const code = ctx.match?.trim();
    if (!code) {
      await replyOwnedHistory(ctx);
      return;
    }
    await replyHistory(ctx, code);
  });
}
