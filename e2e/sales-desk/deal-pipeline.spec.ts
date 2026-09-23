/**
 * Deal pipelines v1 — G8 against 3100.
 * Titles start with [TEST-DEAL]. Cleanup is a separate admin SQL pass.
 */
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { lanEnv, mintJwt, rest } from "../helpers/pgrest";
import { storageStateForRole, userIdFor } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const STAMP = `[TEST-DEAL] ${Date.now()}`;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

function salesJwt() {
  return mintJwt(userIdFor("sales"));
}
function adminJwt() {
  return mintJwt(userIdFor("admin"));
}

async function createDeal(jwt: string, title: string): Promise<string> {
  const personId = dbScalar(
    "select id from public.persons order by created_at limit 1",
  ).trim();
  const res = await rest<string>(jwt, "/rpc/sales_interaction_create", {
    method: "POST",
    body: JSON.stringify({
      p_person_id: personId,
      p_kind: "request",
      p_body: title,
      p_title: title,
      p_salesperson_id: userIdFor("sales"),
      p_source: "manual",
      p_status: "open",
    }),
  });
  expect(res.status, res.text).toBe(200);
  return String(res.body).replace(/"/g, "");
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
    `insert into public.sales_quotes (quote_number, customer_name, customer_phone, status, interaction_id, salesperson_id) values ('${qn}', 'g8', '09000000000', 'draft', '${dealId}', '${userIdFor("sales")}') returning id`,
  );
  const id = out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!id) throw new Error(`insertLinkedQuote failed: ${out}`);
  return id;
}

async function dismissBlockingDialogs(page: import("@playwright/test").Page) {
  const seen = page.getByRole("button", { name: "دیدم" });
  for (let i = 0; i < 3; i += 1) {
    if (!(await seen.isVisible().catch(() => false))) break;
    await seen.click();
    await page.waitForTimeout(300);
  }
}

