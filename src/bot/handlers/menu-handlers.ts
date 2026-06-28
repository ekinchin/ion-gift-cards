import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import { cardService } from '../../services/index.ts';
import { replyWithCardQr } from '../card-qr.ts';
import type { MyContext } from '../context.ts';
import { parseMenuButton } from '../menu.ts';
import {
  getPendingActionForMenuAction,
  parsePendingMenuActionInput,
} from '../pending-menu-action.ts';
import { replyScanPrompt } from './keyboards.ts';
import { getOperator } from './operators.ts';
import {
  createPersonalCardForCurrentCustomer,
  replyExistingLinkedCard,
  replyMyCards,
  replyOwnedBalance,
  replyOwnedHistory,
  unlinkCurrentCardFromCurrentCustomer,
} from './card-replies.ts';

export async function handleMenuButton(
  ctx: MyContext,
  text: string,
  telegramConfig: TelegramConfig
) {
  const action = parseMenuButton(text);
  if (!action) {
    return false;
  }

  ctx.session.action = getPendingActionForMenuAction(action);

  if (action === 'balance') {
    await replyOwnedBalance(ctx);
    return true;
  }

  if (action === 'history') {
    await replyOwnedHistory(ctx);
    return true;
  }

  if (action === 'mycards') {
    await replyMyCards(ctx);
    return true;
  }

  if (action === 'createPersonal') {
    await createPersonalCardForCurrentCustomer(ctx);
    return true;
  }

  if (action === 'link') {
    if (await replyExistingLinkedCard(ctx)) {
      return true;
    }
    await replyScanPrompt(
      ctx,
      telegramConfig,
      'Отсканируйте QR-код карты для привязки:',
      { action: 'link' },
      'Укажите код вручную: /link <код>'
    );
    return true;
  }

  if (action === 'unlink') {
    await unlinkCurrentCardFromCurrentCustomer(ctx);
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

  await ctx.reply('Введите начальную сумму: /create_gift_card <сумма>');
  return true;
}

export async function handlePendingMenuAction(
  ctx: MyContext,
  text: string,
  telegramConfig: TelegramConfig
) {
  const pending = parsePendingMenuActionInput(ctx.session.action, text);
  if (!pending.handled) {
    return false;
  }

  if (!pending.ok) {
    await ctx.reply('❌ Некорректная сумма');
    return true;
  }

  ctx.session.action = undefined;

  if (pending.action === 'debit') {
    await replyScanPrompt(
      ctx,
      telegramConfig,
      `Отсканируйте QR-код карты для списания ${pending.amount} ₽:`,
      { action: 'debit', amount: pending.amount, description: pending.description },
      'Укажите код вручную: /debit <код> <сумма> [описание]'
    );
    return true;
  }

  if (pending.action === 'credit') {
    await replyScanPrompt(
      ctx,
      telegramConfig,
      `Отсканируйте QR-код карты для пополнения на ${pending.amount} ₽:`,
      { action: 'credit', amount: pending.amount, description: pending.description },
      'Укажите код вручную: /credit <код> <сумма> [описание]'
    );
    return true;
  }

  const operator = await getOperator(ctx.from?.id || 0);
  if (!operator) {
    await ctx.reply('❌ У вас нет прав для этой операции');
    return true;
  }

  try {
    const card = await cardService.createCard(pending.amount, operator.id);
    await replyWithCardQr(ctx, '✅ Карта создана', card);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }

  return true;
}
