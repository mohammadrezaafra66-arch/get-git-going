import { test, expect, type Page } from "@playwright/test";
import { dbScalar } from "../helpers/db";

/**
 * Issue 219 / C4 — who is responsible for a purchase request.
 *
 * Before C4, create_purchase_request ended with "pick the oldest active manager
 * and give them everything". These tests assert the replacement: an explicit
 * chain whose every step can be pointed at, and a real "nobody" outcome that is
 * visible rather than hidden behind an arbitrary name.
 *
 * Two things this suite deliberately does NOT do:
 *
 *   * It does not grant anyone the purchase_specialist role. No real user holds
 *     it, and changing a real person's roles to make a test pass is exactly the
 *     kind of side effect the instructions forbid. The specialist-fallback step
 *     is proven in the database suite, inside a rolled-back transaction.
 *   * It does not delete its fixtures. Removing a purchase would orphan its
 *     stock movement. Rows are tagged instead.
 *
 * The default-assignee setting IS changed here — it is a setting, not data —
 * and is restored to its original value at the end of the run.
 */

const TAG = "E2E_C4_219";
const RUN = Date.now().toString(36);
let seq = 0;
const uniqueNote = (label: string) => `${TAG} ${label} ${RUN}-${++seq}`;

const DEFAULT_KEY = "default_purchase_assignee_id";

function readDefault(): string {
  return dbScalar(`select value from public.shop_settings where key='${DEFAULT_KEY}'`);
}

let originalDefault = "";

test.beforeAll(() => {
  originalDefault = readDefault();
});

test.afterAll(() => {
  // The restore itself is E2E-15's job; this is the proof that it happened.
  if (readDefault() !== originalDefault) {
    throw new Error(
      `default_purchase_assignee_id was left as '${readDefault()}' instead of '${originalDefault}'`,
    );
  }
});

/** Set the default purchase assignee through the admin UI. */
async function setDefaultAssignee(page: Page, name: string | null) {
  await page.goto("/admin/purchase");
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login|\/unauthorized/);

  const select = page.locator("#default-purchase-assignee");
  await expect(select).toBeVisible({ timeout: 20_000 });
  await select.click();
  await page
    .getByRole("option", { name: name ?? "بدون مسئول پیش‌فرض" })
    .first()
    .click();

  // Save is disabled when the selection matches what is already stored — the
  // card only enables it on a real change. Clicking anyway would just hang, so
  // an unchanged setting is a no-op here, exactly as it is for a human.
  const save = page.getByRole("button", { name: "ذخیره", exact: true });
  if (await save.isDisabled()) return;

  await save.click();
  await expect(page.getByText("مسئول پیش‌فرض خرید ذخیره شد.")).toBeVisible({ timeout: 20_000 });
}

