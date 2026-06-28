import { InputFile } from 'grammy';
import QRCode from 'qrcode';
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
  return `${title}\n💳 Код: ${card.code}\n💰 Баланс: ${card.balance} ₽`;
}

export async function replyWithCardQr(ctx: MyContext, title: string, card: CardQrView) {
  const qr = await createCardQrPng(card.code);
  await ctx.replyWithPhoto(
    new InputFile(qr, `${card.code}.png`),
    { caption: formatCardQrCaption(title, card) }
  );
}
