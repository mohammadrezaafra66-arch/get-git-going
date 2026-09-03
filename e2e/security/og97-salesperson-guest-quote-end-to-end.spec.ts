/**
 * OG-97 — the salesperson path, end to end, with a real sales-role account.
 *
 * WHY. Both guest quotes on staging (SQ-2026-000239 and -000240) were recorded through the
 * PRIVILEGED path: an admin session, GUEST_NO_LINK_PRIVILEGED_TEXT, no checkbox. The path this
 * release exists for — a salesperson accepting a named commitment — has never been run end to end
 * by anyone. og94 proves the button disables and re-enables; it stops before saving. This does not.
 *
 * IT CREATES AT MOST ONE QUOTE, on the LAN test server, and reports its number and audit row id so
 * the owner can open it in a browser. The count guard below allows exactly one and no more.
 *
 * NEVER RUN THIS AGAINST PRODUCTION.
 *
 * NO CUSTOMER DATA IS PRINTED. The customer arrives through QT_WITH_PHONE and is only typed into a
 * search box; assertions read commitment text and audit diffs, never identity fields.
 */
import { expect, test, type Page } from "@playwright/test";

import { dbRows, dbScalar } from "../helpers/db";

const WITH_PHONE = process.env.QT_WITH_PHONE ?? "";
const PRODUCT = process.env.QT_PRODUCT ?? "";

const quoteCount = () => Number(dbScalar("SELECT count(*) FROM sales_quotes"));

/** Detach from a picked customer so the quote is a guest one, and choose a settlement type. */
async function guestQuote(page: Page) {
  await page.goto("/sales/quotes/new");
  const search = page.getByTestId("quote-customer-search");
  if (!(await search.isVisible().catch(() => false))) {
    await page.getByText("انتخاب مشتری موجود", { exact: true }).click();
  }
  await search.fill(WITH_PHONE.slice(0, 2));
  await page.locator('[data-testid^="quote-customer-result-"]').first().click({ timeout: 15_000 });
  await page.getByTestId("quote-detach-open").click();
  await page.getByTestId("quote-detach-confirm").click();
  await page.getByTestId("quote-settlement-select").click();
  await page.getByRole("option").first().click();
}

/** One item, priced high so no settlement floor can refuse it. */
async function addItem(page: Page) {
  await page.getByTestId("quote-add-item").click();
  const psearch = page.getByTestId("quote-product-search");
  const hit = page.locator('[data-testid^="quote-product-result-"]').first();
  await psearch.fill(PRODUCT);
  if (!(await hit.isVisible({ timeout: 6_000 }).catch(() => false))) {
    await psearch.fill("");
    await psearch.fill(PRODUCT);
  }
  await hit.click({ timeout: 15_000 });
  await page.getByTestId("quote-item-price-type").click();
  await page.getByRole("option").first().click();
  await page.getByTestId("quote-item-quantity").fill("1");
  await page.getByTestId("quote-item-unit-price").fill("999999999");
  await page.getByTestId("quote-item-add-confirm").click();
}