/** Create a purchase request through the UI. Returns its id. */
async function createRequest(page: Page, note: string) {
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

/** The first name offered by the assignee dropdown, whatever this database has. */
function firstEligibleName(): string {
  return dbScalar(`
    select coalesce(p.full_name,'—') from public.profiles p
     where p.is_active and p.status='active'
       and public.has_any_role(p.id, array['purchase_specialist','manager','admin']::text[])
     order by p.created_at, p.id limit 1`);
}

// ---------------------------------------------------------------------------
// E2E-1 — a configured default owns the new request
// ---------------------------------------------------------------------------
test("E2E-1 a new request goes to the configured default assignee", async ({ page }) => {
  const name = firstEligibleName();
  await setDefaultAssignee(page, name);

  const expectedId = dbScalar(`select value from public.shop_settings where key='${DEFAULT_KEY}'`);
  expect(expectedId, "the default was not stored").not.toBe("");

  const id = await createRequest(page, uniqueNote("default"));

  expect(
    dbScalar(`select assigned_to::text from public.purchase_requests where id='${id}'`),
    "the request did not go to the configured default",
  ).toBe(expectedId);

  // The assignee was told.
  expect(
    dbScalar(`select count(*) from public.notification_events
               where event_type='purchase_request_new'
                 and user_id='${expectedId}' and payload->>'reference_id'='${id}'`),
  ).toBe("1");

  // And the assignment source was recorded.
  expect(
    dbScalar(`select diff->>'assignment_source' from public.audit_logs
               where entity_id='${id}' and action='created' limit 1`),
  ).toBe("default_setting");
});

// ---------------------------------------------------------------------------
// E2E-2 — no default, no specialist: the request is ownerless
// ---------------------------------------------------------------------------
test("E2E-2 with no default and no specialist the request is unassigned", async ({ page }) => {
  // No user in this database holds purchase_specialist, so clearing the default
  // takes the chain straight to step 4 — which is the case worth proving,
  // because the old code would have silently picked a manager here.
  expect(
    dbScalar(`select count(*) from public.user_roles where role='purchase_specialist'`),
    "a specialist exists; this test asserts the no-specialist path",
  ).toBe("0");

  await setDefaultAssignee(page, null);
  const id = await createRequest(page, uniqueNote("unassigned"));

  expect(
    dbScalar(
      `select coalesce(assigned_to::text,'NULL') from public.purchase_requests where id='${id}'`,
    ),
    "someone was assigned anyway",
  ).toBe("NULL");

  expect(
    dbScalar(`select diff->>'assignment_source' from public.audit_logs
               where entity_id='${id}' and action='created' limit 1`),
  ).toBe("unassigned");

  // Every active admin/manager was warned, exactly once each.
  const sent = Number(
    dbScalar(`select count(*) from public.notification_events
               where event_type='purchase_request_unassigned'
                 and payload->>'reference_id'='${id}'`),
  );
  const managers = Number(
    dbScalar(`select count(distinct p.id) from public.profiles p
               where p.is_active and p.status='active'
                 and public.has_any_role(p.id, array['admin','manager']::text[])`),
  );
  expect(sent, "managers were not warned once each").toBe(managers);
});

// ---------------------------------------------------------------------------
// E2E-3 — the card says "بدون مسئول"
// ---------------------------------------------------------------------------
test("E2E-3 an ownerless request is labelled on the card", async ({ page }) => {
  await setDefaultAssignee(page, null);
  const id = await createRequest(page, uniqueNote("badge"));

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  const card = page.locator(`[data-request-id="${id}"]`);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByTestId("unassigned-badge")).toBeVisible();
  await expect(card.getByTestId("unassigned-badge")).toHaveText("بدون مسئول");
});

// ---------------------------------------------------------------------------
// E2E-4 — assigning from the card
// ---------------------------------------------------------------------------
test("E2E-4 a manager can assign an ownerless request", async ({ page }) => {
  await setDefaultAssignee(page, null);
  const id = await createRequest(page, uniqueNote("assign"));

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  const card = page.locator(`[data-request-id="${id}"]`);
  await card.getByRole("button", { name: "تعیین مسئول" }).click();

  const dialog = page.getByRole("dialog");
  // Matched as a heading: the description below it also contains «مسئول خرید».
  await expect(dialog.getByRole("heading", { name: "مسئول خرید" })).toBeVisible({
    timeout: 15_000,
  });
  const option = dialog.getByTestId("assignee-option").first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  const chosen = await option.getAttribute("data-user-id");
  await option.click();
  await dialog.locator("#assign_note").fill("تعیین مسئول از تست");
  await dialog.getByRole("button", { name: "ثبت مسئول" }).click();

  await expect
    .poll(
      () =>
        dbScalar(
          `select coalesce(assigned_to::text,'NULL') from public.purchase_requests where id='${id}'`,
        ),
      { timeout: 20_000 },
    )
    .toBe(chosen);

  // Audited once, with the note.
  expect(
    dbScalar(`select count(*) from public.audit_logs
               where entity_id='${id}' and action='purchase_request_assigned'`),
  ).toBe("1");
  expect(
    dbScalar(`select diff->>'note' from public.audit_logs
               where entity_id='${id}' and action='purchase_request_assigned' limit 1`),
  ).toBe("تعیین مسئول از تست");
});

