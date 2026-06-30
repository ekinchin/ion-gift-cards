import type { TelegramConfig } from '../../../configuration/configuration-service.ts';
import { userCopy } from '../../../copy.ts';
import { cardService, transactionReceiptService } from '../../../services/index.ts';
import type { MyContext } from '../../context.ts';
import { formatBotErrorMessage } from '../../error-copy.ts';
import { parseScanWebAppData, type ScanAction, type ScanWebAppPayload } from '../../scan-web-app.ts';
import {
  formatReceiptVerificationStatus,
  promptForReceiptAttachment,
} from '../../receipt-flow.ts';
import {
  linkCardToCurrentCustomer,
  replyBalance,
  replyHistory,
} from '../card-replies.ts';
import { requireBotOperator } from '../access.ts';
import { mainMenuKeyboard } from '../keyboards.ts';

type WebAppActionHandler = (
  ctx: MyContext,
  payload: ScanWebAppPayload,
  telegramConfig: TelegramConfig
) => Promise<void>;

async function handleBalance(ctx: MyContext, payload: ScanWebAppPayload) {
  await replyBalance(ctx, payload.code);
}

async function handleHistory(ctx: MyContext, payload: ScanWebAppPayload) {
  await replyHistory(ctx, payload.code);
}

async function handleLink(ctx: MyContext, payload: ScanWebAppPayload) {
  await linkCardToCurrentCustomer(ctx, payload.code);
}

async function handleReceipt(ctx: MyContext, payload: ScanWebAppPayload) {
  const pendingReceipt = ctx.session.pendingReceipt;
  if (!pendingReceipt) {
    await ctx.reply(userCopy.bot.replies.noPendingReceipt);
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
    await ctx.reply(
      `${userCopy.bot.receipts.saved}: ${formatReceiptVerificationStatus(receipt.verification_status)}`,
      { reply_markup: mainMenuKeyboard(true) }
    );
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}

async function handleDebit(
  ctx: MyContext,
  payload: ScanWebAppPayload,
  telegramConfig: TelegramConfig
) {
  const operatorId = await requireBotOperator(ctx);
  if (!operatorId) {
    return;
  }

  try {
    const result = await cardService.debit(payload.code, payload.amount!, operatorId, payload.description);
    await ctx.reply(`${userCopy.bot.operations.debited}: ${payload.amount} ₽\n${userCopy.bot.cards.card}: ${payload.code}\n${userCopy.bot.operations.remaining}: ${result.card.balance} ₽`);
    await promptForReceiptAttachment(ctx, telegramConfig, {
      transactionId: result.transaction.id,
      operationType: result.transaction.type,
    });
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}

async function handleCredit(
  ctx: MyContext,
  payload: ScanWebAppPayload,
  telegramConfig: TelegramConfig
) {
  const operatorId = await requireBotOperator(ctx);
  if (!operatorId) {
    return;
  }

  try {
    const result = await cardService.credit(payload.code, payload.amount!, operatorId, payload.description);
    await ctx.reply(`${userCopy.bot.operations.credited}: ${payload.amount} ₽\n${userCopy.bot.cards.card}: ${payload.code}\n${userCopy.bot.cards.balance}: ${result.card.balance} ₽`);
    await promptForReceiptAttachment(ctx, telegramConfig, {
      transactionId: result.transaction.id,
      operationType: result.transaction.type,
    });
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}

const webAppActionHandlers = {
  balance: handleBalance,
  history: handleHistory,
  link: handleLink,
  receipt: handleReceipt,
  debit: handleDebit,
  credit: handleCredit,
} satisfies Record<ScanAction, WebAppActionHandler>;

export function createWebAppDataMessageHandler(telegramConfig: TelegramConfig) {
  return async (ctx: MyContext) => {
    ctx.session.action = undefined;
    const payload = parseScanWebAppData(ctx.message!.web_app_data!.data);
    if (!payload) {
      await ctx.reply(userCopy.bot.replies.scanDataUnreadable);
      return;
    }

    if (payload.action !== 'receipt') {
      ctx.session.pendingCardOperation = undefined;
    }

    await webAppActionHandlers[payload.action](ctx, payload, telegramConfig);
  };
}
