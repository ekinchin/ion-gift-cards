export type PendingMenuAction = 'debit' | 'credit' | 'create';

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
    };

export function parsePendingMenuActionInput(
  action: PendingMenuAction | undefined,
  text: string
): PendingMenuActionInputResult {
  if (!action) {
    return { handled: false };
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
