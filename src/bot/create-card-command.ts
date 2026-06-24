type CreateCardAmountParseResult =
  | { ok: true; amount: number }
  | { ok: false; reason: 'missing' | 'invalid' };

export function parseCreateCardAmount(payload: string | undefined): CreateCardAmountParseResult {
  const amountText = payload?.trim();
  if (!amountText) {
    return { ok: false, reason: 'missing' };
  }

  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'invalid' };
  }

  return { ok: true, amount };
}
