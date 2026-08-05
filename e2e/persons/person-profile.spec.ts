import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";

/**
 * Phase 1 P0 — read-only person profile at /persons/$personId.
 *
 * Fixes the list «مشاهده» button that previously linked to the edit route and
 * bounced view-only roles to /unauthorized.
 */

async function firstVisiblePersonId(): Promise<string> {
  const id = dbScalar(
    `select id::text from public.persons
      where is_active = true
        and visibility_scope = 'internal_general'
      order by created_at
      limit 1`,
  );
  expect(id, "need at least one internal_general person").toBeTruthy();
  return id;
}

test.describe("person profile — admin", () => {
  test("admin opens the read-only profile from the list", async ({ page }) => {
    await page.goto("/persons");
    await page.waitForLoadState("networkidle");

    const viewLink = page.locator('a[href^="/persons/"]:not([href*="/edit"]):not([href*="/create"]):not([href*="/import"]):not([href*="/merge"])').filter({ hasText: "مشاهده" }).first();
    await expect(viewLink).toBeVisible();
    const href = await viewLink.getAttribute("href");
    expect(href).toMatch(/^\/persons\/[0-9a-f-]{36}$/i);

    await viewLink.click();
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/unauthorized|\/login/);
    await expect(page).toHaveURL(/\/persons\/[0-9a-f-]{36}$/i);
    await expect(page.getByText("پروندهٔ فقط‌خواندنی شخص")).toBeVisible();
    await expect(page.getByRole("button", { name: "ذخیره تغییرات" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "ویرایش" })).toBeVisible();
    await expect(page.getByRole("link", { name: "اشخاص تکراری" })).toBeVisible();
    await expect(page.getByText("شناسه‌ها").first()).toBeVisible();
    await expect(page.getByText("ارتباط‌های شخص").first()).toBeVisible();
  });

  test("admin edit CTA opens the existing edit route", async ({ page }) => {
    const personId = await firstVisiblePersonId();
    await page.goto(`/persons/${personId}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "ویرایش" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(new RegExp(`/persons/${personId}/edit$`));
    await expect(page.getByText("ویرایش شخص").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "ذخیره تغییرات" })).toBeVisible();
  });
});

test.describe("person profile — accountant (view, no update)", () => {
  test.use({ storageState: "e2e/auth/accountant.storage.json" });

  test("accountant opens profile without unauthorized redirect", async ({ page }) => {
    const personId = await firstVisiblePersonId();
    await page.goto(`/persons/${personId}`);
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/unauthorized|\/login/);
    await expect(page.getByText("پروندهٔ فقط‌خواندنی شخص")).toBeVisible();
    await expect(page.getByRole("link", { name: "ویرایش" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "اشخاص تکراری" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ذخیره تغییرات" })).toHaveCount(0);
  });
});

test.describe("person profile — sales", () => {
  test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });

  test("salesperson opens a visible person profile", async ({ page }) => {
    const personId = await firstVisiblePersonId();
    await page.goto(`/persons/${personId}`);
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/unauthorized|\/login/);
    // Either the profile loads (RLS allows) or the soft not-found copy shows —
    // never the update-route bounce.
    const body = await page.locator("body").innerText();
    const ok =
      body.includes("پروندهٔ فقط‌خواندنی شخص") ||
      body.includes("شخصی با این شناسه یافت نشد یا به آن دسترسی ندارید");
    expect(ok).toBeTruthy();
    await expect(page.getByRole("link", { name: "ویرایش" })).toHaveCount(0);
  });

  test("salesperson cannot open a restricted_executive person via profile URL", async ({
    page,
  }) => {
    const hiddenId = dbScalar(
      `select id::text from public.persons
        where visibility_scope = 'restricted_executive'
        order by created_at
        limit 1`,
    );
    test.skip(!hiddenId, "no restricted_executive person in this database");

    await page.goto(`/persons/${hiddenId}`);
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/unauthorized/);
    await expect(
      page.getByText("شخصی با این شناسه یافت نشد یا به آن دسترسی ندارید"),
    ).toBeVisible();
  });
});

test.describe("person profile — viewer via login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("viewer opens a visible person without unauthorized redirect", async ({ page }) => {
    // Same account the API viewer suite uses. Password is already in-repo there.
    const email = "test.viewer@afrakala.local";
    const password = "AfraTest!1404";

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"][type="email"]').fill(email);
    await page.locator('input[name="password"][type="password"]').fill(password);
    await page.getByRole("button", { name: /^ورود$/ }).click();
    await expect(page).not.toHaveURL(/\/login(?:$|\?)/, { timeout: 30_000 });

    const personId = await firstVisiblePersonId();
    await page.goto(`/persons/${personId}`);
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/unauthorized|\/login/);
    await expect(page.getByText("پروندهٔ فقط‌خواندنی شخص")).toBeVisible();
    await expect(page.getByRole("link", { name: "ویرایش" })).toHaveCount(0);
  });
});

test("list shows مشاهده for everyone and ویرایش only for managers", async ({ page }) => {
  await page.goto("/persons");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("link", { name: "مشاهده" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "ویرایش" }).first()).toBeVisible();

  const viewHref = await page.getByRole("link", { name: "مشاهده" }).first().getAttribute("href");
  const editHref = await page.getByRole("link", { name: "ویرایش" }).first().getAttribute("href");
  expect(viewHref).toMatch(/^\/persons\/[0-9a-f-]{36}$/i);
  expect(editHref).toMatch(/^\/persons\/[0-9a-f-]{36}\/edit$/i);
});