test.describe("deal pipeline v1", () => {
  test.use({
    storageState: storageStateForRole("sales", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
  });

  test("G8.1 create deal lands in seed stage", async ({ page }) => {
    const title = `${STAMP} create`;
    const id = await createDeal(salesJwt(), title);
    const stage = dbScalar(
      `select s.title from public.sales_interactions i join public.sales_pipeline_stages s on s.id = i.stage_id where i.id = '${id}'`,
    ).trim();
    const pipe = dbScalar(
      `select p.title from public.sales_interactions i join public.sales_pipelines p on p.id = i.pipeline_id where i.id = '${id}'`,
    ).trim();
    expect(pipe).toBe("کاریز افراکالا");
    expect(stage).toBe("ثبت درخواست");
    await page.goto("/operations/sales-desk/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "کاریز فروش" })).toBeVisible();
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 15000 });
  });

  test("G8.2 drag / move writes history; closed cannot move", async ({ page }) => {
    const title = `${STAMP} move`;
    const id = await createDeal(salesJwt(), title);
    const s2 = dbScalar(
      `select id from public.sales_pipeline_stages where title = 'اعتبار و قیمت دهی' limit 1`,
    ).trim();
    const pipe = dbScalar(
      `select pipeline_id::text from public.sales_interactions where id = '${id}'`,
    ).trim();
    const moved = await rest(salesJwt(), "/rpc/sales_deal_move", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_pipeline_id: pipe, p_stage_id: s2 }),
    });
    expect(moved.status, moved.text).toBe(200);
    const hist = Number(
      dbScalar(
        `select count(*) from public.sales_interaction_history where interaction_id = '${id}' and event = 'stage'`,
      ).trim(),
    );
    expect(hist).toBeGreaterThan(0);
    await rest(adminJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_status: "won" }),
    });
    const s3 = dbScalar(
      `select id from public.sales_pipeline_stages where title = 'پیگیری معامله و حساب رسانی' limit 1`,
    ).trim();
    const refused = await rest(salesJwt(), "/rpc/sales_deal_move", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_pipeline_id: pipe, p_stage_id: s3 }),
    });
    expect(refused.status).not.toBe(200);
    expect(refused.text).toContain("مرحله و کاریز معاملهٔ بسته قابل تغییر نیست");
    await page.goto("/operations/sales-desk/pipeline", { waitUntil: "domcontentloaded" });
    await page.getByRole("combobox").first().click().catch(() => undefined);
  });

  test("G8.3 won/lost/سایر/D14", async () => {
    const id = await createDeal(salesJwt(), `${STAMP} close`);
    const won = await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_status: "won" }),
    });
    expect(won.status, won.text).toBe(200);
    const reason = dbScalar(
      `select id from public.deal_lost_reasons where title = 'سایر' limit 1`,
    ).trim();
    const d14 = await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({
        p_id: id,
        p_status: "lost",
        p_lost_reason_id: reason,
        p_lost_reason_other: "x",
      }),
    });
    expect(d14.text).toContain("برای ناموفق کردن معاملهٔ موفق");
    await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_status: "open" }),
    });
    const lostNo = await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_status: "lost" }),
    });
    expect(lostNo.status).not.toBe(200);
    const lostOk = await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({
        p_id: id,
        p_status: "lost",
        p_lost_reason_id: reason,
        p_lost_reason_other: "متن سایر",
      }),
    });
    expect(lostOk.status, lostOk.text).toBe(200);
    const d14b = await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_status: "won" }),
    });
    expect(d14b.text).toContain("برای موفق کردن معاملهٔ ناموفق");
  });

  test("G8.4 reopen clears fields and keeps history", async () => {
    const id = await createDeal(salesJwt(), `${STAMP} reopen`);
    await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_status: "won" }),
    });
    await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_status: "open" }),
    });
    const row = dbScalar(
      `select concat_ws(',', coalesce(won_at::text,''), coalesce(won_by::text,''), coalesce(lost_at::text,''), coalesce(lost_by::text,'')) from public.sales_interactions where id = '${id}'`,
    ).trim();
    expect(row.replace(/,/g, "")).toBe("");
    const n = Number(
      dbScalar(
        `select count(*) from public.sales_interaction_history where interaction_id = '${id}' and event = 'status'`,
      ).trim(),
    );
    expect(n).toBeGreaterThanOrEqual(2);
  });

  test("G8.5 hide lost without permission; API refused", async ({ page }) => {
    const id = await createDeal(salesJwt(), `${STAMP} perm`);
    // Flip via admin JWT on role_permissions
    const before = dbScalar(
      `select can_update::text from public.role_permissions where module='deal-mark-lost' and role_name='sales'`,
    ).trim();
    expect(["t", "true"]).toContain(before);
    adminSql(
      `update public.role_permissions set can_update = false where module='deal-mark-lost' and role_name='sales'`,
    );
    try {
      const denied = await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
        method: "POST",
        body: JSON.stringify({
          p_id: id,
          p_status: "lost",
          p_lost_reason_id: dbScalar(
            `select id from public.deal_lost_reasons where title='سایر' limit 1`,
          ).trim(),
          p_lost_reason_other: "x",
        }),
      });
      expect(denied.text).toContain("شما مجوز ناموفق کردن معاملات را ندارید");
      await page.goto(`/operations/sales-desk/deals/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: "ناموفق شد" })).toHaveCount(0);
    } finally {
      adminSql(
        `update public.role_permissions set can_update = true where module='deal-mark-lost' and role_name='sales'`,
      );
    }
  });

  test("G8.6 delete open, restore; refuse closed", async ({ page }) => {
    const id = await createDeal(salesJwt(), `${STAMP} delete`);
    const del = await rest(salesJwt(), "/rpc/sales_deal_delete", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    });
    expect(del.status, del.text).toBe(200);
    await page.goto("/operations/sales-desk/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "کاریز فروش" })).toBeVisible();
    await page.getByRole("combobox").filter({ hasText: "جاری" }).click();
    await page.getByRole("option", { name: "معاملات حذف شده" }).click();
    const row = page.locator("li", { hasText: `${STAMP} delete` });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "بازیابی" }).click();
    await expect.poll(
      () =>
        dbScalar(
          `select (deleted_at is null)::text from public.sales_interactions where id = '${id}'`,
        ).trim(),
      { timeout: 15_000 },
    ).toMatch(/^(t|true)$/);
    const active = dbScalar(
      `select (deleted_at is null)::text from public.sales_interactions where id = '${id}'`,
    ).trim();
    expect(["t", "true"]).toContain(active);
    await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_status: "won" }),
    });
    const refuse = await rest(salesJwt(), "/rpc/sales_deal_delete", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    });
    expect(refuse.text).toContain("برای حذف معامله ابتدا آن را به جاری برگردانید");
  });

  test("G8.7 quote created/sent/accepted advances deal", async ({ page }) => {
    const id = await createDeal(salesJwt(), `${STAMP} quote`);
    await page.goto(`/operations/sales-desk/deals/${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "ایجاد پیش‌فاکتور" })).toBeVisible();
    const jwt = adminJwt();
    const qid = insertLinkedQuote(id, `${STAMP}-Q1`.replace(/[^0-9A-Za-z-]/g, "").slice(0, 40));
    expect(qid).toMatch(/^[0-9a-f-]{36}$/i);
    const afterCreate = dbScalar(
      `select s.title from public.sales_interactions i join public.sales_pipeline_stages s on s.id=i.stage_id where i.id='${id}'`,
    ).trim();
    expect(afterCreate).toBe("اعتبار و قیمت دهی");
    const sent = await rest(jwt, "/rpc/update_sales_quote_status", {
      method: "POST",
      body: JSON.stringify({ p_quote_id: qid, p_next: "sent" }),
    });
    expect(sent.status, sent.text).toBe(200);
    const afterSent = dbScalar(
      `select s.title from public.sales_interactions i join public.sales_pipeline_stages s on s.id=i.stage_id where i.id='${id}'`,
    ).trim();
    expect(afterSent).toBe("پیگیری معامله و حساب رسانی");
    const acc = await rest(jwt, "/rpc/update_sales_quote_status", {
      method: "POST",
      body: JSON.stringify({ p_quote_id: qid, p_next: "accepted" }),
    });
    expect(acc.status, acc.text).toBe(200);
    const st = dbScalar(
      `select concat(status, ':', coalesce(won_by::text,'')) from public.sales_interactions where id='${id}'`,
    ).trim();
    expect(st.startsWith("won:")).toBeTruthy();
    const src = dbScalar(
      `select source from public.sales_interaction_history where interaction_id='${id}' and event='status' and to_value='won' order by created_at desc limit 1`,
    ).trim();
    expect(src).toBe("auto_quote_accepted");
  });

  test("G8.8 rejected quote notice; newer quote hides it", async ({ page }) => {
    const id = await createDeal(salesJwt(), `${STAMP} reject`);
    const jwt = adminJwt();
    const qid = insertLinkedQuote(
      id,
      `${STAMP}-QR`.replace(/[^0-9A-Za-z-]/g, "").slice(0, 40),
    );
    const sent = await rest(jwt, "/rpc/update_sales_quote_status", {
      method: "POST",
      body: JSON.stringify({ p_quote_id: qid, p_next: "sent" }),
    });
    expect(sent.status, sent.text).toBe(200);
    const rej = await rest(jwt, "/rpc/update_sales_quote_status", {
      method: "POST",
      body: JSON.stringify({ p_quote_id: qid, p_next: "rejected", p_reason: "g8 reject" }),
    });
    expect(rej.status, rej.text).toBe(200);
    const qst = dbScalar(
      `select status::text from public.sales_quotes where id = '${qid}'`,
    ).trim();
    expect(qst).toBe("rejected");
    adminSql(
      `update public.notification_queue set is_read = true where type='quote_rejected' and is_read = false`,
    );
    await page.goto(`/operations/sales-desk/deals/${id}`, { waitUntil: "domcontentloaded" });
    {
      const seenBtn = page.getByRole("button", { name: "دیدم" });
      try {
        await seenBtn.waitFor({ state: "visible", timeout: 2_000 });
        await seenBtn.click();
        await seenBtn.waitFor({ state: "hidden", timeout: 5_000 });
      } catch {
        /* no leftover reject dialog */
      }
    }
    await expect(
      page.getByText("اگر معامله از دست رفته", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "ناموفق شد" }).last().click();
    await expect(page.getByRole("heading", { name: "دلیل شکست را انتخاب کنید" })).toBeVisible();
    await page.getByRole("button", { name: "انصراف" }).click();
    insertLinkedQuote(id, `${STAMP}-QR2`.replace(/[^0-9A-Za-z-]/g, "").slice(0, 40));
    await page.reload();
    await expect(
      page.getByText("اگر معامله از دست رفته", { exact: false }),
    ).toHaveCount(0);
  });

});

