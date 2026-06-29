import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import { userCopy } from '../../copy.ts';
import { cardService } from '../../services/index.ts';
import { replyWithCardQr } from '../card-qr.ts';
import type { MyContext } from '../context.ts';
import { formatBotErrorMessage } from '../error-copy.ts';
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
  linkCardToCurrentCustomer,
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
      userCopy.bot.prompts.linkScan,
      { action: 'link' },
      userCopy.bot.prompts.linkManualFallback
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
    await ctx.reply(userCopy.bot.prompts.debitAmount);
    return true;
  }

  if (action === 'credit') {
    if (!await requireBotOperator(ctx)) {
      ctx.session.action = undefined;
      return true;
    }
    await ctx.reply(userCopy.bot.prompts.creditAmount);
    return true;
  }

  if (!await requireBotOperator(ctx)) {
    ctx.session.action = undefined;
    return true;
  }

  await ctx.reply(userCopy.bot.prompts.createAmount);
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
    await ctx.reply(userCopy.bot.replies.invalidAmount);
    return true;
  }

  ctx.session.action = undefined;

  if (pending.action === 'debit') {
    await replyScanPrompt(
      ctx,
      telegramConfig,
      `${userCopy.bot.prompts.debitScanPrefix} ${pending.amount} ₽:`,
      { action: 'debit', amount: pending.amount, description: pending.description },
      userCopy.bot.prompts.debitManualFallback,
      true
    );
    return true;
  }

  if (pending.action === 'credit') {
    await replyScanPrompt(
      ctx,
      telegramConfig,
      `${userCopy.bot.prompts.creditScanPrefix} ${pending.amount} ₽:`,
      { action: 'credit', amount: pending.amount, description: pending.description },
      userCopy.bot.prompts.creditManualFallback,
      true
    );
    return true;
  }

  if (pending.action === 'link') {
    await linkCardToCurrentCustomer(ctx, pending.code);
    return true;
  }

  const operatorId = await requireBotOperator(ctx);
  if (!operatorId) {
    return true;
  }

  try {
    const result = await cardService.createCard(pending.amount, operatorId);
    await replyWithCardQr(ctx, userCopy.bot.cardQr.cardCreated, result.card);
    await promptForReceiptAttachment(ctx, telegramConfig, {
      transactionId: result.transaction.id,
      operationType: result.transaction.type,
    });
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }

  return true;
}
