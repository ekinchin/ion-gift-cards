import { InvalidReceiptQrError } from './errors.ts';

export interface ParsedFiscalReceiptQr {
  raw: string;
  issuedAt: Date;
  total: number;
  fiscalFn: string;
  fiscalFd: string;
  fiscalFp: string;
  operationType: string;
  inn?: string;
}

function getSearchParams(raw: string): URLSearchParams {
  try {
    const url = new URL(raw);
    return url.searchParams;
  } catch {
    return new URLSearchParams(raw);
  }
}

function requireParam(params: URLSearchParams, name: string) {
  const value = params.get(name);
  if (!value) {
    throw new InvalidReceiptQrError();
  }
  return value;
}

function parseIssuedAt(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);
  if (!match) {
    throw new InvalidReceiptQrError();
  }

  const [, year, month, day, hour, minute, second = '00'] = match;
  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ));
}

export function parseFiscalReceiptQr(raw: string): ParsedFiscalReceiptQr {
  const params = getSearchParams(raw);
  const fiscalFd = params.get('fd') || params.get('i');
  if (!fiscalFd) {
    throw new InvalidReceiptQrError();
  }

  const total = Number(requireParam(params, 's'));
  if (!Number.isFinite(total) || total <= 0) {
    throw new InvalidReceiptQrError();
  }

  const inn = params.get('inn') || undefined;

  return {
    raw,
    issuedAt: parseIssuedAt(requireParam(params, 't')),
    total,
    fiscalFn: requireParam(params, 'fn'),
    fiscalFd,
    fiscalFp: requireParam(params, 'fp'),
    operationType: requireParam(params, 'n'),
    ...(inn ? { inn } : {}),
  };
}

export function buildFiscalFingerprint(parsed: ParsedFiscalReceiptQr) {
  return `${parsed.fiscalFn}:${parsed.fiscalFd}:${parsed.fiscalFp}`;
}

export function buildReceiptUrl(parsed: ParsedFiscalReceiptQr) {
  return `https://check.ofd.ru/rec/${encodeURIComponent(parsed.fiscalFn)}/${encodeURIComponent(parsed.fiscalFd)}/${encodeURIComponent(parsed.fiscalFp)}`;
}
