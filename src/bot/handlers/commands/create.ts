import type { CommandContext } from 'grammy';
import { cardService } from '../../../services/index.ts';
import { parseCreateCardAmount } from '../../create-card-command.ts';
import type { MyContext } from '../../context.ts';
import { getOperator } from '../operators.ts';

export async function createGiftCardCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const operator = await getOperator(ctx.from?.id || 0);
  if (!operator) {
    await ctx.reply('❌ У вас нет прав для этой операции');
    return;
  }
  const amount = parseCreateCardAmount(ctx.match);
  if (!amount.ok && amount.reason === 'missing') {
    await ctx.reply('❌ Использование: /create_gift_card <начальная_сумма>');
    return;
  }

  if (!amount.ok) {
    await ctx.reply('❌ Некорректная сумма');
    return;
  }

  try {
    const card = await cardService.createCard(amount.amount, operator.id);
    await ctx.reply(`✅ Подарочная карта создана!\n💳 Код: ${card.code}\n💰 Баланс: ${card.balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}
