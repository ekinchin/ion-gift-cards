import { Keyboard } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import { userCopy } from '../../copy.ts';
import type { MyContext } from '../context.ts';
import { menuButtonLabels } from '../menu.ts';
import {
  buildScanWebAppUrl,
  type ScanAction,
  type ScanWebAppParams,
} from '../scan-web-app.ts';

function scanButtonText(action: ScanAction) {
  switch (action) {
    case 'history':
      return userCopy.bot.scanButtons.history;
    case 'debit':
      return userCopy.bot.scanButtons.debit;
    case 'credit':
      return userCopy.bot.scanButtons.credit;
    case 'link':
      return userCopy.bot.scanButtons.link;
    case 'receipt':
      return userCopy.bot.scanButtons.receipt;
    case 'balance':
      return userCopy.bot.scanButtons.balance;
  }
}

export function scanKeyboard(
  telegramConfig: TelegramConfig,
  params: ScanWebAppParams = { action: 'balance' },
  isOperator = false
) {
  if (!telegramConfig.webAppUrl) {
    return undefined;
  }

  const keyboard = new Keyboard().webApp(
    scanButtonText(params.action),
    buildScanWebAppUrl(telegramConfig.webAppUrl, params)
  ).row();

  return addMainMenuButtons(keyboard, isOperator).resized().oneTime();
}

function addMainMenuButtons(keyboard: Keyboard, isOperator: boolean) {
  keyboard
    .text(menuButtonLabels.balance)
    .text(menuButtonLabels.history)
    .row()
    .text(menuButtonLabels.mycards)
    .text(menuButtonLabels.createPersonal)
    .row()
    .text(menuButtonLabels.link)
    .text(menuButtonLabels.unlink);

  if (!isOperator) {
    return keyboard;
  }

  return keyboard
    .row()
    .text(menuButtonLabels.debit)
    .text(menuButtonLabels.credit)
    .row()
    .text(menuButtonLabels.create);
}

export function mainMenuKeyboard(isOperator = false) {
  return addMainMenuButtons(new Keyboard(), isOperator).resized();
}

export async function replyScanPrompt(
  ctx: MyContext,
  telegramConfig: TelegramConfig,
  message: string,
  params: ScanWebAppParams,
  fallback: string,
  isOperatorMenu = false
) {
  const keyboard = scanKeyboard(telegramConfig, params, isOperatorMenu);
  if (!keyboard) {
    await ctx.reply(`${userCopy.bot.replies.scanNotConfiguredPrefix} ${fallback}`);
    return;
  }

  await ctx.reply(message, { reply_markup: keyboard });
}
