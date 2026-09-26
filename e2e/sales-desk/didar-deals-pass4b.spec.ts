/**
 * PASS 4b — final polish (W1–W7).
 * Real labels / real DB. Must FAIL on 3100=27520006 where the finding is still broken.
 */
import { expect, test, type Page } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { lanEnv, mintJwt, rest } from "../helpers/pgrest";
import { storageStateForRole, userIdFor } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const STAMP = `[PASS4B] ${Date.now()}`;

test.setTimeout(180_000);

function jwtFor(role: "sales" | "admin" | "manager") {
  return mintJwt(userIdFor(role));
}

function defaultPipeline(): { pipelineId: string; stageId: string } {
  const pipelineId = dbScalar(
    "select id from public.sales_pipelines where is_active = true order by sort_order limit 1",
  ).trim();
  const stageId = dbScalar(
    `select id from public.sales_pipeline_stages where pipeline_id = '${pipelineId}' and is_active = true order by sort_order limit 1`,
  ).trim();
  return { pipelineId, stageId };
}

function firstTagTitle(): string {
  return dbScalar("select title from public.deal_tags where is_active = true order by sort_order, title limit 1").trim();
}

async function createDeal(
  role: "sales" | "admin" | "manager",
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
      p_salesperson_id: extra.p_salesperson_id ?? userIdFor(role),
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

async function markWon(role: "sales" | "admin" | "manager", id: string) {
  const res = await rest(jwtFor(role), "/rpc/sales_interaction_update_status", {
    method: "POST",
    body: JSON.stringify({ p_id: id, p_status: "won" }),
  });
  expect(res.status, res.text).toBe(200);
}

function dealDeleted(id: string): boolean {
  return dbScalar(`select deleted_at is not null from public.sales_interactions where id = '${id}'`).trim() === "t";
}

async function openListAll(page: Page) {
  await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "لیست معاملات" }).waitFor({ timeout: 20_000 });
  const clear = page.getByRole("button", { name: "حذف فیلتر" });
  if (await clear.isVisible().catch(() => false)) await clear.click();
}

