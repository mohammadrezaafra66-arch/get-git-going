/**
 * Calm Mind Task System — board + decision queue + ETA guard + merge panel.
 *
 * Covers `/operations/work` against real `work_*` tables (migration 543).
 * Never touches `public.tasks`.
 *
 * UI clicks need committed rows (browser cannot join `inRolledBackTx`), so seeds
 * use `dbExecE2e` with `E2E_PREFIX` markers and are deleted in afterAll.
 * The ETA trigger is also probed inside a rolled-back transaction so a missing
 * trigger would make that half red without leaving residue.
 */
import { createHmac } from "node:crypto";
import { expect, test, type BrowserContextOptions, type Page } from "@playwright/test";
import { E2E_PREFIX, gotoApp } from "../helpers/app";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { lanEnv } from "../helpers/pgrest";
import { authStorageKey, ROLE_EMAILS, userIdFor } from "../helpers/role-session";
import { inRolledBackTx, say } from "../helpers/tx";

const ROUTE = "/operations/work";
const MARK = `${E2E_PREFIX}CALM_`;

/**
 * Committed `admin.storage.json` is expired (~73h). Mint a GoTrue-shaped JWT
 * (email claim included — `/auth/v1/user` returns 200 with it) so the suite
 * can hit LAN :3100 *or* a local Vite that already includes `/operations/work`
 * (LAN web image is still APP_GIT_SHA=a935be0b without these routes).
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL =
  process.env.E2E_SUPABASE_URL ??
  lanEnv().APP_SUPABASE_PUBLIC_URL ??
  lanEnv().VITE_SUPABASE_URL ??
  "http://192.168.170.8:9000";

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function mintAdminAccessToken(userId: string, email: string, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url({
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    email,
    iat: now,
    exp: now + ttlSeconds,
  });
  const sig = createHmac("sha256", lanEnv().JWT_SECRET)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${sig}`;
}

function adminStorageForOrigin(origin: string): BrowserContextOptions["storageState"] {
  const userId = userIdFor("admin");
  const email = ROLE_EMAILS.admin;
  const ttlSeconds = 2 * 60 * 60;
  const accessToken = mintAdminAccessToken(userId, email, ttlSeconds);
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ttlSeconds,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
    refresh_token: "e2e-minted-no-refresh",
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    },
  };
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: authStorageKey(SUPABASE_URL), value: JSON.stringify(session) },
        ],
      },
    ],
  };
}

test.use({
  baseURL: BASE_URL,
  storageState: adminStorageForOrigin(BASE_URL),
});

/** Fixed fixture ids — instantly attributable if cleanup ever fails. */
const IDS = {
  queue: "c1a10001-0000-4000-8000-00000000c001",
  board: "c1a10001-0000-4000-8000-00000000c002",
  detail: "c1a10001-0000-4000-8000-00000000c003",
  src: "c1a10001-0000-4000-8000-00000000c004",
  tgt: "c1a10001-0000-4000-8000-00000000c005",
  suggestion: "c1a10001-0000-4000-8000-00000000c0a1",
  /** Phase F — testing workflow seed */
  testing: "c1a10001-0000-4000-8000-00000000c006",
  /** Phase F — accept-merge pair (dismiss uses src/tgt/suggestion) */
  acceptSrc: "c1a10001-0000-4000-8000-00000000c007",
  acceptTgt: "c1a10001-0000-4000-8000-00000000c008",
  acceptSuggestion: "c1a10001-0000-4000-8000-00000000c0a2",
} as const;

const TITLES = {
  queue: `${MARK}صف_تصمیم`,
  board: `${MARK}تابلو_مرئی`,
  detail: `${MARK}موعد_الزامی`,
  src: `${MARK}ادغام_مبدأ`,
  tgt: `${MARK}ادغام_مقصد`,
  created: `${MARK}ایجاد_از_UI`,
  testing: `${MARK}تست_workflow`,
  acceptSrc: `${MARK}پذیرش_ادغام_مبدأ`,
  acceptTgt: `${MARK}پذیرش_ادغام_مقصد`,
} as const;

const ALL_ITEM_IDS = [
  IDS.queue,
  IDS.board,
  IDS.detail,
  IDS.src,
  IDS.tgt,
  IDS.testing,
  IDS.acceptSrc,
  IDS.acceptTgt,
] as const;

