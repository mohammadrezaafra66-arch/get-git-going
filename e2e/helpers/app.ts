import { expect, type Page, type TestInfo } from "@playwright/test";
import path from "node:path";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
export const E2E_PREFIX = "E2E_AUDIT_20260729_";

export async function gotoApp(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login(?:$|\?)/);
  await expect(page.getByText("بدون نقش")).toHaveCount(0);
}

export async function saveEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  await page.screenshot({
    fullPage: true,
    path: path.join(testInfo.outputDir, `${safeName}.png`),
  });
}

export async function expectAnyText(page: Page, labels: string[]): Promise<void> {
  const body = page.locator("body");
  await expect
    .poll(async () => {
      const text = await body.innerText();
      return labels.some((label) => text.includes(label));
    })
    .toBe(true);
}

export async function expectNoSevereConsoleErrors(page: Page, testInfo: TestInfo) {
  const messages: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") messages.push(msg.text());
  });
  await testInfo.attach("console-errors", {
    body: messages.length ? messages.join("\n") : "none",
    contentType: "text/plain",
  });
}

export function uniqueName(suffix: string): string {
  return `${E2E_PREFIX}${suffix}_${Date.now()}`;
}
