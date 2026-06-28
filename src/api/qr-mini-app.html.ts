import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const qrMiniAppHtml = readFileSync(join(__dirname, 'qr-mini-app.html'), 'utf-8');
