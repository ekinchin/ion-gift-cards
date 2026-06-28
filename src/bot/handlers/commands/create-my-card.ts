import type { CommandContext } from 'grammy';
import type { MyContext } from '../../context.ts';
import { createPersonalCardForCurrentCustomer } from '../card-replies.ts';

export async function createMyCardCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  await createPersonalCardForCurrentCustomer(ctx);
}
