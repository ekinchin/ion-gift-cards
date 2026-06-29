import type { MenuAction } from './menu.ts';

export type PendingMenuAction = 'balance' | 'history' | 'debit' | 'credit' | 'create' | 'link';

type PendingMenuActionInputResult =
  | { handled: false }
  | { handled: true; ok: false; reason: 'invalid_amount' }
  | {
      handled: true;
      ok: true;
      action: 'debit' | 'credit';
      amount: number;
      description: string | undefined;
    }
  | {
      handled: true;
      ok: true;
      action: 'create';
      amount: number;
    }
  | {
      handled: true;
      ok: true;
      action: 'link';
      code: string;
    }
  | {
      handled: true;
      ok: true;
      action: 'balance' | 'history';
      code: string;
    };

export function parsePendingMenuActionInput(
  action: PendingMenuAction | undefined,
  text: string
): PendingMenuActionInputResult {
  if (!action) {
    return { handled: false };
  }

  if (action === 'balance' || action === 'history' || action === 'link') {
    return { handled: true, ok: true, action, code: text.trim() };
  }

  const [amountText, ...descriptionParts] = text.trim().split(/\s+/);
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { handled: true, ok: false, reason: 'invalid_amount' };
  }

  if (action === 'create') {
    return { handled: true, ok: true, action, amount };
  }

  return {
    handled: true,
    ok: true,
    action,
    amount,
    description: descriptionParts.join(' ') || undefined,
  };
}

export function getPendingActionForMenuAction(action: MenuAction): PendingMenuAction | undefined {
  if (action === 'debit' || action === 'credit' || action === 'create' || action === 'link') {
    return action;
  }

  return undefined;
}
