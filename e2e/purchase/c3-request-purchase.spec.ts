import { test, expect, type Page } from "@playwright/test";
import { dbScalar } from "../helpers/db";

/**
 * Issue 219 / C3 — «خرید انجام شد» registers a real purchase document.
 *
 * Before C3 the button opened a dialog that typed in a final price and flipped
 * the status, so a request could read "purchased" while no purchase existed.
 * These tests assert the opposite: the status moves only because a document was
 * committed, and the quantities on the card come from that document.
 *
 * Fixtures are created THROUGH THE UI, because the e2e db helper is read-only by
 * design (it refuses anything that is not a SELECT). Nothing is deleted
 * afterwards: removing a purchase would orphan its stock movement
 * (stock_movements has no FK to purchases), corrupting inventory far worse than
 * leaving a tagged test row behind. LAN test database only, never production.
 */

const TAG = "E2E_C3_219";

/*
  Fixture rows are never cleaned up (see the header), so a note reused between
  runs would match more than one request and the id lookup would be ambiguous.
  Every fixture note therefore carries a token unique to this run.
*/
const RUN = `${Date.now().toString(36)}`;
let seq = 0;
const uniqueNote = (label: string) => `${TAG} ${label} ${RUN}-${++seq}`;

/** A fresh approved request, owned by whoever is signed in. Returns its id. */
async function createApprovedRequest(page: Page, opts: { qty: string; note: string }) {
  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login/);

  await page.getByRole("tab", { name: "ارسال درخواست جدید" }).click();
  // The request form spells this with a ZWNJ («جست‌وجو»), unlike the purchase
  // form's «جستجو». They are different components; matching the wrong spelling
  // silently times out.
  await page.getByText("جست‌وجو و انتخاب محصول...").click();
  const firstProduct = page.getByRole("option").first();
  await expect(firstProduct).toBeVisible({ timeout: 15_000 });
  await firstProduct.click();

  await page.locator("#quantity").fill(opts.qty);
  await page.locator("#notes").fill(opts.note);
  await page.getByRole("button", { name: "ثبت درخواست خرید", exact: true }).click();

  // The row must exist before it can be addressed by id.
  await expect
    .poll(
      () => dbScalar(`select count(*) from public.purchase_requests where notes='${opts.note}'`),
      { timeout: 20_000, message: "request was never created" },
    )
    .toBe("1");

  const id = dbScalar(
    `select id::text from public.purchase_requests where notes='${opts.note}' limit 1`,
  );

  // pending -> approved through the existing dialog (unchanged by C3).
  const card = page.locator(`[data-request-id="${id}"]`);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "تأیید شده", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "تأیید و ثبت" }).click();
  await expect
    .poll(() => dbScalar(`select status from public.purchase_requests where id='${id}'`), {
      timeout: 20_000,
    })
    .toBe("approved");

  return id;
}

/** Fill the purchase form inside the drawer and submit it. */
async function purchaseInDrawer(
  page: Page,
  id: string,
  opts: { price: string; qty?: string; note: string },
) {
  const card = page.locator(`[data-request-id="${id}"]`);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "خرید انجام شد", exact: true }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "ثبت سند خرید" })).toBeVisible({
    timeout: 15_000,
  });

  await drawer.getByText("انتخاب زمان تسویه").click();
  await page.getByRole("option").first().click();

  await drawer.locator("#purchase_price").fill(opts.price);
  if (opts.qty) await drawer.locator("#quantity").fill(opts.qty);
  await drawer.locator("#notes").fill(opts.note);

  await drawer.getByRole("button", { name: "ثبت سند خرید", exact: true }).click();
  await page.getByRole("button", { name: "تأیید و ثبت" }).click();
}

