import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { qrMiniAppHtml } from '../src/api/qr-mini-app.html.ts';
import { userCopy } from '../src/copy.ts';

const userVisiblePattern = /[А-Яа-яЁё]|[✅❌💳💰📋🎟➕🔗⛓🔴🟢🧾ℹ👋🔐]/u;

const checkedSourceFiles = [
  'src/bot/card-qr.ts',
  'src/bot/error-copy.ts',
  'src/bot/menu.ts',
  'src/bot/receipt-flow.ts',
  'src/bot/handlers/access.ts',
  'src/bot/handlers/card-operation-command.ts',
  'src/bot/handlers/card-replies.ts',
  'src/bot/handlers/commands.ts',
  'src/bot/handlers/keyboards.ts',
  'src/bot/handlers/menu-handlers.ts',
  'src/bot/handlers/messages.ts',
  'src/bot/handlers/commands/accept-transfer.ts',
  'src/bot/handlers/commands/create.ts',
  'src/bot/handlers/commands/link.ts',
  'src/bot/handlers/commands/start.ts',
  'src/bot/handlers/commands/transfer.ts',
  'src/api/qr-mini-app.html',
] as const;

function collectCopyValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (typeof value === 'function') {
    return [];
  }
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.values(value).flatMap(collectCopyValues);
}

test('user-facing source text is centralized in userCopy', () => {
  const offenders = checkedSourceFiles.flatMap((file) => {
    const source = readFileSync(file, 'utf-8');
    return source
      .split('\n')
      .map((line, index) => ({ file, line, lineNumber: index + 1 }))
      .filter(({ line }) => userVisiblePattern.test(line))
      .map(({ file, line, lineNumber }) => `${relative(process.cwd(), file)}:${lineNumber}: ${line.trim()}`);
  });

  assert.deepEqual(offenders, []);
});

test('userCopy contains the visible Mini App text rendered into HTML', () => {
  const copyValues = collectCopyValues(userCopy.qrMiniApp);
  assert.ok(copyValues.length > 0);

  for (const text of copyValues) {
    assert.match(qrMiniAppHtml, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
