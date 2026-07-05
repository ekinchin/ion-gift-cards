import type { TelegramConfig } from '../../../configuration/configuration-service.ts';
import { userCopy } from '../../../copy.ts';
import { cardOwnershipService, cardService, customerRepository, transactionReceiptService } from '../../../services/index.ts';
import type { MyContext } from '../../context.ts';
import { formatBotErrorMessage } from '../../error-copy.ts';
import {
  formatReceiptSkipReason,
  parseReceiptSkipInput,
  promptForReceiptAttachment,
} from '../../receipt-flow.ts';
import { requireBotOperator } from '../access.ts';
import { mainMenuKeyboard, replyScanPrompt } from '../keyboards.ts';
import {
  completeLinkCardToCurrentCustomer,
  createPersonalCardForCurrentCustomer,
  linkCardToCurrentCustomer,
  promptOwnershipConfirmation,
  resolveCurrentCustomer,
  unlinkCardFromCurrentCustomer,
  unlinkCurrentCardFromCurrentCustomer,
} from '../card-replies.ts';
import { handleMenuButton, handlePendingMenuAction } from '../menu-handlers.ts';
import { resolveBotActor } from '../access.ts';
import { acceptTransferForCurrentCustomer } from '../commands/accept-transfer.ts';
import { startTransferForCurrentCustomer } from '../commands/transfer.ts';

async function handlePersonalDataConsentResponse(
  ctx: MyContext,
  text: string,
  telegramConfig: TelegramConfig
) {
  const copy = userCopy.bot.personalDataConsent;
  if (text !== copy.acceptButton && text !== copy.declineButton) {
    return false;
  }

  const pending = ctx.session.pendingConsentAction;
  if (!pending) {
    return false;
  }

  if (text === copy.declineButton) {
    ctx.session.pendingConsentAction = undefined;
    ctx.session.action = undefined;
    await ctx.reply(copy.declined, { reply_markup: mainMenuKeyboard(false) });
    return true;
  }

  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) {
    return true;
  }

  await customerRepository.recordConsent(customer.id, 'telegram');
  ctx.session.pendingConsentAction = undefined;
  await ctx.reply(copy.accepted);

  if (pending.action === 'createPersonalCard') {
    await createPersonalCardForCurrentCustomer(ctx);
    return true;
  }

  if (pending.action === 'linkCard') {
    if (pending.code) {
      await promptOwnershipConfirmation(ctx, { action: 'linkCard', code: pending.code });
      return true;
    }

    ctx.session.action = 'link';
    const actor = await resolveBotActor(ctx);
    await replyScanPrompt(
      ctx,
      telegramConfig,
      userCopy.bot.prompts.linkScan,
      { action: 'link' },
      userCopy.bot.prompts.linkManualFallback,
      Boolean(actor.operatorId),
      { hasLinkedCard: false }
    );
    return true;
  }

  await promptOwnershipConfirmation(ctx, { action: 'acceptTransfer', token: pending.token });
  return true;
}

async function handleOwnershipConfirmationResponse(ctx: MyContext, text: string) {
  const copy = userCopy.bot.ownershipConfirmation;
  const pending = ctx.session.pendingOwnershipConfirmation;
  if (!pending) {
    return false;
  }

  const confirmButton = pending.action === 'linkCard'
    ? copy.linkButton
    : pending.action === 'acceptTransfer'
      ? copy.acceptTransferButton
      : copy.transferButton;
  if (text !== confirmButton && text !== copy.cancelButton) {
    return false;
  }

  ctx.session.pendingOwnershipConfirmation = undefined;
  if (text === copy.cancelButton) {
    const actor = await resolveBotActor(ctx);
    await ctx.reply(copy.cancelled, { reply_markup: mainMenuKeyboard(Boolean(actor.operatorId)) });
    return true;
  }

  if (pending.action === 'linkCard') {
    await completeLinkCardToCurrentCustomer(ctx, pending.code);
    return true;
  }

  if (pending.action === 'acceptTransfer') {
    await acceptTransferForCurrentCustomer(ctx, pending.token);
    return true;
  }

  await startTransferForCurrentCustomer(ctx, pending.code);
  return true;
}

async function handleUnlinkConfirmationResponse(ctx: MyContext, text: string) {
  const copy = userCopy.bot.unlinkPrivacy;
  if (text !== copy.confirmButton && text !== copy.cancelButton) {
    return false;
  }

  const pending = ctx.session.pendingUnlinkConfirmation;
  if (!pending) {
    return false;
  }

  ctx.session.pendingUnlinkConfirmation = undefined;
  if (text === copy.cancelButton) {
    await ctx.reply(copy.cancelled, { reply_markup: mainMenuKeyboard(true) });
    return true;
  }

  if (pending.code) {
    await unlinkCardFromCurrentCustomer(ctx, pending.code);
    return true;
  }

  await unlinkCurrentCardFromCurrentCustomer(ctx);
  return true;
}

export function createTextMessageHandler(telegramConfig: TelegramConfig) {
  return async (ctx: MyContext) => {
    const code = ctx.message!.text!.trim();
    if (code.startsWith('/')) return;
    if (await handleUnlinkConfirmationResponse(ctx, code)) return;
    if (await handleOwnershipConfirmationResponse(ctx, code)) return;
    if (await handlePersonalDataConsentResponse(ctx, code, telegramConfig)) return;
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
          cardCode: result.card.code,
          amount: pendingOperation.amount,
          balanceAfter: result.card.balance,
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
  };
}