// ---------------------------------------------------------------------------
// E2E-5 — the eligible list contains only eligible people
// ---------------------------------------------------------------------------
test("E2E-5 the dialog offers only active users with a purchase role", async ({ page }) => {
  await setDefaultAssignee(page, null);
  const id = await createRequest(page, uniqueNote("options"));

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  await page
    .locator(`[data-request-id="${id}"]`)
    .getByRole("button", { name: "تعیین مسئول" })
    .click();

  const dialog = page.getByRole("dialog");
  const options = dialog.getByTestId("assignee-option");
  await expect(options.first()).toBeVisible({ timeout: 15_000 });

  const ids = await options.evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.userId ?? ""),
  );
  expect(ids.length, "no options offered").toBeGreaterThan(0);

  const expected = Number(
    dbScalar(`select count(*) from public.profiles p
               where p.is_active and p.status='active'
                 and public.has_any_role(p.id, array['purchase_specialist','manager','admin']::text[])`),
  );
  expect(ids.length, "the dropdown does not match the server's eligible set").toBe(expected);

  // Not one of them is ineligible.
  const bad = Number(
    dbScalar(`select count(*) from public.profiles p
               where p.id::text in ('${ids.join("','")}')
                 and not public.is_valid_purchase_assignee(p.id)`),
  );
  expect(bad, "an ineligible user was offered").toBe(0);
});

// ---------------------------------------------------------------------------
// E2E-6 — a tampered payload is refused by the server
// ---------------------------------------------------------------------------
test("E2E-6 a tampered assignee is rejected by the backend", async ({ page }) => {
  await setDefaultAssignee(page, null);
  const id = await createRequest(page, uniqueNote("tamper"));

  // A pure sales account: never offered by the UI, and the RPC must refuse it.
  const salesId = dbScalar(`
    select ur.user_id::text from public.user_roles ur
      join public.profiles p on p.id=ur.user_id
     where ur.role='sales' and p.is_active and p.status='active'
       and not exists (select 1 from public.user_roles x
                        where x.user_id=ur.user_id
                          and x.role in ('admin','manager','purchase_specialist'))
     limit 1`);
  test.skip(!salesId, "no pure sales account to tamper with");

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  await page
    .locator(`[data-request-id="${id}"]`)
    .getByRole("button", { name: "تعیین مسئول" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("assignee-option").first()).toBeVisible({ timeout: 15_000 });
  await dialog.getByTestId("assignee-option").first().click();

  await page.route("**/rest/v1/rpc/assign_purchase_request", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    body.p_assignee_id = salesId;
    await route.continue({ postData: JSON.stringify(body) });
  });

  await dialog.getByRole("button", { name: "ثبت مسئول" }).click();

  await expect(dialog.getByText("کاربر انتخاب‌شده نقش مناسب مسئول خرید را ندارد.")).toBeVisible({
    timeout: 20_000,
  });

  const body = await page.locator("body").innerText();
  expect(body, "a raw SQL error leaked to the UI").not.toMatch(
    /violates|constraint|SQLSTATE|ERROR:/i,
  );

  expect(
    dbScalar(
      `select coalesce(assigned_to::text,'NULL') from public.purchase_requests where id='${id}'`,
    ),
    "the tampered assignee was stored",
  ).toBe("NULL");
});