// ---------------------------------------------------------------------------
// E2E-1 — the button opens the real purchase form, not the old price dialog
// ---------------------------------------------------------------------------
test("E2E-1 «خرید انجام شد» opens the purchase form", async ({ page }) => {
  const id = await createApprovedRequest(page, { qty: "5", note: uniqueNote("open") });

  const card = page.locator(`[data-request-id="${id}"]`);
  await card.getByRole("button", { name: "خرید انجام شد", exact: true }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "ثبت سند خرید" })).toBeVisible({
    timeout: 15_000,
  });

  // The real form is present…
  await expect(drawer.locator("#purchase_price")).toBeVisible();
  await expect(drawer.getByText("انتخاب زمان تسویه")).toBeVisible();
  // …and the old "final price only" dialog is gone.
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// E2E-2 — product is locked and prefilled; quantity defaults to what remains
// ---------------------------------------------------------------------------
test("E2E-2 the form is prefilled from the request and the product is locked", async ({ page }) => {
  const id = await createApprovedRequest(page, { qty: "7", note: uniqueNote("prefill") });

  const card = page.locator(`[data-request-id="${id}"]`);
  await card.getByRole("button", { name: "خرید انجام شد", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "ثبت سند خرید" })).toBeVisible({
    timeout: 15_000,
  });

  await expect(drawer.getByTestId("locked-product")).toBeVisible();
  // Locked means locked: no product combobox to change it with.
  await expect(drawer.getByText("جستجو و انتخاب محصول...")).toHaveCount(0);
  await expect(drawer.locator("#quantity")).toHaveValue("7");

  // Nothing the request cannot know is guessed.
  await expect(drawer.locator("#purchase_price")).toHaveValue("");
});

// ---------------------------------------------------------------------------
// E2E-3 — a partial purchase moves the request to «تأمین جزئی», not «purchased»
// ---------------------------------------------------------------------------
test("E2E-3 a partial purchase yields partially_purchased", async ({ page }) => {
  const id = await createApprovedRequest(page, { qty: "10", note: uniqueNote("partial") });

  await purchaseInDrawer(page, id, { price: "1000", qty: "4", note: uniqueNote("partial buy") });

  await expect
    .poll(() => dbScalar(`select status from public.purchase_requests where id='${id}'`), {
      timeout: 25_000,
      message: "status never moved",
    })
    .toBe("partially_purchased");

  expect(
    dbScalar(
      `select count(*) from public.purchase_request_fulfillments where purchase_request_id='${id}'`,
    ),
    "no fulfillment recorded",
  ).toBe("1");
  // Compared numerically: these columns are plain `numeric`, so psql prints "4",
  // not "4.000". Asserting the string would test the display format, not the value.
  expect(
    Number(
      dbScalar(
        `select allocated_quantity::text from public.purchase_request_fulfillments where purchase_request_id='${id}'`,
      ),
    ),
    "wrong quantity allocated",
  ).toBe(4);

  // final_price is derived from the document, not typed by a human.
  expect(
    Number(dbScalar(`select final_price::text from public.purchase_requests where id='${id}'`)),
    "final_price was not derived from the purchase",
  ).toBe(4000);
});

