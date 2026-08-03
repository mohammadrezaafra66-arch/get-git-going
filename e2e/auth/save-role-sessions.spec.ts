/**
 * Interactive LAN auth setup for multi-role business E2E.
 *
 * NOT part of normal regression. Invoke explicitly:
 *   npx playwright test --config=playwright.auth.config.ts e2e/auth/save-role-sessions.spec.ts --headed
 *
 * For each role the browser pauses. Log in manually, then click Resume.
 * Passwords are never requested in code and never logged.
 */
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL } from "../helpers/app";

type RoleTarget = {
  key: "accountant" | "salesperson-a" | "salesperson-b";
  expectedRoleLabel: string;
  storageFile: string;
  probeRoute: string;
  probeText: string | RegExp;
  suggestedEmail: string;
};

const ROLES: RoleTarget[] = [
  {
    key: "accountant",
    expectedRoleLabel: "حسابدار",
    storageFile: "e2e/auth/accountant.storage.json",
    probeRoute: "/accounting/receipts",
    probeText: /فیش|واریزی|رسید|حسابداری|دریافت|مالی/,
    suggestedEmail: "test.accountant@afrakala.local",
  },
  {
    key: "salesperson-a",
    expectedRoleLabel: "فروشنده",
    storageFile: "e2e/auth/salesperson-a.storage.json",
    probeRoute: "/sales/quotes",
    probeText: /پیش‌فاکتور|پیش فاکتور/,
    suggestedEmail: "test.sales@afrakala.local",
  },
  {
    key: "salesperson-b",
    expectedRoleLabel: "فروشنده",
    storageFile: "e2e/auth/salesperson-b.storage.json",
    probeRoute: "/sales/quotes",
    probeText: /پیش‌فاکتور|پیش فاکتور/,
    suggestedEmail: "test.sales2@afrakala.local",
  },
];

const MAX_LOGIN_ATTEMPTS = 3;
const ROLE_LABEL_TIMEOUT_MS = 20_000;

type AuthDebugInfo = {
  consoleErrors: string[];
  failedAuthRequests: string[];
};

async function forceLogout(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
  });
  await page.context().clearCookies();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
}

function resetAuthDebugInfo(debug: AuthDebugInfo): void {
  debug.consoleErrors.length = 0;
  debug.failedAuthRequests.length = 0;
}

async function readUserFingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
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
}

function printLoginInstructions(role: RoleTarget, attempt: number): void {
  console.log("\n============================================================");
  console.log(`ROLE SETUP: ${role.key} (attempt ${attempt}/${MAX_LOGIN_ATTEMPTS})`);
  console.log(`REQUIRED role label on screen: ${role.expectedRoleLabel}`);
  console.log(`Suggested email: ${role.suggestedEmail}`);
  console.log("Do NOT use admin (مدیر کل).");
  console.log("Password is never printed — type it only in the browser form.");
  console.log("Steps:");
  console.log("  1) On /login, enter the suggested account (or another user with that role).");
  console.log("  2) Wait until dashboard loads and sidebar shows the required role.");
  console.log("  3) Click Resume in Playwright Inspector.");
  console.log("============================================================\n");
}

function attachAuthDebugCollectors(page: Page): AuthDebugInfo {
  const debug: AuthDebugInfo = {
    consoleErrors: [],
    failedAuthRequests: [],
  };

  page.on("console", (msg) => {
    if (msg.type() === "error") debug.consoleErrors.push(msg.text());
  });

  page.on("response", (response) => {
    const url = response.url();
    const status = response.status();
    const isAuthIdentityRequest =
      url.includes("/auth/") ||
      url.includes("/profiles") ||
      url.includes("/user_roles") ||
      url.includes("/role_permissions");
    if (isAuthIdentityRequest && status >= 400) {
      debug.failedAuthRequests.push(`${status} ${url}`);
    }
  });

  return debug;
}

async function visibleRoleLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const labels = ["مدیر کل", "مدیر بخش", "حسابدار", "فروشنده", "بیننده", "بدون نقش"];
    const bodyText = document.body.innerText;
    return labels.filter((label) => bodyText.includes(label));
  });
}

