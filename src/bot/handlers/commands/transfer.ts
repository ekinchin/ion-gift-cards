import type { CommandContext } from 'grammy';
import { userCopy } from '../../../copy.ts';
import { cardOwnershipService } from '../../../services/index.ts';
import type { MyContext } from '../../context.ts';
import { formatBotErrorMessage } from '../../error-copy.ts';
import { resolveCurrentCustomer } from '../card-replies.ts';

export async function transferCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

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

  try {
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
