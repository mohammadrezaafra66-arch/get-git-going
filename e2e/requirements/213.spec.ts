import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { expectNoSevereConsoleErrors, gotoApp, saveEvidence } from "../helpers/app";

test.describe("Requirement 213 - dynamic customer credit scoring", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await expectNoSevereConsoleErrors(page, testInfo);
  });

  test("credit scoring rule and dynamic capital pages are reachable", async ({ page }, testInfo) => {
    await gotoApp(page, "/sales/credit-rules");
    await expect(page.getByText("قوانین", { exact: false }).first()).toBeVisible();
    await saveEvidence(page, testInfo, "213-credit-rules");

    await gotoApp(page, "/accounting/dynamic-capital");
    await expect(page.getByText("تخصیص سرمایه پویا", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("محاسبه", { exact: false }).first()).toBeVisible();
    await saveEvidence(page, testInfo, "213-dynamic-capital");
  });

  test("scoring RPCs and active parameter weights exist", async () => {
    const funcs = dbScalar(
      "select string_agg(proname, ',' order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('calculate_dynamic_score','calculate_customer_realtime_credit','run_daily_capital_allocation');",
    );
    expect(funcs).toContain("calculate_dynamic_score");
    expect(funcs).toContain("calculate_customer_realtime_credit");

    const counts = dbScalar(
      "select count(*)::text from public.dynamic_scoring_parameters p join public.dynamic_parameter_weights w on w.parameter_id=p.id where p.is_active;",
    );
    expect(Number(counts)).toBeGreaterThan(0);
  });
});
