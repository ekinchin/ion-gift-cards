import type { CommandContext } from 'grammy';
import type { TelegramConfig } from '../../../configuration/configuration-service.ts';
import type { MyContext } from '../../context.ts';
import { linkCardToCurrentCustomer } from '../card-replies.ts';
import { replyScanPrompt } from '../keyboards.ts';

export function createLinkCommandHandler(telegramConfig: TelegramConfig) {
  return async function linkCommandHandler(ctx: CommandContext<MyContext>) {
    ctx.session.action = undefined;
    const code = ctx.match?.trim();
    if (!code) {
      await replyScanPrompt(
        ctx,
        telegramConfig,
        'Отсканируйте QR-код карты для привязки:',
        { action: 'link' },
        'Укажите код вручную: /link <код>'
      );
      return;
    }

    await linkCardToCurrentCustomer(ctx, code);
  };
}
