import type { CommandContext } from 'grammy';
import { userCopy } from '../../../copy.ts';
import { cardOwnershipService } from '../../../services/index.ts';
import type { MyContext } from '../../context.ts';
import { formatBotErrorMessage } from '../../error-copy.ts';
import { resolveCurrentCustomer } from '../card-replies.ts';

export async function acceptTransferCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  const token = ctx.match?.trim();
  if (!token) {
    await ctx.reply(userCopy.bot.usage.acceptTransfer);
    return;
  }

  try {
    const card = await cardOwnershipService.acceptTransfer(customer.id, token);
    await ctx.reply(`${userCopy.bot.operations.accepted}\n${userCopy.bot.cards.card}: ${card.code}\n${userCopy.bot.cards.balance}: ${card.balance} ₽`);
  } catch (error) {
    await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
  }
}
