import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCardCode } from '../src/application/card-code.generator.ts';

test('generateCardCode returns a public card code in the ION format', () => {
  const code = generateCardCode();

  assert.match(code, /^ION-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
});