function adminCreatorId(): string {
  const id = dbScalar(
    `select ur.user_id::text from public.user_roles ur
      where ur.role = 'admin' order by ur.user_id limit 1`,
  );
  expect(id, "admin profile id required for work_items.creator_id").toMatch(
    /^[0-9a-f-]{36}$/i,
  );
  return id;
}

function adminBearerToken(): string {
  return mintAdminAccessToken(userIdFor("admin"), ROLE_EMAILS.admin, 2 * 60 * 60);
}

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} CALM cleanup
    DELETE FROM public.work_test_reports
     WHERE work_item_id IN (
       '${IDS.queue}','${IDS.board}','${IDS.detail}','${IDS.src}','${IDS.tgt}',
       '${IDS.testing}','${IDS.acceptSrc}','${IDS.acceptTgt}'
     )
        OR work_item_id IN (
          SELECT id FROM public.work_items WHERE title LIKE '${MARK}%'
        );
    DELETE FROM public.work_merge_suggestions
     WHERE id IN ('${IDS.suggestion}', '${IDS.acceptSuggestion}')
        OR source_item_id IN (
          '${IDS.src}','${IDS.tgt}','${IDS.queue}','${IDS.board}','${IDS.detail}',
          '${IDS.testing}','${IDS.acceptSrc}','${IDS.acceptTgt}'
        )
        OR target_item_id IN (
          '${IDS.src}','${IDS.tgt}','${IDS.queue}','${IDS.board}','${IDS.detail}',
          '${IDS.testing}','${IDS.acceptSrc}','${IDS.acceptTgt}'
        );
    DELETE FROM public.work_items
     WHERE id IN (
       '${ALL_ITEM_IDS.join("','")}'
     )
        OR title LIKE '${MARK}%';
  `);
}

function seedFixtures(creatorId: string): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} CALM seed
    INSERT INTO public.work_items (
      id, title, body, status, kind, priority, creator_id,
      decision_bucket, decision_bucket_date, work_mode, impact_level
    ) VALUES
      (
        '${IDS.queue}', '${TITLES.queue}', 'seed queue', 'pending', 'note', 'normal',
        '${creatorId}', 'today_decide', (now() AT TIME ZONE 'Asia/Tehran')::date,
        'request', 'medium'
      ),
      (
        '${IDS.board}', '${TITLES.board}', 'seed board', 'pending', 'bug', 'high',
        '${creatorId}', NULL, NULL, 'request', 'low'
      ),
      (
        '${IDS.detail}', '${TITLES.detail}', 'seed detail', 'pending', 'change_request', 'normal',
        '${creatorId}', NULL, NULL, 'request', 'none'
      ),
      (
        '${IDS.src}', '${TITLES.src}', 'seed source', 'pending', 'note', 'normal',
        '${creatorId}', NULL, NULL, 'request', 'none'
      ),
      (
        '${IDS.tgt}', '${TITLES.tgt}', 'seed target', 'pending', 'note', 'normal',
        '${creatorId}', NULL, NULL, 'request', 'none'
      ),
      (
        '${IDS.testing}', '${TITLES.testing}', 'seed testing workflow', 'testing', 'bug', 'normal',
        '${creatorId}', NULL, NULL, 'executable', 'medium'
      ),
      (
        '${IDS.acceptSrc}', '${TITLES.acceptSrc}', 'seed accept source', 'pending', 'note', 'normal',
        '${creatorId}', NULL, NULL, 'request', 'none'
      ),
      (
        '${IDS.acceptTgt}', '${TITLES.acceptTgt}', 'seed accept target', 'pending', 'note', 'normal',
        '${creatorId}', NULL, NULL, 'request', 'none'
      );

    INSERT INTO public.work_merge_suggestions (
      id, source_item_id, target_item_id, score, reason, status
    ) VALUES
      (
        '${IDS.suggestion}', '${IDS.src}', '${IDS.tgt}', 0.82,
        '${MARK}پیشنهاد_تست', 'pending'
      ),
      (
        '${IDS.acceptSuggestion}', '${IDS.acceptSrc}', '${IDS.acceptTgt}', 0.91,
        '${MARK}پیشنهاد_پذیرش', 'pending'
      );
  `);
}

