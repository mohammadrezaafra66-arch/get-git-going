/**
 * Validates role storageState files without printing secrets.
 *
 * Explicit invocation only:
 *   npx playwright test e2e/auth/validate-role-sessions.spec.ts --project=chromium-admin
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { BASE_URL } from "../helpers/app";

type RoleCheck = {
  key: string;
  storageFile: string;
  expectedRoleLabel: string;
  allowedRoute: string;
  allowedText: string | RegExp;
  deniedRoute?: string;
};

const CHECKS: RoleCheck[] = [
  {
    key: "accountant",
    storageFile: "e2e/auth/accountant.storage.json",
    expectedRoleLabel: "حسابدار",
    allowedRoute: "/accounting/receipts",
    allowedText: /فیش|واریزی|رسید|حسابداری|دریافت|مالی/,
  },
  {
    key: "salesperson-a",
    storageFile: "e2e/auth/salesperson-a.storage.json",
    expectedRoleLabel: "فروشنده",
    allowedRoute: "/sales/quotes",
    allowedText: /پیش‌فاکتور|پیش فاکتور/,
    deniedRoute: "/accounting/receipts",
  },
  {
    key: "salesperson-b",
    storageFile: "e2e/auth/salesperson-b.storage.json",
    expectedRoleLabel: "فروشنده",
    allowedRoute: "/sales/quotes",
    allowedText: /پیش‌فاکتور|پیش فاکتور/,
    deniedRoute: "/accounting/receipts",
  },
];

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.describe("validate role storageState files", () => {
  test("all required storageState files exist", async () => {
    for (const check of CHECKS) {
      expect(
        fs.existsSync(check.storageFile),
        `Missing ${check.storageFile}. Run: npx playwright test e2e/auth/save-role-sessions.spec.ts --headed`,
      ).toBe(true);
      const size = fs.statSync(check.storageFile).size;
      expect(size, `${check.key}: storageState file is empty`).toBeGreaterThan(50);
    }
  });

  for (const check of CHECKS) {
    test(`${check.key}: authenticated, role label, route access`, async ({ browser }) => {
      expect(fs.existsSync(check.storageFile)).toBe(true);

      const context = await browser.newContext({
        storageState: check.storageFile,
        locale: "fa-IR",
        timezoneId: "Asia/Tehran",
        baseURL: BASE_URL,
      });
      const page = await context.newPage();

      try {
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
        await expect(page, `${check.key}: session not authenticated`).not.toHaveURL(
          /\/login(?:$|\?)/,
        );
        await expect(page.getByText("بدون نقش")).toHaveCount(0);
        await expect(
          page.getByText(check.expectedRoleLabel, { exact: false }).first(),
        ).toBeVisible({ timeout: 20_000 });

        await page.goto(check.allowedRoute, { waitUntil: "domcontentloaded" });
        await expect(page).not.toHaveURL(/\/login(?:$|\?)/);
        await expect(page.getByText(check.allowedText).first()).toBeVisible({
          timeout: 20_000,
        });

        if (check.deniedRoute) {
          await page.goto(check.deniedRoute, { waitUntil: "domcontentloaded" });
          // Sales users should not land on a normal accounting page shell.
          const body = await page.locator("body").innerText();
          const blocked =
            /دسترسی|مجاز نیست|Unauthorized|403|بدون نقش|ورود/.test(body) ||
            page.url().includes("/login") ||
            page.url().includes("/dashboard");
          // Soft check: either redirected away or access messaging appears;
          // do not require a specific denial UI contract.
          expect(
            blocked || !/رسیدهای دریافت|ایجاد رسید/.test(body),
            `${check.key}: unexpected full accountant receipts access`,
          ).toBe(true);
        }

        console.log(`Validated ${check.key}: authenticated + role + route OK`);
      } finally {
        await context.close();
      }
    });
  }

  test("salesperson-a and salesperson-b are distinct users", async ({ browser }) => {
    async function fingerprint(storageFile: string): Promise<string> {
      const context = await browser.newContext({
        storageState: storageFile,
        locale: "fa-IR",
        baseURL: BASE_URL,
      });
      const page = await context.newPage();
      try {
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
        return await page.evaluate(() => {
          for (const key of Object.keys(localStorage)) {
            if (!key.includes("auth-token") && !key.includes("sb-")) continue;
            try {
              const raw = localStorage.getItem(key);
              if (!raw) continue;
              const parsed = JSON.parse(raw) as {
                user?: { id?: string };
                currentSession?: { user?: { id?: string } };
              };
              const id = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
              if (typeof id === "string" && id.length > 8) return id.slice(0, 8);
            } catch {
              // ignore
            }
          }
          return "";
        });
      } finally {
        await context.close();
      }
    }

    const a = await fingerprint("e2e/auth/salesperson-a.storage.json");
    const b = await fingerprint("e2e/auth/salesperson-b.storage.json");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a, "salesperson-a and salesperson-b must be different accounts").not.toBe(b);
  });
});
