import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { BASE_URL, expectNoSevereConsoleErrors, saveEvidence } from "../helpers/app";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";

const ACCOUNTANT_STORAGE = "e2e/auth/accountant.storage.json";
const SALESPERSON_STORAGE = "e2e/auth/salesperson-a.storage.json";
const PREFIX_ROOT = "E2E_AUDIT_213_";
const CURRENT_MONTH_SQL = "date_trunc('month', current_date)::date";

const SALESPERSON_SCORE_VALUES: Record<string, string> = {
  salesperson_sales_amount_monthly: "800000000",
  salesperson_profit_monthly: "160000000",
  salesperson_inbound_calls: "400",
  salesperson_outbound_calls: "420",
  salesperson_talk_time_minutes: "2400",
};

const CUSTOMER_SCORE_VALUES_INITIAL: Record<string, string> = {
  customer_payment_discipline: "90",
  customer_cooperation_months: "120",
  customer_profit_3m: "450000000",
  customer_purchase_3m: "1800000000",
  customer_purchase_1y: "4500000000",
  customer_profit_1y: "900000000",
  customer_purchase_3y: "9000000000",
  customer_profit_3y: "2600000000",
};

const CUSTOMER_SCORE_VALUES_UPDATED: Record<string, string> = {
  ...CUSTOMER_SCORE_VALUES_INITIAL,
  customer_payment_discipline: "10",
};

type StorageSession = { accessToken: string; refreshToken: string };
type UserFingerprint = { id: string; email: string | null; role: string | null };
type FixtureIds = {
  prefix: string;
  salespersonId: string;
  customerId: string;
  noSalespersonCustomerId: string;
  overdueCustomerId: string;
  customerName: string;
  noSalespersonCustomerName: string;
  overdueCustomerName: string;
};
type ScoreSnapshotRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  parameter_id: string;
  raw_score: string | null;
  actual_value: string | null;
  is_clipped: boolean;
  note: string | null;
  scored_by: string | null;
  scored_at: string | null;
  period_month: string;
  created_at: string;
  updated_at: string;
};

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

function sqlText(value: string): string {
  return value.replace(/'/g, "''");
}

function parseJson<T>(sql: string): T {
  const out = dbScalar(sql);
  expect(out, `No JSON returned for SQL: ${sql}`).toBeTruthy();
  return JSON.parse(out) as T;
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number(value ?? 0);
  const normalized = value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^\d.-]/g, "");
  return Number(normalized || 0);
}

function readDotEnvValue(filePath: string, key: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match || match[1].trim() !== key) continue;
    return match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return null;
}

function readLanSupabaseEnv(): { url: string; key: string } {
  const envFiles = [
    path.resolve(".env.e2e.local"),
    path.resolve("deploy/lan/.env.lan"),
    path.resolve(".env.local"),
    path.resolve(".env"),
  ];
  const read = (names: string[]) => {
    for (const file of envFiles) {
      for (const name of names) {
        const value = readDotEnvValue(file, name);
        if (value) return value;
      }
    }
    return "";
  };
  const url =
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    read(["VITE_SUPABASE_URL", "API_EXTERNAL_URL"]);
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    read(["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY", "ANON_KEY"]);
  expect(url, "Missing LAN Supabase URL").toBeTruthy();
  expect(key, "Missing LAN Supabase publishable key").toBeTruthy();
  return { url: url.replace(/\/$/, ""), key };
}

function readSessionFromStorage(storageFile: string): StorageSession {
  const state = JSON.parse(fs.readFileSync(storageFile, "utf8")) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  for (const origin of state.origins ?? []) {
    for (const item of origin.localStorage ?? []) {
      if (!item.name.includes("auth-token") && !item.name.includes("sb-")) continue;
      try {
        const parsed = JSON.parse(item.value) as {
          access_token?: string;
          refresh_token?: string;
          currentSession?: { access_token?: string; refresh_token?: string };
        };
        const accessToken = parsed.access_token ?? parsed.currentSession?.access_token;
        const refreshToken = parsed.refresh_token ?? parsed.currentSession?.refresh_token;
        if (accessToken && refreshToken) return { accessToken, refreshToken };
      } catch {
        // Ignore unrelated localStorage entries.
      }
    }
  }
  throw new Error(`${storageFile} does not contain a usable Supabase session`);
}

