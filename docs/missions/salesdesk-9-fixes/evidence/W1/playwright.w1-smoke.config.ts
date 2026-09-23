import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../../');
export default defineConfig({
  testDir: path.join(repoRoot, 'e2e/missions'),
  testMatch: /salesdesk-9-fixes-w1-smoke\.spec\.ts/,
  timeout: 60000, workers: 1, reporter: [['list']],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://192.168.170.8:3100', locale: 'fa-IR', timezoneId: 'Asia/Tehran' },
});
