import { InlineKeyboard, Keyboard } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
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
      return 'Сканировать QR для истории';
    case 'debit':
      return 'Сканировать QR для списания';
    case 'credit':
      return 'Сканировать QR для пополнения';
    case 'link':
      return 'Сканировать QR для привязки';
    case 'balance':
      return 'Сканировать QR для баланса';
  }
}

export function scanKeyboard(
  telegramConfig: TelegramConfig,
  params: ScanWebAppParams = { action: 'balance' }
) {
  if (!telegramConfig.webAppUrl) {
    return undefined;
  }

  return new InlineKeyboard().webApp(
    scanButtonText(params.action),
    buildScanWebAppUrl(telegramConfig.webAppUrl, params)
  );
}

export function mainMenuKeyboard(isOperator = false) {
  const keyboard = new Keyboard()
    .text(menuButtonLabels.balance)
    .text(menuButtonLabels.history)
    .row()
    .text(menuButtonLabels.mycards)
    .text(menuButtonLabels.createPersonal)
    .row()
    .text(menuButtonLabels.link);

  if (!isOperator) {
    return keyboard.resized();
  }

  return keyboard
    .row()
    .text(menuButtonLabels.debit)
    .text(menuButtonLabels.credit)
    .row()
    .text(menuButtonLabels.create)
    .resized();
}

export async function replyScanPrompt(
  ctx: MyContext,
  telegramConfig: TelegramConfig,
  message: string,
  params: ScanWebAppParams,
  fallback: string
) {
  const keyboard = scanKeyboard(telegramConfig, params);
  if (!keyboard) {
    await ctx.reply(`❌ Сканирование QR не настроено. ${fallback}`);
    return;
  }

  await ctx.reply(message, { reply_markup: keyboard });
}
