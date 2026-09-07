/**
 * V-3 — custom person fields, driven end to end in a browser for the first time.
 *
 * Wave 6 built `person_field_definitions` / `person_field_values` and the two screens that
 * read them. The part nobody had ever exercised is the LIST FILTER, so this spec spends its
 * effort there: two people get the same field with DIFFERENT values, and the filter is asked
 * for one of them. A filter proved against a single filled person cannot tell "matches the
 * value" from "has the field at all".
 *
 * The refusal half is taken cold — a fresh context with no storageState, logging in at /login.
 */
import { test, expect } from "@playwright/test";
import { coldContext, coldLogin } from "./cold";
import { armLeakDetector, readLeaks } from "./leak";

const ART = ".artifacts";

const FIELD_NAME = "v3_economic_code";
const FIELD_LABEL = "کد اقتصادی";

const P1 = { id: "b5633d2b-54c8-4999-a31d-65f7139d1d71", name: "حانیه تست 3", value: "V3CODE411111" };
const P2 = { id: "ff16f129-7d8e-4ccd-af0a-01e64ea7c60e", name: "حانیه ماهرو", value: "V3CODE422222" };

const PROTECTED_FIELDS_PAGE = ["تعریف فیلد جدید", "تعریف فیلدهای اختصاصی که در پروفایل اشخاص"];

async function fillCustomField(
  page: import("@playwright/test").Page,
  personId: string,
  value: string,
) {
  await page.goto(`/persons/${personId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "فیلدهای سفارشی" })).toBeVisible();
  // Label and input share one grid cell, so anchor on the cell that carries the label.
  const cell = page.locator("div.space-y-2").filter({ hasText: FIELD_LABEL }).first();
  const input = cell.locator("input");
  // The save button only appears once a DRAFT exists, and a draft only exists once the value
  // has changed — so re-running with the value already stored must clear the field first.
  await input.fill("");
  await input.fill(value);
  await cell.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("مقدار ذخیره شد")).toBeVisible();
}

test("V-3 admin defines a custom field, fills it on two people, and filters the list by value", async ({
  browser,
}) => {
  const ctx = await coldContext(browser);
  const page = await ctx.newPage();
  await coldLogin(page, "admin");

  // ── 1. Define the field ───────────────────────────────────────────────────────────
  await page.goto("/admin/person-fields", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "فیلدهای سفارشی اشخاص" })).toBeVisible();

  const alreadyDefined = await page.getByRole("cell", { name: FIELD_NAME, exact: true }).count();
  if (alreadyDefined === 0) {
    await page.locator("#pf-name").fill(FIELD_NAME);
    await page.locator("#pf-label").fill(FIELD_LABEL);
    // "متن" is the default type; assert it rather than assume it.
    await expect(page.locator("#pf-type")).toContainText("متن");
    await page.getByRole("button", { name: "تعریف فیلد" }).click();
    await expect(page.getByText("فیلد جدید تعریف شد")).toBeVisible();
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(FIELD_NAME, { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${ART}/v3-admin-field-defined.png`, fullPage: true });

  // ── 2. Fill it on two different people, with different values ─────────────────────
  await fillCustomField(page, P1.id, P1.value);
  await page.reload({ waitUntil: "domcontentloaded" });
  const cell1 = page.locator("div.space-y-2").filter({ hasText: FIELD_LABEL }).first();
  await expect(cell1.locator("input")).toHaveValue(P1.value); // survived a reload
  await page.screenshot({ path: `${ART}/v3-person-filled.png`, fullPage: true });

  await fillCustomField(page, P2.id, P2.value);

  // ── 3. THE PART NOBODY HAD EXERCISED — the list filter ────────────────────────────
  await page.goto("/persons", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "اشخاص" }).first()).toBeVisible();
  const unfiltered = await page.getByRole("row").count();

  await page.getByRole("combobox").filter({ hasText: "فیلد سفارشی" }).click();
  await page.getByRole("option", { name: FIELD_LABEL }).click();
  await page.getByPlaceholder("مقدار دقیق").fill(P1.value);

  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(2); // header + exactly one person
  await expect(table.getByText(P1.name, { exact: true })).toBeVisible();
  await expect(table.getByText(P2.name, { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${ART}/v3-list-filtered.png`, fullPage: true });
  console.log(`V-3 rows before filter: ${unfiltered}; after: 2 (header + 1)`);
  console.log("V-3 filtered url:", page.url());

  // And the other value returns the OTHER person — proof it discriminates on value.
  await page.getByPlaceholder("مقدار دقیق").fill(P2.value);
  await expect(table.getByText(P2.name, { exact: true })).toBeVisible();
  await expect(table.getByText(P1.name, { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${ART}/v3-list-filtered-other-value.png`, fullPage: true });

  await ctx.close();
});

test("V-3 viewer is refused the field-definition screen from a cold context", async ({ browser }) => {
  const ctx = await coldContext(browser);
  const page = await ctx.newPage();
  await armLeakDetector(page, PROTECTED_FIELDS_PAGE);
  await coldLogin(page, "viewer");

  await page.goto("/admin/person-fields", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-gate-denied")).toBeVisible();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${ART}/v3-viewer-cold-refused.png`, fullPage: true });

  const leaks = await readLeaks(page);
  expect(leaks, `protected content painted: ${JSON.stringify(leaks)}`).toEqual([]);
  console.log("V-3 refusal url:", page.url());
  await ctx.close();
});
