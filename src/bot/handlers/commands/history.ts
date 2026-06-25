import type { CommandContext } from 'grammy';
import type { MyContext } from '../../context.ts';
import { replyHistory, replyOwnedHistory } from '../card-replies.ts';

export async function historyCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const code = ctx.match?.trim();
  if (!code) {
    await replyOwnedHistory(ctx);
    return;
  }
  await replyHistory(ctx, code);
}