async function authedClient(storageFile: string): Promise<SupabaseClient> {
  const { url, key } = readLanSupabaseEnv();
  const session = readSessionFromStorage(storageFile);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  expect(error, `Unable to hydrate session from ${storageFile}`).toBeNull();
  return client;
}

async function readUserFingerprint(page: Page): Promise<UserFingerprint> {
  return page.evaluate(() => {
    const raw = localStorage.getItem(Object.keys(localStorage).find((k) => k.includes("auth-token")) ?? "");
    const parsed = raw ? JSON.parse(raw) : {};
    const user = parsed.user ?? parsed.currentSession?.user;
    return {
      id: user?.id ?? "",
      email: user?.email ?? null,
      role: null,
    };
  });
}

async function openAccountantPage(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: ACCOUNTANT_STORAGE,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  });
  const page = await context.newPage();
  await expectNoSevereConsoleErrors(page, testInfo);
  return page;
}

async function saveScore(page: Page, code: string, value: string): Promise<void> {
  const input = page.getByTestId(`score-input-${code}`);
  await expect(input, `Missing score input for ${code}`).toBeVisible();
  await input.scrollIntoViewIfNeeded();
  await input.fill(value);
  const save = page.getByTestId(`score-save-${code}`);
  await save.scrollIntoViewIfNeeded();
  await expect(save, `Save button for ${code} did not become enabled`).toBeEnabled();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/rest/v1/dynamic_entity_scores") &&
      ["POST", "PATCH"].includes(response.request().method()),
    { timeout: 10_000 },
  );
  await save.click();
  const response = await responsePromise;
  const responseBody = response.ok() ? "" : await response.text();
  expect(
    response.ok(),
    `Score save request for ${code} failed with ${response.status()} ${response.request().method()} ${response.url()}: ${responseBody}`,
  ).toBeTruthy();
}

async function saveScoreSet(page: Page, scores: Record<string, string>): Promise<void> {
  for (const [code, value] of Object.entries(scores)) {
    await saveScore(page, code, value);
  }
}

function snapshotSalespersonScores(salespersonId: string): ScoreSnapshotRow[] {
  return parseJson<ScoreSnapshotRow[]>(`
    SELECT COALESCE(json_agg(row_to_json(s) ORDER BY s.parameter_id), '[]'::json)::text
      FROM public.dynamic_entity_scores s
     WHERE s.entity_type = 'salesperson'
       AND s.entity_id = '${salespersonId}'::uuid
       AND s.period_month = ${CURRENT_MONTH_SQL}
  `);
}

function clearSalespersonScoresForTest(prefix: string, salespersonId: string): void {
  dbExecE2e(`
    -- ${prefix} isolate salesperson current-month scores after snapshot.
    DELETE FROM public.dynamic_entity_scores
     WHERE entity_type = 'salesperson'
       AND entity_id = '${salespersonId}'::uuid
       AND period_month = ${CURRENT_MONTH_SQL};
  `);
}

function restoreSalespersonScores(prefix: string, salespersonId: string, snapshot: ScoreSnapshotRow[]): void {
  const values = snapshot
    .map(
      (r) => `(
        '${r.id}'::uuid,
        '${sqlText(r.entity_type)}',
        '${r.entity_id}'::uuid,
        '${r.parameter_id}'::uuid,
        ${r.raw_score === null ? "NULL" : r.raw_score},
        ${r.actual_value === null ? "NULL" : r.actual_value},
        ${r.is_clipped ? "true" : "false"},
        ${r.note === null ? "NULL" : `'${sqlText(r.note)}'`},
        ${r.scored_by === null ? "NULL" : `'${r.scored_by}'::uuid`},
        ${r.scored_at === null ? "now()" : `'${r.scored_at}'::timestamptz`},
        '${r.period_month}'::date
      )`,
    )
    .join(",\n");
  dbExecE2e(`
    -- ${prefix} restore salesperson score snapshot.
    DELETE FROM public.dynamic_entity_scores
     WHERE entity_type = 'salesperson'
       AND entity_id = '${salespersonId}'::uuid
       AND period_month = ${CURRENT_MONTH_SQL};

    ${values ? `
      INSERT INTO public.dynamic_entity_scores(
        id, entity_type, entity_id, parameter_id, raw_score, actual_value,
        is_clipped, note, scored_by, scored_at, period_month
      )
      VALUES ${values};
    ` : ""}
  `);
}

