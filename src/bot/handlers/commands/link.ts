import type { CommandContext } from 'grammy';
import type { TelegramConfig } from '../../../configuration/configuration-service.ts';
import { userCopy } from '../../../copy.ts';
import type { MyContext } from '../../context.ts';
import { linkCardToCurrentCustomer, replyExistingLinkedCard } from '../card-replies.ts';
import { replyScanPrompt } from '../keyboards.ts';

export function createLinkCommandHandler(telegramConfig: TelegramConfig) {
  return async function linkCommandHandler(ctx: CommandContext<MyContext>) {
    ctx.session.action = undefined;
    const code = ctx.match?.trim();
    if (!code) {
      if (await replyExistingLinkedCard(ctx)) {
        return;
      }
      ctx.session.action = 'link';
      await replyScanPrompt(
        ctx,
        telegramConfig,
        userCopy.bot.prompts.linkScan,
        { action: 'link' },
        userCopy.bot.prompts.linkManualFallback,
        false,
        { hasLinkedCard: false }
      );
      return;
    }

    await linkCardToCurrentCustomer(ctx, code);
  };
}
