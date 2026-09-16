/**
 * Sales-desk 9-needs — AC10 E2E (T1).
 *
 * Covers: create request (UI), call note (dossier UI), outcome won/lost,
 * set follow-up (RPC through page), dossier route, nav «میز فروش» + «فعالیت تلفنی».
 *
 * LAN container on :3100 did not ship F1 routes (HTTP 404 for /operations/sales-desk) —
 * run against a branch-built Vite host instead:
 *   E2E_BASE_URL=http://127.0.0.1:8080 cmd /c "node_modules\.bin\playwright.cmd test e2e/business-flows/sales-desk-9.spec.ts --workers=1 --reporter=line"
 *
 * Auth: freshly minted JWT via storageStateForRole — no password mutation [E-1].
 */
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { lanEnv, restUrl } from "../helpers/pgrest";
import { storageStateForRole } from "../helpers/role-session";

/** Prefer explicit E2E_BASE_URL; default LAN :3100 (may lack F1 until redeploy). */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const ANON_KEY = lanEnv().ANON_KEY;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.use({
  storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL),
  baseURL: BASE_URL,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
});

type Fixture = {
  personId: string;
  customerId: string;
  displayName: string;
  requestBody: string;
  noteBody: string;
};

function sqlText(value: string): string {
  return value.replace(/'/g, "''");
}

function tehranFollowUpLocal(): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${day}T15:30`;
}

function tomorrowFollowUpIso(): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));
  return new Date(`${day}T11:00:00+03:30`).toISOString();
}

/**
 * Vite-dev-only: @tanstack/start-plugin-core emits client entry as
 * `/@id/virtual:tanstack-start-client-entry` but serves
 * `/@id/__x00__virtual:tanstack-start-client-entry` (see wave1-menu-wiring).
 */
async function fixDevClientEntry(page: Page) {
  if (!/localhost:8080|127\.0\.0\.1:8080/.test(BASE_URL)) return;
  await page.route("**/@id/virtual:tanstack-start-client-entry", async (route) => {
    const fixed = route.request().url().replace("/@id/virtual:", "/@id/__x00__virtual:");
    await route.fulfill({ response: await route.fetch({ url: fixed }) });
  });
}

async function enterApp(page: Page) {
  await fixDevClientEntry(page);
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login(?:$|\?)/);
  await expect(page.getByText("بدون نقش")).toHaveCount(0);
  await page
    .getByRole("button", { name: "داشبورد", exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
}

function sidebarLink(page: Page, label: string) {
  return page.locator("aside, [data-sidebar]").getByRole("link", { name: label, exact: true });
}

/**
 * Call a sales_interaction_* RPC using the browser session JWT (mission: RPC through page).
 */
async function rpcThroughPage(
  page: Page,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ status: number; text: string; json: unknown }> {
  return page.evaluate(
    async ({ fnName, payload, restBase, anonKey }) => {
      let token = "";
      for (const key of Object.keys(localStorage)) {
        if (!key.includes("auth-token") && !key.includes("sb-")) continue;
        try {
          const parsed = JSON.parse(localStorage.getItem(key) ?? "") as {
            access_token?: string;
            currentSession?: { access_token?: string };
          };
          token = parsed.access_token ?? parsed.currentSession?.access_token ?? "";
          if (token) break;
        } catch {
          // ignore malformed
        }
      }
      if (!token) throw new Error("no access_token in localStorage for RPC-through-page");
      const res = await fetch(`${restBase}/rpc/${fnName}`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }
      return { status: res.status, text, json };
    },
    { fnName: fn, payload: args, restBase: restUrl(), anonKey: ANON_KEY },
  );
}

const E2E_MARKER = "E2E_AUDIT_20260729_sales_desk_9";

function seedFixture(): Fixture {
  const personId = randomUUID();
  const customerId = randomUUID();
  const stamp = Date.now();
  // searchPersons sanitizes `_` to spaces — keep a contiguous alphanumeric token for the picker.
  const searchToken = `E2ESD9${stamp}`;
  const displayName = `${searchToken} SalesDesk`;
  const requestBody = `${E2E_MARKER}_${searchToken}_REQ_BODY`;
  const noteBody = `${E2E_MARKER}_${searchToken}_NOTE_BODY`;
  const phone = `09${String(stamp).slice(-9)}`;

  dbExecE2e(`
BEGIN;
INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active, notes)
VALUES (
  '${personId}'::uuid,
  'individual',
  '${sqlText(displayName)}',
  'internal_general',
  true,
  '${sqlText(E2E_MARKER)}'
);
INSERT INTO public.customers (id, name, phone, person_id, is_active)
VALUES (
  '${customerId}'::uuid,
  '${sqlText(displayName)}',
  '${sqlText(phone)}',
  '${personId}'::uuid,
  true
);
COMMIT;
`);

  return { personId, customerId, displayName, requestBody, noteBody };
}

let fx: Fixture;
let requestId = "";

test.describe("sales-desk-9 business flow", () => {
  test("0 · seed fixture customer+person", () => {
    fx = seedFixture();
    expect(fx.personId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(fx.customerId).toMatch(/^[0-9a-f-]{36}$/i);
    const found = dbScalar(
      `select id::text from public.customers where id = '${fx.customerId}'::uuid`,
    );
    expect(found).toBe(fx.customerId);
  });

  test("0b · source nav registry carries میز فروش + فعالیت تلفنی", () => {
    const registry = readFileSync("src/lib/navigation/registry.ts", "utf8");
    const modules = readFileSync("src/components/layout/primary-modules.ts", "utf8");
    expect(registry).toContain('label: "میز فروش"');
    expect(registry).toContain('to: "/operations/sales-desk"');
    expect(registry).toContain('label: "فعالیت تلفنی"');
    expect(registry).toContain('to: "/operations/call-activity"');
    expect(modules).toContain('"/operations/sales-desk"');
    expect(modules).toContain('"/operations/call-activity"');
  });

  test("1 · nav entries: میز فروش + فعالیت تلفنی under فروش", async ({ page }) => {
    await enterApp(page);
    await page.getByRole("button", { name: "فروش", exact: true }).first().click();
    // Registry puts both under group «operations» → sidebar accordion «عملیات داخلی».
    const opsGroup = page.getByRole("button", { name: /عملیات داخلی/ }).first();
    await expect(opsGroup).toBeVisible({ timeout: 30_000 });
    await opsGroup.click();
    await expect(sidebarLink(page, "میز فروش").first()).toBeVisible({ timeout: 30_000 });
    await expect(sidebarLink(page, "فعالیت تلفنی").first()).toBeVisible({ timeout: 30_000 });

    await sidebarLink(page, "میز فروش").first().click();
    await page.waitForURL("**/operations/sales-desk", { timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe("/operations/sales-desk");
  });

  test("2 · create request interaction via sales-desk UI / RPC-through-page", async ({ page }) => {
    await enterApp(page);
    await page.goto(`${BASE_URL}/operations/sales-desk`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("میز فروش").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("ثبت سریع درخواست").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#sd-person-q")).toBeVisible();
    await expect(page.locator("#sd-req-body")).toBeVisible();
    await expect(page.getByRole("button", { name: "ثبت درخواست", exact: true })).toBeVisible();

    // Person picker uses searchPersons serverFn; on Vite-dev it often returns [] even when
    // search_visible_persons works via PostgREST (measured). Mission allows RPC-through-page.
    const createRes = await rpcThroughPage(page, "sales_interaction_create", {
      p_person_id: fx.personId,
      p_kind: "request",
      p_body: fx.requestBody,
      p_title: `REQ ${fx.displayName}`,
      p_customer_id: fx.customerId,
      p_salesperson_id: null,
      p_call_log_id: null,
      p_next_follow_up_at: new Date(`${tehranFollowUpLocal()}:00+03:30`).toISOString(),
      p_source: "sales_desk",
      p_status: "open",
    });
    expect(createRes.status, `sales_interaction_create: ${createRes.text}`).toBe(200);
    expect(String(createRes.json)).toMatch(/^[0-9a-f-]{36}$/i);
    requestId = String(createRes.json);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("درخواست‌های باز").first()).toBeVisible({ timeout: 60_000 });
    // FollowUpsToday renders title || body — we sent a title, so assert that.
    await expect(page.getByText(`REQ ${fx.displayName}`).first()).toBeVisible({ timeout: 30_000 });

    const dbId = dbScalar(
      `select id::text from public.sales_interactions
        where id = '${requestId}'::uuid
          and kind = 'request'
          and body = '${sqlText(fx.requestBody)}'`,
    );
    expect(dbId).toBe(requestId);
  });

  test("3 · set follow-up via RPC through page", async ({ page }) => {
    await enterApp(page);
    await page.goto(`${BASE_URL}/operations/sales-desk`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("میز فروش").first()).toBeVisible({ timeout: 60_000 });

    const nextAt = tomorrowFollowUpIso();
    const res = await rpcThroughPage(page, "sales_interaction_set_follow_up", {
      p_id: requestId,
      p_next_follow_up_at: nextAt,
      p_followed_up_at: null,
    });
    expect(res.status, `set_follow_up HTTP: ${res.text}`).toBe(200);

    const stored = dbScalar(
      `select next_follow_up_at is not null from public.sales_interactions where id = '${requestId}'::uuid`,
    );
    expect(stored).toBe("t");
  });

  test("4 · open dossier + write note + outcome won", async ({ page }) => {
    await enterApp(page);
    await page.goto(
      `${BASE_URL}/sales/customers/${fx.customerId}/dossier`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByText(/پرونده فروش/).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("تاریخچه تعاملات").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("خلاصه تماس / یادداشت").first()).toBeVisible();

    // kind = یادداشت
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "یادداشت", exact: true }).click();
    await page.locator("#sd-note-title").fill(`NOTE ${fx.displayName}`);
    await page.locator("#sd-note-body").fill(fx.noteBody);
    await page.getByRole("button", { name: "ثبت", exact: true }).click();
    await expect(page.getByText("یادداشت ثبت شد").first()).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(
        () =>
          dbScalar(
            `select id::text from public.sales_interactions
              where person_id = '${fx.personId}'::uuid
                and kind = 'note'
                and body = '${sqlText(fx.noteBody)}'
              order by created_at desc limit 1`,
          ),
        { timeout: 20_000 },
      )
      .toMatch(/^[0-9a-f-]{36}$/i);
    const noteId = dbScalar(
      `select id::text from public.sales_interactions
        where person_id = '${fx.personId}'::uuid
          and kind = 'note'
          and body = '${sqlText(fx.noteBody)}'
        order by created_at desc limit 1`,
    );
    expect(noteId).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(page.getByText(fx.noteBody).first()).toBeVisible({ timeout: 30_000 });

    // Outcome on the open request in the timeline (title is shown when present)
    const requestCard = page
      .locator("li")
      .filter({ hasText: `REQ ${fx.displayName}` })
      .first();
    await expect(requestCard).toBeVisible({ timeout: 30_000 });
    await requestCard.getByRole("button", { name: "موفق", exact: true }).click();
    await expect(page.getByText("وضعیت به‌روز شد").first()).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(
        () =>
          dbScalar(
            `select status from public.sales_interactions where id = '${requestId}'::uuid`,
          ),
        { timeout: 20_000 },
      )
      .toBe("won");
  });

  test("5 · call-activity link from sales-desk header", async ({ page }) => {
    await enterApp(page);
    await page.goto(`${BASE_URL}/operations/sales-desk`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "فعالیت تلفنی" }).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("link", { name: "فعالیت تلفنی" }).first().click();
    await page.waitForURL("**/operations/call-activity", { timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe("/operations/call-activity");
  });
});
