import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userCopy } from '../copy.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const qrMiniAppTemplate = readFileSync(join(__dirname, 'qr-mini-app.html'), 'utf-8');

export const qrMiniAppHtml = qrMiniAppTemplate.replace(
  '__QR_MINI_APP_COPY__',
  JSON.stringify(userCopy.qrMiniApp)
);
