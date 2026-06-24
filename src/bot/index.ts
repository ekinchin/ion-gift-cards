import { Bot, Context, InlineKeyboard, Keyboard, session, type SessionFlavor } from 'grammy';
import { cardOwnershipService, cardService, operatorRepository } from '../services/index.ts';
import { menuButtonLabels, parseMenuButton } from './menu.ts';
import {
  buildScanWebAppUrl,
  parseScanWebAppData,
  type ScanAction,
  type ScanWebAppParams,
} from './scan-web-app.ts';

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
  { command: 'mycards', description: 'Мои привязанные карты' },
  { command: 'link', description: 'Привязать карту' },
  { command: 'transfer', description: 'Передать карту' },
  { command: 'accept_transfer', description: 'Принять карту' },
  { command: 'debit', description: 'Списать сумму' },
  { command: 'credit', description: 'Пополнить баланс' },
  { command: 'create', description: 'Создать карту' },
  { command: 'history', description: 'История операций' },
];

// Проверка оператора
async function getOperator(telegramId: number) {
  return operatorRepository.findByTelegramId(telegramId);
}

function parsePositiveAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function scanButtonText(action: ScanAction) {
  switch (action) {
    case 'history':
      return 'Сканировать QR для истории';
    case 'debit':
      return 'Сканировать QR для списания';
    case 'credit':
      return 'Сканировать QR для пополнения';
    case 'link':
      return 'Сканировать QR для привязки';
    case 'balance':
      return 'Сканировать QR для баланса';
  }
}

function scanKeyboard(params: ScanWebAppParams = { action: 'balance' }) {
  if (!webAppUrl) {
    return undefined;
  }

  return new InlineKeyboard().webApp(scanButtonText(params.action), buildScanWebAppUrl(webAppUrl, params));
}

function mainMenuKeyboard() {
  return new Keyboard()
    .text(menuButtonLabels.balance)
    .text(menuButtonLabels.history)
    .row()
    .text(menuButtonLabels.mycards)
    .text(menuButtonLabels.link)
    .row()
    .text(menuButtonLabels.scan)
    .row()
    .text(menuButtonLabels.debit)
    .text(menuButtonLabels.credit)
    .row()
    .text(menuButtonLabels.create)
    .resized();
}

async function replyScanPrompt(ctx: MyContext, message: string, params: ScanWebAppParams, fallback: string) {
  const keyboard = scanKeyboard(params);
  if (!keyboard) {
    await ctx.reply(`❌ Сканирование QR не настроено. ${fallback}`);
    return;
  }

  await ctx.reply(message, { reply_markup: keyboard });
}