function cleanup(prefix: string, fixture: FixtureIds | null, salespersonSnapshot: ScoreSnapshotRow[]): void {
  const ids = fixture
    ? [
        fixture.customerId,
        fixture.noSalespersonCustomerId,
        fixture.overdueCustomerId,
        fixture.salespersonId,
      ]
    : [];
  const idTextPredicate = ids.length
    ? ids.map((id) => `COALESCE(diff::text, '') LIKE '%${id}%'`).join(" OR ")
    : "false";

  try {
    if (fixture) {
      dbExecE2e(`
        -- ${prefix} cleanup generated audit rows and fixture graph.
        DELETE FROM public.audit_logs
         WHERE COALESCE(diff::text, '') LIKE '%${prefix}%'
            OR entity_id LIKE '%${prefix}%'
            OR ${idTextPredicate};

        DELETE FROM public.customer_capital_allocations_dynamic
         WHERE customer_id IN (
          '${fixture.customerId}'::uuid,
          '${fixture.noSalespersonCustomerId}'::uuid,
          '${fixture.overdueCustomerId}'::uuid
         )
            OR capital_setting_id IN (
              SELECT id FROM public.daily_capital_settings
               WHERE COALESCE(notes, '') LIKE '%${prefix}%'
                  OR capital_date = current_date
            );

        DELETE FROM public.salesperson_capital_allocations_dynamic
         WHERE capital_setting_id IN (
              SELECT id FROM public.daily_capital_settings
               WHERE COALESCE(notes, '') LIKE '%${prefix}%'
                  OR capital_date = current_date
            );

        DELETE FROM public.daily_capital_settings
         WHERE COALESCE(notes, '') LIKE '%${prefix}%'
            OR capital_date = current_date;

        DELETE FROM public.customer_credit_balance
         WHERE customer_id IN (
          '${fixture.customerId}'::uuid,
          '${fixture.noSalespersonCustomerId}'::uuid,
          '${fixture.overdueCustomerId}'::uuid
         );

        DELETE FROM public.customer_credit_profile
         WHERE customer_id IN (
          '${fixture.customerId}'::uuid,
          '${fixture.noSalespersonCustomerId}'::uuid,
          '${fixture.overdueCustomerId}'::uuid
         );

        DELETE FROM public.dynamic_entity_scores
         WHERE (entity_type = 'customer'
           AND entity_id IN (
            '${fixture.customerId}'::uuid,
            '${fixture.noSalespersonCustomerId}'::uuid,
            '${fixture.overdueCustomerId}'::uuid
           ))
            OR (entity_type = 'salesperson'
              AND entity_id = '${fixture.salespersonId}'::uuid
              AND period_month = ${CURRENT_MONTH_SQL});

        DELETE FROM public.customers
         WHERE id IN (
          '${fixture.customerId}'::uuid,
          '${fixture.noSalespersonCustomerId}'::uuid,
          '${fixture.overdueCustomerId}'::uuid
         )
            OR name LIKE '%${prefix}%';

        DELETE FROM public.persons
         WHERE display_name LIKE '%${prefix}%';
      `);
      restoreSalespersonScores(prefix, fixture.salespersonId, salespersonSnapshot);
    }
  } finally {
    if (fixture) {
      const remaining = parseJson<Record<string, number>>(`
        SELECT json_build_object(
          'customers', (SELECT count(*) FROM public.customers WHERE name LIKE '%${prefix}%'),
          'customer_scores', (SELECT count(*) FROM public.dynamic_entity_scores WHERE entity_type='customer' AND entity_id IN ('${fixture.customerId}'::uuid, '${fixture.noSalespersonCustomerId}'::uuid, '${fixture.overdueCustomerId}'::uuid)),
          'daily_settings', (SELECT count(*) FROM public.daily_capital_settings WHERE COALESCE(notes, '') LIKE '%${prefix}%' OR capital_date = current_date),
          'customer_allocations', (SELECT count(*) FROM public.customer_capital_allocations_dynamic WHERE customer_id IN ('${fixture.customerId}'::uuid, '${fixture.noSalespersonCustomerId}'::uuid, '${fixture.overdueCustomerId}'::uuid)),
          'audit_logs', (SELECT count(*) FROM public.audit_logs WHERE COALESCE(diff::text, '') LIKE '%${prefix}%' OR entity_id LIKE '%${prefix}%')
        )::text
      `);
      expect(remaining).toEqual({
        customers: 0,
        customer_scores: 0,
        daily_settings: 0,
        customer_allocations: 0,
        audit_logs: 0,
      });
    }
  }
}

