import type { CommandContext } from 'grammy';
import { userCopy } from '../../../copy.ts';
import { cardOwnershipService } from '../../../services/index.ts';
import type { MyContext } from '../../context.ts';
import { formatBotErrorMessage } from '../../error-copy.ts';
import { promptOwnershipConfirmation, requirePersonalDataConsent, resolveCurrentCustomer } from '../card-replies.ts';

export async function acceptTransferCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const token = ctx.match?.trim();
  if (!token) {
    await ctx.reply(userCopy.bot.usage.acceptTransfer);
    return;
  }

  if (!await requirePersonalDataConsent(ctx, { action: 'acceptTransfer', token })) {
    return;
  }

  await promptOwnershipConfirmation(ctx, { action: 'acceptTransfer', token });
}

export async function acceptTransferForCurrentCustomer(ctx: MyContext, token: string) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const card = await cardOwnershipService.acceptTransfer(customer.id, token);
    await ctx.reply(`${userCopy.bot.operations.accepted}\n${userCopy.bot.cards.card}: ${card.code}\n${userCopy.bot.cards.balance}: ${card.balance} ₽`);
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}
