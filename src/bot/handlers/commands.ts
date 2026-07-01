import type { Bot } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import { userCopy } from '../../copy.ts';
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

export const customerBotCommands = [
  { command: 'start', description: userCopy.bot.commandDescriptions.start },
  { command: 'balance', description: userCopy.bot.commandDescriptions.balance },
  { command: 'my_card', description: userCopy.bot.commandDescriptions.myCard },
  { command: 'create_my_card', description: userCopy.bot.commandDescriptions.createMyCard },
  { command: 'link', description: userCopy.bot.commandDescriptions.link },
  { command: 'unlink', description: userCopy.bot.commandDescriptions.unlink },
  { command: 'transfer', description: userCopy.bot.commandDescriptions.transfer },
  { command: 'accept_transfer', description: userCopy.bot.commandDescriptions.acceptTransfer },
  { command: 'history', description: userCopy.bot.commandDescriptions.history },
];

export const operatorBotCommands = [
  ...customerBotCommands,
  { command: 'debit', description: userCopy.bot.commandDescriptions.debit },
  { command: 'credit', description: userCopy.bot.commandDescriptions.credit },
  { command: 'create_gift_card', description: userCopy.bot.commandDescriptions.createGiftCard },
];

export const botCommands = customerBotCommands;

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