function runSafetyPrecheck(prefix: string, salespersonId: string): { classification: string; todaySettings: number } {
  const precheck = parseJson<{
    today_settings: number;
    non_test_today_settings: number;
    ledger_rows: number;
    salesperson_scores: number;
  }>(`
    SELECT json_build_object(
      'today_settings', (SELECT count(*) FROM public.daily_capital_settings WHERE capital_date = current_date),
      'non_test_today_settings', (
        SELECT count(*) FROM public.daily_capital_settings
         WHERE capital_date = current_date
           AND COALESCE(notes, '') NOT LIKE '%E2E_AUDIT_213_%'
      ),
      'ledger_rows', (
        SELECT count(*) FROM public.zz_retired_capital_allocation_ledger l
         WHERE EXISTS (
          SELECT 1 FROM public.customer_capital_allocations_dynamic c
           WHERE c.id = l.allocation_id
             AND c.capital_setting_id IN (
              SELECT id FROM public.daily_capital_settings WHERE capital_date = current_date
             )
         )
         OR EXISTS (
          SELECT 1 FROM public.salesperson_capital_allocations_dynamic s
           WHERE s.id = l.allocation_id
             AND s.capital_setting_id IN (
              SELECT id FROM public.daily_capital_settings WHERE capital_date = current_date
             )
         )
      ),
      'salesperson_scores', (
        SELECT count(*) FROM public.dynamic_entity_scores
         WHERE entity_type = 'salesperson'
           AND entity_id = '${salespersonId}'::uuid
           AND period_month = ${CURRENT_MONTH_SQL}
      )
    )::text
  `);

  if (precheck.today_settings > 0 || precheck.non_test_today_settings > 0 || precheck.ledger_rows > 0) {
    throw new Error(
      `${prefix} BLOCKED_UNSAFE: today_settings=${precheck.today_settings}, non_test_today_settings=${precheck.non_test_today_settings}, ledger_rows=${precheck.ledger_rows}`,
    );
  }
  return {
    classification: precheck.salesperson_scores > 0 ? "SAFE_WITH_SNAPSHOT_RESTORE" : "SAFE_ISOLATED",
    todaySettings: precheck.today_settings,
  };
}

function createFixtures(prefix: string, salespersonId: string): FixtureIds {
  const fixture: FixtureIds = {
    prefix,
    salespersonId,
    customerId: randomUUID(),
    noSalespersonCustomerId: randomUUID(),
    overdueCustomerId: randomUUID(),
    customerName: `${prefix} customer`,
    noSalespersonCustomerName: `${prefix} no salesperson`,
    overdueCustomerName: `${prefix} overdue`,
  };
  // customers.person_id is NOT NULL, so every customer needs a person row first.
  const personIds = {
    main: randomUUID(),
    noSalesperson: randomUUID(),
    overdue: randomUUID(),
  };
  dbExecE2e(`
    -- ${prefix} isolated persons, customers and credit profiles.
    INSERT INTO public.persons(id, kind, display_name, visibility_scope, is_active)
    VALUES
      ('${personIds.main}'::uuid, 'individual', '${sqlText(fixture.customerName)}', 'internal_general', true),
      ('${personIds.noSalesperson}'::uuid, 'individual', '${sqlText(fixture.noSalespersonCustomerName)}', 'internal_general', true),
      ('${personIds.overdue}'::uuid, 'individual', '${sqlText(fixture.overdueCustomerName)}', 'internal_general', true);

    INSERT INTO public.customers(id, name, phone, person_id, is_active, responsible_id, notes)
    VALUES
      ('${fixture.customerId}'::uuid, '${sqlText(fixture.customerName)}', '09900000001', '${personIds.main}'::uuid, true, '${salespersonId}'::uuid, '${prefix} main customer'),
      ('${fixture.noSalespersonCustomerId}'::uuid, '${sqlText(fixture.noSalespersonCustomerName)}', '09900000002', '${personIds.noSalesperson}'::uuid, true, NULL, '${prefix} no salesperson customer'),
      ('${fixture.overdueCustomerId}'::uuid, '${sqlText(fixture.overdueCustomerName)}', '09900000003', '${personIds.overdue}'::uuid, true, '${salespersonId}'::uuid, '${prefix} overdue customer');

    INSERT INTO public.customer_credit_profile(customer_id, credit_limit, credit_score, has_overdue)
    VALUES
      ('${fixture.customerId}'::uuid, 1000000000, 0, false),
      ('${fixture.noSalespersonCustomerId}'::uuid, 1000000000, 0, false),
      ('${fixture.overdueCustomerId}'::uuid, 1000000000, 0, true);
  `);
  return fixture;
}

