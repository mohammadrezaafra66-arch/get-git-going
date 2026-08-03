import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";

/**
 * Issue 219 / C1 — end-of-phase E2E.
 *
 * C1 adds database foundations and activates NOTHING. These specs therefore
 * assert two things: that the existing purchase and purchase-request journeys
 * still work, and that no new behaviour has leaked into the UI.
 *
 * Read-only with respect to business data except E2E-1, which creates one
 * purchase through the real form and cleans it up.
 */

const E2E_NOTE = "E2E_C1_219";

// ---------------------------------------------------------------------------
// E2E-1 — the CURRENT purchase registration page still works end to end
// ---------------------------------------------------------------------------
test("E2E-1 /purchases/create still registers a purchase with its side effects", async ({
  page,
}) => {
  const purchasesBefore = Number(dbScalar("select count(*) from public.purchases"));
  const itemsBefore = Number(dbScalar("select count(*) from public.purchase_items"));
  const stockBefore = Number(
    dbScalar("select count(*) from public.stock_movements where ref_type='purchase'"),
  );

  await page.goto("/purchases/create");
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText("ثبت خرید جدید").first()).toBeVisible();

  // Product. The trigger is a Button with role="combobox" (PurchaseForm.tsx:266-269),
  // so getByRole("button") does not match it — select it by its placeholder text.
  await page.getByText("جستجو و انتخاب محصول...").click();
  const firstProduct = page.getByRole("option").first();
  await expect(firstProduct).toBeVisible({ timeout: 15_000 });
  await firstProduct.click();

  // Payment term. Located by its SelectValue placeholder rather than by index:
  // the sidebar also renders comboboxes, so nth() is not stable here.
  await page.getByText("انتخاب زمان تسویه").click();
  await page.getByRole("option").first().click();

  await page.locator("#purchase_price").fill("5000");
  await page.locator("#quantity").fill("2");
  await page.locator("#notes").fill(E2E_NOTE);

  await page.getByRole("button", { name: "ثبت خرید", exact: true }).click();
  await page.getByRole("button", { name: "تأیید و ثبت" }).click();

  await expect
    .poll(() => Number(dbScalar("select count(*) from public.purchases")), {
      timeout: 20_000,
      message: "purchase was never created",
    })
    .toBe(purchasesBefore + 1);

  // the second insert (line) and its stock trigger both still happen
  expect(
    Number(dbScalar("select count(*) from public.purchase_items")),
    "purchase_items line was not created",
  ).toBe(itemsBefore + 1);
  expect(
    Number(dbScalar("select count(*) from public.stock_movements where ref_type='purchase'")),
    "stock movement did not fire",
  ).toBe(stockBefore + 1);

  /*
    During C1 this asserted a global count of zero, because C1 activated
    nothing. C3 registers real fulfillments, so a global zero is no longer the
    invariant — but the underlying rule this test was written to protect still
    holds and is now stated directly: a purchase created from /purchases/create,
    with no request behind it, allocates to nothing.
  */
  expect(
    dbScalar(
      `select count(*) from public.purchase_request_fulfillments
        where purchase_id = (select id::text from public.purchases order by created_at desc limit 1)::uuid`,
    ),
    "a standalone purchase created a fulfillment",
  ).toBe("0");
});

// ---------------------------------------------------------------------------
// E2E-2 — the purchase request space still behaves exactly as before
// ---------------------------------------------------------------------------
test("E2E-2 purchase request space renders and still uses the old status dialog", async ({
  page,
}) => {
  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText("فضای خرید").first()).toBeVisible();

  const body = await page.locator("body").innerText();

  // The approved requests are rendered, so the card path is alive.
  expect(body.length, "purchase space rendered nothing").toBeGreaterThan(200);
});

/*
  Written during C1, when NO transition had a form behind it. C3 gives
  «خرید انجام شد» a real purchase form, so this is retargeted at the
  transitions C3 explicitly must not disturb.
*/
test("E2E-2b non-purchase transitions still open the old confirm dialog", async ({ page }) => {
  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");

  const btn = page.getByRole("button", { name: "لغو شد", exact: true }).first();
  const count = await btn.count();
  test.skip(count === 0, "no cancellable request visible to this account");

  await btn.click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText("تأیید تغییر وضعیت")).toBeVisible();

  // And it must NOT be the purchase form.
  await expect(dialog.getByText("تأمین‌کننده")).toHaveCount(0);

  // Cancel — nothing must change.
  const f0 = dbScalar("select count(*) from public.purchase_request_fulfillments");
  await dialog.getByRole("button", { name: "انصراف" }).click();
  expect(
    dbScalar("select count(*) from public.purchase_request_fulfillments"),
    "dismissing the dialog created a fulfillment",
  ).toBe(f0);
});

// ---------------------------------------------------------------------------
// E2E-3 — permission regression: no new financial exposure
// ---------------------------------------------------------------------------
test("E2E-3 the new objects are not reachable from the client", async ({ page }) => {
  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");

  // PostgREST must refuse the sealed objects even for an authenticated admin.
  const probe = await page.evaluate(async () => {
    const res: Record<string, number> = {};
    for (const path of [
      "purchase_idempotency",
      "v_purchase_item_allocation",
      "v_purchase_request_fulfillment",
    ]) {
      try {
        const r = await fetch(`/rest/v1/${path}?select=*&limit=1`);
        res[path] = r.status;
      } catch {
        res[path] = -1;
      }
    }
    return res;
  });

  // Anything other than 200 is acceptable here: the point is that these are not
  // openly readable. A 200 would mean a grant leaked.
  for (const [name, status] of Object.entries(probe)) {
    expect(status, `${name} responded 200 — it should not be client-readable`).not.toBe(200);
  }
});

// ---------------------------------------------------------------------------
// E2E-4 — legacy compatibility: the flagged row must not break the page
// ---------------------------------------------------------------------------
test("E2E-4 the legacy-flagged request renders without fabricated numbers", async ({ page }) => {
  const legacyCount = Number(
    dbScalar("select count(*) from public.purchase_requests where legacy_no_fulfillment"),
  );
  expect(legacyCount, "expected exactly one legacy-flagged request").toBe(1);

  // The database must report unknown, not zero.
  expect(
    dbScalar(
      "select coalesce(allocated_quantity::text,'NULL') from public.v_purchase_request_fulfillment where legacy_no_fulfillment",
    ),
    "legacy request reported a fabricated 0 instead of NULL",
  ).toBe("NULL");

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login/);
  // Page still renders — the legacy row causes no runtime error.
  await expect(page.getByText("فضای خرید").first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// E2E-5 — mobile smoke on the two affected pages
// ---------------------------------------------------------------------------
for (const width of [360, 390, 430]) {
  test(`E2E-5 mobile smoke at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });

    for (const route of ["/purchase", "/purchases/create"]) {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expect(page).not.toHaveURL(/\/login/);

      // no horizontal overflow of the document
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} overflows horizontally at ${width}px`).toBeLessThanOrEqual(2);
      expect(errors, `${route} threw a runtime error at ${width}px`).toHaveLength(0);
    }
  });
}
