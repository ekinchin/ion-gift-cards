import type { CommandContext } from 'grammy';
import type { MyContext } from '../../context.ts';
import { replyMyCards } from '../card-replies.ts';

export async function myCardsCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  await replyMyCards(ctx);
}
