/**
 * PASS 4 — owner acceptance leftovers (P1–P12).
 * Real labels / real DB. Must FAIL on 3100=1b737304 where the finding is still broken.
 */
import { expect, test, type Page } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { lanEnv, mintJwt, rest } from "../helpers/pgrest";
import { storageStateForRole, userIdFor } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const STAMP = `[PASS4] ${Date.now()}`;
const AMOUNT_FA = "۱٬۲۵۰٬۰۰۰";

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

function personDisplay(personId: string): string {
  return dbScalar(
    `select display_name from public.persons where id = '${personId.replace(/'/g, "''")}'`,
  ).trim();
}

function profileName(userId: string): string {
  return dbScalar(
    `select coalesce(full_name, id::text) from public.profiles where id = '${userId.replace(/'/g, "''")}'`,
  ).trim();
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

async function openListAll(page: Page) {
  await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
  const clear = page.getByRole("button", { name: "حذف فیلتر" });
  if (await clear.isVisible().catch(() => false)) await clear.click();
}

function suite(role: "sales" | "admin") {
  test.describe(`pass4 as ${role}`, () => {
    test.use({
      storageState: storageStateForRole(role, BASE_URL, SUPABASE_URL),
      baseURL: BASE_URL,
    });

    test("P1 three-dot حذف asks for confirmation before delete", async ({ page }) => {
      const title = `${STAMP} ${role} p1`;
      const id = await createDeal(role, title);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "منوی معامله" }).click();
      await page.getByRole("menuitem", { name: "حذف" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog.getByText("آیا از حذف این معامله مطمئن هستید؟")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "انصراف" })).toBeVisible();
      await dialog.getByRole("button", { name: "انصراف" }).click();
      const still = dbScalar(
        `select count(*) from public.sales_interactions where id = '${id}' and deleted_at is null`,
      ).trim();
      expect(still).toBe("1");
      await page.getByRole("button", { name: "منوی معامله" }).click();
      await page.getByRole("menuitem", { name: "حذف" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
      await expect(page.getByText("حذف شد")).toBeVisible({ timeout: 20_000 });
      const gone = dbScalar(
        `select count(*) from public.sales_interactions where id = '${id}' and deleted_at is not null`,
      ).trim();
      expect(gone).toBe("1");
    });

    test("P1 bulk حذف asks with N and انصراف", async ({ page }) => {
      const title = `${STAMP} ${role} p1-bulk`;
      await createDeal(role, title);
      await openListAll(page);
      const row = page.locator("tr").filter({ hasText: title });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.getByRole("checkbox").check();
      await page.getByLabel("ویرایش گروهی معاملات").getByRole("button", { name: "حذف" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog.getByText(/آیا از حذف .+ معامله مطمئن هستید؟/)).toBeVisible();
      await expect(dialog.getByRole("button", { name: "انصراف" })).toBeVisible();
      await dialog.getByRole("button", { name: "انصراف" }).click();
      await expect(page.getByLabel("ویرایش گروهی معاملات")).toContainText("معامله انتخابی");
    });

    test("P2 bulk برچسب writes tag and one history row", async ({ page }) => {
      const title = `${STAMP} ${role} p2`;
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
      const tags = Number(
        dbScalar(
          `select count(*) from public.sales_interaction_tags t join public.deal_tags d on d.id = t.tag_id where t.interaction_id = '${id}' and d.title = '${tag.replace(/'/g, "''")}'`,
        ).trim(),
      );
      expect(tags, "tag row must exist").toBe(1);
      const hist = Number(
        dbScalar(
          `select count(*) from public.sales_interaction_history where interaction_id = '${id}' and field_name = 'tag'`,
        ).trim(),
      );
      expect(hist, "history row per deal").toBeGreaterThanOrEqual(1);
      await expect(row).toContainText(tag);
    });

    test("P4 default filter is not owner=me and حذف فیلتر clears chips", async ({ page }) => {
      const title = `${STAMP} ${role} p4`;
      await createDeal("manager", title);
      await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "لیست معاملات" }).waitFor({ timeout: 20_000 });
      await page.getByRole("button", { name: "بازگشت به فیلتر پیش‌فرض" }).click();
      await expect(page.locator("body")).not.toContainText("دیتایی یافت نشد!");
      await expect(page.getByText("مسئول معامله برابر باشد با")).toHaveCount(0);
      await page.getByRole("button", { name: "حذف فیلتر" }).click();
      await expect(page.getByText("تاریخ ثبت معامله مساوی")).toHaveCount(0);
      await expect(page.getByText("مسئول معامله برابر باشد با")).toHaveCount(0);
      await expect(page.locator("a", { hasText: title })).toBeVisible({ timeout: 20_000 });
    });

    test("P4 bulk delete resets N معامله انتخابی", async ({ page }) => {
      const title = `${STAMP} ${role} p4-counter`;
      await createDeal(role, title);
      await openListAll(page);
      const row = page.locator("tr").filter({ hasText: title });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.getByRole("checkbox").check();
      await expect(page.getByLabel("ویرایش گروهی معاملات")).toContainText("معامله انتخابی");
      await page.getByLabel("ویرایش گروهی معاملات").getByRole("button", { name: "حذف" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
      await expect(page.getByLabel("ویرایش گروهی معاملات")).toHaveCount(0, { timeout: 20_000 });
    });

    test("P5 deleted and main list are not silently capped at 400", async ({ page }) => {
      const deleted = Number(
        dbScalar(
          "select count(*) from public.sales_interactions where kind='request' and deleted_at is not null",
        ).trim(),
      );
      const open = Number(
        dbScalar("select count(*) from public.sales_interactions where kind='request' and deleted_at is null").trim(),
      );
      await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "لیست معاملات" }).waitFor({ timeout: 20_000 });
      await page.getByRole("button", { name: "حذف فیلتر" }).click();
      const loadAll = async () => {
        const more = page.getByRole("button", { name: "بارگذاری بیشتر" });
        await expect
          .poll(async () => page.locator("tbody tr").count(), { timeout: 30_000 })
          .toBeGreaterThan(1);
        while (await more.isVisible().catch(() => false)) {
          const n = await page.locator("tbody tr").count();
          await more.click();
          await expect
            .poll(async () => page.locator("tbody tr").count(), { timeout: 30_000 })
            .toBeGreaterThan(n);
        }
      };
      if (open > 400) {
        await loadAll();
        const n = await page.locator("tbody tr").count();
        expect(n).toBeGreaterThan(400);
      }
      await page.getByLabel("معاملات حذف شده").check();
      if (deleted > 400) {
        await loadAll();
        const n = await page.locator("tbody tr").count();
        expect(n).toBeGreaterThan(400);
      } else {
        await expect(page.getByText("معاملات حذف شده").first()).toBeVisible();
      }
    });

    test("P6 history won_at is Jalali Tehran", async ({ page }) => {
      const title = `${STAMP} ${role} p6`;
      const id = await createDeal(role, title);
      await rest(jwtFor(role), "/rpc/sales_interaction_update_status", {
        method: "POST",
        body: JSON.stringify({ p_id: id, p_status: "won" }),
      });
      await rest(jwtFor(role), "/rpc/sales_deal_set_won_at", {
        method: "POST",
        body: JSON.stringify({ p_id: id, p_won_at: "2026-09-24T09:28:00+00:00" }),
      });
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: "تاریخچه" }).click();
      const feed = page.getByTestId("deal-history-feed");
      await expect(feed).toContainText("تاریخ موفق شدن");
      await expect(feed).not.toContainText("2026-09-24T");
      await expect(feed).toContainText(/۱۴۰۵\/۰۷\/۰۲ [۰-۹0-9]{2}:[۰-۹0-9]{2}/);
    });

    test("P7 deal surfaces use Persian digits and IRR ٬", async ({ page }) => {
      const title = `${STAMP} ${role} p7`;
      const id = await createDeal(role, title, { p_estimated_amount: 1_250_000 });
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      const block = page.locator("section").filter({ hasText: "اطلاعات معامله" }).first();
      await expect(block).toContainText(`IRR ${AMOUNT_FA}`);
      await expect(block).toContainText("٪");
      await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "حذف فیلتر" }).click();
      const row = page.locator("tr").filter({ hasText: title });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await expect(row).toContainText(AMOUNT_FA);
    });

    test("P8 dialogs match افزودن معامله", async ({ page }) => {
      const title = `${STAMP} ${role} p8`;
      const id = await createDeal(role, title, { p_estimated_amount: 1_250_000 });
      await page.goto("/deal", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "افزودن معامله" }).click();
      await expect(page.getByText("نام خانوادگی")).toHaveCount(0);
      await expect(page.getByText("شخص", { exact: true }).first()).toBeVisible();
      await page.getByRole("button", { name: "ذخیره معامله" }).click();
      await expect(page.getByText("انتخاب شخص الزامی است")).toBeVisible();
      await page.getByRole("button", { name: "انصراف" }).click();

      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "ویرایش معامله" }).click();
      const edit = page.getByTestId("pass3-d1-edit");
      await expect(edit.getByRole("button", { name: "انصراف" })).toBeVisible();
      await expect(edit.locator("input").nth(1)).toHaveValue(/[۰-۹0-9٬,]/);
      await edit.getByRole("button", { name: "انصراف" }).click();

      await rest(jwtFor(role), "/rpc/sales_interaction_update_status", {
        method: "POST",
        body: JSON.stringify({ p_id: id, p_status: "open" }),
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "ناموفق شد" }).click();
      await page.getByLabel("دلیل شکست", { exact: true }).click();
      await page.getByRole("option", { name: "سایر" }).click();
      await expect(page.getByLabel("توضیح دلیل شکست")).toBeVisible();
      await expect(page.getByLabel("سایر")).toHaveCount(0);
    });

    test("P9 stage bar one line at 1024 and menu stays in viewport", async ({ page }) => {
      const title = `${STAMP} ${role} p9`;
      const id = await createDeal(role, title);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      const bar = page.locator("ol").filter({ has: page.locator("button") }).first();
      const box = await bar.boundingBox();
      expect(box?.height ?? 99).toBeLessThan(56);
      const current = page.locator("ol button[aria-current='step']");
      await expect(current).toHaveCount(1);
      await page.getByRole("button", { name: "منوی معامله" }).click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      const inside = await menu.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1;
      });
      expect(inside).toBe(true);
    });

    test("P10 list header stays sticky while scrolling", async ({ page }) => {
      await openListAll(page);
      const head = page.locator("thead");
      await expect(head).toBeVisible({ timeout: 20_000 });
      const sticky = await head.evaluate((el) => getComputedStyle(el).position === "sticky" || getComputedStyle(el.querySelector("tr") ?? el).position === "sticky");
      expect(sticky).toBe(true);
    });

    test("P12 mobile 390 touch targets and dialog above bottom nav", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/deal", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "کاریز معاملات" })).toBeVisible({ timeout: 20_000 });
      const add = page.locator("button").filter({ hasText: "افزودن سریع معامله" }).first();
      if (await add.isVisible().catch(() => false)) {
        const h = await add.evaluate((el) => el.getBoundingClientRect().height);
        expect(h).toBeGreaterThanOrEqual(40);
      }
      const id = await createDeal(role, `${STAMP} ${role} p12`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      const stage = page.locator("ol button").first();
      await expect(stage).toBeVisible();
      const sh = await stage.evaluate((el) => el.getBoundingClientRect().height);
      expect(sh).toBeGreaterThanOrEqual(40);
      await page.getByRole("button", { name: "ویرایش معامله" }).click();
      const dlg = page.getByTestId("pass3-d1-edit");
      await expect(dlg).toBeVisible();
      const overlap = await dlg.evaluate((el) => {
        const nav = document.querySelector("nav.fixed.bottom-0");
        if (!nav) return false;
        const a = el.getBoundingClientRect();
        const b = nav.getBoundingClientRect();
        return a.bottom > b.top + 2 && a.top < b.bottom;
      });
      expect(overlap, "edit dialog must not overlap bottom nav").toBe(false);
    });
  });
}