test.describe("OG-97 — a salesperson records a guest quote", () => {
  test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });
  test.skip(!WITH_PHONE || !PRODUCT, "QT_WITH_PHONE and QT_PRODUCT must be set");

  let before = 0;
  test.beforeEach(() => {
    before = quoteCount();
  });
  test.afterEach(() => {
    const created = quoteCount() - before;
    expect(
      created,
      "at most one quote per test, and only where the test says so",
    ).toBeLessThanOrEqual(1);
  });

  test("the commitment is shown, gates the save button, and releases it when accepted", async ({
    page,
  }) => {
    await guestQuote(page);
    await addItem(page);

    // The exact wording, not a paraphrase. A commitment that names nobody is not this commitment.
    const text = await page.getByTestId("quote-guest-commitment-text").innerText();
    expect(text).toContain("اینجانب متعهد می‌شوم");
    expect(text, "the person responsible must be named").toContain("خانم ماهرو");
    expect(text).toContain("تمام مسئولیت ثبت این پیش‌فاکتور بر عهده اینجانب خواهد بود");

    const save = page.getByTestId("quote-save");
    const box = page.getByTestId("quote-guest-commitment-check");
    await expect(box).not.toBeChecked();
    await expect(save, "before the tick, saving must be impossible").toBeDisabled();
    await box.click();
    await expect(save, "after the tick, saving must be possible").toBeEnabled();

    expect(quoteCount(), "this test only inspects, it does not save").toBe(before);
  });

  test("bypassing the checkbox in the DOM does not produce a quote", async ({ page }) => {
    // THE MUTATION THAT MATTERS. A checkbox is a client-side control. If a quote can be saved
    // without it, the commitment is decoration and anyone with dev-tools walks around the gate.
    //
    // The assertion is the OUTCOME, not the mechanism. A first version of this test insisted a
    // dialog appear and failed — React re-disables the button on its next render, so the forced
    // click lands on a dead control and nothing opens. Nothing opening is a refusal too. What
    // must never happen is a row.
    await guestQuote(page);
    await addItem(page);

    await page.getByTestId("quote-save").evaluate((el) => {
      el.removeAttribute("disabled");
      (el as HTMLButtonElement).disabled = false;
    });
    await expect(page.getByTestId("quote-guest-commitment-check")).not.toBeChecked();
    // force: true so the click definitely dispatches even if React has re-disabled the button.
    await page.getByTestId("quote-save").click({ force: true });
    await page.waitForTimeout(3_000);

    expect(quoteCount(), "a bypassed commitment must not produce a quote").toBe(before);
    expect(page.url(), "and it must not navigate away as a successful save does").toContain(
      "/sales/quotes/new",
    );
  });

  test("and the server refuses it too, independently of the browser", async () => {
    // Belt and braces at the layer that cannot be bypassed. Proven during migration 420 with a
    // simulated sales JWT in a rolled-back transaction: p_customer_id NULL with anything other
    // than accounting_approval or guest_no_link is refused at the function's own branch —
    //   "این پیش‌فاکتور به پرونده مشتری ثبت‌شده وصل نیست…"  ERRCODE 22023
    // Asserted here from the live definition, because a UI test cannot reach that branch once
    // the client refuses first.
    const def = dbRows(
      "SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname = 'create_sales_quote_with_items'",
    );
    expect(def.length, "the function must exist").toBe(1);
    const guard = dbRows(
      `SELECT (pg_get_functiondef(oid) LIKE '%p_customer_id IS NULL%')::text
       FROM pg_proc WHERE proname = 'create_sales_quote_with_items'`,
    );
    expect(guard[0], "the guest branch must still exist in the live function").toBe("true");
    const allowed = dbRows(
      `SELECT (pg_get_functiondef(oid) LIKE '%IS DISTINCT FROM ''guest_no_link''%')::text
       FROM pg_proc WHERE proname = 'create_sales_quote_with_items'`,
    );
    expect(allowed[0], "a guest quote must still require an explicit reason on the server").toBe(
      "true",
    );
  });

  test("a salesperson can complete the sale, and it lands with its own audit row", async ({
    page,
  }) => {
    // The owner allowed ONE new quote for this proof. Once it exists, this test has done its
    // job and re-running it would only add litter to a shared database.
    const already = Number(
      dbScalar(
        `SELECT count(*) FROM sales_quotes
         WHERE quote_exception_type = 'guest_no_link'
           AND quote_exception_text LIKE '%خانم ماهرو%'`,
      ),
    );
    test.skip(already > 0, "the salesperson proof quote already exists — see the release notes");

    const auditBefore = Number(dbScalar("SELECT COALESCE(max(id), 0) FROM audit_logs"));
    await guestQuote(page);
    await addItem(page);
    await page.getByTestId("quote-guest-commitment-check").click();
    await page.getByTestId("quote-save").click();

    // The list is where a saved quote lands.
    await page.waitForURL("**/sales/quotes", { timeout: 30_000 });
    expect(quoteCount(), "exactly one quote").toBe(before + 1);

    const row = dbRows(
      `SELECT quote_number || '␟' || id || '␟' || COALESCE(quote_exception_type,'-')
              || '␟' || (customer_id IS NULL)::text || '␟' || left(quote_exception_text, 24)
       FROM sales_quotes ORDER BY created_at DESC LIMIT 1`,
    )[0].split("␟");
    const [number, id, exceptionType, isGuest, textHead] = row;
    console.log(`[og97] quote ${number} (id ${id})`);

    expect(exceptionType, "the reason must be the guest one, not accounting's").toBe(
      "guest_no_link",
    );
    expect(isGuest, "it must carry no customer file").toBe("true");
    expect(textHead, "the salesperson's commitment, not the privileged system line").toContain(
      "اینجانب متعهد",
    );

    // The independent audit row — the only evidence a commitment was accepted at all.
    const audit = dbRows(
      `SELECT id || '␟' || entity_id || '␟' || diff::text FROM audit_logs
       WHERE id > ${auditBefore} AND action = 'sales_quote_guest_no_link' ORDER BY id`,
    );
    expect(audit.length, "the commitment must leave its own row").toBe(1);
    const [auditId, entityId, diff] = audit[0].split("␟");
    console.log(`[og97] audit row ${auditId} for quote id ${entityId}`);
    expect(entityId, "the audit row must point at this quote").toBe(id);

    const d = JSON.parse(diff) as Record<string, unknown>;
    expect(d.commitment_accepted).toBe(true);
    expect(d.commitment_template).toBe("ACCOUNTING_APPROVAL_TEXT");
    expect(Object.keys(d)).toContain("commitment_template_fingerprint");
    expect(d.actor_roles, "recorded as a salesperson, not a manager").toContain("sales");
    for (const leak of ["customer_name", "customer_phone", "name", "phone"]) {
      expect(Object.keys(d), `the audit row must not carry ${leak}`).not.toContain(leak);
    }

    // And the detail page shows the same commitment back, with its confirmation stamp.
    await page.goto(`/sales/quotes/${id}`);
    const callout = page.getByTestId("quote-detail-exception");
    await expect(callout).toBeVisible({ timeout: 15_000 });
    await expect(callout).toContainText("مشتری مهمان");
    await expect(callout, "the words the salesperson signed").toContainText("خانم ماهرو");
    await expect(callout, "with a confirmation stamp").toContainText("تأیید در");
  });
});
