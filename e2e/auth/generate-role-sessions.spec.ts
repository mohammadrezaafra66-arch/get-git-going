/**
 * Non-interactive LAN auth setup for multi-role business E2E.
 *
 * Preferred credential source:
 *   - process env
 *   - .env.e2e.local (ignored by git)
 *
 * If no password is provided, this LAN-only setup generates an in-memory
 * password and sets it for the three exact test users via Supabase Auth Admin
 * API. The password is never logged, written to disk, or committed.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BASE_URL } from "../helpers/app";

type RoleTarget = {
  key: "admin" | "accountant" | "salesperson-a" | "salesperson-b";
  emailEnv: string;
  passwordEnv: string;
  defaultEmail: string;
  expectedRole: string;
  expectedDbRole: string;
  storageFile: string;
  probeRoute: string;
  probeText: string | RegExp;
};

type DebugInfo = {
  consoleErrors: string[];
  failedRequests: string[];
};

const ROLE_TIMEOUT_MS = 20_000;
const LOGIN_TIMEOUT_MS = 30_000;

const TARGETS: RoleTarget[] = [
  {
    // M1.3/M1.6: the admin session used to belong to afra-admin@local.test, the break-glass
    // account, and was produced by save-admin-session.spec.ts — which calls page.pause().
    // Headless does not block on pause, so that spec silently wrote an EMPTY storageState and
    // turned the whole regression red. Generating it here instead keeps it non-interactive
    // and keeps all four sessions in one place.
    key: "admin",
    emailEnv: "E2E_ADMIN_EMAIL",
    passwordEnv: "E2E_ADMIN_PASSWORD",
    defaultEmail: "test.admin@afrakala.local",
    expectedRole: "مدیر کل",
    expectedDbRole: "admin",
    storageFile: "e2e/auth/admin.storage.json",
    probeRoute: "/users",
    probeText: /کاربران|مدیریت کاربران/,
  },
  {
    key: "accountant",
    emailEnv: "E2E_ACCOUNTANT_EMAIL",
    passwordEnv: "E2E_ACCOUNTANT_PASSWORD",
    defaultEmail: "test.accountant@afrakala.local",
    expectedRole: "حسابدار",
    expectedDbRole: "accountant",
    storageFile: "e2e/auth/accountant.storage.json",
    probeRoute: "/accounting/receipts",
    probeText: /فیش|واریزی|رسید|حسابداری|دریافت|مالی/,
  },
  {
    key: "salesperson-a",
    emailEnv: "E2E_SALESPERSON_A_EMAIL",
    passwordEnv: "E2E_SALESPERSON_A_PASSWORD",
    defaultEmail: "test.sales@afrakala.local",
    expectedRole: "فروشنده",
    expectedDbRole: "sales",
    storageFile: "e2e/auth/salesperson-a.storage.json",
    probeRoute: "/sales/quotes",
    probeText: /پیش‌فاکتور|پیش فاکتور/,
  },
  {
    key: "salesperson-b",
    emailEnv: "E2E_SALESPERSON_B_EMAIL",
    passwordEnv: "E2E_SALESPERSON_B_PASSWORD",
    defaultEmail: "test.sales2@afrakala.local",
    expectedRole: "فروشنده",
    expectedDbRole: "sales",
    storageFile: "e2e/auth/salesperson-b.storage.json",
    probeRoute: "/sales/quotes",
    probeText: /پیش‌فاکتور|پیش فاکتور/,
  },
];

test.use({
  trace: "retain-on-failure",
  video: "retain-on-failure",
  screenshot: "only-on-failure",
});

test.describe.configure({ mode: "serial" });
test.setTimeout(5 * 60_000);

function loadLocalEnv(): void {
  const file = path.resolve(".env.e2e.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function readDotEnvValue(file: string, key: string): string | null {
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    if (trimmed.slice(0, idx).trim() !== key) continue;
    return trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

function assertLanOnly(): void {
  const url = new URL(BASE_URL);
  expect(url.hostname, "Auth generator may run only against LAN test host").toBe("192.168.170.8");
  expect(url.port, "Auth generator must target the LAN web port").toBe("3100");
}

function psqlScalar(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "afrakala-lan-db", "psql", "-U", "postgres", "-d", "afrakala", "-A", "-t", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function sqlText(value: string): string {
  return value.replace(/'/g, "''");
}

function verifyLanUser(target: RoleTarget, email: string): string {
  const row = psqlScalar(`
select concat(u.id::text, '|', coalesce(p.status,''), '|', coalesce(p.is_active::text,''), '|', coalesce(string_agg(r.role, ',' order by r.role),''))
from auth.users u
left join public.profiles p on p.id = u.id
left join public.user_roles r on r.user_id = u.id
where u.email = '${sqlText(email)}'
group by u.id, p.status, p.is_active;
`);
  expect(row, `${target.key}: user not found in LAN auth/users tables`).toBeTruthy();
  const [id, status, isActive, roles] = row.split("|");
  expect(status, `${target.key}: profile must be active`).toBe("active");
  expect(isActive, `${target.key}: profile is_active must be true`).toBe("true");
  expect(roles.split(",")).toContain(target.expectedDbRole);
  return id;
}

async function setPasswordViaAuthAdmin(userId: string, password: string): Promise<void> {
  const envFile = path.resolve("deploy/lan/.env.lan");
  const authBase = (
    readDotEnvValue(envFile, "VITE_SUPABASE_URL") ??
    readDotEnvValue(envFile, "API_EXTERNAL_URL") ??
    ""
  ).replace(/\/$/, "");
  const serviceRole =
    readDotEnvValue(envFile, "SERVICE_ROLE_KEY") ??
    readDotEnvValue(envFile, "SUPABASE_SERVICE_ROLE_KEY") ??
    "";

  expect(authBase, "Missing LAN Auth API base in deploy/lan/.env.lan").toBeTruthy();
  expect(serviceRole, "Missing LAN service role key in deploy/lan/.env.lan").toBeTruthy();

  const response = await fetch(`${authBase}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  expect(response.ok, `Auth Admin password update failed with ${response.status}`).toBe(true);
}

function attachDebug(page: Page): DebugInfo {
  const debug: DebugInfo = { consoleErrors: [], failedRequests: [] };
  page.on("console", (message) => {
    if (message.type() === "error") debug.consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    const url = response.url();
    const status = response.status();
    const interesting =
      url.includes("/auth/") ||
      url.includes("/profiles") ||
      url.includes("/user_roles") ||
      url.includes("/role_permissions");
    if (interesting && status >= 400) debug.failedRequests.push(`${status} ${url}`);
  });
  return debug;
}

async function currentVisibleEmail(page: Page): Promise<string> {
  return page.evaluate(() => {
    const match = document.body.innerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match?.[0] ?? "";
  });
}

async function visibleRoleLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const labels = ["مدیر کل", "مدیر بخش", "حسابدار", "فروشنده", "بیننده", "بدون نقش"];
    return labels.filter((label) => document.body.innerText.includes(label));
  });
}

async function failWithDiagnostics(
  page: Page,
  target: RoleTarget,
  debug: DebugInfo,
  reason: string,
): Promise<never> {
  const screenshot = path.resolve(
    "test-results",
    `generate-role-session-${target.key}-${Date.now()}.png`,
  );
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
  throw new Error(
    [
      `${target.key}: ${reason}`,
      `expectedEmail=${process.env[target.emailEnv] ?? target.defaultEmail}`,
      `currentUrl=${page.url()}`,
      `visibleEmail=${await currentVisibleEmail(page)}`,
      `visibleRoles=${(await visibleRoleLabels(page)).join(",")}`,
      `screenshot=${screenshot}`,
      `consoleErrors=${debug.consoleErrors.join(" || ") || "none"}`,
      `failedRequests=${debug.failedRequests.join(" || ") || "none"}`,
    ].join("\n"),
  );
}

async function waitForRoleAndEmail(page: Page, target: RoleTarget, email: string, debug: DebugInfo) {
  try {
    await expect(page.getByText(target.expectedRole, { exact: true }).first()).toBeVisible({
      timeout: ROLE_TIMEOUT_MS,
    });
    await expect(page.getByText("بدون نقش", { exact: true })).toHaveCount(0);
    await expect(page.getByText(email, { exact: true }).first()).toBeVisible({
      timeout: ROLE_TIMEOUT_MS,
    });
  } catch (error) {
    await failWithDiagnostics(
      page,
      target,
      debug,
      `role/email did not become visible: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function loginThroughUi(page: Page, target: RoleTarget, email: string, password: string) {
  const debug = attachDebug(page);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  await page.locator('input[name="email"][type="email"]').fill(email);
  await page.locator('input[name="password"][type="password"]').fill(password);
  await page.getByRole("button", { name: /^ورود$/ }).click();
  await expect(page, `${target.key}: login should leave /login`).not.toHaveURL(/\/login(?:$|\?)/, {
    timeout: LOGIN_TIMEOUT_MS,
  });

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await waitForRoleAndEmail(page, target, email, debug);

  await page.goto(target.probeRoute, { waitUntil: "domcontentloaded" });
  await expect(page, `${target.key}: probe route redirected to login`).not.toHaveURL(
    /\/login(?:$|\?)/,
  );
  await waitForRoleAndEmail(page, target, email, debug);
  await expect(page.getByText(target.probeText).first()).toBeVisible({ timeout: ROLE_TIMEOUT_MS });
}

async function revalidateStorage(browser: Browser, target: RoleTarget, email: string) {
  const context = await browser.newContext({
    storageState: target.storageFile,
    baseURL: BASE_URL,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  });
  const page = await context.newPage();
  const debug = attachDebug(page);
  try {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page, `${target.key}: storageState redirected to login`).not.toHaveURL(
      /\/login(?:$|\?)/,
    );
    await waitForRoleAndEmail(page, target, email, debug);
    await page.goto(target.probeRoute, { waitUntil: "domcontentloaded" });
    await waitForRoleAndEmail(page, target, email, debug);
    await expect(page.getByText(target.probeText).first()).toBeVisible({ timeout: ROLE_TIMEOUT_MS });
  } finally {
    await context.close();
  }
}

function resolvePasswords(): Map<string, string> {
  loadLocalEnv();
  const shared = process.env.E2E_LAN_TEST_PASSWORD;
  const out = new Map<string, string>();
  for (const target of TARGETS) {
    const password = process.env[target.passwordEnv] || shared || "";
    if (password) out.set(target.key, password);
  }
  return out;
}

function randomPassword(): string {
  return `${crypto.randomBytes(18).toString("base64url")}Aa1!`;
}

test("generate admin, accountant and salesperson storageState files", async ({ browser }) => {
  assertLanOnly();
  fs.mkdirSync("e2e/auth", { recursive: true });

  for (const target of TARGETS) {
    if (fs.existsSync(target.storageFile)) fs.unlinkSync(target.storageFile);
  }

  const passwords = resolvePasswords();
  const usingProvidedPasswords = TARGETS.every((target) => passwords.has(target.key));
  if (!usingProvidedPasswords) {
    expect(
      process.env.E2E_ALLOW_LAN_PASSWORD_RESET ?? "1",
      "No E2E password was provided; LAN-only ephemeral password reset is disabled",
    ).not.toBe("0");
    const ephemeral = randomPassword();
    for (const target of TARGETS) passwords.set(target.key, ephemeral);
    console.log("No E2E password source found; using LAN-only ephemeral Auth Admin reset.");
  } else {
    console.log("Using E2E password source from environment/local ignored file.");
  }

  for (const target of TARGETS) {
    const email = process.env[target.emailEnv] || target.defaultEmail;
    const userId = verifyLanUser(target, email);
    if (!usingProvidedPasswords) {
      await setPasswordViaAuthAdmin(userId, passwords.get(target.key)!);
    }

    const context = await browser.newContext({
      baseURL: BASE_URL,
      locale: "fa-IR",
      timezoneId: "Asia/Tehran",
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    try {
      await loginThroughUi(page, target, email, passwords.get(target.key)!);
      await context.storageState({ path: path.resolve(target.storageFile) });
      expect(fs.existsSync(target.storageFile), `${target.key}: storageState missing`).toBe(true);
      expect(fs.statSync(target.storageFile).size, `${target.key}: storageState empty`).toBeGreaterThan(
        50,
      );
    } finally {
      await context.close();
    }

    await revalidateStorage(browser, target, email);
    console.log(`${target.key}: storageState generated and revalidated for ${email}`);
  }
});
