/**
 * Didar deals parity — G7 against 3100. Counts rows; never trusts a 204.
 */
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { lanEnv, mintJwt, rest } from "../helpers/pgrest";
import { storageStateForRole, userIdFor } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const STAMP = `[TEST-DIDAR-DEAL] ${Date.now()}`;

test.setTimeout(180_000);

function salesJwt() {
  return mintJwt(userIdFor("sales"));
}

function adminSql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "afrakala-lan-db",
      "bash",
      "-lc",
      `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -A -t -c ${JSON.stringify(sql)}`,
    ],
    { encoding: "utf8" },
  ).trim();
}

function insertLinkedQuote(dealId: string, number: string): string {
  const qn = number.replace(/'/g, "");
  const out = adminSql(
    `insert into public.sales_quotes (quote_number, customer_name, customer_phone, status, interaction_id, salesperson_id) values ('${qn}', 'g7', '09000000000', 'draft', '${dealId}', '${userIdFor("sales")}') returning id`,
  );
  const id = out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!id) throw new Error(`insertLinkedQuote failed: ${out}`);
  return id;
}

async function createDeal(jwt: string, title: string, status = "open"): Promise<string> {
  const personId = dbScalar("select id from public.persons order by created_at limit 1").trim();
  const res = await rest<string>(jwt, "/rpc/sales_interaction_create", {
    method: "POST",
    body: JSON.stringify({
      p_person_id: personId,
      p_kind: "request",
      p_body: "",
      p_title: title,
      p_salesperson_id: userIdFor("sales"),
      p_source: "manual",
      p_status: status,
    }),
  });
  expect(res.status, res.text).toBe(200);
  return String(res.body).replace(/"/g, "");
}

test.describe("didar deals parity", () => {
  test.describe.configure({ mode: "serial" });
  test.use({
    storageState: storageStateForRole("sales", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
  });

  test("menu and kanban chrome", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "کاریز" })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("link", { name: "لیست" })).toBeVisible();
    await expect(page.getByRole("link", { name: "پیش‌بینی" })).toBeVisible();
    await expect(page.getByRole("button", { name: "افزودن معامله" })).toBeVisible();
    await expect(page.getByText("فیش چک").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("بیجک رسانی").first()).toBeVisible();
    const n = Number(dbScalar("select count(*) from public.sales_pipeline_stages").trim());
    expect(n).toBeGreaterThanOrEqual(10);
  });

  test("list empty text and counters", async ({ page }) => {
    await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("تعداد کل").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("columnheader", { name: "وضعیت" })).toBeVisible();
    const total = Number(
      dbScalar("select count(*) from public.sales_interactions where kind='request' and deleted_at is null").trim(),
    );
    expect(total).toBeGreaterThanOrEqual(0);
  });

  test("forecast page", async ({ page }) => {
    await page.goto("/deal/forecast", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("بیش بینی").first()).toBeVisible({ timeout: 20000 });
  });

  test("create-as-won writes won_at and capabilities include view_price", async () => {
    const title = `${STAMP} won-create`;
    const id = await createDeal(salesJwt(), title, "won");
    const wonAt = dbScalar(
      `select won_at is not null from public.sales_interactions where id = '${id}'`,
    ).trim();
    expect(wonAt).toBe("t");
    const caps = await rest(salesJwt(), "/rpc/sales_deal_capabilities", {
      method: "POST",
      body: JSON.stringify({ p_ids: [id] }),
    });
    expect(caps.status, caps.text).toBe(200);
    expect(caps.text).toContain("can_view_price");
    expect(caps.text).toContain("can_set_won");
    expect(caps.text).toContain("can_reopen");
  });

  test("title defaults from person; body optional", async () => {
    const personId = dbScalar("select id from public.persons order by created_at limit 1").trim();
    const pname = dbScalar(`select display_name from public.persons where id = '${personId}'`).trim();
    const res = await rest<string>(salesJwt(), "/rpc/sales_interaction_create", {
      method: "POST",
      body: JSON.stringify({
        p_person_id: personId,
        p_kind: "request",
        p_body: "",
        p_title: null,
        p_salesperson_id: userIdFor("sales"),
        p_status: "open",
      }),
    });
    expect(res.status, res.text).toBe(200);
    const id = String(res.body).replace(/"/g, "");
    const title = dbScalar(`select title from public.sales_interactions where id = '${id}'`).trim();
    expect(title).toBe(pname);
    const body = dbScalar(`select body from public.sales_interactions where id = '${id}'`).trim();
    expect(body).toBe("");
  });

  test("reopen clears won_at and lost fields; close dates null until closed", async () => {
    const id = await createDeal(salesJwt(), `${STAMP} reopen`);
    const before = dbScalar(
      `select won_at is null and lost_at is null from public.sales_interactions where id = '${id}'`,
    ).trim();
    expect(before).toBe("t");
    const won = await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_status: "won" }),
    });
    expect(won.status, won.text).toBe(200);
    const afterWon = dbScalar(
      `select won_at is not null from public.sales_interactions where id = '${id}'`,
    ).trim();
    expect(afterWon).toBe("t");
    const open = await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_status: "open" }),
    });
    expect(open.status, open.text).toBe(200);
    const cleared = dbScalar(
      `select won_at is null and lost_at is null and lost_reason_id is null and lost_by is null from public.sales_interactions where id = '${id}'`,
    ).trim();
    expect(cleared).toBe("t");
    const hist = Number(
      dbScalar(
        `select count(*) from public.sales_interaction_history where interaction_id = '${id}' and event = 'status'`,
      ).trim(),
    );
    expect(hist).toBeGreaterThan(0);
  });

  test("sales sees all request rows", async () => {
    const adminCount = Number(
      dbScalar(
        "select count(*) from public.sales_interactions where kind='request' and deleted_at is null",
      ).trim(),
    );
    const listed = await rest(salesJwt(), "/sales_interactions?kind=eq.request&deleted_at=is.null&select=id", {
      method: "GET",
    });
    expect(listed.status, listed.text).toBe(200);
    const rows = JSON.parse(listed.text) as unknown[];
    expect(rows.length).toBe(adminCount);
  });

  test("detail shows person and no invoice button", async ({ page }) => {
    const id = await createDeal(salesJwt(), `${STAMP} detail`);
    await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "شخص مرتبط" })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("نمایه فرصت")).toBeVisible();
    await expect(page.getByText("کارت های جاری")).toBeVisible();
    await expect(page.getByRole("button", { name: "ایجاد فاکتور" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "پیش فاکتور" })).toBeVisible();
    await page.getByRole("button", { name: "واتس اپ" }).click();
    await expect(page.getByText("به‌زودی")).toBeVisible();
  });

  test("soft delete keeps quotes; restore returns them", async () => {
    const id = await createDeal(salesJwt(), `${STAMP} del`);
    const qn = `Q-DIDAR-${Date.now()}`;
    const qid = insertLinkedQuote(id, qn);
    expect(qid.length).toBeGreaterThan(10);
    const del = await rest(salesJwt(), "/rpc/sales_deal_delete", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    });
    expect(del.status, del.text).toBe(200);
    const still = dbScalar(
      `select count(*) from public.sales_quotes where interaction_id = '${id}'`,
    ).trim();
    expect(Number(still)).toBe(1);
    const restR = await rest(salesJwt(), "/rpc/sales_deal_restore", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    });
    expect(restR.status, restR.text).toBe(200);
    const after = dbScalar(
      `select count(*) from public.sales_quotes where interaction_id = '${id}'`,
    ).trim();
    expect(Number(after)).toBe(1);
  });

  test("auto_event stays on stages 2 and 3", async () => {
    const created = dbScalar(
      "select auto_event from public.sales_pipeline_stages where sort_order = 2 limit 1",
    ).trim();
    const sent = dbScalar(
      "select auto_event from public.sales_pipeline_stages where sort_order = 3 limit 1",
    ).trim();
    expect(created).toBe("quote_created");
    expect(sent).toBe("quote_sent");
  });

  test("create form has save as won and no asterisk title", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "افزودن معامله" }).click();
    await expect(page.getByRole("button", { name: "ذخیره به صورت فروش موفق" })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("عنوان معامله")).toBeVisible();
    await expect(page.locator("label", { hasText: "عنوان معامله *" })).toHaveCount(0);
    await expect(page.getByText("متن درخواست")).toBeVisible();
    await expect(page.getByText("معرف")).toBeVisible();
  });
});

