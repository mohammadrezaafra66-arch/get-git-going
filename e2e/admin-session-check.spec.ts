import { test, expect } from '@playwright/test';

test.use({
  storageState: 'e2e/auth/admin.storage.json',
});

test('admin session is valid', async ({ page }) => {
  await page.goto('http://192.168.170.8:3100/dashboard');

  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText('مدیر کل').first()).toBeVisible();
});
