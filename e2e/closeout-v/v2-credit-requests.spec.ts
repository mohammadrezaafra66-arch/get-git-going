/**
 * V-2 — the credit-raise round trip, driven across two roles in a real browser.
 *
 * Wave 6 proved `credit_requests` and `review_credit_request` at the DATABASE layer, by
 * calling the RPC directly. This is the first time anyone has clicked the buttons, and the
 * two halves do not behave the same way:
 *
 *   - filing a request (a plain INSERT through supabase-js) works;
 *   - approving one (the `review_credit_request` RPC) NEVER LEAVES THE BROWSER.
 *
 * `src/lib/credit/requests.ts:101` detaches the method from its client —
 * `const rpc = supabase.rpc as unknown as UntypedRpc;` — so the call runs with `this`
 * undefined and dies on `this.rest` before any fetch is issued. The second test below is
 * written to record exactly that, because a test that merely failed would leave the reader
 * guessing whether the selector or the product was wrong.
 *
 * This spec deliberately does NOT reach for another route to the RPC. Approving by SQL or by
 * a direct PostgREST call would produce a green round trip that no user can reproduce.
 */
import { test, expect } from "@playwright/test";
import { coldContext, coldLogin } from "./cold";
import { armLeakDetector, readLeaks } from "./leak";

const ART = ".artifacts";

/** The only customer `test.sales` can see: `customers` RLS scopes a salesperson to
 *  `responsible_id = auth.uid() OR responsible_id IS NULL`. */
const CUSTOMER = "مشتری آزمایشی 16";
const AMOUNT = "500000000";
const NOTES = "V-2 close-out proof — group V";

const PROTECTED = ["درخواست‌های افزایش اعتبار", "ثبت درخواست جدید"];

test("V-2 step 1 — salesperson-a files a credit-raise request, and it persists", async ({
  browser,
}) => {
  const ctx = await coldContext(browser);
  const page = await ctx.newPage();
  await coldLogin(page, "sales");

  await page.goto("/sales/credit-requests", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "درخواست‌های افزایش اعتبار" })).toBeVisible();

  // A salesperson may request but NOT approve: `sales.can_approve` is false, so the
  // «اقدام» column is not rendered at all.
  await expect(page.getByRole("columnheader", { name: "اقدام" })).toHaveCount(0);

  const existing = await page.locator("tr").filter({ hasText: CUSTOMER }).count();
  if (existing === 0) {
    // The picker is bounded to 30 rows (CLAUDE.md rule 11) and this salesperson can see 78
    // customers, so the target is only reachable through the search box.
    await page.locator("#cr-customer-search").fill(CUSTOMER);
    await page.locator("#cr-customer").click();
    await page.getByRole("option", { name: new RegExp(CUSTOMER) }).click();
    await page.locator("#cr-amount").fill(AMOUNT);
    await page.locator("#cr-notes").fill(NOTES);
    await page.getByRole("button", { name: "ثبت درخواست" }).click();
    await expect(page.getByText("درخواست ثبت شد")).toBeVisible();
  }

  await page.reload({ waitUntil: "domcontentloaded" }); // survives a fresh load ⇒ it is stored
  const row = page.locator("tr").filter({ hasText: CUSTOMER }).first();
  await expect(row).toContainText("در انتظار بررسی");
  await expect(row).toContainText("۵۰۰,۰۰۰,۰۰۰");
  await page.screenshot({ path: `${ART}/v2-sales-request-filed.png`, fullPage: true });
  await ctx.close();
});

test("V-2 step 2 — the manager's approve button issues no request at all (DEFECT)", async ({
  browser,
}) => {
  const ctx = await coldContext(browser);
  const page = await ctx.newPage();

  const rpcCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/rpc/")) rpcCalls.push(r.url().split("/rpc/")[1]);
  });

  await coldLogin(page, "manager");
  await page.goto("/sales/credit-requests", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "درخواست‌های افزایش اعتبار" })).toBeVisible();
  // The manager DOES get the action column — the UI half of the workflow is present.
  await expect(page.getByRole("columnheader", { name: "اقدام" })).toBeVisible();
  await page.screenshot({ path: `${ART}/v2-manager-pending.png`, fullPage: true });

  const row = page.locator("tr").filter({ hasText: CUSTOMER }).first();
  await expect(row).toContainText("در انتظار بررسی");
  const approve = row.getByRole("button", { name: "تأیید" });
  await expect(approve).toBeEnabled();
  rpcCalls.length = 0;
  await approve.click();

  // What actually happens: the client-side error surfaces as a toast, and the browser never
  // opens a connection for the RPC.
  const toast = page.locator("[data-sonner-toast]");
  await expect(toast).toBeVisible();
  const text = (await toast.innerText()).replace(/\s+/g, " ").trim();
  console.log("V-2 approve toast:", JSON.stringify(text));
  console.log("V-2 rpc calls after clicking approve:", JSON.stringify(rpcCalls));
  await page.screenshot({ path: `${ART}/v2-manager-approve-fails.png`, fullPage: true });

  expect(text).toContain("بررسی درخواست ناموفق بود");
  expect(text).toContain("Cannot read properties of undefined (reading 'rest')");
  expect(rpcCalls).not.toContain("review_credit_request");

  // And the request is still pending after a reload — nothing was decided.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("tr").filter({ hasText: CUSTOMER }).first()).toContainText(
    "در انتظار بررسی",
  );
  await ctx.close();
});

test("V-2 step 3 — no credit floor was recorded, because no approval ever landed", async ({
  browser,
}) => {
  const ctx = await coldContext(browser);
  const page = await ctx.newPage();
  await coldLogin(page, "sales");

  await page.goto("/sales/credit-requests", { waitUntil: "domcontentloaded" });
  await page.locator("#cr-customer-search").fill(CUSTOMER);
  await page.locator("#cr-customer").click();
  // The picker reads `customers.manual_credit_floor` straight from the table, so this option
  // label is the app reading back whatever an approval would have written.
  const option = page.getByRole("option", { name: new RegExp(CUSTOMER) });
  await expect(option).toBeVisible();
  const label = (await option.innerText()).trim();
  console.log("V-2 customer option label:", JSON.stringify(label));
  expect(label).not.toContain("سقف دستی فعلی");
  await page.screenshot({ path: `${ART}/v2-no-floor-recorded.png`, fullPage: true });
  await ctx.close();
});

test("V-2 viewer is refused the credit-requests screen from a cold context", async ({ browser }) => {
  const ctx = await coldContext(browser);
  const page = await ctx.newPage();
  await armLeakDetector(page, PROTECTED);
  await coldLogin(page, "viewer");

  await page.goto("/sales/credit-requests", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-gate-denied")).toBeVisible();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${ART}/v2-viewer-cold-refused.png`, fullPage: true });

  const leaks = await readLeaks(page);
  expect(leaks, `protected content painted: ${JSON.stringify(leaks)}`).toEqual([]);
  console.log("V-2 refusal url:", page.url());
  await ctx.close();
});
