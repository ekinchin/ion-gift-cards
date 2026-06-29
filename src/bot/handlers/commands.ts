import type { Bot } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import type { MyContext } from '../context.ts';
import { createCardOperationCommandHandler } from './card-operation-command.ts';
import { acceptTransferCommandHandler } from './commands/accept-transfer.ts';
import { balanceCommandHandler } from './commands/balance.ts';
import { createGiftCardCommandHandlerWithConfig } from './commands/create.ts';
import { createMyCardCommandHandler } from './commands/create-my-card.ts';
import { historyCommandHandler } from './commands/history.ts';
import { createLinkCommandHandler } from './commands/link.ts';
import { myCardsCommandHandler } from './commands/my-cards.ts';
import { startCommandHandler } from './commands/start.ts';
import { transferCommandHandler } from './commands/transfer.ts';
import { unlinkCommandHandler } from './commands/unlink.ts';

export const botCommands = [
  { command: 'start', description: 'Начало работы' },
  { command: 'balance', description: 'Проверить баланс' },
  { command: 'my_card', description: 'Моя карта' },
  { command: 'create_my_card', description: 'Создать мою карту' },
  { command: 'link', description: 'Привязать карту' },
  { command: 'unlink', description: 'Отвязать карту' },
  { command: 'transfer', description: 'Передать карту' },
  { command: 'accept_transfer', description: 'Принять карту' },
  { command: 'debit', description: 'Списать сумму' },
  { command: 'credit', description: 'Пополнить баланс' },
  { command: 'create_gift_card', description: 'Создать подарочную карту' },
  { command: 'history', description: 'История операций' },
];

export function registerCommandHandlers(bot: Bot<MyContext>, telegramConfig: TelegramConfig) {
  bot.command('start', startCommandHandler);
  bot.command('balance', balanceCommandHandler);
  bot.command('my_card', myCardsCommandHandler);
  bot.command('create_my_card', createMyCardCommandHandler);
  bot.command('link', createLinkCommandHandler(telegramConfig));
  bot.command('unlink', unlinkCommandHandler);
  bot.command('transfer', transferCommandHandler);
  bot.command('accept_transfer', acceptTransferCommandHandler);
  bot.command('debit', createCardOperationCommandHandler('debit', telegramConfig));
  bot.command('credit', createCardOperationCommandHandler('credit', telegramConfig));
  bot.command('create_gift_card', createGiftCardCommandHandlerWithConfig(telegramConfig));
  bot.command('history', historyCommandHandler);
}
