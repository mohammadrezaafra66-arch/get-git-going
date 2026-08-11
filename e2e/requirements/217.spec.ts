import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { expectNoSevereConsoleErrors, gotoApp, saveEvidence } from "../helpers/app";

test.describe("Requirement 217 - visitor management", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await expectNoSevereConsoleErrors(page, testInfo);
  });

  test("admin visitor management page renders list and create affordance", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, "/admin/visitors");
    await expect(page.getByText("ویزیتور", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "ویزیتور جدید" })).toBeVisible();
    await saveEvidence(page, testInfo, "217-visitors-management");
  });

  test("visitor table and active visitor fixture exist", async () => {
    const cols = dbScalar(
      "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema='public' and table_name='visitors';",
    );
    expect(cols).toContain("full_name");
    expect(cols).toContain("is_active");

    const active = Number(dbScalar("select count(*)::text from public.visitors where is_active;"));
    expect(active).toBeGreaterThan(0);
  });
});
