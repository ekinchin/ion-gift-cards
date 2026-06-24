export type ScanAction = 'balance' | 'history' | 'debit' | 'credit' | 'link';

export interface ScanWebAppParams {
  action: ScanAction;
  amount?: number;
  description?: string;
}

export interface ScanWebAppPayload extends ScanWebAppParams {
  code: string;
}

const scanActions = new Set<ScanAction>(['balance', 'history', 'debit', 'credit', 'link']);

export function buildScanWebAppUrl(baseUrl: string, params: ScanWebAppParams) {
  const url = new URL(baseUrl);
  url.searchParams.set('action', params.action);

  if (params.amount !== undefined) {
    url.searchParams.set('amount', String(params.amount));
  }

  if (params.description) {
    url.searchParams.set('description', params.description);
  }

  return url.toString();
}

export function parseScanWebAppData(raw: string): ScanWebAppPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const payload = parsed as Partial<ScanWebAppPayload>;
  if (typeof payload.action !== 'string' || !scanActions.has(payload.action as ScanAction)) {
    return null;
  }

  if (typeof payload.code !== 'string' || payload.code.trim().length === 0) {
    return null;
  }

  const result: ScanWebAppPayload = {
    action: payload.action as ScanAction,
    code: payload.code.trim(),
  };

  if (payload.action === 'debit' || payload.action === 'credit') {
    if (typeof payload.amount !== 'number' || !Number.isFinite(payload.amount) || payload.amount <= 0) {
      return null;
    }

    result.amount = payload.amount;
  }

  if (typeof payload.description === 'string' && payload.description.trim().length > 0) {
    result.description = payload.description.trim();
  }

  return result;
}