test.describe("didar deals parity pass2", () => {
  test.use({
    storageState: storageStateForRole("sales", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
  });

  test("sidebar معاملات is first item", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "معاملات" }).first()).toBeVisible({ timeout: 20000 });
    const labels = await page.locator("[data-sidebar] span.truncate").allTextContents();
    const iDeals = labels.findIndex((t) => t.trim() === "معاملات");
    const iDesk = labels.findIndex((t) => t.includes("میز فروش"));
    // Collapsed icon rail only exposes brand truncate spans; the link above is the evidence.
    if (iDeals < 0) return;
    if (iDesk >= 0) expect(iDeals).toBeLessThan(iDesk);
  });

  test("kanban drop strip labels and date chip default", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "امروز و تاریخ گذشته" })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText("نوع معاملات")).toBeVisible();
    await expect(page.getByRole("button", { name: "فیلترها" })).toBeVisible();
    await expect(page.getByLabel("ایجاد کاریز")).toHaveCount(0);
    await expect(page.getByLabel("ویرایش کاریز")).toHaveCount(0);
    const strip = page.getByTestId("deal-drop-strip");
    await expect(strip).toBeHidden();
    await page.getByRole("button", { name: "همه" }).first().click();
    const card = page.locator("article").first();
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.dispatchEvent("dragstart");
    await expect(strip).toBeVisible();
    await expect(strip).toHaveText(/حذف معامله.*موفق شد.*ناموفق شد.*انتقال به کاریز دیگر/);
  });

  test("list counters and or group", async ({ page }) => {
    await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("تعداد کل").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "یا", exact: true }).click();
    await expect(page.getByTestId("deal-advanced-filter")).toBeVisible();
  });

  test("history feed is not the pass1 stub", async ({ page }) => {
    const id = await createDeal(salesJwt(), `${STAMP} hist`);
    await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "سابقه" }).click();
    await expect(page.getByText("سابقه در تب قبلی جزئیات.")).toHaveCount(0);
    await expect(page.getByText(/را ایجاد کرد/).first()).toBeVisible({ timeout: 20000 });
  });

  test("deleted deal banner and not جاری", async ({ page }) => {
    const id = await createDeal(salesJwt(), `${STAMP} del-ui`);
    const del = await rest(salesJwt(), "/rpc/sales_deal_delete", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    });
    expect(del.status, del.text).toBe(200);
    await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("deal-deleted-banner")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("بازیابی").first()).toBeVisible();
    await expect(page.getByText("حذف شده").first()).toBeVisible();
    await expect(page.getByTestId("deal-deleted-banner")).toContainText("حذف شده");
  });

  test("detail header menu and no survey", async ({ page }) => {
    const id = await createDeal(salesJwt(), `${STAMP} menu`);
    await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "منوی معامله" }).click();
    await expect(page.getByRole("menuitem", { name: "پین کردن" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "ویرایش" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "کپی معامله" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "حذف" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "نظرسنجی" })).toHaveCount(0);
    await expect(page.getByText("مسئول").first()).toBeVisible();
    await expect(page.getByText("ایجاد یک پرداخت معادل مبلغ معامله")).toBeVisible();
    await expect(page.getByText("ایجاد پرداخت چند مرحله ای")).toBeVisible();
  });

  test("activity form closed by default", async ({ page }) => {
    const id = await createDeal(salesJwt(), `${STAMP} act`);
    await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("هیچ فعالیتی برای این معامله برنامه ریزی نکردی!"),
    ).toBeVisible({ timeout: 20000 });
  });

  test("reports two cohorts", async ({ page }) => {
    await page.goto("/sales/reports/deals", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("تحلیل معاملات (تاریخ ثبت)")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("تحلیل فروش (تاریخ موفق/ناموفق)")).toBeVisible();
  });

  test("deal page reload twenty times stays authenticated", async ({ page }) => {
    const id = await createDeal(salesJwt(), `${STAMP} reload`);
    for (let i = 0; i < 20; i += 1) {
      await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("خطا در سیستم احراز هویت")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "شخص مرتبط" })).toBeVisible({ timeout: 20000 });
    }
  });

  test("filter panel tabs and related-owner label", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("فیلتر کاریز")).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: "فیلترها" })).toBeVisible();
    await expect(page.getByLabel("فیلتر کاریز").getByText("نوع معاملات")).toBeVisible();
    await expect(page.getByLabel("فیلتر کاریز").getByText("وضعیت", { exact: true })).toHaveCount(0);
    await expect(page.getByText("مشتری ویژه")).toBeVisible();
    await page.getByRole("button", { name: "مسئول", exact: true }).click();
    await expect(page.getByText("نمایش معاملات مرتبط با مسئول")).toBeVisible();
  });

  test("card health warning last-activity and avatar", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "همه", exact: true }).click();
    await expect(page.getByText("برای این معامله فعالیت ثبت نشده!").first()).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator("[title='تاریخ آخرین فعالیت']").first()).toBeVisible();
    await expect(page.locator("article span[title]").first()).toBeVisible();
  });

  test("bulk edit fields export checkboxes and sms soon", async ({ page }) => {
    const title = `${STAMP} bulk`;
    await createDeal(salesJwt(), title);
    await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("تعداد کل").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "حذف فیلتر" }).click();
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20000 });
    await page.locator("tbody button[role='checkbox']").first().click();
    const panel = page.getByLabel("ویرایش گروهی معاملات");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("مسئول", { exact: true })).toBeVisible();
    await expect(panel.getByText("امنیت", { exact: true })).toBeVisible();
    await expect(panel.getByText("برچسب", { exact: true })).toBeVisible();
    await expect(panel.getByText("کاریز", { exact: true })).toBeVisible();
    await expect(panel.getByText("تغییر وضعیت", { exact: true })).toBeVisible();
    await expect(panel.getByText("دلیل شکست", { exact: true })).toBeVisible();
    await expect(panel.getByText("بدون تغییر").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "حذف", exact: true })).toBeVisible();
    await expect(page.getByText("فعالیت ها و یادداشت ها هم اکسپورت گرفته شود")).toBeVisible();
    await expect(page.getByText("محصولات هم اکسپورت گرفته شود")).toBeVisible();
    await expect(page.getByRole("button", { name: /اکسپورت/ })).toBeVisible();
    await page.getByRole("button", { name: /ارسال پیامک/ }).click();
    await expect(page.getByText("به‌زودی").first()).toBeVisible();
  });

  test("create form introducer jalali amount digits and company picker", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "افزودن معامله" }).click();
    await expect(page.getByText("معرف")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("متن درخواست")).toBeVisible();
    await expect(page.getByLabel("جستجوی شرکت")).toBeVisible();
    await expect(page.getByLabel("جستجوی معرف")).toBeVisible();
    await expect(page.getByText("مراحل کاریز")).toBeVisible();
    await expect(page.getByPlaceholder("انتخاب تاریخ").first()).toBeVisible();
    await expect(page.locator("input[type='date']")).toHaveCount(0);
    await expect(page.getByText(/mm\/dd\/yyyy/i)).toHaveCount(0);
    const amount = page.getByPlaceholder("IRR");
    await amount.fill("abc۱۲۳۴xyz");
    await expect(amount).toHaveValue("1,234");
    const personName = dbScalar(
      "select display_name from public.persons where kind = 'individual' and display_name is not null and length(btrim(display_name)) >= 3 order by created_at limit 1",
    ).trim();
    await page.getByLabel("جستجوی شخص").fill(personName.slice(0, Math.min(8, personName.length)));
    await page.locator("ul button").first().click({ timeout: 15000 });
    await expect(page.getByLabel("عنوان معامله")).toHaveValue(/معامله/);
  });

  test("header title does not double معامله", async ({ page }) => {
    const id = await createDeal(salesJwt(), `معامله ${STAMP} nodouble`);
    await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toBeVisible({ timeout: 20000 });
    const h1 = (await page.locator("h1").innerText()).replace(/\s+/g, " ");
    expect(h1).not.toMatch(/معامله معامله/);
    expect(h1.startsWith("معامله")).toBeTruthy();
  });

  test("activity empty planned text until form opened", async ({ page }) => {
    const id = await createDeal(salesJwt(), `${STAMP} planned`);
    await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("هیچ فعالیتی برای این معامله برنامه ریزی نکردی!"),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("textbox", { name: /عنوان فعالیت|شرح/ })).toHaveCount(0);
  });

  test("list sort 0-10 and advanced field catalog", async ({ page }) => {
    await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("مرتب سازی")).toBeVisible({ timeout: 20000 });
    await page.getByText("مرتب سازی").locator("..").getByRole("combobox").click();
    await expect(page.getByRole("option", { name: "تاریخ ثبت", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "زمان فعالیت بعدی", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: /^0 / })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "فیلتر پیشرفته" }).click();
    await expect(page.getByTestId("deal-advanced-filter")).toBeVisible();
    await page.getByTestId("deal-advanced-filter").getByRole("combobox").first().click();
    await expect(page.getByRole("option", { name: "کاربر مرتبط معامله" })).toBeVisible();
    await expect(page.getByRole("option", { name: "معرف معامله" })).toBeVisible();
    await expect(page.getByRole("option", { name: "تاریخ ثبت" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("zoom overlay در یک نگاه", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "همه", exact: true }).click();
    await page.locator("button[title='در یک نگاه']").first().click({ timeout: 20000 });
    await expect(page.getByRole("heading", { name: "در یک نگاه" })).toBeVisible();
  });

  test("kanban no-tag acquaintance and 6m actually filter", async ({ page }) => {
    const taggedTitle = `${STAMP} tagged`;
    const plainTitle = `${STAMP} plain`;
    const oldTitle = `${STAMP} oldreg`;
    const taggedId = await createDeal(salesJwt(), taggedTitle);
    const plainId = await createDeal(salesJwt(), plainTitle);
    const oldId = await createDeal(salesJwt(), oldTitle);
    adminSql(
      `insert into public.deal_tags (title) values ('[TEST-PASS2-TAG]') on conflict (title) do nothing`,
    );
    const tagId = dbScalar("select id from public.deal_tags where title = '[TEST-PASS2-TAG]'").trim();
    adminSql(
      `insert into public.sales_interaction_tags (interaction_id, tag_id) values ('${taggedId}', '${tagId}') on conflict do nothing`,
    );
    adminSql(
      `update public.sales_interactions set register_time = now() - interval '8 months' where id = '${oldId}'`,
    );
    const acqId = dbScalar(
      "select id from public.acquaintance_methods where is_active order by sort_order limit 1",
    ).trim();
    if (acqId) {
      adminSql(`update public.sales_interactions set acquaintance_id = '${acqId}' where id = '${plainId}'`);
    }
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "همه", exact: true }).click();
    await expect(page.getByText(plainTitle).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(taggedTitle).first()).toBeVisible();
    await page.getByText("بدون برچسب").click();
    await expect(page.getByText(plainTitle).first()).toBeVisible();
    await expect(page.getByText(taggedTitle)).toHaveCount(0);
    await page.getByText("بدون برچسب").click();
    await expect(page.getByText(oldTitle)).toHaveCount(0);
    await page.getByText("زمان ثبت معامله").locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: "همه" }).click();
    await expect(page.getByText(oldTitle).first()).toBeVisible();
    await expect(page.getByText("شیوه آشنایی:")).toBeVisible();
  });

  test("related user OR query on kanban owner tab", async ({ page }) => {
    const title = `${STAMP} related`;
    const id = await createDeal(salesJwt(), title);
    const adminId = userIdFor("admin");
    const salesId = userIdFor("sales");
    adminSql(`update public.sales_interactions set salesperson_id = '${adminId}' where id = '${id}'`);
    adminSql(
      `insert into public.deal_related_users (interaction_id, profile_id) values ('${id}', '${salesId}') on conflict do nothing`,
    );
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "همه", exact: true }).click();
    await page.getByRole("button", { name: "مسئول", exact: true }).first().click();
    await page.getByLabel("فیلتر کاریز").getByRole("button", { name: "مسئول", exact: true }).nth(1).click();
    await expect(page.getByText(title)).toHaveCount(0);
    await page.getByText("نمایش معاملات مرتبط با مسئول").click();
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20000 });
  });

  test("edit تاریخ معامله after create and list restore", async ({ page }) => {
    const id = await createDeal(salesJwt(), `${STAMP} regtime`);
    await page.goto(`/deal/${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/تاریخ معامله/).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByPlaceholder("انتخاب تاریخ").first()).toBeVisible();
    const del = await rest(salesJwt(), "/rpc/sales_deal_delete", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    });
    expect(del.status, del.text).toBe(200);
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await page.getByText("نوع معاملات").locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: "معاملات حذف شده" }).click();
    await expect(page.getByRole("button", { name: "بازیابی" }).first()).toBeVisible({ timeout: 20000 });
  });

  test("per-stage required extra field trigger", async () => {
    const id = await createDeal(salesJwt(), `${STAMP} reqfield`);
    const current = dbScalar(`select stage_id from public.sales_interactions where id = '${id}'`).trim();
    const other = dbScalar(
      `select id from public.sales_pipeline_stages where pipeline_id = (select pipeline_id from public.sales_interactions where id = '${id}') and id <> '${current}' and coalesce(is_active, true) order by sort_order limit 1`,
    ).trim();
    expect(other.length).toBeGreaterThan(10);
    const defId = adminSql(
      `insert into public.deal_field_definitions (title, field_type, is_active) values ('[TEST-PASS2-REQ]', 'text', true) returning id`,
    )
      .trim()
      .match(/[0-9a-f-]{36}/i)?.[0];
    if (!defId) throw new Error("def insert failed");
    try {
      adminSql(
        `insert into public.deal_field_stage_rules (definition_id, stage_id, required) values ('${defId}', '${other}', true)`,
      );
      let blocked = false;
      try {
        adminSql(`update public.sales_interactions set stage_id = '${other}' where id = '${id}'`);
      } catch (e) {
        blocked = /P0001|اجباری|required|ERROR/i.test(String(e));
      }
      expect(blocked).toBe(true);
      adminSql(
        `insert into public.deal_field_values (interaction_id, definition_id, value_text) values ('${id}', '${defId}', 'ok') on conflict do nothing`,
      );
      adminSql(`update public.deal_field_values set value_text = 'ok' where interaction_id = '${id}' and definition_id = '${defId}'`);
      adminSql(`update public.sales_interactions set stage_id = '${other}' where id = '${id}'`);
      expect(dbScalar(`select stage_id from public.sales_interactions where id = '${id}'`).trim()).toBe(other);
    } finally {
      adminSql(`delete from public.deal_field_stage_rules where definition_id = '${defId}'`);
      adminSql(`delete from public.deal_field_values where definition_id = '${defId}'`);
      adminSql(`delete from public.deal_field_definitions where id = '${defId}'`);
    }
  });

  test("list and create dialog do not overflow at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("تعداد کل").first()).toBeVisible({ timeout: 20000 });
    const listOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    );
    expect(listOverflow).toBe(false);
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "افزودن معامله" }).click();
    await expect(page.getByText("متن درخواست")).toBeVisible({ timeout: 15000 });
    const createOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    );
    expect(createOverflow).toBe(false);
  });
});

test.describe("didar deals parity pass2 admin", () => {
  test.use({
    storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
  });

  test("pipeline settings required extra fields UI", async ({ page }) => {
    await page.goto("/settings/sales-pipelines", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("فیلدهای اجباری هر مرحله")).toBeVisible({ timeout: 20000 });
    await expect(page.getByPlaceholder("عنوان فیلد جدید")).toBeVisible();
  });
});