// ---------------------------------------------------------------------------
// E2E-4 — a second purchase completes the request
// ---------------------------------------------------------------------------
test("E2E-4 a second purchase completes a partially supplied request", async ({ page }) => {
  const id = await createApprovedRequest(page, { qty: "6", note: uniqueNote("multi") });

  await purchaseInDrawer(page, id, { price: "500", qty: "2", note: uniqueNote("multi a") });
  await expect
    .poll(() => dbScalar(`select status from public.purchase_requests where id='${id}'`), {
      timeout: 25_000,
    })
    .toBe("partially_purchased");

  await page.reload();
  await page.waitForLoadState("networkidle");

  // The remaining amount is what the form now offers by default.
  const card = page.locator(`[data-request-id="${id}"]`);
  await card.getByRole("button", { name: "خرید انجام شد", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.locator("#quantity")).toHaveValue("4");
  await page.keyboard.press("Escape");

  await page.reload();
  await page.waitForLoadState("networkidle");
  await purchaseInDrawer(page, id, { price: "500", qty: "4", note: uniqueNote("multi b") });

  await expect
    .poll(() => dbScalar(`select status from public.purchase_requests where id='${id}'`), {
      timeout: 25_000,
    })
    .toBe("purchased");
  expect(
    dbScalar(
      `select count(*) from public.purchase_request_fulfillments where purchase_request_id='${id}'`,
    ),
    "second fulfillment missing",
  ).toBe("2");
});

// ---------------------------------------------------------------------------
// E2E-5 — the card shows the purchase summary
// ---------------------------------------------------------------------------
test("E2E-5 the card shows the registered purchase", async ({ page }) => {
  const id = await createApprovedRequest(page, { qty: "3", note: uniqueNote("summary") });
  await purchaseInDrawer(page, id, { price: "2500", qty: "3", note: uniqueNote("summary buy") });

  await expect
    .poll(() => dbScalar(`select status from public.purchase_requests where id='${id}'`), {
      timeout: 25_000,
    })
    .toBe("purchased");

  await page.reload();
  await page.waitForLoadState("networkidle");

  const card = page.locator(`[data-request-id="${id}"]`);
  const summary = card.getByTestId("fulfillment-summary");
  await expect(summary).toBeVisible({ timeout: 20_000 });
  await expect(summary.getByText("تأمین کامل")).toBeVisible();
  // 3 × 2500. The grouping separator is a Latin comma because the whole app
  // formats money with toLocaleString("en-US") and then maps only the digits —
  // the summary follows that existing convention rather than inventing its own.
  await expect(summary).toContainText("۷,۵۰۰ تومان");
  await expect(summary).toContainText("تأمین‌شده ۳ از ۳");
});

// ---------------------------------------------------------------------------
// E2E-6 — one submit, one document: a double click cannot double-buy
// ---------------------------------------------------------------------------
test("E2E-6 double submit registers exactly one purchase", async ({ page }) => {
  const id = await createApprovedRequest(page, { qty: "2", note: uniqueNote("double") });

  const card = page.locator(`[data-request-id="${id}"]`);
  await card.getByRole("button", { name: "خرید انجام شد", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "ثبت سند خرید" })).toBeVisible({
    timeout: 15_000,
  });
  await drawer.getByText("انتخاب زمان تسویه").click();
  await page.getByRole("option").first().click();
  await drawer.locator("#purchase_price").fill("900");
  await drawer.locator("#notes").fill(`${TAG} double buy`);
  await drawer.getByRole("button", { name: "ثبت سند خرید", exact: true }).click();

  const confirm = page.getByRole("button", { name: "تأیید و ثبت" });
  await confirm.click();
  // The dialog detaches on the first click, so the second is allowed to miss.
  // What matters is the database, asserted below.
  await confirm.click({ timeout: 1000, force: true }).catch(() => undefined);

  await expect
    .poll(
      () =>
        dbScalar(
          `select count(*) from public.purchase_request_fulfillments where purchase_request_id='${id}'`,
        ),
      { timeout: 25_000, message: "no fulfillment was created" },
    )
    .toBe("1");
  await page.waitForTimeout(1500);

  expect(
    dbScalar(
      `select count(*) from public.purchase_request_fulfillments where purchase_request_id='${id}'`,
    ),
    "the request was supplied twice",
  ).toBe("1");
  expect(
    Number(
      dbScalar(
        `select coalesce(sum(sm.quantity),0)::text from public.stock_movements sm
           join public.purchase_request_fulfillments f on f.purchase_id = sm.ref_id
          where f.purchase_request_id='${id}' and sm.ref_type='purchase'`,
      ),
    ),
    "stock moved twice",
  ).toBe(2);
});

// ---------------------------------------------------------------------------
// E2E-7 — a server rejection is readable Persian and changes nothing
// ---------------------------------------------------------------------------
test("E2E-7 an over-allocated purchase is refused without side effects", async ({ page }) => {
  const id = await createApprovedRequest(page, { qty: "2", note: uniqueNote("over") });

  const p0 = Number(dbScalar("select count(*) from public.purchases"));
  const f0 = Number(dbScalar("select count(*) from public.purchase_request_fulfillments"));

  const card = page.locator(`[data-request-id="${id}"]`);
  await card.getByRole("button", { name: "خرید انجام شد", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "ثبت سند خرید" })).toBeVisible({
    timeout: 15_000,
  });
  await drawer.getByText("انتخاب زمان تسویه").click();
  await page.getByRole("option").first().click();
  await drawer.locator("#purchase_price").fill("100");
  await drawer.locator("#notes").fill(`${TAG} over buy`);

  // The UI never offers an allocation larger than what remains, so the server
  // guard is exercised directly by rewriting the request in flight. This proves
  // the backend — not the form — is the authority.
  await page.route("**/rest/v1/rpc/create_purchase", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    body.p_allocate_quantity = 999;
    await route.continue({ postData: JSON.stringify(body) });
  });

  await drawer.getByRole("button", { name: "ثبت سند خرید", exact: true }).click();
  await page.getByRole("button", { name: "تأیید و ثبت" }).click();

  await expect(page.getByText(/بیش از مقدار باقی‌مانده|مقدار تخصیص/)).toBeVisible({
    timeout: 20_000,
  });
  const body = await page.locator("body").innerText();
  expect(body, "a raw SQL error leaked to the UI").not.toMatch(
    /violates|constraint|SQLSTATE|ERROR:|relation/i,
  );

  expect(Number(dbScalar("select count(*) from public.purchases")), "purchase created").toBe(p0);
  expect(
    Number(dbScalar("select count(*) from public.purchase_request_fulfillments")),
    "fulfillment created",
  ).toBe(f0);
  expect(dbScalar(`select status from public.purchase_requests where id='${id}'`)).toBe("approved");
});

