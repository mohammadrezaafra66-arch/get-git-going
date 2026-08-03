import { test } from '@playwright/test';
import fs from 'node:fs';

test('save admin authenticated session', async ({ page, context }) => {
  fs.mkdirSync('e2e/auth', { recursive: true });

  await page.goto('http://192.168.170.8:3100');

  console.log('وارد حساب مدیر شو، سپس در Playwright Inspector روی Resume بزن.');

  await page.pause();

  await context.storageState({
    path: 'e2e/auth/admin.storage.json',
  });

  console.log('Admin session saved.');
});
