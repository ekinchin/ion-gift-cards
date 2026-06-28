import { canOperateCards, type Actor } from '../../application/card-access-policy.ts';
import type { MyContext } from '../context.ts';
import { getOperator } from './operators.ts';

export async function resolveBotActor(ctx: MyContext): Promise<Actor> {
  const operator = await getOperator(ctx.from?.id || 0);
  return operator ? { operatorId: operator.id } : {};
}

export async function requireBotOperator(ctx: MyContext): Promise<string | null> {
  const actor = await resolveBotActor(ctx);
  if (!canOperateCards(actor)) {
    await ctx.reply('❌ У вас нет прав для этой операции');
    return null;
  }

  return actor.operatorId;
}