async function replyBalance(ctx: MyContext, code: string) {
  try {
    const { balance } = await cardService.getBalance(code);
    await ctx.reply(`💳 Карта: ${code}\n💰 Баланс: ${balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}

async function resolveCurrentCustomer(ctx: MyContext) {
  const from = ctx.from;
  if (!from) {
    await ctx.reply('❌ Не удалось определить аккаунт пользователя');
    return null;
  }

  const displayName = [from.first_name, from.last_name].filter(Boolean).join(' ') || undefined;
  const { customer } = await cardOwnershipService.resolveCustomer({
    provider: 'telegram',
    providerUserId: String(from.id),
    username: from.username,
    displayName,
  });
  return customer;
}

async function replyMyCards(ctx: MyContext) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  const cards = await cardOwnershipService.listCards(customer.id);
  if (cards.length === 0) {
    await ctx.reply('У вас пока нет привязанных карт. Привяжите карту командой /link <код> или через QR.');
    return;
  }

  const lines = cards.map((card) => `💳 ${card.code}\n💰 Баланс: ${card.balance} ₽`);
  await ctx.reply(`🎟️ Ваши карты:\n\n${lines.join('\n\n')}`);
}

async function replyOwnedBalance(ctx: MyContext, code?: string) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const { card, balance } = await cardOwnershipService.getOwnedBalance(customer.id, code);
    await ctx.reply(`💳 Карта: ${card.code}\n💰 Баланс: ${balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}

async function replyOwnedHistory(ctx: MyContext, code?: string) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const { card, transactions } = await cardOwnershipService.getOwnedHistory(customer.id, code);
    if (transactions.length === 0) {
      await ctx.reply(`💳 Карта: ${card.code}\n📋 История пуста`);
      return;
    }
    const lines = transactions.slice(0, 10).map((tx) => {
      const sign = tx.type === 'DEBIT' ? '-' : '+';
      const emoji = tx.type === 'DEBIT' ? '🔴' : '🟢';
      return `${emoji} ${sign}${tx.amount} ₽ → ${tx.balance_after} ₽`;
    });
    await ctx.reply(`💳 Карта: ${card.code}\n📋 Последние операции:\n\n${lines.join('\n')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}

async function linkCardToCurrentCustomer(ctx: MyContext, code: string) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const card = await cardOwnershipService.linkCard(customer.id, code);
    await ctx.reply(`✅ Карта привязана\n💳 Карта: ${card.code}\n💰 Баланс: ${card.balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}

async function replyHistory(ctx: MyContext, code: string) {
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
}

async function handleMenuButton(ctx: MyContext, text: string) {
  const action = parseMenuButton(text);
  if (!action) {
    return false;
  }

  if (action === 'balance') {
    await replyScanPrompt(
      ctx,
      'Отсканируйте QR-код карты для проверки баланса:',
      { action: 'balance' },
      'Укажите код вручную: /balance <код>'
    );
    return true;
  }

  if (action === 'history') {
    await replyScanPrompt(
      ctx,
      'Отсканируйте QR-код карты для просмотра истории:',
      { action: 'history' },
      'Укажите код вручную: /history <код>'
    );
    return true;
  }

  if (action === 'mycards') {
    await replyMyCards(ctx);
    return true;
  }

  if (action === 'link') {
    await replyScanPrompt(
      ctx,
      'Отсканируйте QR-код карты для привязки:',
      { action: 'link' },
      'Укажите код вручную: /link <код>'
    );
    return true;
  }

  if (action === 'scan') {
    await replyScanPrompt(
      ctx,
      'Откройте сканер QR-кода:',
      { action: 'balance' },
      'Укажите код вручную: /balance <код>'
    );
    return true;
  }

  if (action === 'debit') {
    await ctx.reply('Введите сумму для списания: /debit <сумма> [описание]');
    return true;
  }

  if (action === 'credit') {
    await ctx.reply('Введите сумму для пополнения: /credit <сумма> [описание]');
    return true;
  }

  await ctx.reply('Введите начальную сумму: /create <сумма>');
  return true;
}

// Команда /start
bot.command('start', async (ctx) => {
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

bot.command('scan', async (ctx) => {
  await replyScanPrompt(
    ctx,
    'Откройте сканер QR-кода:',
    { action: 'balance' },
    'Укажите код вручную: /balance <код>'
  );
});

// Проверка баланса
bot.command('balance', async (ctx) => {
  const code = ctx.match?.trim();
  if (!code) {
    await replyOwnedBalance(ctx);
    return;
  }
  await replyBalance(ctx, code);
});

bot.command('mycards', async (ctx) => {
  await replyMyCards(ctx);
});

bot.command('link', async (ctx) => {
  const code = ctx.match?.trim();
  if (!code) {
    await replyScanPrompt(
      ctx,
      'Отсканируйте QR-код карты для привязки:',
      { action: 'link' },
      'Укажите код вручную: /link <код>'
    );
    return;
  }

  await linkCardToCurrentCustomer(ctx, code);
});

bot.command('transfer', async (ctx) => {
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

// Списание (только для операторов)
bot.command('debit', async (ctx) => {
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
    `Отсканируйте QR-код карты для списания ${scanAmount} ₽:`,
    { action: 'debit', amount: scanAmount, description: parts.slice(1).join(' ') || undefined },
    'Укажите код вручную: /debit <код> <сумма> [описание]'
  );
});

// Пополнение (только для операторов)
bot.command('credit', async (ctx) => {
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
    `Отсканируйте QR-код карты для пополнения на ${scanAmount} ₽:`,
    { action: 'credit', amount: scanAmount, description: parts.slice(1).join(' ') || undefined },
    'Укажите код вручную: /credit <код> <сумма> [описание]'
  );
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
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Некорректная сумма');
    return;
  }
  try {
    const card = await cardService.createCard(amount, operator.id);
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
    await replyOwnedHistory(ctx);
    return;
  }
  await replyHistory(ctx, code);
});

bot.on('message:web_app_data', async (ctx) => {
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

  const operator = await getOperator(ctx.from?.id || 0);
  if (!operator) {
    await ctx.reply('❌ У вас нет прав для этой операции');
    return;
  }

  try {
    if (payload.action === 'debit') {
      const card = await cardService.debit(payload.code, payload.amount!, operator.id, payload.description);
      await ctx.reply(`✅ Списано: ${payload.amount} ₽\n💳 Карта: ${payload.code}\n💰 Остаток: ${card.balance} ₽`);
      return;
    }

    const card = await cardService.credit(payload.code, payload.amount!, operator.id, payload.description);
    await ctx.reply(`✅ Пополнено: ${payload.amount} ₽\n💳 Карта: ${payload.code}\n💰 Баланс: ${card.balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
});

// Обработка текста (код карты для проверки баланса)
bot.on('message:text', async (ctx) => {
  const code = ctx.message.text.trim();
  if (code.startsWith('/')) return;
  if (await handleMenuButton(ctx, code)) return;

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
