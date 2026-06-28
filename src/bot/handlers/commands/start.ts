import type { CommandContext } from 'grammy';
import type { MyContext } from '../../context.ts';
import { mainMenuKeyboard } from '../keyboards.ts';
import { getOperator } from '../operators.ts';

export async function startCommandHandler(ctx: CommandContext<MyContext>) {
  ctx.session.action = undefined;
  const operator = await getOperator(ctx.from?.id || 0);
  if (operator) {
    await ctx.reply(
      '👋 Добро пожаловать, оператор!\n\n' +
      'Выберите действие на клавиатуре ниже.',
      { reply_markup: mainMenuKeyboard(true) }
    );
  } else {
    await ctx.reply(
      '👋 Привет!\n\n' +
      'Отправьте код вашего сертификата, чтобы узнать баланс.\n' +
      'Для восстановления доступа привяжите карту командой /link <код>.\n' +
      'Или выберите действие на клавиатуре ниже.',
      { reply_markup: mainMenuKeyboard(false) }
    );
  }
}
