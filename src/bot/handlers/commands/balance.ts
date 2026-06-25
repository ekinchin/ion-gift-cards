import type { CommandContext } from 'grammy';
import type { MyContext } from '../../context.ts';
import { replyBalance, replyOwnedBalance } from '../card-replies.ts';

export async function balanceCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const code = ctx.match?.trim();
  if (!code) {
    await replyOwnedBalance(ctx);
    return;
  }
  await replyBalance(ctx, code);
}
