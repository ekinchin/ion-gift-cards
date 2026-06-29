import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import { cardService } from '../../services/index.ts';
import { replyWithCardQr } from '../card-qr.ts';
import type { MyContext } from '../context.ts';
import { parseMenuButton } from '../menu.ts';
import {
  getPendingActionForMenuAction,
  parsePendingMenuActionInput,
} from '../pending-menu-action.ts';
import { requireBotOperator } from './access.ts';
import { replyScanPrompt } from './keyboards.ts';
import { promptForReceiptAttachment } from '../receipt-flow.ts';
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
    if (!await requireBotOperator(ctx)) {
      ctx.session.action = undefined;
      return true;
    }
    await ctx.reply('Введите сумму для списания: /debit <сумма> [описание]');
    return true;
  }

  if (action === 'credit') {
    if (!await requireBotOperator(ctx)) {
      ctx.session.action = undefined;
      return true;
    }
    await ctx.reply('Введите сумму для пополнения: /credit <сумма> [описание]');
    return true;
  }

  if (!await requireBotOperator(ctx)) {
    ctx.session.action = undefined;
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

  const operatorId = await requireBotOperator(ctx);
  if (!operatorId) {
    return true;
  }

  try {
    const result = await cardService.createCard(pending.amount, operatorId);
    await replyWithCardQr(ctx, '✅ Карта создана', result.card);
    await promptForReceiptAttachment(ctx, telegramConfig, {
      transactionId: result.transaction.id,
      operationType: result.transaction.type,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }

  return true;
}