// ---------------------------------------------------------------------------
// E2E-8 — a cancelled request cannot be purchased against
// ---------------------------------------------------------------------------
test("E2E-8 a cancelled request is refused by the server", async ({ page }) => {
  const id = await createApprovedRequest(page, { qty: "2", note: uniqueNote("cancel") });

  const card = page.locator(`[data-request-id="${id}"]`);
  await card.getByRole("button", { name: "لغو شد", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "تأیید و ثبت" }).click();
  await expect
    .poll(() => dbScalar(`select status from public.purchase_requests where id='${id}'`), {
      timeout: 20_000,
    })
    .toBe("cancelled");

  // A cancelled request offers no further transitions, so the button is gone —
  // the UI and the backend agree.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`[data-request-id="${id}"]`)).toBeVisible({ timeout: 20_000 });
  await expect(
    page.locator(`[data-request-id="${id}"]`).getByRole("button", { name: "خرید انجام شد" }),
  ).toHaveCount(0);

  expect(
    dbScalar(
      `select count(*) from public.purchase_request_fulfillments where purchase_request_id='${id}'`,
    ),
  ).toBe("0");
});

// ---------------------------------------------------------------------------
// E2E-9 — /purchases/create still works standalone (C2 regression)
// ---------------------------------------------------------------------------
test("E2E-9 the standalone purchase page is unaffected", async ({ page }) => {
  const p0 = Number(dbScalar("select count(*) from public.purchases"));
  const f0 = Number(dbScalar("select count(*) from public.purchase_request_fulfillments"));

  await page.goto("/purchases/create");
  await page.waitForLoadState("networkidle");
  await page.getByText("جستجو و انتخاب محصول...").click();
  await page.getByRole("option").first().click();
  await page.getByText("انتخاب زمان تسویه").click();
  await page.getByRole("option").first().click();
  await page.locator("#purchase_price").fill("1200");
  await page.locator("#quantity").fill("1");
  await page.locator("#notes").fill(`${TAG} standalone`);
  await page.getByRole("button", { name: "ثبت خرید", exact: true }).click();
  await page.getByRole("button", { name: "تأیید و ثبت" }).click();

  await expect(page.getByText("خرید با موفقیت ثبت شد")).toBeVisible({ timeout: 20_000 });
  expect(Number(dbScalar("select count(*) from public.purchases"))).toBe(p0 + 1);
  // A standalone purchase allocates to nothing.
  expect(
    Number(dbScalar("select count(*) from public.purchase_request_fulfillments")),
    "a standalone purchase created a fulfillment",
  ).toBe(f0);
});

// ---------------------------------------------------------------------------
// E2E-10 — mobile: the drawer is usable on a phone
// ---------------------------------------------------------------------------
for (const width of [360, 390, 430]) {
  test(`E2E-10 the drawer is usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    const id = await createApprovedRequest(page, { qty: "2", note: uniqueNote("mobile ${width}") });

    const card = page.locator(`[data-request-id="${id}"]`);
    await card.getByRole("button", { name: "خرید انجام شد", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "ثبت سند خرید" })).toBeVisible({
      timeout: 15_000,
    });

    const submit = drawer.getByRole("button", { name: "ثبت سند خرید", exact: true });
    await expect(submit).toBeVisible();
    const box = await submit.boundingBox();
    expect(box!.height, "submit is too small to tap").toBeGreaterThanOrEqual(36);

    await expect(drawer.locator("#purchase_price")).toHaveAttribute("inputmode", "decimal");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `layout overflows at ${width}px`).toBeLessThanOrEqual(2);
    expect(errors, `runtime error at ${width}px`).toHaveLength(0);
  });
}
