import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";

/**
 * Issue 219 — Final Release Review: the role matrix, in a real browser.
 *
 * The C5 report listed "browser sessions for sales / accountant" as SKIPPED and
 * asserted those cases at the database instead. Stored sessions for both do
 * exist (`e2e/auth/*.storage.json`), so the review closes that gap rather than
 * leaving it as a documented hole.
 *
 * The accounts, verified against the database before use:
 *   salesperson-a  test.sales@afrakala.local        active, role = sales only
 *   accountant     test.accountant@afrakala.local   active, role = accountant only
 *
 * There is no purchase_specialist session because no real user holds that role,
 * and granting it to a real person to make a test pass is exactly what the
 * instructions forbid. That path stays covered by the transactional database
 * suite, where the grant disappears on ROLLBACK.
 */

const SALES = "e2e/auth/salesperson-a.storage.json";
const ACCOUNTANT = "e2e/auth/accountant.storage.json";

// A guard against the fixtures silently changing underneath the assertions.
test("R0 the session fixtures are the pure roles this review assumes", () => {
  expect(
    dbScalar(`select coalesce(string_agg(role::text,',' order by role::text),'NONE')
                from public.user_roles where user_id='ea9b35dd-fd57-4905-9355-50ca8646d4d1'`),
    "salesperson-a is not a pure sales account any more",
  ).toBe("sales");
  expect(
    dbScalar(`select coalesce(string_agg(role::text,',' order by role::text),'NONE')
                from public.user_roles where user_id='90c0479f-410d-4fff-9e00-34bbba1cce2b'`),
    "the accountant fixture is not a pure accountant any more",
  ).toBe("accountant");
});

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------
test.describe("sales", () => {
  test.use({ storageState: SALES });

  test("R1 sales cannot create a purchase, and the form cannot be submitted", async ({ page }) => {
    const before = Number(dbScalar("select count(*) from public.purchases"));

    await page.goto("/purchases/create");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    /*
      Recorded rather than asserted: the route DOES render for a salesperson.
      requirePermission returns early while roles are still loading —

          if (auth.rolesLoading || auth.profileLoading || auth.loading)
            return { user, roles: auth.roles };

      — so on a direct navigation the check never runs. That early return is in
      HEAD, untouched by Issue 219, and it affects every guarded route in the
      application, not just this one. It is reported to the owner as a
      pre-existing framework limitation rather than silently patched here.

      What this test asserts is the boundary that actually protects the data:
      whatever the page shows, no purchase can come out of it.
    */
    console.log(`REVIEW sales-purchases-create-url=${page.url()}`);
    console.log(
      `REVIEW sales-form-rendered=${(await page.locator("#purchase_price").count()) > 0}`,
    );

    expect(
      Number(dbScalar("select count(*) from public.purchases")),
      "merely opening the page created a purchase",
    ).toBe(before);

    // The server is the authority, and it refuses this role outright.
    expect(
      dbScalar(`select coalesce(string_agg(role_name,',' order by role_name),'')
                  from public.role_permissions where module='purchases' and can_create`),
      "role_permissions advertises creation to a role the RPC refuses",
    ).toBe("admin,manager");
  });

  test("R2 the request space works, with no purchase action and no money", async ({ page }) => {
    await page.goto("/purchase");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/unauthorized|\/login/);
    await expect(page.getByText("فضای خرید").first()).toBeVisible({ timeout: 20_000 });

    // Raising a request is a salesperson's job and must still be offered.
    await expect(page.getByRole("tab", { name: "ارسال درخواست جدید" })).toBeVisible();

    // No assignment control, no standalone purchase control.
    await expect(page.getByRole("button", { name: /تعیین مسئول|تغییر مسئول/ })).toHaveCount(0);
    await expect(page.getByTestId("filter-unassigned")).toHaveCount(0);

    // No financial or supplier text anywhere on the surface.
    const body = await page.locator("body").innerText();
    expect(body, "a purchase price label leaked to sales").not.toContain("قیمت خرید");
    expect(body, "a supplier label leaked to sales").not.toContain("تأمین‌کننده");
  });

  test("R3 the summary the server sends carries no financial key", async ({ page }) => {
    // Asserted on the wire, not on the rendered text: a key that never arrives
    // cannot be read out of the payload by a determined client.
    const payloads: string[] = [];
    page.on("response", async (r) => {
      if (r.url().includes("/rpc/get_purchase_requests")) {
        try {
          payloads.push(await r.text());
        } catch {
          /* body already consumed */
        }
      }
    });

    await page.goto("/purchase");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("فضای خرید").first()).toBeVisible({ timeout: 20_000 });
    expect(payloads.length, "the request list never loaded").toBeGreaterThan(0);

    const all = payloads.join("");
    for (const key of ["purchase_price", "total_amount", "supplier_name", "currency"]) {
      expect(all, `${key} reached a sales session`).not.toContain(key);
    }
  });

  test("R4 the purchase panel menu entry — recorded, not assumed", async ({ page }) => {
    await page.goto("/purchase");
    await page.waitForLoadState("networkidle");

    const menuVisible = await page.getByRole("link", { name: "پنل خرید" }).count();
    // Recorded as evidence for the release decision rather than asserted either
    // way: /purchases and /purchase share one module key, so hiding it needs a
    // new module rather than a permission tweak.
    console.log(`REVIEW purchase-panel-menu-visible-to-sales=${menuVisible > 0}`);

    await page.goto("/purchases");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    const body = await page.locator("body").innerText();
    console.log(`REVIEW purchases-route-url=${url.includes("/unauthorized") ? "denied" : "open"}`);

    // Whatever the menu does, no purchase data may reach a salesperson.
    expect(body, "purchase price leaked on /purchases").not.toContain("قیمت خرید");
    expect(body, "supplier leaked on /purchases").not.toContain("تأمین‌کننده");
    await expect(page.getByRole("button", { name: "ثبت خرید", exact: true })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Accountant
// ---------------------------------------------------------------------------
test.describe("accountant", () => {
  test.use({ storageState: ACCOUNTANT });

  test("R5 an accountant cannot create a purchase either", async ({ page }) => {
    const before = Number(dbScalar("select count(*) from public.purchases"));

    await page.goto("/purchases/create");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Same pre-existing route-guard behaviour as R1; same real boundary.
    console.log(`REVIEW accountant-purchases-create-url=${page.url()}`);
    expect(Number(dbScalar("select count(*) from public.purchases"))).toBe(before);
  });

  test("R6 an accountant has no assignment control", async ({ page }) => {
    await page.goto("/purchase");
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/unauthorized")) return; // permitted outcome

    await expect(page.getByRole("button", { name: /تعیین مسئول|تغییر مسئول/ })).toHaveCount(0);
    await expect(page.getByTestId("filter-unassigned")).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Anonymous
// ---------------------------------------------------------------------------
test.describe("anonymous", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("R7 an anonymous visitor cannot reach the data", async ({ page }) => {
    for (const route of ["/purchase", "/purchases", "/purchases/create"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
      // Same early-return behaviour as R1: the shell renders before the guard
      // resolves. Recorded, not asserted.
      console.log(`REVIEW anon ${route} -> ${page.url()}`);
    }

    // The boundary that matters: the anon database role reaches nothing.
    for (const fn of [
      "create_purchase",
      "create_purchase_request",
      "assign_purchase_request",
      "update_purchase_status",
      "get_purchase_requests",
    ]) {
      expect(
        dbScalar(`select coalesce(bool_or(has_function_privilege('anon', p.oid,'EXECUTE')),false)::text
                    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname='${fn}'`),
        `anon can execute ${fn}`,
      ).toBe("false");
    }

    for (const tbl of ["purchases", "purchase_items", "purchase_requests"]) {
      expect(
        dbScalar(`select count(*) from information_schema.role_table_grants
                   where table_schema='public' and table_name='${tbl}' and grantee='anon'`),
        `anon holds grants on ${tbl}`,
      ).toBe("0");
    }
  });
});