test.describe("deal pipeline admin settings", () => {
  test.use({
    storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
  });

  test("G8.9 second pipeline move", async ({ page }) => {
    const id = await createDeal(adminJwt(), `${STAMP} pipe2`);
    await page.goto("/settings/sales-pipelines");
    await expect(page.getByRole("heading", { name: "کاریزهای فروش" })).toBeVisible();
    await page.getByPlaceholder("عنوان کاریز جدید").fill(`${STAMP} کاریز`);
    await page.getByRole("button", { name: "کاریز جدید" }).click();
    await expect
      .poll(
        () =>
          dbScalar(
            `select count(*) from public.sales_pipelines where title = '${STAMP} کاریز'`,
          ).trim(),
        { timeout: 10_000 },
      )
      .not.toBe("0");
    const pipe2 = dbScalar(
      `select id from public.sales_pipelines where title = '${STAMP} کاریز' limit 1`,
    ).trim();
    expect(pipe2).toBeTruthy();
    const stage2 = dbScalar(
      `select id from public.sales_pipeline_stages where pipeline_id = '${pipe2}' order by sort_order limit 1`,
    ).trim();
    if (!stage2) {
      await page.getByPlaceholder("عنوان مرحله جدید").fill(`${STAMP} مرحله`);
      await page.getByRole("button", { name: "افزودن مرحله" }).click();
    }
    const sid = dbScalar(
      `select id from public.sales_pipeline_stages where pipeline_id = '${pipe2}' order by sort_order limit 1`,
    ).trim();
    const moved = await rest(adminJwt(), "/rpc/sales_deal_move", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_pipeline_id: pipe2, p_stage_id: sid }),
    });
    expect(moved.status, moved.text).toBe(200);
  });
});

