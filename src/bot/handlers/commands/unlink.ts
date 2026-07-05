import type { CommandContext } from 'grammy';
import type { MyContext } from '../../context.ts';
import { promptUnlinkConfirmation } from '../card-replies.ts';

export async function unlinkCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const code = ctx.match?.trim();
  await promptUnlinkConfirmation(ctx, code || undefined);
}