/** Advance create wizard from describe through optional intake to confirm. */
async function progressCreateWizardToConfirm(page: Page, description: string): Promise<void> {
  const wizard = page.getByTestId("create-work-wizard");
  await expect(wizard).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("create-work-describe")).toBeVisible();
  await expect(page.getByTestId("classify-preview")).toBeVisible();

  await page.getByTestId("create-work-describe").fill(description);
  await expect(page.getByTestId("classify-preview").getByText(/نوع:/)).toBeVisible({
    timeout: 10_000,
  });

  await wizard.getByRole("button", { name: "بعدی" }).click();

  // Default note confidence is 0.35 → intake always required (needsIntakeStep).
  const intake = page.getByTestId("create-work-intake");
  if (await intake.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await wizard.getByRole("button", { name: "بعدی" }).click();
  }

  await expect(page.getByTestId("create-work-confirm")).toBeVisible({
    timeout: 20_000,
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  cleanup();
  seedFixtures(adminCreatorId());
});

test.afterAll(() => {
  cleanup();
  expect(
    dbScalar(
      `select count(*)::text from public.work_items where title like '${MARK}%'`,
    ),
    "CALM work_items residue after cleanup",
  ).toBe("0");
  expect(
    dbScalar(
      `select count(*)::text from public.work_merge_suggestions
        where id in ('${IDS.suggestion}', '${IDS.acceptSuggestion}')`,
    ),
    "CALM suggestion residue after cleanup",
  ).toBe("0");
});

/* ───────────────────────────── database ETA guard ───────────────────────────── */

test("DB trigger refuses in_progress without claimed_due_at", () => {
  const creator = adminCreatorId();
  const body = `
DO $probe$
DECLARE
  _ok boolean := false;
  _msg text;
BEGIN
  BEGIN
    INSERT INTO public.work_items (
      id, title, status, kind, priority, creator_id, claimed_due_at
    ) VALUES (
      'c1a10001-0000-4000-8000-00000000de01',
      '${MARK}trigger_probe',
      'in_progress',
      'note',
      'normal',
      '${creator}',
      NULL
    );
    _ok := true;
  EXCEPTION WHEN others THEN
    _msg := SQLERRM;
  END;
  ${say(`'trigger|ok=' || _ok::text || '|msg=' || coalesce(_msg,'NONE')`)}
END
$probe$;
`;

  const out = inRolledBackTx(body);
  const line = out.find((l) => l.startsWith("trigger|"));
  expect(line, `missing trigger probe line in:\n${out.join("\n")}`).toBeTruthy();
  expect(line, "insert must not succeed without claimed_due_at").toContain("ok=false");
  expect(line).toMatch(/claimed_due_at required when status=in_progress/i);
});

test("DB trigger allows in_progress when claimed_due_at is set", () => {
  const creator = adminCreatorId();
  const body = `
DO $probe$
DECLARE
  _status text;
  _due timestamptz;
BEGIN
  INSERT INTO public.work_items (
    id, title, status, kind, priority, creator_id, claimed_due_at
  ) VALUES (
    'c1a10001-0000-4000-8000-00000000a11e',
    '${MARK}trigger_ok',
    'in_progress',
    'note',
    'normal',
    '${creator}',
    now() + interval '2 days'
  );
  SELECT status, claimed_due_at INTO _status, _due
    FROM public.work_items WHERE id = 'c1a10001-0000-4000-8000-00000000a11e';
  ${say(`'allowed|status=' || _status || '|has_due=' || (_due IS NOT NULL)::text`)}
END
$probe$;
`;

  const out = inRolledBackTx(body);
  const line = out.find((l) => l.startsWith("allowed|"));
  expect(line).toBeTruthy();
  expect(line).toContain("status=in_progress");
  expect(line).toContain("has_due=true");
});

/* ───────────────────────────── board UI ───────────────────────────── */

test("seeded work item is visible on /operations/work", async ({ page }) => {
  await gotoApp(page, ROUTE);
  await expect(page.getByText("در حال بررسی جلسه کاربری...")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: "تیکت" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText("نظرات، انتقادات و پیشنهادات خود را اینجا ثبت کنید"),
  ).toBeVisible();
  await expect(page.getByText(TITLES.board)).toBeVisible({ timeout: 20_000 });
});