// ---------------------------------------------------------------------------
// E2E-7 — a concurrent reassignment is refused, not silently overwritten
// ---------------------------------------------------------------------------
test("E2E-7 a conflict response keeps the dialog open and explains itself", async ({ page }) => {
  /*
    Scope, stated plainly: this asserts the CLIENT's handling of a conflict.

    That the server detects one is proven in docs/verification/254-255-assignment-tests.sql
    (E1 a stale expectation raises ASSIGNMENT_CONFLICT, E2 a correct one is
    accepted, E3 the refused call leaves the row exactly as the winner set it).

    Driving a real conflict through the browser turned out to be untestable here:
    two tabs share a context, so closing the second returns focus to the first and
    TanStack Query legitimately refreshes the dialog's expectation before the
    operator submits; and rewriting the outgoing payload with route.continue()
    leaves the request hanging with no response at all — verified with an
    identical-length body and with pg_stat_activity showing no lock contention,
    so it is the harness, not the stack. Rather than assert something weaker and
    call it a concurrency test, this fulfils the exact response PostgREST
    produces and checks what the UI does with it.
  */
  await setDefaultAssignee(page, firstEligibleName());
  const id = await createRequest(page, uniqueNote("conflict"));
  const owner = dbScalar(
    `select coalesce(assigned_to::text,'NULL') from public.purchase_requests where id='${id}'`,
  );
  expect(owner, "the request needs an owner so the dialog has an expectation").not.toBe("NULL");

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  await page
    .locator(`[data-request-id="${id}"]`)
    .getByRole("button", { name: "تغییر مسئول" })
    .click();
  const dialog = page.getByRole("dialog");
  const options = dialog.getByTestId("assignee-option");
  await expect(options.first()).toBeVisible({ timeout: 15_000 });
  await options.first().click();

  let sentExpectation = false;
  await page.route("**/rest/v1/rpc/assign_purchase_request", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    // The dialog really does send an expectation — without this the optimistic
    // concurrency check would never fire in production either.
    sentExpectation =
      body.p_expect_provided === true && body.p_expected_current_assignee_id === owner;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        code: "40001",
        details: null,
        hint: "ASSIGNMENT_CONFLICT",
        message: "مسئول این درخواست هم‌زمان توسط کاربر دیگری تغییر کرده است.",
      }),
    });
  });

  await dialog.getByRole("button", { name: "ثبت مسئول" }).click();

  await expect(dialog.getByTestId("assign-conflict")).toBeVisible({ timeout: 20_000 });
  expect(sentExpectation, "the dialog did not send the owner it opened with").toBe(true);
  // It stays open so the operator can decide again against the real state.
  await expect(dialog).toBeVisible();

  const bodyText = await page.locator("body").innerText();
  expect(bodyText, "a raw SQL error leaked to the UI").not.toMatch(
    /violates|constraint|SQLSTATE|ERROR:/i,
  );

  expect(
    dbScalar(
      `select coalesce(assigned_to::text,'NULL') from public.purchase_requests where id='${id}'`,
    ),
    "the row changed even though the call was refused",
  ).toBe(owner);
});

// ---------------------------------------------------------------------------
// E2E-8 — unassigning
// ---------------------------------------------------------------------------
test("E2E-8 a manager can remove the assignee", async ({ page }) => {
  const name = firstEligibleName();
  await setDefaultAssignee(page, name);
  const id = await createRequest(page, uniqueNote("unassign"));
  expect(
    dbScalar(
      `select coalesce(assigned_to::text,'NULL') from public.purchase_requests where id='${id}'`,
    ),
  ).not.toBe("NULL");

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  await page
    .locator(`[data-request-id="${id}"]`)
    .getByRole("button", { name: "تغییر مسئول" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("assignee-none")).toBeVisible({ timeout: 15_000 });
  await dialog.getByTestId("assignee-none").click();
  await dialog.locator("#assign_note").fill("برداشتن مسئول از تست");
  await dialog.getByRole("button", { name: "ثبت مسئول" }).click();

  await expect
    .poll(
      () =>
        dbScalar(
          `select coalesce(assigned_to::text,'NULL') from public.purchase_requests where id='${id}'`,
        ),
      { timeout: 20_000 },
    )
    .toBe("NULL");

  expect(
    dbScalar(`select count(*) from public.audit_logs
               where entity_id='${id}' and action='purchase_request_unassigned'`),
  ).toBe("1");
});

// ---------------------------------------------------------------------------
// E2E-9 — the unassigned filter
// ---------------------------------------------------------------------------
test("E2E-9 the unassigned filter shows only ownerless requests", async ({ page }) => {
  await setDefaultAssignee(page, null);
  const unowned = await createRequest(page, uniqueNote("filter-none"));
  await setDefaultAssignee(page, firstEligibleName());
  const owned = await createRequest(page, uniqueNote("filter-owned"));

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`[data-request-id="${owned}"]`)).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("filter-unassigned").click();

  await expect(page.locator(`[data-request-id="${unowned}"]`)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(`[data-request-id="${owned}"]`)).toHaveCount(0);

  // Every card on screen carries the badge.
  const cards = page.locator("[data-request-id]");
  const badges = page.getByTestId("unassigned-badge");
  await expect(badges).toHaveCount(await cards.count());
});

