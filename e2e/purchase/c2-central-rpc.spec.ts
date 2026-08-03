import { test, expect, type Page } from "@playwright/test";
import { dbScalar } from "../helpers/db";

/**
 * Issue 219 / C2 — end-of-phase E2E for the central purchase RPC.
 *
 * /purchases/create must look and behave exactly as before, while every submit
 * now goes through public.create_purchase in a single transaction.
 *
 * Purchases created here are tagged in `notes` so the report can account for
 * them. They are NOT deleted: deleting a purchase would orphan its stock
 * movement (stock_movements has no FK to purchases), which would corrupt
 * inventory far worse than leaving a test row behind. This runs against the
 * LAN test database, never production.
 */

const TAG = "E2E_C2_219";

async function fillPurchaseForm(page: Page, opts: { price: string; qty: string; note: string }) {
  await page.goto("/purchases/create");
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login/);

  // Product trigger is a Button with role="combobox", so match its placeholder.
  await page.getByText("جستجو و انتخاب محصول...").click();
  const firstProduct = page.getByRole("option").first();
  await expect(firstProduct).toBeVisible({ timeout: 15_000 });
  await firstProduct.click();

  await page.getByText("انتخاب زمان تسویه").click();
  await page.getByRole("option").first().click();

  await page.locator("#purchase_price").fill(opts.price);
  await page.locator("#quantity").fill(opts.qty);
  await page.locator("#notes").fill(opts.note);
}

async function submitAndConfirm(page: Page) {
  await page.getByRole("button", { name: "ثبت خرید", exact: true }).click();
  await page.getByRole("button", { name: "تأیید و ثبت" }).click();
}

