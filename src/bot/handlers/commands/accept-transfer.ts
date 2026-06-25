import type { CommandContext } from 'grammy';
import { cardOwnershipService } from '../../../services/index.ts';
import type { MyContext } from '../../context.ts';
import { resolveCurrentCustomer } from '../card-replies.ts';

export async function acceptTransferCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  const token = ctx.match?.trim();
  if (!token) {
    await ctx.reply('❌ Использование: /accept_transfer <код_передачи>');
    return;
  }

  try {
    const card = await cardOwnershipService.acceptTransfer(customer.id, token);
    await ctx.reply(`✅ Карта принята\n💳 Карта: ${card.code}\n💰 Баланс: ${card.balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}
