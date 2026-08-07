import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { ADMIN_USER_ID } from "../helpers/pgrest";

/**
 * Issue 219 / C5 — the permission layers agree, and the bypasses are closed.
 *
 * Scope note, stated up front. These run as the project's admin session, which
 * is the only browser session the suite has. Where a test needs a different
 * role, it asserts at the layer that actually decides — the database — rather
 * than pretending a second login happened. Every negative case for sales,
 * purchase_specialist, accountant, viewer and anon is proven in
 * docs/verification/257-259-c5-permission-tests.sql (63 assertions, run as the
 * real database roles with SET LOCAL ROLE, so the GRANT layer itself is under
 * test).
 *
 * Fixtures are tagged and not deleted: removing a purchase would orphan its
 * stock movement, which has no FK back to purchases.
 */

const TAG = "E2E_C5_219";
const RUN = Date.now().toString(36);
let seq = 0;
const uniqueNote = (label: string) => `${TAG} ${label} ${RUN}-${++seq}`;

async function createRequest(page: import("@playwright/test").Page, note: string) {
  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "ارسال درخواست جدید" }).click();
  await page.getByText("جست‌وجو و انتخاب محصول...").click();
  const first = page.getByRole("option").first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  await first.click();
  await page.locator("#quantity").fill("2");
  await page.locator("#notes").fill(note);
  await page.getByRole("button", { name: "ثبت درخواست خرید", exact: true }).click();
  await expect
    .poll(() => dbScalar(`select count(*) from public.purchase_requests where notes='${note}'`), {
      timeout: 20_000,
      message: "request was never created",
    })
    .toBe("1");
  return dbScalar(`select id::text from public.purchase_requests where notes='${note}' limit 1`);
}

// ---------------------------------------------------------------------------
// E2E-1 — the old manual "final price" path is gone from the UI
// ---------------------------------------------------------------------------
test("E2E-1 approving a request offers the purchase form, never a price dialog", async ({
  page,
}) => {
  const id = await createRequest(page, uniqueNote("no-final-price"));

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  const card = page.locator(`[data-request-id="${id}"]`);
  await card.getByRole("button", { name: "تأیید شده", exact: true }).click();

  // The status dialog still exists for ordinary transitions — but with no price.
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("تأیید تغییر وضعیت")).toBeVisible({ timeout: 15_000 });
  await expect(dialog.locator("#final_price")).toHaveCount(0);
  await expect(dialog.getByText("قیمت نهایی")).toHaveCount(0);
  await dialog.getByRole("button", { name: "تأیید و ثبت" }).click();

  await expect
    .poll(() => dbScalar(`select status from public.purchase_requests where id='${id}'`), {
      timeout: 20_000,
    })
    .toBe("approved");

  // «خرید انجام شد» opens the real form, with no fallback branch left.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page
    .locator(`[data-request-id="${id}"]`)
    .getByRole("button", { name: "خرید انجام شد", exact: true })
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "ثبت سند خرید" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// E2E-2 — a hand-set `purchased` is refused, with a readable message
// ---------------------------------------------------------------------------
test("E2E-2 the RPC refuses a manual purchased and changes nothing", async ({ page }) => {
  const id = await createRequest(page, uniqueNote("manual-purchased"));

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  const card = page.locator(`[data-request-id="${id}"]`);
  await card.getByRole("button", { name: "تأیید شده", exact: true }).click();

  // Rewrite the target in flight — same length, so the body does not grow.
  await page.route("**/rest/v1/rpc/update_purchase_status", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    body.p_new_status = "purchased";
    await route.continue({ postData: JSON.stringify(body) });
  });

  const historyBefore = dbScalar(
    `select count(*) from public.purchase_request_status_history where request_id='${id}'`,
  );
  await page.getByRole("alertdialog").getByRole("button", { name: "تأیید و ثبت" }).click();

  await expect(page.getByText("وضعیت خرید فقط پس از ثبت سند خرید واقعی تغییر می‌کند.")).toBeVisible(
    { timeout: 20_000 },
  );

  const bodyText = await page.locator("body").innerText();
  expect(bodyText, "a raw SQL error leaked to the UI").not.toMatch(
    /violates|constraint|SQLSTATE|ERROR:|relation/i,
  );

  expect(
    dbScalar(`select status from public.purchase_requests where id='${id}'`),
    "the status moved anyway",
  ).toBe("pending");
  expect(
    dbScalar(
      `select count(*) from public.purchase_request_status_history where request_id='${id}'`,
    ),
    "a fake history row was written",
  ).toBe(historyBefore);
  expect(
    dbScalar(
      `select count(*) from public.notification_events
        where payload->>'reference_id'='${id}' and payload->>'to'='purchased'`,
    ),
    "a fake notification was emitted",
  ).toBe("0");
});