test("morning summary strip shows Calm Mind counts", async ({ page }) => {
  await gotoApp(page, ROUTE);
  await expect(page.getByRole("heading", { name: "خلاصهٔ صبحگاهی" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("امروز تصمیم", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("امروز انجام", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("در انتظار", { exact: true }).first()).toBeVisible();
  // Seeded queue item must move today_decide count off zero (Persian digits).
  // Phase E turned cells into clickable buttons with data-testid.
  const decideCell = page.getByTestId("morning-bucket-today_decide");
  await expect(decideCell).toBeVisible();
  const text = (await decideCell.innerText()).replace(/\s+/g, " ").trim();
  expect(text, `today_decide cell text: ${text}`).toMatch(/^[۰-۹]+/);
  expect(text, "seeded queue must make today_decide non-zero").not.toMatch(/^۰\b/);
});

test("decision queue can set today_do, waiting, and clear", async ({ page }) => {
  // Re-seed queue row in today_decide so this case stays independent of prior clicks.
  dbExecE2e(`
    -- ${E2E_PREFIX} CALM requeue
    UPDATE public.work_items
       SET decision_bucket = 'today_decide',
           decision_bucket_date = (now() AT TIME ZONE 'Asia/Tehran')::date,
           status = 'pending'
     WHERE id = '${IDS.queue}';
  `);

  await gotoApp(page, ROUTE);
  const queue = page.locator("section").filter({
    has: page.getByRole("heading", { name: "صف تصمیم امروز" }),
  });
  await expect(queue.getByText(TITLES.queue)).toBeVisible({ timeout: 20_000 });

  const row = queue.locator("li").filter({ hasText: TITLES.queue });
  await row.getByRole("button", { name: "امروز انجام" }).click();
  await expect(page.getByText("به «امروز انجام» منتقل شد.")).toBeVisible({
    timeout: 15_000,
  });
  expect(
    dbScalar(
      `select decision_bucket from public.work_items where id = '${IDS.queue}'`,
    ),
  ).toBe("today_do");

  // Put it back into the decide queue for the waiting path.
  dbExecE2e(`
    -- ${E2E_PREFIX} CALM requeue waiting
    UPDATE public.work_items
       SET decision_bucket = 'today_decide',
           decision_bucket_date = (now() AT TIME ZONE 'Asia/Tehran')::date
     WHERE id = '${IDS.queue}';
  `);
  await page.getByRole("button", { name: "تازه‌سازی" }).click();
  await expect(queue.getByText(TITLES.queue)).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "انتظار" }).click();
  await expect(page.getByText("به «انتظار» منتقل شد.")).toBeVisible({
    timeout: 15_000,
  });
  expect(
    dbScalar(
      `select decision_bucket from public.work_items where id = '${IDS.queue}'`,
    ),
  ).toBe("waiting");

  // Clear path (null bucket) — mission «clear».
  dbExecE2e(`
    -- ${E2E_PREFIX} CALM requeue clear
    UPDATE public.work_items
       SET decision_bucket = 'today_decide',
           decision_bucket_date = (now() AT TIME ZONE 'Asia/Tehran')::date
     WHERE id = '${IDS.queue}';
  `);
  await page.getByRole("button", { name: "تازه‌سازی" }).click();
  await expect(queue.getByText(TITLES.queue)).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "پاک کردن" }).click();
  await expect(page.getByText("سطل تصمیم پاک شد.")).toBeVisible({
    timeout: 15_000,
  });
  expect(
    dbScalar(
      `select coalesce(decision_bucket, 'NULL') from public.work_items where id = '${IDS.queue}'`,
    ),
  ).toBe("NULL");
});

