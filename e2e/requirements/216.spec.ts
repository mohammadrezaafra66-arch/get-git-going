import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { expectNoSevereConsoleErrors, gotoApp, saveEvidence } from "../helpers/app";

test.describe("Requirement 216 - notification queue type check regression", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await expectNoSevereConsoleErrors(page, testInfo);
  });

  test("notification UI is reachable and queue supports quote rejection", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, "/notifications");
    await expect(page.getByText("اعلان‌ها", { exact: false }).first()).toBeVisible();
    await saveEvidence(page, testInfo, "216-notifications-quote-rejected-support");

    const def = dbScalar(
      "select pg_get_constraintdef(oid) from pg_constraint where conname='notification_queue_type_check' order by oid desc limit 1;",
    );
    expect(def).toContain("quote_rejected");
  });
});
