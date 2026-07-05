import { InputFile } from 'grammy';
import QRCode from 'qrcode';
import { userCopy } from '../copy.ts';
import type { MyContext } from './context.ts';

interface CardQrView {
  code: string;
  balance: number | string;
}

export async function createCardQrPng(code: string): Promise<Buffer> {
  return QRCode.toBuffer(code, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 8,
  });
}

export function formatCardQrCaption(title: string, card: CardQrView): string {
  return `${title}\n${userCopy.bot.cardQr.code}: ${card.code}\n${userCopy.bot.cardQr.balance}: ${card.balance} ₽`;
}

export async function replyWithCardQr(
  ctx: MyContext,
  title: string,
  card: CardQrView,
  options: Parameters<MyContext['replyWithPhoto']>[1] = {}
) {
  const qr = await createCardQrPng(card.code);
  await ctx.replyWithPhoto(
    new InputFile(qr, `${card.code}.png`),
    { ...options, caption: formatCardQrCaption(title, card) }
  );
}
