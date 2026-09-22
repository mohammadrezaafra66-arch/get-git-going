import { test, expect } from '@playwright/test';
import { storageStateForRole } from '../../e2e/helpers/role-session';
const BASE = process.env.E2E_BASE_URL ?? 'http://192.168.170.8:3100';
const SUPABASE = process.env.E2E_SUPABASE_URL ?? 'http://192.168.170.8:9000';
test.use({ storageState: storageStateForRole('admin', BASE, SUPABASE) });
test('smoke sales desk + work board', async ({ page }) => {
  await page.goto('/operations/sales-desk', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('میز فروش').first()).toBeVisible({ timeout: 20000 });
  await page.goto('/operations/work', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('در حال اجرا').first()).toBeVisible({ timeout: 20000 });
  await page.goto('/purchases', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('بدون تأمین‌کننده').first()).toBeVisible({ timeout: 20000 });
});
