import { expect, type Locator, type Page } from "@playwright/test";

export async function fillFirstVisibleByPlaceholder(
  page: Page,
  placeholder: string,
  value: string,
): Promise<void> {
  const input = page.getByPlaceholder(placeholder).first();
  await expect(input).toBeVisible();
  await input.fill(value);
}

export async function clickFirstVisible(locator: Locator): Promise<void> {
  await expect(locator.first()).toBeVisible();
  await locator.first().click();
}

export async function hasText(page: Page, text: string): Promise<boolean> {
  return (await page.getByText(text, { exact: false }).count()) > 0;
}
