import { userCopy } from '../../copy.ts';
import { AppError } from '../../application/errors.ts';
import { cardOwnershipService, cardService } from '../../services/index.ts';
import { replyWithCardQr } from '../card-qr.ts';
import type { MyContext } from '../context.ts';
import { formatBotErrorMessage } from '../error-copy.ts';
import { resolveBotActor } from './access.ts';
import type { MainMenuOptions } from './keyboards.ts';
import type { TransactionWithReceipt } from '../../types/index.ts';
import { formatReceiptVerificationError } from '../receipt-flow.ts';

function formatReceiptSummary(tx: TransactionWithReceipt) {
  if (!tx.receipt) {
    return '';
  }

  const label = userCopy.bot.receipts.historyStatusLabels[tx.receipt.status];
  const failureReason = tx.receipt.status === 'failed'
    ? formatReceiptVerificationError(tx.receipt.verificationError)
    : undefined;
  if (failureReason) {
    return `\n   ${userCopy.bot.receipts.icon} ${label}: ${failureReason}`;
  }

  return tx.receipt.receiptUrl
    ? `\n   ${userCopy.bot.receipts.icon} ${label}: ${tx.receipt.receiptUrl}`
    : `\n   ${userCopy.bot.receipts.icon} ${label}`;
}

function isNoOwnedCardsError(error: unknown) {
  return error instanceof AppError && error.code === 'NO_OWNED_CARDS';
}

export async function replyBalance(ctx: MyContext, code: string) {
  try {
    const { balance } = await cardService.getBalance(code);
    await ctx.reply(`${userCopy.bot.cards.card}: ${code}\n${userCopy.bot.cards.balance}: ${balance} ₽`);
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}

export async function resolveCurrentCustomer(ctx: MyContext) {
  const from = ctx.from;
  if (!from) {
    await ctx.reply(userCopy.bot.replies.accountUnknown);
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

export async function replyMyCards(ctx: MyContext) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  const cards = await cardOwnershipService.listCards(customer.id);
  if (cards.length === 0) {
    await ctx.reply(userCopy.bot.replies.noCardsWithHint);
    return;
  }

  const card = cards[0]!;
  await replyWithCardQr(ctx, userCopy.bot.cardQr.yourCard, card);
}

export async function getCurrentCustomerMenuOptions(ctx: MyContext): Promise<MainMenuOptions> {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) {
    return { hasLinkedCard: false };
  }

  const cards = await cardOwnershipService.listCards(customer.id);
  return { hasLinkedCard: cards.length > 0 };
}

export async function replyExistingLinkedCard(ctx: MyContext): Promise<boolean> {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return true;

  const cards = await cardOwnershipService.listCards(customer.id);
  const card = cards[0];
  if (!card) {
    return false;
  }

  await replyWithCardQr(ctx, userCopy.bot.cardQr.existingCard, card);
  return true;
}

export async function createPersonalCardForCurrentCustomer(ctx: MyContext) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const { card, created } = await cardOwnershipService.createPersonalCard(customer.id);
    const title = created ? userCopy.bot.cardQr.personalCreated : userCopy.bot.cardQr.existingCard;
    await replyWithCardQr(ctx, title, card);
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}

export async function replyOwnedBalance(
  ctx: MyContext,
  code?: string,
  options: { onNoOwnedCards?: () => Promise<void> } = {}
) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const { card, balance } = await cardOwnershipService.getOwnedBalance(customer.id, code);
    if (code) {
      await ctx.reply(`${userCopy.bot.cards.card}: ${card.code}\n${userCopy.bot.cards.balance}: ${balance} ₽`);
      return;
    }
    await replyWithCardQr(ctx, userCopy.bot.cardQr.currentCard, { ...card, balance });
  } catch (error) {
    if (!code && options.onNoOwnedCards && isNoOwnedCardsError(error)) {
      await options.onNoOwnedCards();
      return;
    }
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}

export async function replyOwnedHistory(
  ctx: MyContext,
  code?: string,
  options: { onNoOwnedCards?: () => Promise<void> } = {}
) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const { card, transactions } = await cardOwnershipService.getOwnedHistory(customer.id, code);
    if (transactions.length === 0) {
      await ctx.reply(`${userCopy.bot.cards.card}: ${card.code}\n${userCopy.bot.replies.historyEmpty}`);
      return;
    }
    const lines = transactions.slice(0, 10).map((tx) => {
      const sign = tx.type === 'DEBIT' ? userCopy.bot.operations.debitSign : userCopy.bot.operations.creditSign;
      return `${sign} ${tx.amount} ₽ → ${tx.balance_after} ₽${formatReceiptSummary(tx)}`;
    });
    await ctx.reply(`${userCopy.bot.cards.card}: ${card.code}\n${userCopy.bot.replies.recentOperations}\n\n${lines.join('\n')}`);
  } catch (error) {
    if (!code && options.onNoOwnedCards && isNoOwnedCardsError(error)) {
      await options.onNoOwnedCards();
      return;
    }
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}

export async function linkCardToCurrentCustomer(ctx: MyContext, code: string) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const card = await cardOwnershipService.linkCard(customer.id, code);
    await ctx.reply(`${userCopy.bot.operations.linked}\n${userCopy.bot.cards.card}: ${card.code}\n${userCopy.bot.cards.balance}: ${card.balance} ₽`);
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}

export async function unlinkCardFromCurrentCustomer(ctx: MyContext, code: string) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const card = await cardOwnershipService.unlinkCard(customer.id, code);
    await replyWithCardQr(ctx, userCopy.bot.cardQr.unlinked, card);
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}

export async function unlinkCurrentCardFromCurrentCustomer(ctx: MyContext) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const card = await cardOwnershipService.unlinkCurrentCard(customer.id);
    await replyWithCardQr(ctx, userCopy.bot.cardQr.unlinked, card);
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}

export async function replyHistory(ctx: MyContext, code: string) {
  try {
    const actor = await resolveBotActor(ctx);
    if (!actor.operatorId) {
      const customer = await resolveCurrentCustomer(ctx);
      if (!customer) return;
      actor.customerId = customer.id;
    }

    const { card, transactions } = await cardOwnershipService.getHistoryByCode(code, actor);
    if (transactions.length === 0) {
      await ctx.reply(`${userCopy.bot.cards.card}: ${card.code}\n${userCopy.bot.replies.historyEmpty}`);
      return;
    }
    const lines = transactions.slice(0, 10).map((tx) => {
      const sign = tx.type === 'DEBIT' ? userCopy.bot.operations.debitSign : userCopy.bot.operations.creditSign;
      return `${sign} ${tx.amount} ₽ → ${tx.balance_after} ₽${formatReceiptSummary(tx)}`;
    });
    await ctx.reply(`${userCopy.bot.cards.card}: ${card.code}\n${userCopy.bot.replies.recentOperations}\n\n${lines.join('\n')}`);
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}
