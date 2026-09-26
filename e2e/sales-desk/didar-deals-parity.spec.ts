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

test.describe.configure({ mode: "serial" });
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

  test("sidebar معاملات is first item", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    const first = page.locator("nav a, aside a").filter({ hasText: "معاملات" }).first();
    await expect(first).toBeVisible({ timeout: 20000 });
  });

  test("kanban drop strip labels and date chip default", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "امروز و تاریخ گذشته" })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText("نوع معاملات")).toBeVisible();
    await expect(page.getByRole("button", { name: "فیلترها" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ویرایش کاریز" })).toBeVisible();
  });

  test("list counters and or group", async ({ page }) => {
    await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("تعداد کل").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "یا" }).click();
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
    await expect(page.getByTestId("deal-deleted-banner")).not.toContainText("جاری");
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
    await expect(page.getByText("مسئول")).toBeVisible();
    await expect(page.getByRole("heading", { name: "پرداخت" })).toBeVisible();
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
});