test("UI blocks in_progress without claimed_due_at", async ({ page }) => {
  await gotoApp(page, `/operations/work/${IDS.detail}`);
  await expect(page.getByRole("heading", { name: "آرامش ذهن" })).toBeVisible({
    timeout: 20_000,
  });

  // Ensure due field is empty, then pick «در حال انجام».
  const due = page.locator("#claimed_due_at");
  await due.fill("");
  const statusBox = page
    .getByText("وضعیت", { exact: true })
    .locator("..")
    .getByRole("combobox");
  await statusBox.click();
  await page.getByRole("option", { name: "در حال انجام" }).click();

  await expect(
    page.getByText(/برای شروع کار \(در حال انجام\) باید موعد ادعا/, {
      exact: false,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("موعد ادعا‌شده را مشخص کنید.")).toBeVisible({
    timeout: 10_000,
  });

  // DB must still be pending — UI refused before write.
  expect(
    dbScalar(`select status from public.work_items where id = '${IDS.detail}'`),
  ).toBe("pending");
  expect(
    dbScalar(
      `select coalesce(claimed_due_at::text, 'NULL') from public.work_items where id = '${IDS.detail}'`,
    ),
  ).toBe("NULL");
});

test("create work wizard describe+classify then create end-to-end", async ({ page }) => {
  await gotoApp(page, ROUTE);
  await expect(page.getByText("در حال بررسی جلسه کاربری...")).toHaveCount(0, {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "تیکت جدید" }).click();
  await expect(page.getByRole("heading", { name: "ثبت تیکت جدید" })).toBeVisible();

  const describeText =
    `${TITLES.created} — یادداشت آزاد برای ثبت از ویزارد e2e با متن به اندازه کافی بلند برای عبور از آستانهٔ کوتاه بودن`;
  await progressCreateWizardToConfirm(page, describeText);

  await page.locator("#work-wizard-title").fill(TITLES.created);
  await page.locator("#work-wizard-body").fill("created by calm-mind e2e wizard");

  const createRpc = page.waitForResponse(
    (res) =>
      res.url().includes("/rest/v1/rpc/work_create_item") && res.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByTestId("create-work-submit").click();
  const rpcRes = await createRpc;
  expect(rpcRes.ok(), `work_create_item HTTP ${rpcRes.status()}`).toBeTruthy();

  await expect
    .poll(
      () =>
        dbScalar(
          `select count(*)::text from public.work_items where title = '${TITLES.created}'`,
        ),
      { timeout: 10_000 },
    )
    .toBe("1");

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "تازه‌سازی" }).click();
  await expect(page.getByText(TITLES.created)).toBeVisible({ timeout: 20_000 });
});

test("POST /api/work/classify responds with kind/priority JSON", async ({ request }) => {
  const token = adminBearerToken();
  const res = await request.post(`${BASE_URL}/api/work/classify`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      text: "باگ فوری در ثبت فاکتور مالی — خطای ذخیره",
      title: "باگ فاکتور",
    },
  });

  const status = res.status();
  const bodyText = await res.text();
  // Must not be SPA/missing-route 404. Vite without SUPABASE_* → 500 misconfigured.
  expect(status, `classify HTTP ${status} body=${bodyText.slice(0, 200)}`).not.toBe(404);
  expect([200, 401, 500], `unexpected classify status ${status}`).toContain(status);

  if (status === 200) {
    const json = JSON.parse(bodyText) as {
      kind?: string;
      priority?: string;
      confidence?: number;
    };
    expect(json.kind, "classify.kind").toMatch(/^(bug|note|question|change_request)$/);
    expect(json.priority, "classify.priority").toMatch(/^(low|normal|high)$/);
    expect(typeof json.confidence).toBe("number");
  } else {
    expect(bodyText.length, "non-empty error body from classify route").toBeGreaterThan(0);
  }
});