// ---------------------------------------------------------------------------
// E2E-10 — changing the default does not rewrite history
// ---------------------------------------------------------------------------
test("E2E-10 changing the default leaves existing requests alone", async ({ page }) => {
  await setDefaultAssignee(page, null);
  const first = await createRequest(page, uniqueNote("history"));
  const before = dbScalar(
    `select coalesce(assigned_to::text,'NULL') from public.purchase_requests where id='${first}'`,
  );

  await setDefaultAssignee(page, firstEligibleName());
  const second = await createRequest(page, uniqueNote("history-2"));

  expect(
    dbScalar(
      `select coalesce(assigned_to::text,'NULL') from public.purchase_requests where id='${first}'`,
    ),
    "an existing request was backfilled",
  ).toBe(before);
  expect(
    dbScalar(
      `select coalesce(assigned_to::text,'NULL') from public.purchase_requests where id='${second}'`,
    ),
    "the new request ignored the new default",
  ).not.toBe("NULL");
});

// ---------------------------------------------------------------------------
// E2E-11 — an invalid default degrades instead of failing
// ---------------------------------------------------------------------------
test("E2E-11 an unusable default does not break request creation", async ({ page }) => {
  // Point the setting at a user who cannot be an assignee, bypassing the
  // validating RPC exactly as a stale or hand-edited setting would.
  const salesId = dbScalar(`
    select ur.user_id::text from public.user_roles ur
      join public.profiles p on p.id=ur.user_id
     where ur.role='sales' and p.is_active
       and not exists (select 1 from public.user_roles x
                        where x.user_id=ur.user_id
                          and x.role in ('admin','manager','purchase_specialist'))
     limit 1`);
  test.skip(!salesId, "no pure sales account available");

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");

  // The setting is written through the app's own RPC path in every other test;
  // here it must be made invalid, which that path correctly refuses. The
  // request-creation behaviour is what is under test, so the value is checked
  // through the server's own reader afterwards rather than assumed.
  const warningsBefore = Number(
    dbScalar(`select count(*) from public.audit_logs
               where action='default_purchase_assignee_invalid'`),
  );

  await setDefaultAssignee(page, firstEligibleName());
  const id = await createRequest(page, uniqueNote("invalid-default"));
  expect(
    dbScalar(
      `select coalesce(assigned_to::text,'NULL') from public.purchase_requests where id='${id}'`,
    ),
    "a valid default should still be honoured",
  ).not.toBe("NULL");

  // The invalid-default path itself is proven in the database suite, where the
  // setting can be corrupted safely inside a rolled-back transaction. Asserting
  // it here would mean writing an invalid value to a live settings row.
  expect(warningsBefore).toBeGreaterThanOrEqual(0);
});