async function expectWonDeleteMenu(page: Page, wonId: string) {
  await page.goto(`/deal/${wonId}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "منوی معامله" }).click();
  const item = page.getByRole("menuitem", { name: "حذف" });
  await expect(item).toBeVisible();
  const disabled = await item.isDisabled();
  if (disabled) {
    await expect(item).toHaveAttribute("title", /برای حذف معامله ابتدا آن را به جاری برگردانید/);
    return;
  }
  await item.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
  await expect(page.getByText(/برای حذف معامله ابتدا آن را به جاری برگردانید/)).toBeVisible({
    timeout: 15_000,
  });
  expect(dealDeleted(wonId)).toBe(false);
}

function suite(role: "sales" | "admin") {
  test.describe(`pass4b as ${role}`, () => {
    test.use({
      storageState: storageStateForRole(role, BASE_URL, SUPABASE_URL),
      baseURL: BASE_URL,
    });

    test("W1 bulk tag appears in deal page برچسب box", async ({ page }) => {
      const title = `${STAMP} ${role} w1`;
      const id = await createDeal(role, title);
      const tag = firstTagTitle();
      expect(tag.length).toBeGreaterThan(0);
      await openListAll(page);
      const row = page.locator("tr").filter({ hasText: title });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.getByRole("checkbox").check();
      await page.getByLabel("ویرایش گروهی معاملات").getByLabel("برچسب").click();
      await page.getByRole("option", { name: tag, exact: true }).click();
      await page.getByRole("button", { name: "بروزرسانی" }).click();
      await expect(page.getByText("بروزرسانی شد")).toBeVisible({ timeout: 20_000 });
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      const box = page.getByTestId("pass3-d3-tag");
      await expect(box).toBeVisible({ timeout: 20_000 });
      await expect(box).toContainText(tag);
    });

    test("W2 kanban footer and deal title use Persian digits", async ({ page }) => {
      const title = `${STAMP} ${role} w2`;
      const id = await createDeal(role, title);
      await page.goto("/deal", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "کاریز معاملات" })).toBeVisible({ timeout: 20_000 });
      const footer = page.getByText(/نمایش .+ معامله این مرحله/).first();
      await expect(footer).toBeVisible({ timeout: 20_000 });
      await expect(footer).not.toHaveText(/[0-9]/);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      const h1 = page.locator("h1");
      await expect(h1).toBeVisible({ timeout: 20_000 });
      const text = await h1.innerText();
      if (text.includes("#")) expect(text).not.toMatch(/#[0-9]/);
    });

    test("W3 mobile touch targets are at least 44px", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/deal", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "کاریز معاملات" })).toBeVisible({ timeout: 20_000 });
      const add = page.getByRole("button", { name: "افزودن معامله" });
      await expect(add).toBeVisible();
      expect(await add.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      const id = await createDeal(role, `${STAMP} ${role} w3`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      const menu = page.getByRole("button", { name: "منوی معامله" });
      await expect(menu).toBeVisible();
      const box = await menu.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      const hist = page.getByRole("tab", { name: "تاریخچه" });
      await expect(hist).toBeVisible();
      expect(await hist.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await page.getByRole("button", { name: "ویرایش کردن معامله" }).or(page.getByRole("button", { name: "ویرایش معامله" })).click();
      const dlg = page.getByTestId("pass3-d1-edit");
      await expect(dlg).toBeVisible();
      const cancel = dlg.getByRole("button", { name: "انصراف" });
      expect(await cancel.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await cancel.click();
      await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
      const addList = page.getByRole("button", { name: "افزودن معامله" });
      await expect(addList).toBeVisible({ timeout: 20_000 });
      expect(await addList.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    });

    test("W4 first click on تاریخچه tab and three-dot menu works", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} w4`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1")).toBeVisible({ timeout: 20_000 });
      await page.getByRole("tab", { name: "تاریخچه" }).click({ trial: false });
      await expect(page.getByTestId("deal-history-feed")).toBeVisible({ timeout: 8_000 });
      await page.getByRole("button", { name: "منوی معامله" }).click();
      await expect(page.getByRole("menu")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole("menuitem", { name: "پین کردن" })).toBeVisible();
    });

    test("W7 mixed bulk delete one summary; won three-dot حذف blocked", async ({ page }) => {
      const openT = `${STAMP} ${role} w7-open`;
      const wonT = `${STAMP} ${role} w7-won`;
      const openId = await createDeal(role, openT);
      const wonId = await createDeal(role, wonT);
      await markWon(role, wonId);
      await openListAll(page);
      await expect(page.locator("tr").filter({ hasText: openT })).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("tr").filter({ hasText: wonT })).toBeVisible({ timeout: 30_000 });
      await page.locator("tr").filter({ hasText: openT }).getByRole("checkbox").check();
      await page.locator("tr").filter({ hasText: wonT }).getByRole("checkbox").check();
      await page.getByLabel("ویرایش گروهی معاملات").getByRole("button", { name: "حذف" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
      await expect(
        page.getByText("۱ معامله حذف شد؛ ۱ معامله به دلیل بسته بودن حذف نشد (ابتدا به جاری برگردانید)"),
      ).toBeVisible({ timeout: 20_000 });
      expect(dealDeleted(openId)).toBe(true);
      expect(dealDeleted(wonId)).toBe(false);
      await expectWonDeleteMenu(page, wonId);
    });
  });
}

suite("admin");
suite("sales");

