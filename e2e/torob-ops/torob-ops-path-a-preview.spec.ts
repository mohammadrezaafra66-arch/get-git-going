/**
 * Torob Ops Path A — unlock + dry-run preview + unauthorized status block.
 * Requires TOROB_OPS_E2E_PASSWORD (seed via accept harness / seed-test-admin-ops-password.ts).
 */
import { expect, test, type Page } from "@playwright/test";

import { lanEnv, ADMIN_USER_ID } from "../helpers/pgrest";
import { storageStateForRole } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const MODULE_PASSWORD = process.env.TOROB_OPS_E2E_PASSWORD ?? "";

const GATE_TITLE = "ورود به عملیات ترب";
const PASSWORD_LABEL = "رمز ماژول";

test.describe.configure({ mode: "serial" });

async function settle(page: Page) {
  await expect(page.getByTestId("route-gate-checking")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText("در حال آماده‌سازی…")).toHaveCount(0, { timeout: 15_000 });
}

async function seedPreviewFindings() {
  const env = lanEnv();
  const service = env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: service!,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const restBase = `http://127.0.0.1:${env.SUPABASE_API_PORT}/rest/v1`;

  await fetch(`${restBase}/torob_ops_findings?review_note=like.e2e-preview-*`, {
    method: "DELETE",
    headers,
  });
  const prod = await fetch(`${restBase}/products?select=id,name&limit=1`, { headers });
  const products = (await prod.json()) as Array<{ id: string; name: string }>;
  const product = products[0];
  if (!product) throw new Error("no product");

  const runRes = await fetch(`${restBase}/torob_ops_scan_runs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      status: "completed",
      created_by: ADMIN_USER_ID,
      notes: "e2e-preview-run",
      products_total: 1,
      findings_total: 2,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    }),
  });
  const runs = (await runRes.json()) as Array<{ id: string }>;
  const runId = runs[0]?.id;
  if (!runId) throw new Error(`run seed failed: ${await runRes.text()}`);

  const evidence = { seller_enriched: true, bait_signals: ["phone_only"], note: "e2e-preview" };
  const ins = await fetch(`${restBase}/torob_ops_findings`, {
    method: "POST",
    headers,
    body: JSON.stringify([
      {
        scan_run_id: runId,
        product_id: product.id,
        product_name_snapshot: product.name,
        torob_url: "https://example.com/torob-e2e-manual",
        seller_domain: "e2e-manual.local",
        our_price_toman: 1000,
        their_price_toman: 800,
        price_source: "observatory",
        status: "manual_review",
        evidence,
        review_note: "e2e-preview-manual",
      },
      {
        scan_run_id: runId,
        product_id: product.id,
        product_name_snapshot: product.name,
        torob_url: "https://example.com/torob-e2e-confirmed",
        seller_domain: "e2e-confirmed.local",
        our_price_toman: 1000,
        their_price_toman: 700,
        price_source: "observatory",
        status: "confirmed_bait",
        evidence,
        review_note: "e2e-preview-confirmed",
      },
    ]),
  });
  if (!ins.ok) throw new Error(`findings seed failed: ${await ins.text()}`);
}

test.describe("Torob Ops Path A — dry-run preview after unlock", () => {
  test.skip(!MODULE_PASSWORD, "set TOROB_OPS_E2E_PASSWORD after accept harness");

  test.use({
    storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  });

  test("unlock then preview blocks manual_review and allows confirmed_bait", async ({ page }) => {
    await seedPreviewFindings();

    await page.goto("/torob-ops/findings", { waitUntil: "domcontentloaded" });
    await settle(page);

    await expect(page.getByText(GATE_TITLE)).toBeVisible({ timeout: 15_000 });
    await page.getByLabel(PASSWORD_LABEL).fill(MODULE_PASSWORD);
    await page.getByRole("button", { name: /^ورود$/ }).click();
    await expect(page.getByRole("heading", { name: "صف بررسی یافته‌های ترب" })).toBeVisible({
      timeout: 20_000,
    });

    const statusSelect = page.getByRole("combobox").first();
    await statusSelect.click();
    await page.getByRole("option", { name: "نیاز به بررسی دستی" }).click();
    await expect(page.getByRole("button", { name: "پیش‌نمایش گزارش" }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "پیش‌نمایش گزارش" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "کپی متن" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await statusSelect.click();
    await page.getByRole("option", { name: "طعمه تأییدشده" }).click();
    await page.getByRole("button", { name: "پیش‌نمایش گزارش" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "کپی متن" })).toBeVisible({ timeout: 10_000 });
  });
});
