import { Bot, Context, InlineKeyboard, session, type SessionFlavor } from 'grammy';
import { cardService, operatorRepository } from '../services/index.ts';
import { randomUUID } from 'node:crypto';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

const webAppUrl = process.env.WEB_APP_URL;

interface SessionData {
  action?: 'debit' | 'credit' | 'balance' | 'create';
  cardCode?: string;
}

type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(token);

bot.use(session({ initial: (): SessionData => ({}) }));

const botCommands = [
  { command: 'start', description: 'Начало работы' },
  { command: 'scan', description: 'Открыть QR-сканер' },
  { command: 'balance', description: 'Проверить баланс' },
  { command: 'debit', description: 'Списать сумму' },
  { command: 'credit', description: 'Пополнить баланс' },
  { command: 'create', description: 'Создать карту' },
  { command: 'history', description: 'История операций' },
];

// Проверка оператора
async function getOperator(telegramId: number) {
  return operatorRepository.findByTelegramId(telegramId);
}

function scanKeyboard() {
  if (!webAppUrl) {
    return undefined;
  }

  return new InlineKeyboard().webApp('Сканировать QR', webAppUrl);
}

// Команда /start
bot.command('start', async (ctx) => {
  const operator = await getOperator(ctx.from?.id || 0);
  if (operator) {
    await ctx.reply(
      '👋 Добро пожаловать, оператор!\n\n' +
      'Команды:\n' +
      '/balance <код> - проверить баланс\n' +
      '/debit <код> <сумма> - списать\n' +
      '/credit <код> <сумма> - пополнить\n' +
      '/create <сумма> - создать карту\n' +
      '/history <код> - история операций',
      { reply_markup: scanKeyboard() }
    );
  } else {
    await ctx.reply(
      '👋 Привет!\n\n' +
      'Отправьте код вашего сертификата, чтобы узнать баланс.\n' +
      'Или используйте команду: /balance <код>',
      { reply_markup: scanKeyboard() }
    );
  }
});

bot.command('scan', async (ctx) => {
  const keyboard = scanKeyboard();
  if (!keyboard) {
    await ctx.reply('❌ Сканирование QR не настроено');
    return;
  }

  await ctx.reply('Откройте сканер QR-кода:', { reply_markup: keyboard });
});

// Проверка баланса
bot.command('balance', async (ctx) => {
  const code = ctx.match?.trim();
  if (!code) {
    await ctx.reply('❌ Укажите код карты: /balance <код>');
    return;
  }
  try {
    const { balance } = await cardService.getBalance(code);
    await ctx.reply(`💳 Карта: ${code}\n💰 Баланс: ${balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
});

// Списание (только для операторов)
bot.command('debit', async (ctx) => {
  const operator = await getOperator(ctx.from?.id || 0);
  if (!operator) {
    await ctx.reply('❌ У вас нет прав для этой операции');
    return;
  }
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    await ctx.reply('❌ Использование: /debit <код> <сумма> [описание]');
    return;
  }
  const [code, amountStr, ...descParts] = parts;
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Некорректная сумма');
    return;
  }
  const description = descParts.join(' ') || undefined;
  try {
    const card = await cardService.debit(code, amount, operator.id, description);
    await ctx.reply(`✅ Списано: ${amount} ₽\n💳 Карта: ${code}\n💰 Остаток: ${card.balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
});

// Пополнение (только для операторов)
bot.command('credit', async (ctx) => {
  const operator = await getOperator(ctx.from?.id || 0);
  if (!operator) {
    await ctx.reply('❌ У вас нет прав для этой операции');
    return;
  }
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    await ctx.reply('❌ Использование: /credit <код> <сумма> [описание]');
    return;
  }
  const [code, amountStr, ...descParts] = parts;
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Некорректная сумма');
    return;
  }
  const description = descParts.join(' ') || undefined;
  try {
    const card = await cardService.credit(code, amount, operator.id, description);
    await ctx.reply(`✅ Пополнено: ${amount} ₽\n💳 Карта: ${code}\n💰 Баланс: ${card.balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
});

// Создание карты (только для операторов)
bot.command('create', async (ctx) => {
  const operator = await getOperator(ctx.from?.id || 0);
  if (!operator) {
    await ctx.reply('❌ У вас нет прав для этой операции');
    return;
  }
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 1) {
    await ctx.reply('❌ Использование: /create <начальная_сумма>');
    return;
  }
  const [amountStr] = parts;
  const code = randomUUID();
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Некорректная сумма');
    return;
  }
  try {
    const card = await cardService.createCard(code, amount, operator.id);
    await ctx.reply(`✅ Карта создана!\n💳 Код: ${card.code}\n💰 Баланс: ${card.balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
});

// История операций
bot.command('history', async (ctx) => {
  const code = ctx.match?.trim();
  if (!code) {
    await ctx.reply('❌ Укажите код карты: /history <код>');
    return;
  }
  try {
    const history = await cardService.getHistory(code);
    if (history.length === 0) {
      await ctx.reply(`💳 Карта: ${code}\n📋 История пуста`);
      return;
    }
    const lines = history.slice(0, 10).map((tx) => {
      const sign = tx.type === 'DEBIT' ? '-' : '+';
      const emoji = tx.type === 'DEBIT' ? '🔴' : '🟢';
      return `${emoji} ${sign}${tx.amount} ₽ → ${tx.balance_after} ₽`;
    });
    await ctx.reply(`💳 Карта: ${code}\n📋 Последние операции:\n\n${lines.join('\n')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
});

// Обработка текста (код карты для проверки баланса)
bot.on('message:text', async (ctx) => {
  const code = ctx.message.text.trim();
  if (code.startsWith('/')) return;
  try {
    const { balance } = await cardService.getBalance(code);
    await ctx.reply(`💳 Карта: ${code}\n💰 Баланс: ${balance} ₽`);
  } catch {
    await ctx.reply('❌ Карта не найдена. Проверьте код и попробуйте снова.');
  }
});

// Запуск бота
await bot.api.setMyCommands(botCommands);

if (webAppUrl) {
  await bot.api.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: 'Сканировать QR',
      web_app: { url: webAppUrl },
    },
  });
}

bot.start();
console.log('🤖 Bot started!');