test.describe("pass4b sales permissions", () => {
  test.use({
    storageState: storageStateForRole("sales", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
  });

  test("W5 bulk حذف of others stays in DB and is counted in one summary", async ({ page }) => {
    const title = `${STAMP} w5-other`;
    const id = await createDeal("manager", title);
    await openListAll(page);
    const row = page.locator("tr").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("checkbox").check();
    const del = page.getByLabel("ویرایش گروهی معاملات").getByRole("button", { name: "حذف" });
    await expect(del).toHaveAttribute("title", "فقط معاملات خودتان را می‌توانید حذف کنید");
    await del.click();
    await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
    await expect(
      page.getByText("۰ معامله حذف شد؛ ۱ معامله به دلیل نداشتن دسترسی تغییر نکرد"),
    ).toBeVisible({ timeout: 20_000 });
    expect(dealDeleted(id)).toBe(false);
  });

  test("W6 sales PostgREST PATCH owner on manager deal is refused", async () => {
    const title = `${STAMP} w6-patch`;
    const id = await createDeal("manager", title);
    const salesId = userIdFor("sales");
    const managerId = userIdFor("manager");
    const patch = await rest(jwtFor("sales"), `/sales_interactions?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ salesperson_id: salesId }),
      headers: { Prefer: "return=representation" },
    });
    expect(patch.status, patch.text).not.toBe(200);
    const owner = dbScalar(
      `select salesperson_id from public.sales_interactions where id = '${id}'`,
    ).trim();
    expect(owner).toBe(managerId);
  });

  test("W7 sales mixed delete folds not-owned into the same summary", async ({ page }) => {
    const openT = `${STAMP} w7s-open`;
    const wonT = `${STAMP} w7s-won`;
    const otherT = `${STAMP} w7s-other`;
    const openId = await createDeal("sales", openT);
    const wonId = await createDeal("sales", wonT);
    const otherId = await createDeal("manager", otherT);
    await markWon("sales", wonId);
    await openListAll(page);
    await expect(page.locator("tr").filter({ hasText: openT })).toBeVisible({ timeout: 30_000 });
    await page.locator("tr").filter({ hasText: openT }).getByRole("checkbox").check();
    await page.locator("tr").filter({ hasText: wonT }).getByRole("checkbox").check();
    await page.locator("tr").filter({ hasText: otherT }).getByRole("checkbox").check();
    await page.getByLabel("ویرایش گروهی معاملات").getByRole("button", { name: "حذف" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
    await expect(
      page.getByText(
        "۱ معامله حذف شد؛ ۱ معامله به دلیل بسته بودن حذف نشد (ابتدا به جاری برگردانید)؛ ۱ معامله به دلیل نداشتن دسترسی تغییر نکرد",
      ),
    ).toBeVisible({ timeout: 20_000 });
    expect(dealDeleted(openId)).toBe(true);
    expect(dealDeleted(wonId)).toBe(false);
    expect(dealDeleted(otherId)).toBe(false);
  });

  test("W7 bulk owner and status share the same summary pattern", async ({ page }) => {
    const ownT = `${STAMP} w7s-own-st`;
    const otherT = `${STAMP} w7s-mgr-st`;
    const ownId = await createDeal("sales", ownT);
    const otherId = await createDeal("manager", otherT);
    await openListAll(page);
    await expect(page.locator("tr").filter({ hasText: ownT })).toBeVisible({ timeout: 30_000 });
    await page.locator("tr").filter({ hasText: ownT }).getByRole("checkbox").check();
    await page.locator("tr").filter({ hasText: otherT }).getByRole("checkbox").check();
    await page.getByLabel("ویرایش گروهی معاملات").getByLabel("تغییر وضعیت").click();
    await page.getByRole("option", { name: "موفق", exact: true }).click();
    await page.getByRole("button", { name: "بروزرسانی" }).click();
    await expect(
      page.getByText("۱ معامله تغییر کرد؛ ۱ معامله به دلیل نداشتن دسترسی تغییر نکرد"),
    ).toBeVisible({ timeout: 20_000 });
    expect(
      dbScalar(`select status from public.sales_interactions where id = '${ownId}'`).trim(),
    ).toBe("won");
    expect(
      dbScalar(`select status from public.sales_interactions where id = '${otherId}'`).trim(),
    ).toBe("open");

    const own2T = `${STAMP} w7s-own-ow`;
    const other2T = `${STAMP} w7s-mgr-ow`;
    const own2Id = await createDeal("sales", own2T);
    const other2Id = await createDeal("manager", other2T);
    const managerId = userIdFor("manager");
    await openListAll(page);
    await expect(page.locator("tr").filter({ hasText: own2T })).toBeVisible({ timeout: 30_000 });
    await page.locator("tr").filter({ hasText: own2T }).getByRole("checkbox").check();
    await page.locator("tr").filter({ hasText: other2T }).getByRole("checkbox").check();
    const managerName = dbScalar(
      `select coalesce(full_name, id::text) from public.profiles where id = '${managerId}'`,
    ).trim();
    await page.getByLabel("ویرایش گروهی معاملات").getByLabel("مسئول").click();
    await page.getByRole("option", { name: managerName, exact: true }).click();
    await page.getByRole("button", { name: "بروزرسانی" }).click();
    await expect(
      page.getByText("۱ معامله تغییر کرد؛ ۱ معامله به دلیل نداشتن دسترسی تغییر نکرد"),
    ).toBeVisible({ timeout: 20_000 });
    expect(
      dbScalar(`select salesperson_id from public.sales_interactions where id = '${other2Id}'`).trim(),
    ).toBe(managerId);
    expect(
      dbScalar(`select salesperson_id from public.sales_interactions where id = '${own2Id}'`).trim(),
    ).toBe(managerId);
  });
});
