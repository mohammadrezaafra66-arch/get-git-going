/**
 * G2.8 — sidebar-by-role
 *
 * Minted JWT via storageStateForRole (no password mutation). Writes visible
 * sidebar items (label + href) to R2_EVIDENCE_DIR as sidebar-<role>-<APP_GIT_SHA>.json.
 *
 *   $env:AFRAKALA_LAN_ENV = "D:\AfraKalaTest\app\deploy\lan\.env.lan"
 *   $env:R2_EVIDENCE_DIR  = "...\evidence\G2\sidebar-before"
 *   $env:PLAYWRIGHT_BROWSERS_PATH = "C:\Users\AFRA\AppData\Local\ms-playwright"
 *   npx playwright test e2e/release-r2/sidebar-by-role.spec.ts --workers=1
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { lanEnv } from "../helpers/pgrest";
import { ROLE_EMAILS, storageStateForRole, type TestRole } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const EVIDENCE_DIR = process.env.R2_EVIDENCE_DIR ?? "";
const ROLES = Object.keys(ROLE_EMAILS) as TestRole[];

function appGitSha(): string {
  if (process.env.APP_GIT_SHA?.trim()) return process.env.APP_GIT_SHA.trim();
  try {
    return execFileSync(
      "docker",
      ["exec", "afrakala-lan-web", "printenv", "APP_GIT_SHA"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "unknown";
  }
}

async function collectVisibleSidebar(page: Page): Promise<{ label: string; href: string | null }[]> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login/);
  // Viewer can land on /unauthorized when /dashboard requires dashboard.view.
  // Recover via an allowed before-set route so the rail can still be harvested.
  const denied = page.getByText("دسترسی غیرمجاز");
  const sidebar = page.locator("aside:visible, [data-sidebar=\"sidebar\"]:visible").first();
  await Promise.race([
    sidebar.waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined),
    denied.waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined),
  ]);
  if ((await denied.count()) > 0 && (await sidebar.count()) === 0) {
    for (const fallback of ["/knowledge", "/notifications", "/settings/caller-id"]) {
      await page.goto(fallback, { waitUntil: "domcontentloaded" });
      if ((await sidebar.count()) > 0) break;
    }
  }
  await sidebar.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(1500);

  const harvest = () =>
    page.evaluate(() => {
      const root =
        document.querySelector("aside") ??
        document.querySelector('[data-sidebar="sidebar"]') ??
        document.body;
      const out: { label: string; href: string | null }[] = [];
      const seen = new Set<string>();

      for (const a of Array.from(root.querySelectorAll("a[href]"))) {
        const href = a.getAttribute("href");
        const label = (a.getAttribute("aria-label") || a.getAttribute("title") || a.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80);
        if (!href || !label) continue;
        const key = `${label}|${href}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ label, href });
      }

      for (const b of Array.from(root.querySelectorAll("button[aria-label]"))) {
        const label = (b.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 80);
        if (!label) continue;
        const key = `${label}|`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ label, href: null });
      }

      return out;
    });

  const byKey = new Map<string, { label: string; href: string | null }>();
  const merge = (items: { label: string; href: string | null }[]) => {
    for (const it of items) {
      const key = `${it.label}|${it.href ?? ""}`;
      if (!byKey.has(key)) byKey.set(key, it);
    }
  };

  merge(await harvest());

  // Cycle only primary-module toggles (href-less rail buttons from the first harvest).
  // Clicking every visible sidebar button navigates into pages and exceeds the timeout.
  const railLabels = [
    ...new Set(
      [...byKey.values()]
        .filter((i) => i.href === null && i.label && i.label !== "خروج")
        .map((i) => i.label as string),
    ),
  ];
  for (const label of railLabels) {
    await page
      .locator("aside:visible, [data-sidebar=\"sidebar\"]:visible")
      .getByRole("button", { name: label, exact: true })
      .first()
      .click({ force: true, timeout: 5_000 })
      .catch(() => undefined);
    await page.waitForTimeout(300);
    merge(await harvest());
  }

  return [...byKey.values()].sort((a, b) =>
    `${a.href ?? ""}${a.label}`.localeCompare(`${b.href ?? ""}${b.label}`),
  );
}

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.beforeAll(() => {
  expect(EVIDENCE_DIR, "R2_EVIDENCE_DIR must be set (outside the worktree)").toBeTruthy();
  expect(
    path.resolve(EVIDENCE_DIR).toLowerCase().includes("wt-release-r2"),
    "R2_EVIDENCE_DIR must not be inside the R2 worktree",
  ).toBe(false);
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

for (const role of ROLES) {
  test(`sidebar items for ${role}`, async ({ browser }) => {
    const sha = appGitSha();
    const ctx = await browser.newContext({
      baseURL: BASE_URL,
      locale: "fa-IR",
      timezoneId: "Asia/Tehran",
      storageState: storageStateForRole(role, BASE_URL, SUPABASE_URL),
    });
    const page = await ctx.newPage();
    try {
      const items = await collectVisibleSidebar(page);
      expect(items.length, `${role} sidebar should expose at least one item`).toBeGreaterThan(0);

      const payload = {
        role,
        email: ROLE_EMAILS[role],
        app_git_sha: sha,
        auth_method: "minted-jwt",
        captured_at: new Date().toISOString(),
        base_url: BASE_URL,
        items,
      };
      const outFile = path.join(EVIDENCE_DIR, `sidebar-${role}-${sha}.json`);
      writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      test.info().annotations.push({ type: "evidence", description: outFile });
    } finally {
      await ctx.close();
    }
  });
}
