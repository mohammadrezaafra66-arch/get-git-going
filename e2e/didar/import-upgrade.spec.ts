/**
 * Didar contact import + Asan-code upgrade path (G7).
 *
 * Browser cases use minted JWT storageState (no password mutation).
 * Database writes go through PostgREST/RPCs with a real JWT, except cleanup
 * which is supabase_admin via the run-folder helper after the suite.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { dbScalar } from "../helpers/db";
import { lanEnv, mintJwt, rest, ADMIN_USER_ID, errMessage } from "../helpers/pgrest";
import { storageStateForRole, userIdFor, type TestRole } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const RUN = `G7${String(Date.now()).slice(-7)}`;
const PAGE_TITLE = "ورود اشخاص از دیدار";
const ROUTE = "/admin/didar-import";
const MENU = "ورود اشخاص از دیدار";

const DIDAR_HEADERS = [
  "کد دیدار مشتری",
  "تلفن همراه مشتری",
  "نام خانوادگی مشتری",
  "عنوان مشتری",
  "نام مشتری",
  "نام شرکت",
  "تلفن ثابت مشتری",
  "کد ملی مشتری",
  "آدرس",
];

const ASAN_HEADERS = ["کد حساب", "نام حساب", "موبایل", "تلفن", "کد ملی", "آدرس"];

function writeXlsx(sheetName: string, rows: unknown[][]): string {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const file = path.join(os.tmpdir(), `didar-${RUN}-${Math.random().toString(16).slice(2)}.xlsx`);
  XLSX.writeFile(wb, file);
  return file;
}

function adminJwt(): string {
  return mintJwt(ADMIN_USER_ID);
}

function salesJwt(): string {
  return mintJwt(userIdFor("sales"));
}

function managerJwt(): string {
  return mintJwt(userIdFor("manager"));
}

function accountantJwt(): string {
  return mintJwt(userIdFor("accountant"));
}

/** Iranian mobile: 09 + 9 digits. Stamp must stay 11 characters. */
function irMobile(stamp: string, tail = ""): string {
  const digits = `${stamp}${tail}`.replace(/\D/g, "");
  return `0912${digits.slice(-7).padStart(7, "0")}`;
}

async function createInlineCustomer(
  jwt: string,
  name: string,
  mobile: string,
  asan?: string | null,
): Promise<{ person_id: string; legacy_id: string }> {
  const res = await rest<{ person_id: string; legacy_id: string }>(jwt, "/rpc/person_create_inline", {
    method: "POST",
    body: JSON.stringify({
      p_display_name: name,
      p_context_kind: "customer",
      p_kind: "individual",
      p_identifiers: [
        { kind: "mobile_e164", value_raw: mobile, is_primary: true, status: "provisional" },
      ],
      p_accounting_code: asan ?? null,
      p_visibility_scope: "internal_general",
    }),
  });
  expect(res.status, res.text).toBeLessThan(300);
  return res.body;
}

