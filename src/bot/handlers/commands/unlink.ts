import type { CommandContext } from 'grammy';
import type { MyContext } from '../../context.ts';
import { unlinkCardFromCurrentCustomer, unlinkCurrentCardFromCurrentCustomer } from '../card-replies.ts';

export async function unlinkCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const code = ctx.match?.trim();
  if (!code) {
    await unlinkCurrentCardFromCurrentCustomer(ctx);
    return;
  }

  await unlinkCardFromCurrentCustomer(ctx, code);
}