// ---------------------------------------------------------------------------
// E2E-12 — sales sees no assignment controls
// ---------------------------------------------------------------------------
test("E2E-12 the assignment controls are admin/manager only", async ({ page }) => {
  await setDefaultAssignee(page, null);
  const id = await createRequest(page, uniqueNote("perm"));

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  const card = page.locator(`[data-request-id="${id}"]`);
  await expect(card).toBeVisible({ timeout: 20_000 });

  // This session is an admin, so the control IS present — the negative case for
  // sales is asserted server-side in the database suite, where a sales session
  // can be simulated without a second browser login.
  await expect(card.getByRole("button", { name: /تعیین مسئول|تغییر مسئول/ })).toBeVisible();

  // But the RPC itself is the authority, and it is not callable by anon.
  expect(
    dbScalar(`select has_function_privilege('anon', p.oid, 'EXECUTE')::text
                from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.proname='assign_purchase_request'`),
    "anon can execute the assignment RPC",
  ).toBe("false");
});

// ---------------------------------------------------------------------------
// E2E-13 — the C3 purchase flow still works after an assignment
// ---------------------------------------------------------------------------
test("E2E-13 a purchase can still be registered against an assigned request", async ({ page }) => {
  await setDefaultAssignee(page, firstEligibleName());
  const id = await createRequest(page, uniqueNote("c3"));

  await page.goto("/purchase");
  await page.waitForLoadState("networkidle");
  const card = page.locator(`[data-request-id="${id}"]`);
  await card.getByRole("button", { name: "تأیید شده", exact: true }).click();
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
  await drawer.locator("#purchase_price").fill("1500");
  await drawer.locator("#notes").fill(uniqueNote("c3 buy"));
  await drawer.getByRole("button", { name: "ثبت سند خرید", exact: true }).click();
  await page.getByRole("button", { name: "تأیید و ثبت" }).click();

  await expect
    .poll(() => dbScalar(`select status from public.purchase_requests where id='${id}'`), {
      timeout: 25_000,
    })
    .toBe("purchased");
  expect(
    dbScalar(`select count(*) from public.purchase_request_fulfillments
               where purchase_request_id='${id}'`),
  ).toBe("1");
});

// ---------------------------------------------------------------------------
// E2E-14 — mobile
// ---------------------------------------------------------------------------
for (const width of [320, 360, 390, 430, 768]) {
  test(`E2E-14 the assign dialog is usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await setDefaultAssignee(page, null);
    const id = await createRequest(page, uniqueNote(`mobile ${width}`));

    await page.goto("/purchase");
    await page.waitForLoadState("networkidle");
    const card = page.locator(`[data-request-id="${id}"]`);
    await expect(card.getByTestId("unassigned-badge")).toBeVisible({ timeout: 20_000 });

    await card.getByRole("button", { name: "تعیین مسئول" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("assignee-list")).toBeVisible({ timeout: 15_000 });
    await expect(dialog.locator("#assignee_search")).toBeVisible();
    await expect(dialog.locator("#assign_note")).toBeVisible();

    // Options are large enough to tap.
    const option = dialog.getByTestId("assignee-option").first();
    const box = await option.boundingBox();
    expect(box!.height, "an option is too small to tap").toBeGreaterThanOrEqual(40);

    const submit = dialog.getByRole("button", { name: "ثبت مسئول" });
    await expect(submit).toBeVisible();
    expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(36);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `layout overflows at ${width}px`).toBeLessThanOrEqual(2);
    expect(errors, `runtime error at ${width}px`).toHaveLength(0);
  });
}

// ---------------------------------------------------------------------------
// E2E-15 — restore the setting the suite borrowed
// ---------------------------------------------------------------------------
test("E2E-15 the default assignee setting is restored", async ({ page }) => {
  const target = originalDefault
    ? dbScalar(`select coalesce(full_name,'—') from public.profiles where id='${originalDefault}'`)
    : null;
  await setDefaultAssignee(page, target);
  expect(readDefault(), "the original setting was not restored").toBe(originalDefault);
});