async function waitForExpectedRole(
  page: Page,
  role: RoleTarget,
  debug: AuthDebugInfo,
): Promise<boolean> {
  try {
    await expect(page.getByText(role.expectedRoleLabel, { exact: true }).first()).toBeVisible({
      timeout: ROLE_LABEL_TIMEOUT_MS,
    });
    await expect(page.getByText("بدون نقش", { exact: true })).toHaveCount(0);
    return true;
  } catch (error) {
    const screenshot = path.resolve(
      "test-results",
      `auth-role-timeout-${role.key}-${Date.now()}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
    console.log(`${role.key}: expected role did not appear within 20s.`);
    console.log(`${role.key}: current URL: ${page.url()}`);
    console.log(`${role.key}: visible role labels: ${(await visibleRoleLabels(page)).join(", ")}`);
    console.log(`${role.key}: screenshot: ${screenshot}`);
    if (debug.consoleErrors.length > 0) {
      console.log(`${role.key}: console errors:\n${debug.consoleErrors.join("\n")}`);
    }
    if (debug.failedAuthRequests.length > 0) {
      console.log(`${role.key}: failed auth/profile/user_roles requests:\n${debug.failedAuthRequests.join("\n")}`);
    }
    console.log(`${role.key}: role wait error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

test.use({
  storageState: { cookies: [], origins: [] },
});

test.describe.configure({ mode: "serial" });
test.setTimeout(20 * 60_000);

test.describe("interactive role session capture", () => {
  const capturedUserFingerprints: string[] = [];

  for (const role of ROLES) {
    test(`save ${role.key} storageState after manual login`, async ({ page, context }) => {
      fs.mkdirSync("e2e/auth", { recursive: true });
      const debug = attachAuthDebugCollectors(page);

      let saved = false;

      for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt++) {
        resetAuthDebugInfo(debug);
        await forceLogout(page);
        printLoginInstructions(role, attempt);
        await page.pause();

        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
        if (/\/login(?:$|\?)/.test(page.url())) {
          console.log(`${role.key}: still on login after Resume — try again.`);
          continue;
        }

        const hasRequiredRole = await waitForExpectedRole(page, role, debug);
        if (!hasRequiredRole) {
          const looksLikeAdmin = (await page.getByText("مدیر کل", { exact: true }).count()) > 0;
          console.log(
            `${role.key}: wrong account (required "${role.expectedRoleLabel}" missing` +
              `${looksLikeAdmin ? "; admin session detected" : ""}). Clearing and retrying.`,
          );
          continue;
        }

        await page.goto(`${BASE_URL}${role.probeRoute}`, { waitUntil: "domcontentloaded" });
        if (/\/login(?:$|\?)/.test(page.url())) {
          console.log(`${role.key}: lost session or no role on probe route — retry.`);
          continue;
        }
        if (!(await waitForExpectedRole(page, role, debug))) {
          console.log(`${role.key}: role not visible on probe route — retry.`);
          continue;
        }
        if ((await page.getByText(role.probeText).count()) === 0) {
          console.log(`${role.key}: probe route content missing — retry.`);
          continue;
        }

        const fingerprint = await readUserFingerprint(page);
        if (!fingerprint) {
          console.log(`${role.key}: no auth fingerprint — retry.`);
          continue;
        }

        if (role.key.startsWith("salesperson-") && capturedUserFingerprints.includes(fingerprint)) {
          console.log(
            `${role.key}: same user as a previous salesperson session — use a different sales account.`,
          );
          continue;
        }

        const abs = path.resolve(role.storageFile);
        await context.storageState({ path: abs });
        expect(fs.existsSync(abs)).toBe(true);
        capturedUserFingerprints.push(fingerprint);
        console.log(`Saved session for ${role.key} (role verified).`);
        saved = true;
        break;
      }

      expect(
        saved,
        `${role.key}: failed after ${MAX_LOGIN_ATTEMPTS} attempts — storageState NOT saved`,
      ).toBe(true);
    });
  }
});
