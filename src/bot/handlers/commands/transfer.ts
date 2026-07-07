import type { CommandContext } from 'grammy';
import type { FeatureActor } from '../../../application/feature-flags.ts';
import type { FeatureFlagService } from '../../../application/feature-flag.service.ts';
import { AppError } from '../../../application/errors.ts';
import { userCopy } from '../../../copy.ts';
import { cardOwnershipService, featureFlagService } from '../../../services/index.ts';
import type { MyContext } from '../../context.ts';
import { formatBotErrorMessage } from '../../error-copy.ts';
import { hashTelegramUserIdForBot } from '../../telegram-identity.ts';
import { findCurrentCustomer, promptOwnershipConfirmation } from '../card-replies.ts';
import { getOperator } from '../operators.ts';

export async function assertCardTransferEnabled(options: {
  featureFlags: Pick<FeatureFlagService, 'isEnabled'>;
  actor: FeatureActor;
}) {
  const enabled = await options.featureFlags.isEnabled('card_transfer', options.actor);

  if (!enabled) {
    throw new AppError(userCopy.bot.errors.featureDisabled, 'FEATURE_DISABLED', 403);
  }
}

export async function getCardTransferFeatureActor(ctx: MyContext): Promise<FeatureActor> {
  const telegramUserId = ctx.from?.id;
  const operator = telegramUserId === undefined ? undefined : await getOperator(telegramUserId);

  return {
    ...(telegramUserId === undefined ? {} : { telegramUserIdHmac: hashTelegramUserIdForBot(telegramUserId) }),
    isOperator: operator !== undefined && operator !== null,
  };
}

export async function transferCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const customer = await findCurrentCustomer(ctx);
  if (!customer) {
    await ctx.reply(userCopy.bot.replies.noLinkedCard);
    return;
  }

  let code = ctx.match?.trim();
  if (!code) {
    const cards = await cardOwnershipService.listCards(customer.id);
    const card = cards[0];
    if (!card) {
      await ctx.reply(userCopy.bot.replies.noLinkedCard);
      return;
    }
    code = card.code;
  }

  await promptOwnershipConfirmation(ctx, { action: 'transferCard', code });
}

export async function startTransferForCurrentCustomer(ctx: MyContext, code: string) {
  const customer = await findCurrentCustomer(ctx);
  if (!customer) {
    await ctx.reply(userCopy.bot.replies.noLinkedCard);
    return;
  }

  try {
    await assertCardTransferEnabled({
      featureFlags: featureFlagService,
      actor: await getCardTransferFeatureActor(ctx),
    });
    const { card, token, expiresAt } = await cardOwnershipService.startTransfer(customer.id, code);
    await ctx.reply(
      `${userCopy.bot.operations.transfer}: ${card.code}\n` +
      `${userCopy.bot.operations.transferForwardCommand}\n/accept_transfer ${token}\n\n` +
      `${userCopy.bot.operations.transferExpiresAt} ${expiresAt.toLocaleString('ru-RU')}.`
    );
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}