async function rpc<T>(jwt: string, name: string, args: Record<string, unknown>): Promise<T> {
  const res = await rest<T>(jwt, `/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  expect(res.status, `${name}: ${res.text}`).toBeLessThan(300);
  return res.body;
}

async function stageDidar(
  jwt: string,
  fileName: string,
  rows: {
    row_number: number;
    didar_id: string | null;
    display_name: string | null;
    mobile_raw: string | null;
  }[],
): Promise<string> {
  const batch = await rest<{ id: string }[]>(jwt, "/didar_import_batches", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      kind: "persons",
      file_name: fileName,
      row_count: rows.length,
      created_by: ADMIN_USER_ID,
    }),
  });
  expect(batch.status, batch.text).toBe(201);
  const id = batch.body[0].id;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({ ...r, batch_id: id }));
    const res = await rest(jwt, "/didar_import_person_rows", {
      method: "POST",
      body: JSON.stringify(chunk),
    });
    expect(res.status, res.text).toBeLessThan(300);
  }
  return id;
}

test.describe("G7 — Didar import + Asan upgrade", () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL) });

  test("G7.1 Didar import e2e: preview counts equal committed", async ({ page }) => {
    const jwt = adminJwt();
    const stamp = String(Date.now()).slice(-6);
    const m1 = irMobile(stamp, "1");
    const m2 = irMobile(stamp, "2");
    const rows = [
      DIDAR_HEADERS,
      [`${RUN}-1`, m1, `[TEST-DIDAR] ${RUN} a`, "", "", "", "", "", ""],
      [`${RUN}-2`, m2, `[TEST-DIDAR] ${RUN} b`, "", "", "", "", "", ""],
      [`${RUN}-3`, "", `[TEST-DIDAR] ${RUN} empty`, "", "", "", "", "", ""],
      [`${RUN}-4`, m1, `[TEST-DIDAR] ${RUN} dup`, "", "", "", "", "", ""],
    ];
    const file = writeXlsx("Contact", rows);
    const personsBefore = Number(dbScalar("select count(*) from public.persons"));

    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: PAGE_TITLE })).toBeVisible();
    const discard = page.getByRole("button", { name: "کنار گذاشتن" });
    if (await discard.isVisible().catch(() => false)) {
      await discard.click();
      await expect(page.locator("#didar-contacts-file")).toBeVisible({ timeout: 15_000 });
    }
    await page.locator("#didar-contacts-file").setInputFiles(file);
    await expect(page.getByText(/ردیف خوانده شد/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "ثبت در جدول موقت" }).click();
    await expect(page.getByText("طبقه‌بندی انجام شد")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "شخص تازه" })).toBeVisible();

    const batchId = dbScalar(
      `select batch_id::text from public.didar_import_person_rows
        where display_name like '%${RUN} a%' order by row_number asc limit 1`,
    );
    const newN = Number(
      dbScalar(
        `select count(*) from public.didar_import_person_rows where batch_id='${batchId}' and classification='new'`,
      ),
    );
    const incN = Number(
      dbScalar(
        `select count(*) from public.didar_import_person_rows where batch_id='${batchId}' and classification='incomplete'`,
      ),
    );
    const confN = Number(
      dbScalar(
        `select count(*) from public.didar_import_person_rows where batch_id='${batchId}' and classification='conflict'`,
      ),
    );
    expect(newN).toBe(2);
    expect(incN).toBe(1);
    expect(confN).toBe(1);

    await page.getByRole("button", { name: "تأیید همهٔ تازه‌ها" }).click();
    await page.getByRole("button", { name: "ثبت نهایی" }).click();
    await expect(page.getByText(/ثبت شد — ساخته‌شده/)).toBeVisible({ timeout: 30_000 });

    const created = Number(
      dbScalar(
        `select count(*) from public.persons where display_name like '[TEST-DIDAR] ${RUN}%'`,
      ),
    );
    expect(created).toBe(newN);
    expect(Number(dbScalar("select count(*) from public.persons"))).toBe(personsBefore + newN);
    const asanOnNew = Number(
      dbScalar(
        `select count(*) from public.person_identifiers pi
           join public.persons p on p.id=pi.person_id
          where p.display_name like '[TEST-DIDAR] ${RUN}%'
            and pi.kind='asan_person_code' and pi.status<>'revoked'`,
      ),
    );
    expect(asanOnNew).toBe(0);
    const origins = dbScalar(
      `select string_agg(distinct origin, ',') from public.persons where display_name like '[TEST-DIDAR] ${RUN}%'`,
    );
    expect(origins).toBe("didar_import");
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  });

  const deniedRoles: TestRole[] = ["sales", "manager", "viewer"];
  for (const role of deniedRoles) {
    test.describe(role, () => {
      test.use({ storageState: storageStateForRole(role, BASE_URL, SUPABASE_URL) });
      test(`G7.2 ${role} does not see the menu and is refused on the URL`, async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("link", { name: MENU })).toHaveCount(0);
        await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);
        await expect(page.getByRole("heading", { name: PAGE_TITLE })).toHaveCount(0);
        const body = await page.locator("body").innerText();
        const url = page.url();
        const denied =
          /\/unauthorized/.test(url) ||
          /\/login/.test(url) ||
          body.includes("دسترسی ندارید") ||
          body.includes("دسترسی غیرمجاز");
        expect(denied, `${role} must be refused`).toBeTruthy();
      });
    });
  }

  test.describe("admin menu", () => {
    test.use({ storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL) });
    test("G7.2 admin sees the menu entry", async ({ page }) => {
      await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: PAGE_TITLE })).toBeVisible();
      await page.getByRole("button", { name: "مدیریت" }).click({ timeout: 10_000 }).catch(() => undefined);
      await expect(page.getByText(MENU).first()).toBeVisible();
    });
  });

  test.describe("accountant menu", () => {
    test.use({ storageState: storageStateForRole("accountant", BASE_URL, SUPABASE_URL) });
    test("G7.2 accountant sees and can open the page", async ({ page }) => {
      await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: PAGE_TITLE })).toBeVisible();
      await page.getByRole("button", { name: "مدیریت" }).click({ timeout: 10_000 }).catch(() => undefined);
      await expect(page.getByText(MENU).first()).toBeVisible();
    });
  });

  test("G7.2 purchase_specialist has no view grant", async () => {
    const view = dbScalar(
      `select can_view::text from public.role_permissions where module='didar-import' and role_name='purchase_specialist'`,
    );
    expect(view).toBe("false");
  });

  test("G7.3 accountant assigns first Asan code via ExistingPersonPrompt", async ({
    browser,
  }) => {
    const jwt = adminJwt();
    const mobile = `0912098${RUN.slice(-4)}`;
    const id = await stageDidar(jwt, `g7-assign-${RUN}.xlsx`, [
      {
        row_number: 2,
        didar_id: `${RUN}-asg`,
        display_name: `[TEST-DIDAR] ${RUN} assign`,
        mobile_raw: mobile,
      },
    ]);
    await rpc(jwt, "didar_classify_person_batch", { p_batch_id: id });
    await rest(jwt, `/didar_import_person_rows?batch_id=eq.${id}&classification=eq.new`, {
      method: "PATCH",
      body: JSON.stringify({ decision: "accept" }),
    });
    await rpc(jwt, "didar_commit_person_batch", { p_batch_id: id, p_limit: 50 });
    const personsBefore = Number(dbScalar("select count(*) from public.persons"));
    const personId = dbScalar(
      `select id::text from public.persons where display_name='[TEST-DIDAR] ${RUN} assign' order by created_at desc limit 1`,
    );
    const originBefore = dbScalar(`select origin from public.persons where id='${personId}'`);
    expect(originBefore).toBe("didar_import");

    const ctx = await browser.newContext({
      storageState: storageStateForRole("accountant", BASE_URL, SUPABASE_URL),
    });
    const page = await ctx.newPage();
    await page.goto("/sales/customers/create", { waitUntil: "domcontentloaded" });
    await page.locator("#phone").fill(mobile);
    await expect(
      page.getByText(/این شماره متعلق به/),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("فقط کد آسان را وارد کنید")).toBeVisible();
    const code = `77${RUN.slice(-7)}`;
    await page.getByPlaceholder("کد آسان").fill(code);
    await page.getByRole("button", { name: "ثبت کد آسان روی همین پرونده" }).click();
    await expect(page.getByText("کد آسان روی همین پرونده ثبت شد")).toBeVisible({
      timeout: 20_000,
    });
    await ctx.close();

    expect(Number(dbScalar("select count(*) from public.persons"))).toBe(personsBefore);
    expect(dbScalar(`select origin from public.persons where id='${personId}'`)).toBe(
      "didar_import",
    );
    const acct = dbScalar(
      `select coalesce(accounting_code,'') from public.customers where person_id='${personId}'`,
    );
    expect(acct.length).toBeGreaterThan(0);
  });

  test("G7.4 sales sees the unchanged notice and API insert is refused", async ({
    browser,
  }) => {
    const stamp = `s4${String(Date.now()).slice(-5)}`;
    const mobile = irMobile(stamp);
    const created = await createInlineCustomer(
      adminJwt(),
      `[TEST-DIDAR] ${RUN} ${stamp} sales-see`,
      mobile,
    );
    await rest(adminJwt(), `/customers?id=eq.${created.legacy_id}`, {
      method: "PATCH",
      body: JSON.stringify({ responsible_id: null }),
    });
    const ctx = await browser.newContext({
      storageState: storageStateForRole("sales", BASE_URL, SUPABASE_URL),
    });
    const page = await ctx.newPage();
    await page.goto("/sales/customers/create", { waitUntil: "domcontentloaded" });
    await page.locator("#phone").fill(mobile);
    await expect(page.getByText("این شماره ثبت است؛ از همین پرونده استفاده کنید")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "ثبت کد آسان روی همین پرونده" })).toHaveCount(
      0,
    );
    await ctx.close();

    const ins = await rest(salesJwt(), "/person_identifiers", {
      method: "POST",
      body: JSON.stringify({
        person_id: created.person_id,
        kind: "asan_person_code",
        value_raw: `88${stamp}`,
        status: "provisional",
      }),
    });
    expect(ins.status).toBeGreaterThanOrEqual(400);
    expect(errMessage(ins.body) + ins.text).toContain(
      "ثبت کد اسان روی پروندهٔ موجود فقط برای حسابدار و مدیر سیستم مجاز است",
    );
  });

  test("G7.4b sales can create a brand-new person with an Asan code", async ({ browser }) => {
    const gate = dbScalar(
      `select count(*)::text from pg_trigger
        where tgname in ('trg_note_person_created_in_xact','trg_asan_code_role_gate')`,
    );
    expect(Number(gate)).toBe(2);
    const ctx = await browser.newContext({
      storageState: storageStateForRole("sales", BASE_URL, SUPABASE_URL),
    });
    const page = await ctx.newPage();
    await page.goto("/sales/customers/create", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#accounting_code")).toBeEnabled();
    await expect(page.getByRole("button", { name: "ثبت مشتری" })).toBeVisible();
    await ctx.close();
  });

  test("G7.4c manager cannot change a registered Asan code (UI + API)", async ({
    browser,
  }) => {
    const stamp = String(Date.now()).slice(-7);
    const created = await createInlineCustomer(
      adminJwt(),
      `[TEST-DIDAR] ${RUN} ${stamp} mgr`,
      irMobile(stamp),
      `61${stamp}`,
    );
    const identId = dbScalar(
      `select id::text from public.person_identifiers
        where person_id='${created.person_id}' and kind='asan_person_code' and status<>'revoked' limit 1`,
    );
    expect(identId.length).toBe(36);
    const ctx = await browser.newContext({
      storageState: storageStateForRole("manager", BASE_URL, SUPABASE_URL),
    });
    const page = await ctx.newPage();
    await page.goto(`/sales/customers/${created.legacy_id}/edit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("#accounting_code")).toBeDisabled();
    await ctx.close();

    const upd = await rest(managerJwt(), `/person_identifiers?id=eq.${identId}`, {
      method: "PATCH",
      body: JSON.stringify({ value_raw: `99${stamp}` }),
    });
    expect(upd.status).toBeGreaterThanOrEqual(400);
    expect(upd.text).toContain("ثبت کد اسان روی پروندهٔ موجود فقط برای حسابدار و مدیر سیستم مجاز است");
  });

  test("G7.5 D5 and D6 refuse with the exact Persian messages", async () => {
    const jwt = accountantJwt();
    const stamp = String(Date.now()).slice(-7);
    const withCode = await createInlineCustomer(
      adminJwt(),
      `[TEST-DIDAR] ${RUN} ${stamp} d6`,
      irMobile(stamp, "1"),
      `55${stamp}`,
    );
    const noCode = await createInlineCustomer(
      adminJwt(),
      `[TEST-DIDAR] ${RUN} ${stamp} d5`,
      irMobile(stamp, "2"),
    );
    const otherCode = dbScalar(
      `select value_normalized from public.person_identifiers
        where kind='asan_person_code' and status<>'revoked'
          and person_id='${withCode.person_id}' limit 1`,
    );
    const d6 = await rest(jwt, "/rpc/person_assign_asan_code", {
      method: "POST",
      body: JSON.stringify({ p_person_id: withCode.person_id, p_code: `54${stamp}` }),
    });
    expect(d6.status).toBeGreaterThanOrEqual(400);
    expect(errMessage(d6.body) + d6.text).toContain(
      "این پرونده از قبل کد اسان دارد و از این مسیر قابل تغییر نیست",
    );
    const d5 = await rest(jwt, "/rpc/person_assign_asan_code", {
      method: "POST",
      body: JSON.stringify({ p_person_id: noCode.person_id, p_code: otherCode }),
    });
    expect(d5.status).toBeGreaterThanOrEqual(400);
    expect(errMessage(d5.body) + d5.text).toContain(
      "این کد آسان قبلاً برای شخص دیگری ثبت شده است",
    );
  });

  test("G7.6 Asan import attaches a code to a Didar person", async () => {
    const jwt = adminJwt();
    const mobile = `0912096${RUN.slice(-4)}`;
    const didarBatch = await stageDidar(jwt, `g7-attach-${RUN}.xlsx`, [
      {
        row_number: 2,
        didar_id: `${RUN}-att`,
        display_name: `[TEST-DIDAR] ${RUN} attach`,
        mobile_raw: mobile,
      },
    ]);
    await rpc(jwt, "didar_classify_person_batch", { p_batch_id: didarBatch });
    await rest(jwt, `/didar_import_person_rows?batch_id=eq.${didarBatch}&classification=eq.new`, {
      method: "PATCH",
      body: JSON.stringify({ decision: "accept" }),
    });
    await rpc(jwt, "didar_commit_person_batch", { p_batch_id: didarBatch, p_limit: 50 });
    const personsBefore = Number(dbScalar("select count(*) from public.persons"));

    const asanBatch = await rest<{ id: string }[]>(jwt, "/asan_import_batches", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        kind: "persons",
        file_name: `g7-asan-attach-${RUN}.xlsx`,
        row_count: 1,
        created_by: ADMIN_USER_ID,
      }),
    });
    expect(asanBatch.status).toBe(201);
    const bid = asanBatch.body[0].id;
    const ins = await rest(jwt, "/asan_import_person_rows", {
      method: "POST",
      body: JSON.stringify({
        batch_id: bid,
        row_number: 2,
        asan_code: `54${RUN.slice(-7)}`,
        display_name: `[TEST-DIDAR] ${RUN} attach`,
        mobile_raw: mobile,
      }),
    });
    expect(ins.status).toBeLessThan(300);
    await rpc(jwt, "asan_classify_person_batch", { p_batch_id: bid });
    const cls = dbScalar(
      `select classification from public.asan_import_person_rows where batch_id='${bid}'`,
    );
    expect(cls).toBe("attach_code");
    await rest(jwt, `/asan_import_person_rows?batch_id=eq.${bid}`, {
      method: "PATCH",
      body: JSON.stringify({ decision: "accept" }),
    });
    await rpc(jwt, "asan_commit_person_batch", { p_batch_id: bid });
    expect(Number(dbScalar("select count(*) from public.persons"))).toBe(personsBefore);
    const has = dbScalar(
      `select count(*)::text from public.person_identifiers pi
         join public.persons p on p.id=pi.person_id
        where p.display_name='[TEST-DIDAR] ${RUN} attach'
          and pi.kind='asan_person_code' and pi.status<>'revoked'`,
    );
    expect(Number(has)).toBe(1);
  });

  test("G7.7 Asan import regression: new/update/conflict still classify as before", async () => {
    const jwt = adminJwt();
    const existingCode = dbScalar(
      `select value_normalized from public.person_identifiers
        where kind='asan_person_code' and status<>'revoked' limit 1`,
    );
    const existingMobile = dbScalar(
      `select value_normalized from public.person_identifiers
        where kind='mobile_e164' and status<>'revoked'
          and person_id=(
            select person_id from public.person_identifiers
             where kind='asan_person_code' and value_normalized='${existingCode}'
               and status<>'revoked' limit 1
          ) limit 1`,
    );
    const batch = await rest<{ id: string }[]>(jwt, "/asan_import_batches", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        kind: "persons",
        file_name: `g7-asan-reg-${RUN}.xlsx`,
        row_count: 3,
        created_by: ADMIN_USER_ID,
      }),
    });
    const bid = batch.body[0].id;
    const freshMobile = `0912095${RUN.slice(-4)}`;
    const freshCode = `53${RUN.slice(-7)}`;
    await rest(jwt, "/asan_import_person_rows", {
      method: "POST",
      body: JSON.stringify([
        {
          batch_id: bid,
          row_number: 2,
          asan_code: freshCode,
          display_name: `[TEST-DIDAR] ${RUN} asan-new`,
          mobile_raw: freshMobile,
        },
        {
          batch_id: bid,
          row_number: 3,
          asan_code: existingCode,
          display_name: "keep",
          mobile_raw: existingMobile?.replace("+98", "0") ?? null,
        },
        {
          batch_id: bid,
          row_number: 4,
          asan_code: existingCode,
          display_name: "other",
          mobile_raw: `0912094${RUN.slice(-4)}`,
        },
      ]),
    });
    await rpc(jwt, "asan_classify_person_batch", { p_batch_id: bid });
    const classes = dbScalar(
      `select string_agg(classification, ',' order by row_number)
         from public.asan_import_person_rows where batch_id='${bid}'`,
    );
    expect(classes).toMatch(/^new,/);
    expect(classes).not.toContain("attach_code");
    const row2 = dbScalar(
      `select classification from public.asan_import_person_rows where batch_id='${bid}' and row_number=2`,
    );
    const row4 = dbScalar(
      `select classification from public.asan_import_person_rows where batch_id='${bid}' and row_number=4`,
    );
    expect(row2).toBe("new");
    expect(["conflict", "update", "unchanged"]).toContain(row4);
  });
});