async function rpcJson(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn as never, args as never);
  expect(error, `${fn} failed: ${error?.message ?? ""}`).toBeNull();
  return data as Record<string, unknown>;
}

async function waitForWeightedScore(
  client: SupabaseClient,
  entityType: "customer" | "salesperson",
  entityId: string,
): Promise<number> {
  let latest = 0;
  await expect
    .poll(async () => {
      const score = await rpcJson(client, "calculate_dynamic_score", {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_period_month: new Date().toISOString().slice(0, 10),
      });
      latest = parseNumber(score.weighted_score);
      return latest;
    })
    .toBeGreaterThan(0);
  return latest;
}

test("Requirement 213 dynamic customer credit scoring and recompute is proven end-to-end", async ({
  browser,
}, testInfo) => {
  const prefix = `${PREFIX_ROOT}${Date.now()}_`;
  let fixture: FixtureIds | null = null;
  let salespersonSnapshot: ScoreSnapshotRow[] = [];
  const diagnostics: Record<string, unknown> = { prefix };

  const page = await openAccountantPage(browser, testInfo);
  const accountantClient = await authedClient(ACCOUNTANT_STORAGE);
  const salespersonClient = await authedClient(SALESPERSON_STORAGE);

  try {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/);

    const salespersonPage = await browser.newPage({
      baseURL: BASE_URL,
      storageState: SALESPERSON_STORAGE,
      locale: "fa-IR",
      timezoneId: "Asia/Tehran",
    });
    await salespersonPage.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const salesperson = await readUserFingerprint(salespersonPage);
    await salespersonPage.close();
    expect(salesperson.id, "salesperson-a storageState has no user id").toBeTruthy();

    const safety = runSafetyPrecheck(prefix, salesperson.id);
    diagnostics.safety = safety;
    salespersonSnapshot = snapshotSalespersonScores(salesperson.id);
    clearSalespersonScoresForTest(prefix, salesperson.id);
    fixture = createFixtures(prefix, salesperson.id);
    diagnostics.fixture = fixture;

    await testInfo.attach("213-safety-precheck", {
      body: JSON.stringify({ safety, salespersonScoreSnapshotRows: salespersonSnapshot.length }, null, 2),
      contentType: "application/json",
    });

    await page.goto("/accounting/salesperson-scoring", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "امتیازدهی کارشناسان فروش" })).toBeVisible();
    await page.getByTestId("salesperson-scoring-select").click();
    await page.getByRole("option", { name: /test\.sales@afrakala\.local/ }).click();
    await expect(page.getByTestId("dynamic-score-card-salesperson")).toBeVisible();
    await saveScoreSet(page, SALESPERSON_SCORE_VALUES);
    await expect
      .poll(() =>
        parseNumber(
          dbScalar(`
            SELECT count(*)::text
              FROM public.dynamic_entity_scores
             WHERE entity_type = 'salesperson'
               AND entity_id = '${salesperson.id}'::uuid
               AND period_month = ${CURRENT_MONTH_SQL}
               AND actual_value IS NOT NULL
          `),
        ),
      )
      .toBeGreaterThanOrEqual(Object.keys(SALESPERSON_SCORE_VALUES).length);

    await waitForWeightedScore(accountantClient, "salesperson", salesperson.id);

    await page.goto(`/sales/customers/${fixture.customerId}/credit`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(fixture.customerName)).toBeVisible();
    await expect(page.getByTestId("dynamic-score-card-customer")).toBeVisible();
    await saveScoreSet(page, CUSTOMER_SCORE_VALUES_INITIAL);
    await expect
      .poll(() =>
        parseNumber(
          dbScalar(`
            SELECT count(*)::text
              FROM public.dynamic_entity_scores
             WHERE entity_type = 'customer'
               AND entity_id = '${fixture!.customerId}'::uuid
               AND period_month = ${CURRENT_MONTH_SQL}
               AND actual_value IS NOT NULL
          `),
        ),
      )
      .toBeGreaterThanOrEqual(Object.keys(CUSTOMER_SCORE_VALUES_INITIAL).length);

    const initialWeighted = await waitForWeightedScore(
      accountantClient,
      "customer",
      fixture.customerId,
    );

    const scoreRows = parseNumber(
      dbScalar(`
        SELECT count(*)::text
          FROM public.dynamic_entity_scores
         WHERE period_month = ${CURRENT_MONTH_SQL}
           AND (
            (entity_type = 'salesperson' AND entity_id = '${salesperson.id}'::uuid)
            OR (entity_type = 'customer' AND entity_id = '${fixture.customerId}'::uuid)
           )
      `),
    );
    expect(scoreRows).toBeGreaterThan(0);

    await page.goto("/accounting/dynamic-capital", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "تخصیص سرمایه روزانه" })).toBeVisible();
    await page.getByTestId("dynamic-capital-total-input").fill("1000000000");
    const runButton = page.getByTestId("dynamic-capital-run-button");
    await expect(runButton).toBeEnabled({ timeout: 10_000 });
    await runButton.click();

    await expect
      .poll(() =>
        parseNumber(
          dbScalar(`
            SELECT count(*)::text
              FROM public.daily_capital_settings
             WHERE capital_date = current_date
          `),
        ),
      )
      .toBe(1);

    const settingId = dbScalar(`
      SELECT id::text FROM public.daily_capital_settings
       WHERE capital_date = current_date
       ORDER BY created_at DESC LIMIT 1
    `);
    diagnostics.settingId = settingId;

    const spAllocationInitial = parseJson<{ allocated_capital: number; weighted_score: number }>(`
      SELECT row_to_json(x)::text
        FROM (
          SELECT allocated_capital::numeric AS allocated_capital,
                 weighted_score::numeric AS weighted_score
            FROM public.salesperson_capital_allocations_dynamic
           WHERE capital_setting_id = '${settingId}'::uuid
             AND salesperson_id = '${salesperson.id}'::uuid
        ) x
    `);
    expect(parseNumber(spAllocationInitial.allocated_capital)).toBeGreaterThan(0);

    const customerAllocationInitial = parseJson<{
      final_limit: number;
      weighted_score: number;
      binding_constraint: string;
    }>(`
      SELECT row_to_json(x)::text
        FROM (
          SELECT final_limit::numeric AS final_limit,
                 weighted_score::numeric AS weighted_score,
                 binding_constraint
            FROM public.customer_capital_allocations_dynamic
           WHERE capital_setting_id = '${settingId}'::uuid
             AND customer_id = '${fixture.customerId}'::uuid
        ) x
    `);
    expect(parseNumber(customerAllocationInitial.final_limit)).toBeGreaterThan(0);
    expect(["formula", "credit_limit"]).toContain(customerAllocationInitial.binding_constraint);

    await page.goto(`/sales/customers/${fixture.customerId}/credit`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("customer-realtime-credit-final-limit")).toBeVisible();
    await expect
      .poll(async () => parseNumber(await page.getByTestId("customer-weighted-score").innerText()))
      .toBeGreaterThan(0);
    await expect
      .poll(async () => parseNumber(await page.getByTestId("customer-realtime-credit-final-limit").innerText()))
      .toBeGreaterThan(0);
    await expect(page.getByTestId("customer-credit-binding-constraint")).not.toContainText(/بدون سرمایه|بدون کارشناس|معوقه/);
    await saveEvidence(page, testInfo, "213-initial-customer-credit");

    const realtimeInitial = await rpcJson(accountantClient, "calculate_customer_realtime_credit", {
      p_customer_id: fixture.customerId,
    });
    expect(parseNumber(realtimeInitial.final_limit)).toBeGreaterThan(0);
    expect(realtimeInitial.binding_constraint).not.toBe("no_capital");
    expect(realtimeInitial.binding_constraint).not.toBe("no_salesperson");
    expect(realtimeInitial.binding_constraint).not.toBe("overdue");

    await saveScore(page, "customer_payment_discipline", CUSTOMER_SCORE_VALUES_UPDATED.customer_payment_discipline);
    await expect
      .poll(() =>
        parseNumber(
          dbScalar(`
            SELECT COALESCE(actual_value, -1)::text
              FROM public.dynamic_entity_scores s
              JOIN public.dynamic_scoring_parameters p ON p.id = s.parameter_id
             WHERE s.entity_type = 'customer'
               AND s.entity_id = '${fixture.customerId}'::uuid
               AND s.period_month = ${CURRENT_MONTH_SQL}
               AND p.code = 'customer_payment_discipline'
             LIMIT 1
          `),
        ),
      )
      .toBe(parseNumber(CUSTOMER_SCORE_VALUES_UPDATED.customer_payment_discipline));
    await expect
      .poll(async () => {
        const changed = await rpcJson(accountantClient, "calculate_dynamic_score", {
          p_entity_type: "customer",
          p_entity_id: fixture!.customerId,
          p_period_month: new Date().toISOString().slice(0, 10),
        });
        return parseNumber(changed.weighted_score);
      })
      .not.toBe(initialWeighted);

    await page.reload({ waitUntil: "domcontentloaded" });
    const customerScoreUpdated = await rpcJson(accountantClient, "calculate_dynamic_score", {
      p_entity_type: "customer",
      p_entity_id: fixture.customerId,
      p_period_month: new Date().toISOString().slice(0, 10),
    });
    const updatedWeighted = parseNumber(customerScoreUpdated.weighted_score);
    expect(updatedWeighted).not.toBe(initialWeighted);

    const customerAllocationUpdated = parseJson<{
      final_limit: number;
      weighted_score: number;
      binding_constraint: string;
    }>(`
      SELECT row_to_json(x)::text
        FROM (
          SELECT final_limit::numeric AS final_limit,
                 weighted_score::numeric AS weighted_score,
                 binding_constraint
            FROM public.customer_capital_allocations_dynamic
           WHERE capital_setting_id = '${settingId}'::uuid
             AND customer_id = '${fixture.customerId}'::uuid
        ) x
    `);
    expect(parseNumber(customerAllocationUpdated.weighted_score)).toBeCloseTo(updatedWeighted, 3);

    const realtimeUpdated = await rpcJson(accountantClient, "calculate_customer_realtime_credit", {
      p_customer_id: fixture.customerId,
    });
    expect(parseNumber(realtimeUpdated.weighted_score)).toBeCloseTo(updatedWeighted, 3);

    const recomputeAuditCount = parseNumber(
      dbScalar(`
        SELECT count(*)::text FROM public.audit_logs
         WHERE action = 'dynamic_capital_recomputed'
           AND entity_type = 'daily_capital_setting'
           AND entity_id = '${settingId}'
      `),
    );
    expect(recomputeAuditCount).toBeGreaterThan(0);

    const noSalespersonRealtime = await rpcJson(accountantClient, "calculate_customer_realtime_credit", {
      p_customer_id: fixture.noSalespersonCustomerId,
    });
    expect(parseNumber(noSalespersonRealtime.final_limit)).toBe(0);
    expect(noSalespersonRealtime.binding_constraint).toBe("no_salesperson");

    await page.goto(`/sales/customers/${fixture.noSalespersonCustomerId}/credit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("این مشتری به هیچ کارشناسی متصل نیست")).toBeVisible();
    await saveEvidence(page, testInfo, "213-no-salesperson");

    const overdueRealtime = await rpcJson(accountantClient, "calculate_customer_realtime_credit", {
      p_customer_id: fixture.overdueCustomerId,
    });
    expect(parseNumber(overdueRealtime.final_limit)).toBe(0);
    expect(overdueRealtime.binding_constraint).toBe("overdue");

    await page.goto(`/sales/customers/${fixture.overdueCustomerId}/credit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("customer-credit-binding-constraint")).toContainText(/معوق/);
    await saveEvidence(page, testInfo, "213-overdue");

    const salesContext = await browser.newContext({
      baseURL: BASE_URL,
      storageState: SALESPERSON_STORAGE,
      locale: "fa-IR",
      timezoneId: "Asia/Tehran",
    });
    const salesPage = await salesContext.newPage();
    for (const protectedRoute of [
      "/sales/credit-rules",
      "/accounting/dynamic-capital",
      "/accounting/salesperson-scoring",
    ]) {
      await salesPage.goto(protectedRoute, { waitUntil: "domcontentloaded" });
      await expect(salesPage.getByText(/قوانین امتیازدهی|تخصیص سرمایه روزانه|امتیازدهی کارشناسان فروش/)).toHaveCount(0);
    }
    await salesContext.close();

    const beforeUnauthorized = parseNumber(
      dbScalar(`
        SELECT count(*)::text FROM public.dynamic_entity_scores
         WHERE entity_type = 'customer'
           AND entity_id = '${fixture.noSalespersonCustomerId}'::uuid
           AND period_month = ${CURRENT_MONTH_SQL}
      `),
    );
    const customerParamId = dbScalar(`
      SELECT id::text FROM public.dynamic_scoring_parameters
       WHERE entity_type = 'customer'
         AND code = 'customer_payment_discipline'
       LIMIT 1
    `);
    const unauthorized = await salespersonClient
      .from("dynamic_entity_scores")
      .upsert({
        entity_type: "customer",
        entity_id: fixture.noSalespersonCustomerId,
        parameter_id: customerParamId,
        period_month: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          .toISOString()
          .slice(0, 10),
        raw_score: 1,
        actual_value: 100,
      });
    expect(unauthorized.error, "salesperson write unexpectedly succeeded").toBeTruthy();
    const afterUnauthorized = parseNumber(
      dbScalar(`
        SELECT count(*)::text FROM public.dynamic_entity_scores
         WHERE entity_type = 'customer'
           AND entity_id = '${fixture.noSalespersonCustomerId}'::uuid
           AND period_month = ${CURRENT_MONTH_SQL}
      `),
    );
    expect(afterUnauthorized).toBe(beforeUnauthorized);

    await page.goto(`/sales/customers/${fixture.customerId}/credit`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("customer-realtime-credit-final-limit")).toBeVisible();
    const duplicateScores = parseNumber(
      dbScalar(`
        SELECT COALESCE(max(c), 0)::text
          FROM (
            SELECT parameter_id, count(*) c
              FROM public.dynamic_entity_scores
             WHERE entity_type = 'customer'
               AND entity_id = '${fixture.customerId}'::uuid
               AND period_month = ${CURRENT_MONTH_SQL}
             GROUP BY parameter_id
          ) x
      `),
    );
    expect(duplicateScores).toBeLessThanOrEqual(1);

    diagnostics.initialWeightedScore = initialWeighted;
    diagnostics.updatedWeightedScore = updatedWeighted;
    diagnostics.initialSalespersonAllocation = spAllocationInitial;
    diagnostics.initialCustomerAllocation = customerAllocationInitial;
    diagnostics.updatedCustomerAllocation = customerAllocationUpdated;
    diagnostics.initialRealtimeCredit = realtimeInitial;
    diagnostics.updatedRealtimeCredit = realtimeUpdated;
    diagnostics.noSalespersonRealtime = noSalespersonRealtime;
    diagnostics.overdueRealtime = overdueRealtime;
    diagnostics.recomputeAuditCount = recomputeAuditCount;

    await testInfo.attach("213-final-diagnostics", {
      body: JSON.stringify(diagnostics, null, 2),
      contentType: "application/json",
    });
  } finally {
    await saveEvidence(page, testInfo, "213-final-page").catch(() => undefined);
    cleanup(prefix, fixture, salespersonSnapshot);
    await page.context().close();
  }
});
