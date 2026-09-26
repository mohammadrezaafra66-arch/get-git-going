/**
 * PASS 3 leftover items. Must FAIL on 3100=e0374408 (no pass3-* hooks)
 * and PASS after the wt-parity-deals-3 deploy.
 */
import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { lanEnv, mintJwt, rest } from "../helpers/pgrest";
import { storageStateForRole, userIdFor } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const STAMP = `[PASS3] ${Date.now()}`;

test.setTimeout(180_000);

function jwtFor(role: "sales" | "admin") {
  return mintJwt(userIdFor(role));
}

const AMOUNT_FA = "۱,۲۵۰,۰۰۰";

function defaultPipeline(): { pipelineId: string; stageId: string } {
  const pipelineId = dbScalar(
    "select id from public.sales_pipelines where is_active = true order by sort_order limit 1",
  ).trim();
  const stageId = dbScalar(
    `select id from public.sales_pipeline_stages where pipeline_id = '${pipelineId}' and is_active = true order by sort_order limit 1`,
  ).trim();
  return { pipelineId, stageId };
}

async function createDeal(
  role: "sales" | "admin",
  title: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const personId = dbScalar("select id from public.persons order by created_at limit 1").trim();
  const { pipelineId, stageId } = defaultPipeline();
  const res = await rest<string>(jwtFor(role), "/rpc/sales_interaction_create", {
    method: "POST",
    body: JSON.stringify({
      p_person_id: personId,
      p_kind: "request",
      p_body: "",
      p_title: title,
      p_salesperson_id: userIdFor(role),
      p_source: "manual",
      p_status: extra.p_status ?? "open",
      p_estimated_amount: extra.p_estimated_amount ?? 1_250_000,
      p_pipeline_id: extra.p_pipeline_id ?? pipelineId,
      p_stage_id: extra.p_stage_id ?? stageId,
    }),
  });
  expect(res.status, res.text).toBe(200);
  return String(res.body).replace(/"/g, "");
}

function suite(role: "sales" | "admin") {
  test.describe(`pass3 as ${role}`, () => {
    test.use({
      storageState: storageStateForRole(role, BASE_URL, SUPABASE_URL),
      baseURL: BASE_URL,
    });

    test("B2 kanban shows estimated amount", async ({ page }) => {
      const title = `${STAMP} ${role} b2`;
      await createDeal(role, title, { p_estimated_amount: 1250000 });
      await page.goto("/deal", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "همه" }).first().click();
      const card = page.locator("article").filter({ hasText: title });
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card.getByTestId("pass3-b2-amount")).toContainText(AMOUNT_FA);
    });

    test("B3 detail shows estimated amount", async ({ page }) => {
      const title = `${STAMP} ${role} b3`;
      const id = await createDeal(role, title, { p_estimated_amount: 1250000 });
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("pass3-b3-amount")).toContainText(AMOUNT_FA);
    });

    test("D1 edit dialog", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} d1`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await page.getByLabel("منوی معامله").click();
      await page.getByRole("menuitem", { name: "ویرایش" }).click();
      await expect(page.getByTestId("pass3-d1-edit")).toBeVisible();
    });

    test("D2 note form", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} d2`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "افزودن یادداشت" }).first().click();
      await expect(page.getByTestId("pass3-d2-note")).toBeVisible();
    });

    test("D3 tag picker", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} d3`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("pass3-d3-tag")).toBeVisible();
    });

    test("D4 change person", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} d4`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("pass3-d4-person")).toBeVisible();
    });

    test("D5 acquaintance setter", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} d5`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("pass3-d5-acq")).toBeVisible();
    });

    test("D6 related users", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} d6`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("pass3-d6-related")).toBeVisible();
    });

    test("D7 add product", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} d7`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("pass3-d7-products")).toBeVisible();
    });

    test("D8 jalali won date", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} d8`, { p_status: "won" });
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("pass3-d8-wonat")).toBeVisible();
    });

    test("D9 create extra fields", async ({ page }) => {
      await page.goto("/deal", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "افزودن معامله" }).click();
      await expect(page.getByTestId("pass3-d9-create-extra")).toBeVisible();
    });

    test("D10 visibility persist control", async ({ page }) => {
      await page.goto("/deal", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "افزودن معامله" }).click();
      await expect(page.getByTestId("pass3-d10-visibility")).toBeVisible();
    });

    test("D11 notes tab writer", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} d11`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: "یادداشت ها" }).click();
      await page.getByRole("button", { name: "افزودن یادداشت" }).last().click();
      await expect(page.getByTestId("pass3-d2-note")).toBeVisible();
    });

    test("D12 files tab", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} d12`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: "پیوست ها" }).click();
      await expect(page.getByTestId("pass3-d12-files")).toBeVisible();
    });

    test("D13 feed zoom", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} d13`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "بزرگتر ببین و فیلتر کن" }).click();
      await expect(page.getByTestId("pass3-d13-zoom")).toBeVisible();
    });
  });
}

suite("sales");
suite("admin");
