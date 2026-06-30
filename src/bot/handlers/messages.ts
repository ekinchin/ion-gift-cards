import type { Bot } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import type { MyContext } from '../context.ts';
import { createTextMessageHandler } from './messages/text.ts';
import { createWebAppDataMessageHandler } from './messages/web-app-data.ts';

export function registerMessageHandlers(bot: Bot<MyContext>, telegramConfig: TelegramConfig) {
  bot.on('message:web_app_data', createWebAppDataMessageHandler(telegramConfig));
  bot.on('message:text', createTextMessageHandler(telegramConfig));
}
