import type { CommandContext } from 'grammy';
import { cardOwnershipService } from '../../../services/index.ts';
import type { MyContext } from '../../context.ts';
import { resolveCurrentCustomer } from '../card-replies.ts';

export async function transferCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  let code = ctx.match?.trim();
  if (!code) {
    const cards = await cardOwnershipService.listCards(customer.id);
    const card = cards[0];
    if (!card) {
      await ctx.reply('❌ У вас пока нет привязанной карты');
      return;
    }
    code = card.code;
  }

  try {
    const { card, token, expiresAt } = await cardOwnershipService.startTransfer(customer.id, code);
    await ctx.reply(
      `🔐 Передача карты: ${card.code}\n` +
      `Перешлите получателю команду:\n/accept_transfer ${token}\n\n` +
      `Код действует до ${expiresAt.toLocaleString('ru-RU')}.`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}
