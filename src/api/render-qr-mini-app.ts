import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { qrMiniAppHtml } from './qr-mini-app.html.ts';

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error('Output path is required');
}

const resolvedOutputPath = resolve(outputPath);
mkdirSync(dirname(resolvedOutputPath), { recursive: true });
writeFileSync(resolvedOutputPath, qrMiniAppHtml);