test.describe("deal pipeline roles", () => {
  test("G8.10 viewer cannot open pipeline or settings", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: storageStateForRole("viewer", BASE_URL, SUPABASE_URL),
      locale: "fa-IR",
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/operations/sales-desk/pipeline`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "کاریز فروش" })).toHaveCount(0);
    await page.goto(`${BASE_URL}/settings/sales-pipelines`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "کاریزهای فروش" })).toHaveCount(0);
    await ctx.close();
  });

  test("G8.10 sales views settings, cannot create pipeline", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: storageStateForRole("sales", BASE_URL, SUPABASE_URL),
      locale: "fa-IR",
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/settings/sales-pipelines`);
    await expect(page.getByRole("heading", { name: "کاریزهای فروش" })).toBeVisible();
    await expect(page.getByRole("button", { name: "کاریز جدید" })).toHaveCount(0);
    await ctx.close();
  });

  test("G8.10 purchase_specialist has no pipeline grants", async () => {
    const view = dbScalar(
      `select can_view::text from public.role_permissions where module='sales-pipelines' and role_name='purchase_specialist'`,
    ).trim();
    expect(["f", "false"]).toContain(view);
    const n = Number(
      dbScalar(`select count(*) from public.user_roles where role='purchase_specialist'`).trim(),
    );
    expect(n).toBe(0);
  });
});
