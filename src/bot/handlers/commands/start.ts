import type { CommandContext } from 'grammy';
import { userCopy } from '../../../copy.ts';
import type { MyContext } from '../../context.ts';
import { mainMenuKeyboard } from '../keyboards.ts';
import { getOperator } from '../operators.ts';

export async function startCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const operator = await getOperator(ctx.from?.id || 0);
  if (operator) {
    await ctx.reply(
      userCopy.bot.start.operator,
      { reply_markup: mainMenuKeyboard(true) }
    );
  } else {
    await ctx.reply(
      userCopy.bot.start.customer,
      { reply_markup: mainMenuKeyboard(false) }
    );
  }
}
