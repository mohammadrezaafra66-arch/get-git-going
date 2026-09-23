/**
 * Wave 1 / A3 · BUILD — ticket history (`work_item_events` + «سابقه»).
 *
 * Before the migration the catalog returned NULL for
 * `to_regclass('public.work_item_events')` (recorded in
 * docs/missions/salesdesk-9-fixes/evidence/W1/a3-before.txt). After 560 the
 * table and trigger exist; the detail page must also surface «سابقه».
 *
 * Pass condition (mission brief): table exists OR the UI timeline shows a
 * change after a status update. Both paths are asserted separately so a
 * schema-only land cannot hide a missing UI, and a UI-only land cannot hide
 * a missing table.
 *
 * Run:
 *   $env:AFRAKALA_LAN_ENV='D:\AfraKalaTest\app\deploy\lan\.env.lan'
 *   $env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\AFRA\AppData\Local\ms-playwright'
 *   $env:E2E_BASE_URL='http://192.168.170.8:3100'
 *   cmd /c "node_modules\.bin\playwright.cmd test --config=docs/missions/salesdesk-9-fixes/evidence/W1/playwright.w1.config.ts e2e/missions/salesdesk-9-fixes-w1-a3-history.spec.ts"
 */
import { expect, test } from "@playwright/test";

import { dbScalar } from "../helpers/db";
import { storageStateForRole } from "../helpers/role-session";
import { inRolledBackTx } from "../helpers/tx";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE = process.env.E2E_SUPABASE_URL ?? "http://192.168.170.8:9000";

const EXPECTED_COLS = [
  "id",
  "work_item_id",
  "actor_id",
  "event_at",
  "field",
  "old_value",
  "new_value",
];

function tableExists(): boolean {
  return dbScalar(`SELECT to_regclass('public.work_item_events') IS NOT NULL`) === "t";
}

test.describe("W1 A3 — work_item_events schema", () => {
  test("public.work_item_events exists with CONTRACTS columns", () => {
    expect(
      tableExists(),
      "work_item_events must exist after migration 560 (was NULL before — see a3-before.txt)",
    ).toBe(true);

    const cols = dbScalar(
      `SELECT string_agg(column_name, ',' ORDER BY column_name)
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'work_item_events'`,
    );
    for (const c of EXPECTED_COLS) {
      expect(cols.split(","), `missing column ${c}`).toContain(c);
    }
  });
});

test.describe("W1 A3 — trigger writes history on status change", () => {
  test("UPDATE status inside a rolled-back tx inserts a status event", () => {
    test.skip(!tableExists(), "table absent — schema test already fails");

    const out = inRolledBackTx(`
DO $probe$
DECLARE
  wid uuid;
  before_n int;
  after_n int;
BEGIN
  SELECT id INTO wid FROM public.work_items ORDER BY created_at DESC LIMIT 1;
  IF wid IS NULL THEN
    INSERT INTO probe VALUES ('no_work_item');
    RETURN;
  END IF;
  SELECT count(*)::int INTO before_n
    FROM public.work_item_events
   WHERE work_item_id = wid AND field = 'status';
  UPDATE public.work_items
     SET status = CASE WHEN status = 'done' THEN 'pending' ELSE 'done' END
   WHERE id = wid;
  SELECT count(*)::int INTO after_n
    FROM public.work_item_events
   WHERE work_item_id = wid AND field = 'status';
  INSERT INTO probe VALUES ('delta=' || (after_n - before_n)::text);
END
$probe$;
`);
    expect(out, "need at least one work_items row on the test DB").not.toContain("no_work_item");
    const deltaLine = out.find((l) => l.startsWith("delta="));
    expect(deltaLine, `probe lines: ${out.join("|")}`).toBeTruthy();
    const delta = Number(deltaLine!.slice("delta=".length));
    expect(delta, "status UPDATE must insert ≥1 work_item_events row").toBeGreaterThanOrEqual(1);
  });
});

test.describe("W1 A3 — UI «سابقه» OR schema (mission OR)", () => {
  test.use({
    storageState: storageStateForRole("admin", BASE, SUPABASE),
  });

  test("table exists OR detail page shows سابقه after a status change", async ({
    page,
  }) => {
    const schemaOk = tableExists();

    let uiOk = false;
    const itemId = dbScalar(
      `SELECT id::text FROM public.work_items ORDER BY created_at DESC LIMIT 1`,
    );
    if (/^[0-9a-f-]{36}$/i.test(itemId)) {
      await page.goto(`/operations/work/${itemId}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1500);

      const historyHeading = page.getByText("سابقه", { exact: false });
      if ((await historyHeading.count()) > 0) {
        // Flip status via the existing وضعیت select, then re-check timeline.
        const statusTrigger = page.locator("label", { hasText: "وضعیت" }).locator("..").locator("button, [role='combobox']").first();
        if (await statusTrigger.count()) {
          await statusTrigger.click();
          const option = page.getByRole("option").filter({ hasNotText: /انتخاب/ }).first();
          if (await option.count()) {
            await option.click();
            await page.getByRole("button", { name: /ذخیره/ }).click();
            await page.waitForTimeout(1500);
          }
        }
        const body = await page.locator("body").innerText();
        uiOk = body.includes("سابقه") && /وضعیت|status|pending|done|انجام/i.test(body);
      }
    }

    expect(
      schemaOk || uiOk,
      `A3 requires work_item_events OR UI «سابقه» (schemaOk=${schemaOk}, uiOk=${uiOk})`,
    ).toBe(true);
  });

  test("detail page renders a سابقه section (UI path)", async ({ page }) => {
    const itemId = dbScalar(
      `SELECT id::text FROM public.work_items ORDER BY created_at DESC LIMIT 1`,
    );
    expect(itemId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.goto(`/operations/work/${itemId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    // Prefer heading role: empty-state copy «هنوز سابقه‌ای…» also contains سابقه.
    await expect(
      page.getByRole("heading", { name: "سابقه" }),
      "ticket detail must show the «سابقه» timeline heading",
    ).toBeVisible({ timeout: 10_000 });
  });
});
