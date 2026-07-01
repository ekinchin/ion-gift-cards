import { Bot, session } from 'grammy';
import type { TelegramConfig } from '../configuration/configuration-service.ts';
import { operatorRepository } from '../services/index.ts';
import type { Operator } from '../types/index.ts';
import { type MyContext, type SessionData } from './context.ts';
import { customerBotCommands, operatorBotCommands } from './handlers/commands.ts';
import { registerBotHandlers } from './handlers/index.ts';

export type { MyContext, SessionData } from './context.ts';

export function createBot(telegramConfig: TelegramConfig) {
  const bot = new Bot<MyContext>(telegramConfig.botToken);
  bot.use(session({ initial: (): SessionData => ({}) }));
  registerBotHandlers(bot, telegramConfig);
  return bot;
}

type OperatorCommandSource = {
  getAll(): Promise<Operator[]>;
};

export async function configureBotApi(
  bot: Bot<MyContext>,
  operatorCommandSource: OperatorCommandSource = operatorRepository
) {
  await bot.api.setMyCommands(customerBotCommands);

  const operators = await operatorCommandSource.getAll();
  await Promise.all(operators.map((operator) => bot.api.setMyCommands(operatorBotCommands, {
    scope: {
      type: 'chat',
      chat_id: operator.telegram_id,
    },
  })));

  await bot.api.setChatMenuButton({ menu_button: { type: 'default' } });
}
