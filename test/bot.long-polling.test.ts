import test from 'node:test';
import assert from 'node:assert/strict';
import { startLongPolling } from '../src/bot/long-polling.ts';

test('startLongPolling waits for bot.start to finish', async () => {
  let resolveStart: () => void = () => {};
  const startPromise = new Promise<void>((resolve) => {
    resolveStart = resolve;
  });
  let completed = false;

  const runPromise = startLongPolling({
    start: () => startPromise,
  }).then(() => {
    completed = true;
  });

  await Promise.resolve();
  assert.equal(completed, false);

  resolveStart();
  await runPromise;
  assert.equal(completed, true);
});