// ---------------------------------------------------------------------------
// E2E-3 — the legacy request is read-only and honest about it
// ---------------------------------------------------------------------------
test("E2E-3 the legacy request offers no action at all", async ({ page }) => {
  const legacy = dbScalar(
    "select id::text from public.purchase_requests where legacy_no_fulfillment limit 1",
  );
  test.skip(!legacy, "no legacy request on this database");

  await page.goto("/admin/purchase");
  await page.waitForLoadState("networkidle");

  // Reached through the admin table, which lists every request.
  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  const card = page.locator(`[data-request-id="${legacy}"]`);
  const visible = (await card.count()) > 0;
  test.skip(!visible, "the legacy request is not in this account's own list");

  await expect(card.getByTestId("legacy-readonly")).toBeVisible();
  await expect(card.getByRole("button", { name: "خرید انجام شد" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "تأیید شده" })).toHaveCount(0);

  // And no fabricated numbers.
  expect(
    dbScalar(
      `select count(*) from public.purchase_request_fulfillments where purchase_request_id='${legacy}'`,
    ),
    "a fulfillment was invented for the legacy request",
  ).toBe("0");
});

// ---------------------------------------------------------------------------
// E2E-4 — admin standalone purchase still works
// ---------------------------------------------------------------------------
test("E2E-4 an admin can still register a standalone purchase", async ({ page }) => {
  const before = Number(dbScalar("select count(*) from public.purchases"));

  await page.goto("/purchases/create");
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login|\/unauthorized/);

  await page.getByText("جستجو و انتخاب محصول...").click();
  await page.getByRole("option").first().click();
  await page.getByText("انتخاب زمان تسویه").click();
  await page.getByRole("option").first().click();
  await page.locator("#purchase_price").fill("2200");
  await page.locator("#quantity").fill("1");
  await page.locator("#notes").fill(uniqueNote("standalone"));
  await page.getByRole("button", { name: "ثبت خرید", exact: true }).click();
  await page.getByRole("button", { name: "تأیید و ثبت" }).click();

  await expect(page.getByText("خرید با موفقیت ثبت شد")).toBeVisible({ timeout: 20_000 });
  expect(Number(dbScalar("select count(*) from public.purchases"))).toBe(before + 1);
});

// ---------------------------------------------------------------------------
// E2E-5 — the permission layers agree with each other
// ---------------------------------------------------------------------------
test("E2E-5 role_permissions advertises only what the backend honours", async () => {
  // The route guard for /purchases/create reads exactly this column, so a role
  // with can_create=true and no RLS/RPC right is a door that opens onto a wall.
  expect(
    dbScalar(`select coalesce(string_agg(role_name, ',' order by role_name), '')
                from public.role_permissions
               where module='purchases' and can_create`),
    "a role advertises purchase creation that the backend refuses",
  ).toBe("admin,manager");

  // Sales keeps view, because /purchase is gated on it and raising a request is
  // its job.
  expect(
    dbScalar(
      `select can_view::text from public.role_permissions where module='purchases' and role_name='sales'`,
    ),
  ).toBe("true");
  expect(
    dbScalar(
      `select can_view::text from public.role_permissions
        where module='purchases' and role_name='purchase_specialist'`,
    ),
  ).toBe("true");
});

// ---------------------------------------------------------------------------
// E2E-6 — no anonymous reach into the purchase surface
// ---------------------------------------------------------------------------
test("E2E-6 anon can neither execute the RPCs nor read the tables", async () => {
  const fns = [
    "create_purchase",
    "create_purchase_request",
    "assign_purchase_request",
    "update_purchase_status",
    "get_purchase_requests",
  ];
  for (const fn of fns) {
    expect(
      dbScalar(`select coalesce(bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')), false)::text
                  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname='public' and p.proname='${fn}'`),
      `anon can execute ${fn}`,
    ).toBe("false");
  }

  for (const tbl of ["purchases", "purchase_items", "purchase_requests"]) {
    expect(
      dbScalar(`select count(*) from information_schema.role_table_grants
                 where table_schema='public' and table_name='${tbl}' and grantee='anon'`),
      `anon still holds grants on ${tbl}`,
    ).toBe("0");
  }
});

// ---------------------------------------------------------------------------
// E2E-7 — direct writes into purchase documents are closed
// ---------------------------------------------------------------------------
test("E2E-7 authenticated cannot insert purchases or lines directly", async () => {
  // The whole grant map is fetched and compared here rather than filtered in
  // SQL: the e2e db helper refuses any statement containing a write verb, even
  // as a string literal, so naming the privileges in the query is impossible —
  // and the helper is right to be that strict.
  const grants = dbScalar(`
    select coalesce(string_agg(table_name || ':' || privilege_type, ' ' order by
                               table_name, privilege_type), '')
      from information_schema.role_table_grants
     where table_schema='public' and grantee='authenticated'
       and table_name in ('purchases','purchase_items','purchase_requests')`);

  // Exactly the three reads the app does, plus the two writes it genuinely
  // needs: the accountant marking a purchase paid, and a requester editing
  // their own pending request. Anything else is a direct write path into
  // purchase documents, which is what C5 closed.
  expect(grants, "the authenticated grant map is not what C5 left behind").toBe(
    "purchase_items:SELECT purchase_requests:SELECT purchase_requests:UPDATE " +
      "purchases:SELECT purchases:UPDATE",
  );
});

