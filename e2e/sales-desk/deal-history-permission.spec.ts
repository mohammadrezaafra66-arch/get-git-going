/**
 * History-table permission hotfix — run as test.sales, never admin.
 * Titles start with [CHROME-PARITY-2] so the research cleanup can remove them.
 */
import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { lanEnv, mintJwt, rest } from "../helpers/pgrest";
import { storageStateForRole, userIdFor } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const STAMP = `[CHROME-PARITY-2] ${Date.now()}`;

test.setTimeout(180_000);

function salesJwt() {
  return mintJwt(userIdFor("sales"));
}

async function createDeal(
  title: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const personId = dbScalar(
    "select id from public.persons order by created_at limit 1",
  ).trim();
  const res = await rest<string>(salesJwt(), "/rpc/sales_interaction_create", {
    method: "POST",
    body: JSON.stringify({
      p_person_id: personId,
      p_kind: "request",
      p_body: title,
      p_title: title,
      p_salesperson_id: userIdFor("sales"),
      p_source: "manual",
      p_status: "open",
      ...extra,
    }),
  });
  expect(res.status, res.text).toBe(200);
  expect(res.text.toLowerCase()).not.toContain("permission denied");
  return String(res.body).replace(/"/g, "");
}

test.describe("deal history permission as sales", () => {
  test.use({
    storageState: storageStateForRole("sales", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
  });

  test("create with amount saves amount and exactly one deal", async () => {
    const title = `${STAMP} amount`;
    const before = Number(
      dbScalar(
        `select count(*) from public.sales_interactions where title = '${title}'`,
      ).trim(),
    );
    const id = await createDeal(title, { p_estimated_amount: 2500000 });
    const amt = dbScalar(
      `select estimated_amount::text from public.sales_interactions where id = '${id}'`,
    ).trim();
    expect(Number(amt)).toBe(2500000);
    const after = Number(
      dbScalar(
        `select count(*) from public.sales_interactions where title = '${title}'`,
      ).trim(),
    );
    expect(after - before).toBe(1);
    const hist = Number(
      dbScalar(
        `select count(*) from public.sales_interaction_history where interaction_id = '${id}'`,
      ).trim(),
    );
    expect(hist).toBeGreaterThan(0);
  });

  test("PATCH amount as sales writes history and does not 403", async () => {
    const id = await createDeal(`${STAMP} patch`);
    const patch = await rest(salesJwt(), `/sales_interactions?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ estimated_amount: 777000 }),
    });
    expect(patch.status, patch.text).toBeLessThan(300);
    expect(patch.text.toLowerCase()).not.toContain("permission denied");
    const amt = dbScalar(
      `select estimated_amount::text from public.sales_interactions where id = '${id}'`,
    ).trim();
    expect(Number(amt)).toBe(777000);
    const hist = Number(
      dbScalar(
        `select count(*) from public.sales_interaction_history where interaction_id = '${id}' and event = 'field' and field_name = 'amount'`,
      ).trim(),
    );
    expect(hist).toBeGreaterThan(0);
  });

  test("stage change, won, reopen, lost write history without 403", async () => {
    const id = await createDeal(`${STAMP} lifecycle`);
    const pipe = dbScalar(
      `select pipeline_id::text from public.sales_interactions where id = '${id}'`,
    ).trim();
    const s2 = dbScalar(
      `select id from public.sales_pipeline_stages where pipeline_id = '${pipe}' and is_active order by sort_order offset 1 limit 1`,
    ).trim();
    const moved = await rest(salesJwt(), "/rpc/sales_deal_move", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_pipeline_id: pipe, p_stage_id: s2 }),
    });
    expect(moved.status, moved.text).toBe(200);
    expect(moved.text.toLowerCase()).not.toContain("permission denied");
    const stageHist = Number(
      dbScalar(
        `select count(*) from public.sales_interaction_history where interaction_id = '${id}' and event = 'stage'`,
      ).trim(),
    );
    expect(stageHist).toBeGreaterThan(0);

    const won = await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_status: "won" }),
    });
    expect(won.status, won.text).toBe(200);
    expect(won.text.toLowerCase()).not.toContain("permission denied");

    const reopen = await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_status: "open" }),
    });
    expect(reopen.status, reopen.text).toBe(200);
    expect(reopen.text.toLowerCase()).not.toContain("permission denied");

    const reason = dbScalar(
      `select id from public.deal_lost_reasons where title = 'سایر' limit 1`,
    ).trim();
    const lost = await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
      method: "POST",
      body: JSON.stringify({
        p_id: id,
        p_status: "lost",
        p_lost_reason_id: reason,
        p_lost_reason_other: "hotfix",
      }),
    });
    expect(lost.status, lost.text).toBe(200);
    expect(lost.text.toLowerCase()).not.toContain("permission denied");
    const statusHist = Number(
      dbScalar(
        `select count(*) from public.sales_interaction_history where interaction_id = '${id}' and event = 'status'`,
      ).trim(),
    );
    expect(statusHist).toBeGreaterThanOrEqual(3);
  });

  test("bulk status change as sales does not 403 and writes history", async () => {
    const a = await createDeal(`${STAMP} bulk-a`);
    const b = await createDeal(`${STAMP} bulk-b`);
    for (const id of [a, b]) {
      const res = await rest(salesJwt(), "/rpc/sales_interaction_update_status", {
        method: "POST",
        body: JSON.stringify({ p_id: id, p_status: "won" }),
      });
      expect(res.status, res.text).toBe(200);
      expect(res.text.toLowerCase()).not.toContain("permission denied");
      const n = Number(
        dbScalar(
          `select count(*) from public.sales_interaction_history where interaction_id = '${id}' and event = 'status' and to_value = 'won'`,
        ).trim(),
      );
      expect(n).toBeGreaterThan(0);
    }
  });

  test("create form with amount saves one deal as sales", async ({ page }) => {
    const title = `${STAMP} ui-amount`;
    const personName = dbScalar(
      "select display_name from public.persons where kind = 'individual' and display_name is not null and length(btrim(display_name)) >= 3 order by created_at limit 1",
    ).trim();
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "افزودن معامله" }).click();
    await expect(page.getByLabel("عنوان معامله")).toBeVisible({ timeout: 15000 });
    await page.getByLabel("جستجوی شخص").fill(personName.slice(0, Math.min(8, personName.length)));
    await page.locator("ul button").first().click({ timeout: 15000 });
    await page.getByLabel("عنوان معامله").fill(title);
    await page.getByPlaceholder("IRR").fill("1500000");
    const save = page.getByRole("button", { name: "ذخیره معامله" });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();
    await expect(page.getByLabel("عنوان معامله")).toBeHidden({ timeout: 20000 });
    const count = Number(
      dbScalar(
        `select count(*) from public.sales_interactions where title = '${title}'`,
      ).trim(),
    );
    expect(count).toBe(1);
    const amt = dbScalar(
      `select estimated_amount::text from public.sales_interactions where title = '${title}'`,
    ).trim();
    expect(Number(amt)).toBe(1500000);
  });
});
