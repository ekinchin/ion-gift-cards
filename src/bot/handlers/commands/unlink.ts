import type { CommandContext } from 'grammy';
import type { MyContext } from '../../context.ts';
import { unlinkCardFromCurrentCustomer } from '../card-replies.ts';

export async function unlinkCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const code = ctx.match?.trim();
  if (!code) {
    await ctx.reply('❌ Использование: /unlink <код>');
    return;
  }

  await unlinkCardFromCurrentCustomer(ctx, code);
}
