import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflowFiles = [
  '.github/workflows/release-polling-vm.yml',
  '.github/workflows/release.yml',
] as const;

test('GitHub workflows use Node 24 action runtimes', () => {
  for (const file of workflowFiles) {
    const workflow = readFileSync(file, 'utf-8');

    assert.match(workflow, /uses: actions\/checkout@v7/);
    assert.match(workflow, /uses: actions\/setup-node@v6/);
    assert.doesNotMatch(workflow, /uses: actions\/checkout@v4/);
    assert.doesNotMatch(workflow, /uses: actions\/setup-node@v4/);
  }
});
