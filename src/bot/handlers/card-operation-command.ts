import type { CommandContext } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import { cardService } from '../../services/index.ts';
import type { MyContext } from '../context.ts';
import type { ScanAction } from '../scan-web-app.ts';
import { parsePositiveAmount } from './amount.ts';
import { requireBotOperator } from './access.ts';
import { replyScanPrompt } from './keyboards.ts';

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
    usage: '❌ Использование: /debit <код> <сумма> [описание] или /debit <сумма> [описание] для сканирования QR',
    scanMessage: (amount) => `Отсканируйте QR-код карты для списания ${amount} ₽:`,
    scanFallback: 'Укажите код вручную: /debit <код> <сумма> [описание]',
    success: (amount, code, balance) => `✅ Списано: ${amount} ₽\n💳 Карта: ${code}\n💰 Остаток: ${balance} ₽`,
  },
  credit: {
    usage: '❌ Использование: /credit <код> <сумма> [описание] или /credit <сумма> [описание] для сканирования QR',
    scanMessage: (amount) => `Отсканируйте QR-код карты для пополнения на ${amount} ₽:`,
    scanFallback: 'Укажите код вручную: /credit <код> <сумма> [описание]',
    success: (amount, code, balance) => `✅ Пополнено: ${amount} ₽\n💳 Карта: ${code}\n💰 Баланс: ${balance} ₽`,
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
      await ctx.reply(command.reason === 'missing' ? copy.usage : '❌ Некорректная сумма');
      return;
    }

    if (command.mode === 'direct') {
      try {
        const card = kind === 'debit'
          ? await cardService.debit(command.code, command.amount, operatorId, command.description)
          : await cardService.credit(command.code, command.amount, operatorId, command.description);
        await ctx.reply(copy.success(command.amount, command.code, card.balance));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ошибка';
        await ctx.reply(`❌ ${message}`);
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
