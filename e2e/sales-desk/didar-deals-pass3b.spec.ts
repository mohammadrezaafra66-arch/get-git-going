/**
 * PASS 3b — owner Chrome findings (Q1–Q15).
 * Real labels / real UI only. Must FAIL on 3100=e600a618 where the finding is still broken.
 */
import { expect, test, type Page } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { lanEnv, mintJwt, rest } from "../helpers/pgrest";
import { storageStateForRole, userIdFor } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const STAMP = `[PASS3B] ${Date.now()}`;
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

function personName(): string {
  return dbScalar(
    "select display_name from public.persons where coalesce(kind, 'individual') = 'individual' and display_name ilike '%آزمایشی%' order by created_at limit 1",
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

async function pickPerson(page: Page) {
  const name = personName();
  const q = name.replace(/\s+/g, " ").trim().slice(0, 6);
  const box = page.getByLabel("جستجوی شخص");
  await box.click();
  await box.fill(q);
  const hit = page.locator("ul").filter({ has: page.getByRole("button") }).getByRole("button").first();
  await expect(hit).toBeVisible({ timeout: 20_000 });
  const picked = ((await hit.innerText()) || name).trim();
  await hit.click();
  return picked;
}

async function openKanbanAll(page: Page) {
  await page.goto("/deal", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "همه" }).first().click();
}

function suite(role: "sales" | "admin") {
  test.describe(`pass3b as ${role}`, () => {
    test.use({
      storageState: storageStateForRole(role, BASE_URL, SUPABASE_URL),
      baseURL: BASE_URL,
    });

    test("Q1 create submit disables and double submit writes one deal", async ({ page }) => {
      const title = `${STAMP} ${role} q1`;
      await page.goto("/deal", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "افزودن معامله" }).click();
      await expect(page.getByRole("heading", { name: "افزودن معامله" })).toBeVisible();
      await pickPerson(page);
      await page.getByLabel("عنوان معامله").fill(title);
      const save = page.getByRole("button", { name: "ذخیره معامله" });
      await save.evaluate((el) => {
        (el as HTMLButtonElement).click();
        (el as HTMLButtonElement).click();
      });
      await expect(save).toBeDisabled();
      await expect(page.getByRole("heading", { name: "افزودن معامله" })).toBeHidden({ timeout: 30_000 });
      const n = Number(
        dbScalar(
          `select count(*) from public.sales_interactions where kind='request' and title = '${title.replace(/'/g, "''")}'`,
        ).trim(),
      );
      expect(n, "double submit must create one deal").toBe(1);
    });

    test("Q2 اطلاعات معامله shows the saved amount not IRR ۰", async ({ page }) => {
      const title = `${STAMP} ${role} q2`;
      const id = await createDeal(role, title, { p_estimated_amount: 1_250_000 });
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      const block = page.locator("section").filter({ hasText: "اطلاعات معامله" }).first();
      await expect(block.getByRole("heading", { name: "اطلاعات معامله" })).toBeVisible({ timeout: 20_000 });
      await expect(block).toContainText(AMOUNT_FA);
      await expect(block).not.toContainText("IRR ۰");
    });

    test("Q3 picking a person does not overwrite a typed title", async ({ page }) => {
      const typed = `${STAMP} ${role} typed-title`;
      await page.goto("/deal", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "افزودن معامله" }).click();
      const titleBox = page.getByLabel("عنوان معامله");
      await titleBox.fill(typed);
      const name = await pickPerson(page);
      await expect(titleBox).toHaveValue(typed);
      await titleBox.fill("");
      await page.getByLabel("جستجوی شخص").fill("");
      await pickPerson(page);
      const auto = await titleBox.inputValue();
      expect(auto.length).toBeGreaterThan(0);
      expect(auto === typed).toBe(false);
      expect(auto.includes(name.slice(0, 3)) || auto.startsWith("معامله")).toBeTruthy();
    });

    test("Q4 pipeline selector lives in the toolbar not the filter panel", async ({ page }) => {
      await page.goto("/deal", { waitUntil: "domcontentloaded" });
      const header = page
        .locator("div")
        .filter({ has: page.getByRole("heading", { name: "کاریز معاملات" }) })
        .first();
      await expect(header.getByRole("combobox").first()).toBeVisible({ timeout: 20_000 });
      const filters = page.getByLabel("فیلتر کاریز");
      await expect(filters.getByText("فیلترها")).toBeVisible();
      await expect(filters.locator("label", { hasText: /^کاریز$/ })).toHaveCount(0);
    });

    test("Q5 filter has برچسب and no-activity returns zero-activity deals", async ({ page }) => {
      const title = `${STAMP} ${role} q5-idle`;
      await createDeal(role, title);
      await openKanbanAll(page);
      const filters = page.getByLabel("فیلتر کاریز");
      await expect(filters.getByText("برچسب", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
      await expect(filters.getByRole("combobox", { name: "برچسب" })).toBeVisible();
      await filters.getByText("معاملاتی که فعالیتی روی آن‌ها نیست").click();
      await expect(page.locator("article").filter({ hasText: title })).toBeVisible({ timeout: 20_000 });
    });

    test("Q6 drop strip is hidden until a card is dragged then fixed at the bottom", async ({ page }) => {
      const title = `${STAMP} ${role} q6`;
      await createDeal(role, title);
      await openKanbanAll(page);
      const card = page.locator("article").filter({ hasText: title });
      await expect(card).toBeVisible({ timeout: 30_000 });
      const strip = page.getByTestId("deal-drop-strip");
      await expect(strip).toBeHidden();
      await card.dispatchEvent("dragstart");
      await expect(strip).toBeVisible();
      await expect(strip.getByRole("button", { name: "حذف معامله", exact: true })).toBeVisible();
      await expect(strip.getByRole("button", { name: "موفق شد", exact: true })).toBeVisible();
      await expect(strip.getByRole("button", { name: "ناموفق شد", exact: true })).toBeVisible();
      await expect(strip.getByRole("button", { name: "انتقال به کاریز دیگر", exact: true })).toBeVisible();
      const pos = await strip.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { position: cs.position, bottom: cs.bottom };
      });
      expect(pos.position).toBe("fixed");
    });

    test("Q7 list counters, sort labels, empty condition, default-filter reset", async ({ page }) => {
      const title = `${STAMP} ${role} q7`;
      await createDeal(role, title);
      await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "حذف فیلتر" }).click();
      await expect(page.getByText(/تعداد کل/)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(title)).toBeVisible({ timeout: 30_000 });
      const before = await page.locator("div").filter({ hasText: /^تعداد کل / }).first().innerText();
      await page.getByRole("button", { name: "افزودن شرط" }).click();
      await expect(page.getByText("شرط").first()).toBeVisible();
      await page.locator("div").filter({ hasText: /^شرط/ }).getByRole("textbox").fill(title);
      await expect(page.locator("div").filter({ hasText: /^تعداد کل / }).first()).not.toHaveText(before, {
        timeout: 15_000,
      });
      await expect(page.locator("div").filter({ hasText: /^تعداد کل / }).first()).toContainText("تعداد کل ۱");
      await page.locator("span", { hasText: "مرتب سازی" }).locator("..").getByRole("combobox").click();
      await expect(page.getByRole("option", { name: "تاریخ ثبت" })).toBeVisible();
      await expect(page.getByRole("option", { name: /^0 / })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "بازگشت به فیلتر پیش‌فرض" }).first().click();
      await expect(page.getByText(/^شرط$/)).toHaveCount(0);
    });

    test("Q8 bulk edit shows every field at once defaulting to بدون تغییر", async ({ page }) => {
      const title = `${STAMP} ${role} q8`;
      await createDeal(role, title);
      await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "حذف فیلتر" }).click();
      const row = page.locator("tr").filter({ hasText: title });
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.getByRole("checkbox").click();
      const panel = page.getByLabel("ویرایش گروهی معاملات");
      await expect(panel).toBeVisible();
      await expect(panel.getByText("مسئول", { exact: true })).toBeVisible();
      await expect(panel.getByText("امنیت", { exact: true })).toBeVisible();
      await expect(panel.getByText("برچسب", { exact: true })).toBeVisible();
      await expect(panel.getByText("کاریز", { exact: true })).toBeVisible();
      await expect(panel.getByText("تغییر وضعیت", { exact: true })).toBeVisible();
      await expect(panel.getByText("دلیل شکست", { exact: true })).toBeVisible();
      await expect(panel.getByText("بدون تغییر").first()).toBeVisible();
      await expect(panel.getByText("فیلد", { exact: true })).toHaveCount(0);
    });

    test("Q9 header has no standalone حذف and has a pencil edit icon", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} q9`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      const header = page.getByLabel("سربرگ معامله");
      await expect(header.getByRole("button", { name: "حذف", exact: true })).toHaveCount(0);
      await expect(header.getByLabel("ویرایش معامله")).toBeVisible({ timeout: 20_000 });
      await page.getByLabel("منوی معامله").click();
      await expect(page.getByRole("menuitem", { name: "حذف" })).toBeVisible();
    });

    test("Q10 تغییر تاریخ موفق شدن writes won_at from the side block", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} q10`, { p_status: "won" });
      const beforeCount = Number(
        dbScalar(
          `select count(*) from public.sales_interaction_history where interaction_id = '${id}'`,
        ).trim(),
      );
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      const block = page.locator("section").filter({ hasText: "اطلاعات معامله" });
      await expect(block.getByText("تغییر تاریخ موفق شدن")).toBeVisible({ timeout: 20_000 });
      await expect(block.getByText("به‌زودی")).toHaveCount(0);
      await block.getByText("تغییر تاریخ موفق شدن").locator("..").getByPlaceholder("انتخاب تاریخ").click();
      const day = page.locator(".rmdp-day:not(.rmdp-disabled)").first();
      await expect(day).toBeVisible();
      await day.click();
      await block.getByRole("button", { name: "ثبت تاریخ موفق شدن" }).click();
      await expect.poll(() =>
        dbScalar(`select won_at is not null from public.sales_interactions where id = '${id}'`).trim(),
      ).toBe("t");
      const afterCount = Number(
        dbScalar(
          `select count(*) from public.sales_interaction_history where interaction_id = '${id}'`,
        ).trim(),
      );
      expect(afterCount - beforeCount).toBe(1);
    });

    test("Q11 lost reason سایر requires the note", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} q11`);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "ناموفق شد" }).click();
      const dlg = page.getByRole("dialog");
      await expect(dlg.getByText("دلیل شکست را انتخاب کنید").first()).toBeVisible();
      await dlg.getByRole("combobox").first().click();
      await page.getByRole("option", { name: "سایر", exact: true }).click();
      await page.getByRole("button", { name: "این معامله موفق نشد" }).click();
      await expect(page.getByRole("button", { name: "این معامله موفق نشد" })).toBeVisible();
      const stillOpen = dbScalar(
        `select status from public.sales_interactions where id = '${id}'`,
      ).trim();
      expect(stillOpen).toBe("open");
      await page.getByLabel("توضیح دلیل شکست").fill("یادداشت الزامی سایر");
      await page.getByRole("button", { name: "این معامله موفق نشد" }).click();
      await expect.poll(() =>
        dbScalar(`select status from public.sales_interactions where id = '${id}'`).trim(),
      ).toBe("lost");
    });

    test("Q12 history uses full Didar sentences and create writes one row", async ({ page }) => {
      const title = `${STAMP} ${role} q12`;
      const id = await createDeal(role, title);
      const created = Number(
        dbScalar(
          `select count(*) from public.sales_interaction_history where interaction_id = '${id}'`,
        ).trim(),
      );
      expect(created).toBe(1);
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: "تاریخچه" }).click();
      const feed = page.locator("ul").filter({ hasText: "را ایجاد کرد" });
      await expect(feed).toContainText(`معامله با عنوان ${title} را ایجاد کرد`);
      await rest(jwtFor(role), "/rpc/sales_interaction_update_status", {
        method: "POST",
        body: JSON.stringify({ p_id: id, p_status: "won" }),
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: "تاریخچه" }).click();
      await expect(page.getByText("را موفق کرد")).toBeVisible({ timeout: 20_000 });
      await rest(jwtFor(role), "/rpc/sales_interaction_update_status", {
        method: "POST",
        body: JSON.stringify({ p_id: id, p_status: "open" }),
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: "تاریخچه" }).click();
      await expect(page.getByText("را به جاری برگرداند")).toBeVisible({ timeout: 20_000 });
    });

    test("Q13 deal detail has no horizontal overflow at 725 and 390", async ({ page }) => {
      const id = await createDeal(role, `${STAMP} ${role} q13`);
      for (const width of [725, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: /معامله/ }).first()).toBeVisible({
          timeout: 20_000,
        });
        const overflow = await page.evaluate(() => {
          const root = document.documentElement;
          return root.scrollWidth > root.clientWidth + 1;
        });
        expect(overflow, `overflow at ${width}px`).toBe(false);
      }
    });
  });
}

suite("admin");
suite("sales");

test.describe("pass3b sales-only chrome", () => {
  test.use({
    storageState: storageStateForRole("sales", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
  });

  test("Q14 sales does not see ایجاد کاریز without manage-pipelines", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "کاریز معاملات" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("ایجاد کاریز")).toHaveCount(0);
    await expect(page.getByLabel("ویرایش کاریز")).toHaveCount(0);
    await expect(page.getByTitle("ایجاد کاریز")).toHaveCount(0);
  });

  test("Q15 manager-owned deal is visible to sales after clearing owner filter", async ({ page }) => {
    const title = `${STAMP} vis-manager`;
    await createDeal("manager", title);
    await openKanbanAll(page);
    await expect(page.locator("article").filter({ hasText: title })).toBeVisible({ timeout: 30_000 });
    await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "حذف فیلتر" }).click();
    await expect(page.locator("a", { hasText: title })).toBeVisible({ timeout: 20_000 });
  });
});