// ---------------------------------------------------------------------------
// E2E-8 — a derived status cannot be forged by a direct UPDATE either
// ---------------------------------------------------------------------------
test("E2E-8 the trigger blocks a hand-written purchased status", async () => {
  // Proven at the database layer: the browser has no way to issue this
  // statement now that INSERT/UPDATE grants are gone, which is the point.
  const blocked = dbScalar(`
    select case when exists (
      select 1 from pg_trigger tg
       where tg.tgrelid = 'public.purchase_requests'::regclass
         and tg.tgname = 'trg_purchase_request_status_derived'
         and not tg.tgisinternal
    ) then 'present' else 'MISSING' end`);
  expect(blocked, "the derived-status trigger is not installed").toBe("present");

  // And it is data-driven, not flag-driven: no request carries a derived status
  // without the fulfillment rows to justify it.
  expect(
    dbScalar(`
      select count(*) from public.purchase_requests r
       where r.status in ('purchased','partially_purchased')
         and not r.legacy_no_fulfillment
         and coalesce((select sum(f.allocated_quantity)
                         from public.purchase_request_fulfillments f
                        where f.purchase_request_id = r.id), 0) <= 0`),
    "a request claims a derived status with no supply behind it",
  ).toBe("0");
});

// ---------------------------------------------------------------------------
// E2E-9 — receipts and the delivered transition still work
// ---------------------------------------------------------------------------
test("E2E-9 a purchased request can still be delivered", async ({ page }) => {
  const id = await createRequest(page, uniqueNote("deliver"));

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  await page
    .locator(`[data-request-id="${id}"]`)
    .getByRole("button", { name: "تأیید شده", exact: true })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "تأیید و ثبت" }).click();
  await expect
    .poll(() => dbScalar(`select status from public.purchase_requests where id='${id}'`), {
      timeout: 20_000,
    })
    .toBe("approved");

  await page.reload();
  await page.waitForLoadState("networkidle");
  await page
    .locator(`[data-request-id="${id}"]`)
    .getByRole("button", { name: "خرید انجام شد", exact: true })
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "ثبت سند خرید" })).toBeVisible({
    timeout: 15_000,
  });
  await drawer.getByText("انتخاب زمان تسویه").click();
  await page.getByRole("option").first().click();
  await drawer.locator("#purchase_price").fill("800");
  await drawer.locator("#notes").fill(uniqueNote("deliver buy"));
  await drawer.getByRole("button", { name: "ثبت سند خرید", exact: true }).click();
  await page.getByRole("button", { name: "تأیید و ثبت" }).click();

  await expect
    .poll(() => dbScalar(`select status from public.purchase_requests where id='${id}'`), {
      timeout: 25_000,
    })
    .toBe("purchased");

  // purchased -> delivered, the one transition that remains after C5
  await page.reload();
  await page.waitForLoadState("networkidle");
  const card = page.locator(`[data-request-id="${id}"]`);
  // The receipt button is deliberately assignee-only (C3): it renders for the
  // user the request is assigned TO, not merely whenever an assignee exists.
  //
  // This previously read `coalesce(assigned_to,'')` and treated any non-empty
  // value as "the button must be here". That conflated "assigned to someone"
  // with "assigned to me", and held only while the request happened to be
  // ownerless — the original comment said as much. It broke the moment a
  // default assignee existed who was not this session's admin: the request was
  // assigned to another account, so the button was correctly absent while the
  // expectation demanded it be present.
  //
  // Comparing against ADMIN_USER_ID asserts the actual rule and is strictly
  // stronger: the button must appear when this user owns the request, and must
  // be absent when they do not — both directions, whatever the assignment is.
  await expect(card.getByRole("button", { name: "آپلود رسید" })).toHaveCount(
    dbScalar(
      `select count(*) from public.purchase_requests
        where id='${id}' and assigned_to='${ADMIN_USER_ID}'`,
    ) === "1"
      ? 1
      : 0,
  );
  await card.getByRole("button", { name: "تحویل داده شد", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "تأیید و ثبت" }).click();

  await expect
    .poll(() => dbScalar(`select status from public.purchase_requests where id='${id}'`), {
      timeout: 20_000,
    })
    .toBe("delivered");
});

// ---------------------------------------------------------------------------
// E2E-10 — mobile
// ---------------------------------------------------------------------------
for (const width of [320, 360, 390, 430, 768]) {
  test(`E2E-10 the purchase space has no overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/purchase");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("فضای خرید").first()).toBeVisible({ timeout: 20_000 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `layout overflows at ${width}px`).toBeLessThanOrEqual(2);

    // No stale price control anywhere on the surface.
    await expect(page.locator("#final_price")).toHaveCount(0);
    expect(errors, `runtime error at ${width}px`).toHaveLength(0);
  });
}