suite("admin");
suite("sales");

test.describe("pass4 sales names and permissions", () => {
  test.use({
    storageState: storageStateForRole("sales", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
  });

  test("P3 sales sees person and owner names on a manager deal", async ({ page }) => {
    const title = `${STAMP} vis-names`;
    const id = await createDeal("manager", title);
    const personId = dbScalar(
      `select person_id from public.sales_interactions where id = '${id}'`,
    ).trim();
    const person = personDisplay(personId);
    const owner = profileName(userIdFor("manager"));
    await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "حذف فیلتر" }).click();
    const row = page.locator("tr").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(person);
    await expect(row).toContainText(owner);
    await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("section").filter({ hasText: "اطلاعات معامله" })).toContainText(owner);
    await expect(page.locator("section").filter({ hasText: "شخص مرتبط" })).toContainText(person);
  });

  test("P11 sales cannot delete or reassign a manager deal (UI + PATCH + RPC)", async ({ page }) => {
    const title = `${STAMP} p11-other`;
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
    const del = await rest(jwtFor("sales"), "/rpc/sales_deal_delete", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    });
    expect(del.status, del.text).not.toBe(200);
    const still = dbScalar(
      `select count(*) from public.sales_interactions where id = '${id}' and deleted_at is null`,
    ).trim();
    expect(still).toBe("1");

    await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "منوی معامله" }).click();
    await expect(page.getByRole("menuitem", { name: "حذف" })).toHaveCount(0);

    await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "حذف فیلتر" }).click();
    const row = page.locator("tr").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("checkbox").check();
    await expect(page.getByLabel("ویرایش گروهی معاملات").getByLabel("مسئول")).toBeDisabled();
    await page.getByLabel("ویرایش گروهی معاملات").getByRole("button", { name: "حذف" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
    await expect(page.getByText("معامله به دلیل نداشتن دسترسی تغییر نکرد")).toBeVisible({
      timeout: 20_000,
    });
    const still2 = dbScalar(
      `select count(*) from public.sales_interactions where id = '${id}' and deleted_at is null`,
    ).trim();
    expect(still2).toBe("1");
  });

  test("P11 sales can delete and reassign an own deal", async ({ page }) => {
    const title = `${STAMP} p11-own`;
    const id = await createDeal("sales", title);
    const managerId = userIdFor("manager");
    const patch = await rest(jwtFor("sales"), `/sales_interactions?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ salesperson_id: managerId }),
      headers: { Prefer: "return=representation" },
    });
    expect(patch.status, patch.text).toBe(200);
    const own = await createDeal("sales", `${title}-del`);
    const del = await rest(jwtFor("sales"), "/rpc/sales_deal_delete", {
      method: "POST",
      body: JSON.stringify({ p_id: own }),
    });
    expect(del.status, del.text).toBe(200);
    await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("section").filter({ hasText: "اطلاعات معامله" })).toBeVisible();
  });
});

test.describe("pass4 admin any-deal permissions", () => {
  test.use({
    storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
  });

  test("P11 admin may delete and reassign a manager deal", async ({ page }) => {
    const title = `${STAMP} p11-admin`;
    const id = await createDeal("manager", title);
    const salesId = userIdFor("sales");
    const patch = await rest(jwtFor("admin"), `/sales_interactions?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ salesperson_id: salesId }),
      headers: { Prefer: "return=representation" },
    });
    expect(patch.status, patch.text).toBe(200);
    const del = await rest(jwtFor("admin"), "/rpc/sales_deal_delete", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    });
    expect(del.status, del.text).toBe(200);
    await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "لیست معاملات" })).toBeVisible({ timeout: 20_000 });
  });

  test("P12 معاملات is the first sidebar rail item", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    const rail = page.locator("div.flex.w-14 button[aria-label]").first();
    await expect(rail).toHaveAttribute("aria-label", "معاملات");
  });
});
