import type { CommandContext } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import { userCopy } from '../../copy.ts';
import { cardService } from '../../services/index.ts';
import type { MyContext } from '../context.ts';
import { formatBotErrorMessage } from '../error-copy.ts';
import type { ScanAction } from '../scan-web-app.ts';
import { parsePositiveAmount } from './amount.ts';
import { requireBotOperator } from './access.ts';
import { replyScanPrompt } from './keyboards.ts';
import { promptForReceiptAttachment } from '../receipt-flow.ts';

type CardOperationKind = Extract<ScanAction, 'debit' | 'credit'>;

type ParsedCardOperationCommand =
  | {
      ok: true;
      mode: 'direct';
      code: string;
      amount: number;
      description?: string;
    }
  | {
      ok: true;
      mode: 'scan';
      amount: number;
      description?: string;
    }
  | {
      ok: false;
      reason: 'missing' | 'invalid-amount';
    };

interface CardOperationCopy {
  usage: string;
  scanMessage(amount: number): string;
  scanFallback: string;
  success(amount: number, code: string, balance: number): string;
}

const copyByKind: Record<CardOperationKind, CardOperationCopy> = {
  debit: {
    usage: userCopy.bot.usage.debit,
    scanMessage: (amount) => `${userCopy.bot.prompts.debitScanPrefix} ${amount} ₽:`,
    scanFallback: userCopy.bot.prompts.debitManualFallback,
    success: (amount, code, balance) => `${userCopy.bot.operations.debited}: ${amount} ₽\n${userCopy.bot.cards.card}: ${code}\n${userCopy.bot.operations.remaining}: ${balance} ₽`,
  },
  credit: {
    usage: userCopy.bot.usage.credit,
    scanMessage: (amount) => `${userCopy.bot.prompts.creditScanPrefix} ${amount} ₽:`,
    scanFallback: userCopy.bot.prompts.creditManualFallback,
    success: (amount, code, balance) => `${userCopy.bot.operations.credited}: ${amount} ₽\n${userCopy.bot.cards.card}: ${code}\n${userCopy.bot.cards.balance}: ${balance} ₽`,
  },
};

export function parseCardOperationCommand(match: string | undefined): ParsedCardOperationCommand {
  const parts = match?.trim().split(/\s+/);
  if (!parts || parts.length < 1 || parts[0] === '') {
    return { ok: false, reason: 'missing' };
  }

  const directAmount = parts.length >= 2 ? parsePositiveAmount(parts[1]) : null;
  if (parts.length >= 2 && directAmount !== null) {
    const [code, _amountStr, ...descParts] = parts;
    return {
      ok: true,
      mode: 'direct',
      code,
      amount: directAmount,
      description: descParts.join(' ') || undefined,
    };
  }

  const scanAmount = parsePositiveAmount(parts[0]);
  if (scanAmount === null) {
    return { ok: false, reason: 'invalid-amount' };
  }

  return {
    ok: true,
    mode: 'scan',
    amount: scanAmount,
    description: parts.slice(1).join(' ') || undefined,
  };
}

export function createCardOperationCommandHandler(
  kind: CardOperationKind,
  telegramConfig: TelegramConfig
) {
  const copy = copyByKind[kind];

  return async function cardOperationCommandHandler(ctx: CommandContext<MyContext>) {
    ctx.session.action = undefined;
    const operatorId = await requireBotOperator(ctx);
    if (!operatorId) {
      return;
    }

    const command = parseCardOperationCommand(ctx.match);
    if (!command.ok) {
      await ctx.reply(command.reason === 'missing' ? copy.usage : userCopy.bot.replies.invalidAmount);
      return;
    }

    if (command.mode === 'direct') {
      try {
        const result = kind === 'debit'
          ? await cardService.debit(command.code, command.amount, operatorId, command.description)
          : await cardService.credit(command.code, command.amount, operatorId, command.description);
        await ctx.reply(copy.success(command.amount, command.code, result.card.balance));
        await promptForReceiptAttachment(ctx, telegramConfig, {
          transactionId: result.transaction.id,
          operationType: result.transaction.type,
        });
      } catch (error) {
        await ctx.reply(`${userCopy.bot.replies.errorPrefix} ${formatBotErrorMessage(error)}`);
      }
      return;
    }

    await replyScanPrompt(
      ctx,
      telegramConfig,
      copy.scanMessage(command.amount),
      { action: kind, amount: command.amount, description: command.description },
      copy.scanFallback
    );
  };
}