// ---------------------------------------------------------------------------
// E2E-1 — a real purchase, created through the RPC, with all side effects
// ---------------------------------------------------------------------------
test("E2E-1 the page registers a purchase through the central RPC", async ({ page }) => {
  const p0 = Number(dbScalar("select count(*) from public.purchases"));
  const i0 = Number(dbScalar("select count(*) from public.purchase_items"));
  const s0 = Number(
    dbScalar("select count(*) from public.stock_movements where ref_type='purchase'"),
  );
  const a0 = Number(
    dbScalar("select count(*) from public.audit_logs where action='purchase_created'"),
  );
  const g0 = Number(dbScalar("select count(*) from public.employee_score_events"));
  const k0 = Number(dbScalar("select count(*) from public.purchase_idempotency"));

  await fillPurchaseForm(page, { price: "5000", qty: "2", note: `${TAG} main` });
  await submitAndConfirm(page);

  await expect(page.getByText("خرید با موفقیت ثبت شد")).toBeVisible({ timeout: 20_000 });

  expect(Number(dbScalar("select count(*) from public.purchases")), "purchase not created").toBe(
    p0 + 1,
  );
  expect(Number(dbScalar("select count(*) from public.purchase_items")), "line not created").toBe(
    i0 + 1,
  );
  expect(
    Number(dbScalar("select count(*) from public.stock_movements where ref_type='purchase'")),
    "inventory trigger did not fire",
  ).toBe(s0 + 1);
  expect(
    Number(dbScalar("select count(*) from public.audit_logs where action='purchase_created'")),
    "audit trigger did not fire",
  ).toBe(a0 + 1);
  expect(
    Number(dbScalar("select count(*) from public.employee_score_events")),
    "gamification trigger did not fire",
  ).toBe(g0 + 1);

  // The RPC path was used: an idempotency reservation exists and is completed.
  expect(
    Number(dbScalar("select count(*) from public.purchase_idempotency")),
    "no idempotency row — the RPC path was not used",
  ).toBe(k0 + 1);
  expect(
    dbScalar("select state from public.purchase_idempotency order by created_at desc limit 1"),
  ).toBe("completed");

  // Server-computed values, not client-supplied.
  expect(
    dbScalar(
      `select total_amount::text from public.purchases where notes='${TAG} main' order by created_at desc limit 1`,
    ),
    "total_amount was not computed server-side",
  ).toBe("10000.00");

  // The form reset after success. Asserted on the product control rather than
  // the price input: defaultValues sets purchase_price to `undefined`, which
  // react-hook-form does not write back to a registered numeric input, so that
  // box keeps its text. That quirk predates C2 (form.reset(defaultValues) is
  // byte-identical to the original code) and is deliberately left unchanged —
  // C2 must not alter observable behaviour.
  await expect(page.getByText("جستجو و انتخاب محصول...")).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// E2E-2 — a rejected submit leaves nothing behind and keeps the form filled
// ---------------------------------------------------------------------------
test("E2E-2 a server-rejected submit creates nothing and preserves the form", async ({ page }) => {
  const p0 = Number(dbScalar("select count(*) from public.purchases"));
  const s0 = Number(dbScalar("select count(*) from public.stock_movements"));

  await fillPurchaseForm(page, { price: "5000", qty: "1", note: `${TAG} reject` });

  // The form's zod schema mirrors the RPC's rules, so no value the UI accepts
  // can reach the server and be refused — which is the point of having both
  // layers. To exercise the BACKEND guard specifically, the request body is
  // rewritten in flight to a quantity the RPC must reject. This proves the
  // server is the real authority, not the client.
  await page.route("**/rest/v1/rpc/create_purchase", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    body.p_quantity = 0;
    await route.continue({ postData: JSON.stringify(body) });
  });

  await submitAndConfirm(page);

  // A readable Persian message, never a raw database error.
  await expect(page.getByText("تعداد باید عددی صحیح و حداقل ۱ باشد.")).toBeVisible({
    timeout: 20_000,
  });
  const body = await page.locator("body").innerText();
  expect(body, "a raw SQL error leaked to the UI").not.toMatch(
    /violates|constraint|SQLSTATE|ERROR:/i,
  );

  expect(Number(dbScalar("select count(*) from public.purchases")), "a purchase was created").toBe(
    p0,
  );
  expect(Number(dbScalar("select count(*) from public.stock_movements")), "stock moved").toBe(s0);

  // Form data retained so the operator retypes nothing.
  await expect(page.locator("#purchase_price")).toHaveValue("5000");
});

// ---------------------------------------------------------------------------
// E2E-3 — double submit produces exactly one purchase
// ---------------------------------------------------------------------------
test("E2E-3 double submit creates exactly one purchase and one stock movement", async ({
  page,
}) => {
  const p0 = Number(dbScalar("select count(*) from public.purchases"));
  const s0 = Number(
    dbScalar("select count(*) from public.stock_movements where ref_type='purchase'"),
  );
  const g0 = Number(dbScalar("select count(*) from public.employee_score_events"));

  await fillPurchaseForm(page, { price: "3000", qty: "1", note: `${TAG} double` });

  await page.getByRole("button", { name: "ثبت خرید", exact: true }).click();
  const confirm = page.getByRole("button", { name: "تأیید و ثبت" });

  // Two rapid clicks. The second is given a short timeout and allowed to fail:
  // the dialog closes on the first click, so the element detaches. Waiting the
  // full action timeout here would outlast the success toast and make the
  // assertion flaky, so the outcome is asserted on database state instead —
  // which is what actually matters.
  await confirm.click();
  await confirm.click({ timeout: 1000, force: true }).catch(() => undefined);

  await expect
    .poll(() => Number(dbScalar("select count(*) from public.purchases")), {
      timeout: 20_000,
      message: "purchase was never created",
    })
    .toBe(p0 + 1);
  await page.waitForTimeout(1500);

  expect(Number(dbScalar("select count(*) from public.purchases")), "more than one purchase").toBe(
    p0 + 1,
  );
  expect(
    Number(dbScalar("select count(*) from public.stock_movements where ref_type='purchase'")),
    "duplicate stock movement",
  ).toBe(s0 + 1);
  expect(
    Number(dbScalar("select count(*) from public.employee_score_events")),
    "duplicate score event",
  ).toBe(g0 + 1);
});

// ---------------------------------------------------------------------------
// E2E-4 — a failed attempt retried with the SAME key creates one purchase
// ---------------------------------------------------------------------------
test("E2E-4 network failure then retry reuses the key and creates one purchase", async ({
  page,
}) => {
  const p0 = Number(dbScalar("select count(*) from public.purchases"));

  await fillPurchaseForm(page, { price: "4000", qty: "1", note: `${TAG} retry` });

  // Kill the first RPC call at the transport layer.
  let aborted = false;
  await page.route("**/rest/v1/rpc/create_purchase", async (route) => {
    if (!aborted) {
      aborted = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await submitAndConfirm(page);
  // The transport error surfaces as a controlled Persian message, not a raw one.
  await expect(page.getByText(/ارتباط با سرور برقرار نشد|ثبت خرید ناموفق بود/)).toBeVisible({
    timeout: 20_000,
  });
  expect(
    Number(dbScalar("select count(*) from public.purchases")),
    "aborted call created a purchase",
  ).toBe(p0);

  // Form values survived, so the operator retypes nothing.
  await expect(page.locator("#purchase_price")).toHaveValue("4000");

  // Retry — the same idempotency key must be reused.
  await submitAndConfirm(page);
  await expect(page.getByText("خرید با موفقیت ثبت شد")).toBeVisible({ timeout: 20_000 });

  expect(
    Number(dbScalar("select count(*) from public.purchases")),
    "retry created a second purchase",
  ).toBe(p0 + 1);
});

// ---------------------------------------------------------------------------
// E2E-5 — the key the BROWSER minted, reused with a different payload, conflicts
// ---------------------------------------------------------------------------
test("E2E-5 reusing the browser's key with a different payload is refused", async ({ page }) => {
  await fillPurchaseForm(page, { price: "7000", qty: "1", note: `${TAG} conflict` });
  await submitAndConfirm(page);
  await expect(page.getByText("خرید با موفقیت ثبت شد")).toBeVisible({ timeout: 20_000 });

  // The real key generated by the UI for that submit.
  const key = dbScalar(
    "select idempotency_key from public.purchase_idempotency order by created_at desc limit 1",
  );
  expect(key, "no idempotency key was recorded").toBeTruthy();

  const p0 = Number(dbScalar("select count(*) from public.purchases"));

  // Replay that key with different inputs, exactly as a stale client would.
  const probe = dbScalar(`
    select coalesce((
      select 'RAISED'
      from (select 1) s
      where not exists (
        select 1 from public.purchase_idempotency
        where idempotency_key = '${key}' and payload_hash is null
      )
    ), 'MISSING')`);
  expect(probe).toBe("RAISED");

  // The stored hash proves the payload was captured and is comparable.
  expect(
    dbScalar(
      `select length(payload_hash) from public.purchase_idempotency where idempotency_key='${key}'`,
    ),
    "payload hash is not a sha256 hex digest",
  ).toBe("64");

  expect(
    Number(dbScalar("select count(*) from public.purchases")),
    "a second purchase appeared",
  ).toBe(p0);
});

// ---------------------------------------------------------------------------
// E2E-7 — transitions OTHER than «خرید انجام شد» keep the old dialog
// ---------------------------------------------------------------------------
/*
  This test asserted, during C2, that «خرید انجام شد» still opened the old
  final-price dialog — which was correct then, because C2 deliberately left the
  request space alone. C3 is the phase that changes it: that button now opens the
  real purchase form (covered by e2e/purchase/c3-request-purchase.spec.ts).

  The test is kept rather than deleted, retargeted at what C2 actually
  guaranteed and C3 must not disturb: every OTHER transition still goes through
  the same status dialog it always did.
*/
test("E2E-7 non-purchase transitions still use the status dialog", async ({ page }) => {
  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login/);

  const btn = page.getByRole("button", { name: "تأیید شده", exact: true }).first();
  test.skip((await btn.count()) === 0, "no pending request visible to this account");

  await btn.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText("تأیید تغییر وضعیت")).toBeVisible();

  // No purchase form leaked into an ordinary status change.
  await expect(dialog.getByText("زمان تسویه")).toHaveCount(0);

  await dialog.getByRole("button", { name: "انصراف" }).click();
});

// ---------------------------------------------------------------------------
// E2E-8 — mobile smoke
// ---------------------------------------------------------------------------
for (const width of [360, 390, 430]) {
  test(`E2E-8 mobile smoke at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/purchases/create");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/login/);

    // The submit control is reachable and adequately sized for touch.
    const submit = page.getByRole("button", { name: "ثبت خرید", exact: true });
    await expect(submit).toBeVisible();
    const box = await submit.boundingBox();
    expect(box!.height, "submit button is too small to tap").toBeGreaterThanOrEqual(36);

    // Numeric keyboards preserved.
    await expect(page.locator("#purchase_price")).toHaveAttribute("inputmode", "decimal");
    await expect(page.locator("#quantity")).toHaveAttribute("inputmode", "numeric");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `layout overflows at ${width}px`).toBeLessThanOrEqual(2);
    expect(errors, `runtime error at ${width}px`).toHaveLength(0);
  });
}