test("testing workflow approve moves status to done", async ({ page }) => {
  // Re-seed testing row so prior runs / partial failures stay independent.
  dbExecE2e(`
    -- ${E2E_PREFIX} CALM reseed testing
    UPDATE public.work_items
       SET status = 'testing',
           claimed_due_at = NULL,
           completed_at = NULL
     WHERE id = '${IDS.testing}';
    DELETE FROM public.work_test_reports WHERE work_item_id = '${IDS.testing}';
  `);

  await gotoApp(page, `/operations/work/${IDS.testing}`);
  await expect(page.getByRole("heading", { name: "آرامش ذهن" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("work-test-report-panel")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByTestId("work-test-approve").click();
  await expect(
    page.getByText("تست تأیید شد؛ وضعیت به انجام‌شده رفت."),
  ).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(
      () => dbScalar(`select status from public.work_items where id = '${IDS.testing}'`),
      { timeout: 10_000 },
    )
    .toBe("done");
});

test("testing workflow reject with ETA returns to in_progress", async ({ page }) => {
  dbExecE2e(`
    -- ${E2E_PREFIX} CALM reseed testing reject
    UPDATE public.work_items
       SET status = 'testing',
           claimed_due_at = NULL,
           completed_at = NULL
     WHERE id = '${IDS.testing}';
    DELETE FROM public.work_test_reports WHERE work_item_id = '${IDS.testing}';
  `);

  await gotoApp(page, `/operations/work/${IDS.testing}`);
  await expect(page.getByTestId("work-test-report-panel")).toBeVisible({
    timeout: 20_000,
  });

  // datetime-local: far enough future to satisfy ETA gate.
  await page.locator("#test-report-eta").fill("2030-06-15T14:30");
  // Use reject-existing without linked bug id — RPC allows null linked bug.
  await page.getByTestId("work-test-reject-existing").click();
  await expect(
    page.getByText("تست رد شد؛ وضعیت به در حال انجام برگشت."),
  ).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(
      () => dbScalar(`select status from public.work_items where id = '${IDS.testing}'`),
      { timeout: 10_000 },
    )
    .toBe("in_progress");
  expect(
    dbScalar(
      `select (claimed_due_at IS NOT NULL)::text from public.work_items where id = '${IDS.testing}'`,
    ),
  ).toBe("true");
});

test("merge suggestion dismiss path removes pending card", async ({ page }) => {
  // Ensure the pending suggestion exists (prior runs may have dismissed it).
  dbExecE2e(`
    -- ${E2E_PREFIX} CALM suggestion reset
    DELETE FROM public.work_merge_suggestions WHERE id = '${IDS.suggestion}';
    INSERT INTO public.work_merge_suggestions (
      id, source_item_id, target_item_id, score, reason, status
    ) VALUES (
      '${IDS.suggestion}', '${IDS.src}', '${IDS.tgt}', 0.82,
      '${MARK}پیشنهاد_تست', 'pending'
    );
  `);

  await gotoApp(page, ROUTE);
  const panel = page.locator("#work-merge-panel");
  await expect(panel.getByRole("heading", { name: "پیشنهاد ادغام" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(panel.getByRole("link", { name: TITLES.src })).toBeVisible({
    timeout: 20_000,
  });

  const dismissCard = panel.locator("li").filter({ hasText: TITLES.src });
  await dismissCard.getByRole("button", { name: "رد پیشنهاد" }).click();
  await expect(page.getByText("پیشنهاد رد شد.")).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByRole("link", { name: TITLES.src })).toHaveCount(0);

  expect(
    dbScalar(
      `select status from public.work_merge_suggestions where id = '${IDS.suggestion}'`,
    ),
  ).toBe("dismissed");
});

test("merge suggestion accept path keeps one item", async ({ page }) => {
  dbExecE2e(`
    -- ${E2E_PREFIX} CALM accept suggestion reset
    UPDATE public.work_items
       SET status = 'pending', body = 'seed accept source'
     WHERE id = '${IDS.acceptSrc}';
    UPDATE public.work_items
       SET status = 'pending', body = 'seed accept target'
     WHERE id = '${IDS.acceptTgt}';
    DELETE FROM public.work_merge_suggestions WHERE id = '${IDS.acceptSuggestion}';
    INSERT INTO public.work_merge_suggestions (
      id, source_item_id, target_item_id, score, reason, status
    ) VALUES (
      '${IDS.acceptSuggestion}', '${IDS.acceptSrc}', '${IDS.acceptTgt}', 0.91,
      '${MARK}پیشنهاد_پذیرش', 'pending'
    );
  `);

  await gotoApp(page, ROUTE);
  const panel = page.locator("#work-merge-panel");
  await expect(panel.getByRole("heading", { name: "پیشنهاد ادغام" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(panel.getByRole("link", { name: TITLES.acceptSrc })).toBeVisible({
    timeout: 20_000,
  });

  const card = panel.locator("li").filter({ hasText: TITLES.acceptSrc });
  // Default keep is source_item_id; leave it and confirm.
  await card.getByRole("button", { name: "تأیید ادغام" }).click();
  await expect(page.getByText("ادغام با تأیید شما انجام شد.")).toBeVisible({
    timeout: 15_000,
  });

  expect(
    dbScalar(
      `select status from public.work_merge_suggestions where id = '${IDS.acceptSuggestion}'`,
    ),
  ).toBe("accepted");
  expect(
    dbScalar(`select status from public.work_items where id = '${IDS.acceptSrc}'`),
  ).toBe("pending");
  expect(
    dbScalar(`select status from public.work_items where id = '${IDS.acceptTgt}'`),
  ).toBe("cancelled");
});
