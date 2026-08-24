import { test, expect, type Page } from "@playwright/test";

/**
 * M6 · R1 — the three wizard branches driven to the REVIEW step, with an accountant session.
 *
 * Reaching the route is not R1. M9 correctly refused to call R1 green on a 200 status alone;
 * this mission changes routing and guards, so the review screen is read and its values are
 * compared against what was typed in.
 *
 * NOTHING IS SUBMITTED. `wizard-submit` is never clicked, and the spec asserts the review
 * screen instead. No document, journal entry or row of any kind is created by this file.
 */

test.use({ storageState: "e2e/auth/accountant.storage.json" });

const AMOUNT = "1250000";
const AMOUNT_FA = "۱٬۲۵۰٬۰۰۰";
const CUSTOMER_ASAN = "105052";
const SUPPLIER_ASAN = "90019001";

async function openWizard(page: Page) {
  await page.goto("/accounting/receipts/create", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  // The access gate renders «در حال بررسی دسترسی…» until the roles arrive and then swaps the
  // page in, which remounts this subtree. Interacting across that swap made the branch card
  // vanish between the visibility check and the click, so wait for the gate to settle first.
  await expect(page.locator('[data-testid="route-gate-checking"]')).toHaveCount(0, {
    timeout: 25_000,
  });
  await expect(page.locator('[data-testid="create-roles-checking"]')).toHaveCount(0, {
    timeout: 25_000,
  });
  await expect(page.getByTestId("document-wizard")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("wizard-branch-receipt")).toBeVisible({ timeout: 15_000 });
}

async function next(page: Page) {
  const btn = page.getByTestId("wizard-next");
  await expect(btn).toBeEnabled({ timeout: 20_000 });
  await btn.click();
  await page.waitForTimeout(500);
}

/**
 * Choosing a branch ADVANCES the wizard by itself — `chooseBranch` in DocumentWizard ends with
 * `setStep(2)`. Three earlier drafts of this spec called `next()` afterwards and then clicked a
 * step-1 card that had already unmounted; the wizard was never at fault. Choosing a channel, by
 * contrast, does NOT advance, so those steps still need `next()`.
 */
async function pickBranch(page: Page, testId: string) {
  const card = page.getByTestId(testId);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  // step 1 is gone once the branch is taken
  await expect(page.getByTestId("wizard-branch-receipt")).toHaveCount(0, { timeout: 10_000 });
}

/**
 * Resolve a party through the wizard's own lookup. `lookupParty` accepts only an
 * `asan_person_code` or a `mobile_e164` and additionally REFUSES a person with no Asan code, so
 * the terms below are real Asan codes read out of `person_identifiers`:
 *   105052 — «علی», a customer;  90019001 — «شخص آزمایشی ۷۸», a supplier.
 */
async function lookupParty(page: Page, term: string) {
  await page.getByTestId("wizard-lookup-input").fill(term);
  await page.getByTestId("wizard-lookup-search").click();
  // The wizard resolves to a single party and renders it as a summary; there is no hit list to
  // pick from. Wait for `next` to unlock, which is the wizard's own statement that the party
  // step is satisfied (`payerLookup.status === "ok"`).
  await expect(page.getByTestId("wizard-next")).toBeEnabled({ timeout: 20_000 });
}

/** `wizard-account` is a native <select>, so it is driven with selectOption, not a click. */
async function selectFirstAccount(page: Page) {
  const sel = page.getByTestId("wizard-account");
  await expect(sel).toBeVisible({ timeout: 15_000 });
  const values = await sel.locator("option").evaluateAll((os) =>
    os.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
  );
  expect(values.length, "no account is available to choose").toBeGreaterThan(0);
  await sel.selectOption(values[0]);
}

async function readReview(page: Page): Promise<string> {
  const review = page.getByTestId("wizard-review");
  await expect(review).toBeVisible({ timeout: 15_000 });
  return ((await review.innerText()) || "").replace(/\s+/g, " ").trim();
}

test("R1-a — receipt branch reaches the review screen and shows what was entered", async ({
  page,
}) => {
  await openWizard(page);
  await pickBranch(page, "wizard-branch-receipt");

  // step 2 — channel. Choosing one does not advance.
  //
  // BANK, not cash, and that is a measured constraint rather than a preference: for the cash
  // channel `accountChoices` is empty, so the wizard renders «صندوقی با نوع نقدی ثبت نشده است.»
  // and no account control at all. `bank_accounts` holds exactly one row and its account_type
  // is 'bank'; there is no cash box on this server. That is OG-37, it predates this mission,
  // and creating one would be writing business data.
  await page.getByTestId("wizard-channel-bank").click();
  await next(page);

  // step 3 — payer
  await lookupParty(page, CUSTOMER_ASAN);
  await next(page);

  // step 4 — details
  await page.getByTestId("wizard-amount").fill(AMOUNT);
  await selectFirstAccount(page);
  await page.getByTestId("wizard-tracking").fill("R1RECV4410");
  const time = page.locator('input[type="time"]').first();
  if (await time.isVisible().catch(() => false)) await time.fill("10:30");
  await next(page);

  const text = await readReview(page);
  console.log("\nR1-a RECEIPT review screen: " + text);
  expect(text).toContain("نوع: دریافت");
  expect(text).toContain("نحوه: بانکی");
  expect(text).toContain(AMOUNT_FA);
  await expect(page.getByTestId("wizard-submit")).toBeVisible();
  // and it is NOT clicked.
});

test("R1-b — payment branch reaches the review screen and shows what was entered", async ({
  page,
}) => {
  await openWizard(page);
  await pickBranch(page, "wizard-branch-payment");

  await page.getByTestId("wizard-channel-bank").click();
  await next(page);

  await lookupParty(page, CUSTOMER_ASAN);
  await next(page);

  await page.getByTestId("wizard-amount").fill(AMOUNT);
  await selectFirstAccount(page);
  await page.getByTestId("wizard-tracking").fill("R1TRACK9911");
  const time = page.locator('input[type="time"]').first();
  if (await time.isVisible().catch(() => false)) await time.fill("11:15");
  await next(page);

  const text = await readReview(page);
  console.log("\nR1-b PAYMENT review screen: " + text);
  expect(text).toContain("نوع: پرداخت");
  expect(text).toContain("نحوه: بانکی");
  expect(text).toContain(AMOUNT_FA);
  expect(text).toContain("R1TRACK9911");
  await expect(page.getByTestId("wizard-submit")).toBeVisible();
});

test("R1-c — dual branch reaches the review screen and shows what was entered", async ({
  page,
}) => {
  await openWizard(page);
  await pickBranch(page, "wizard-branch-dual");

  // dual step 2 — the deposit slip itself: amount, date, tracking, description
  await page.getByTestId("wizard-amount").fill(AMOUNT);
  await page.getByTestId("wizard-tracking").fill("R1DUAL7722");
  await page.locator("textarea").first().fill("آزمون R1 — فقط تا صفحهٔ بازبینی، بدون ثبت");
  await next(page);

  // step 3 — payer, step 4 — beneficiary
  await lookupParty(page, CUSTOMER_ASAN);
  await next(page);
  await lookupParty(page, SUPPLIER_ASAN);
  await next(page);

  const text = await readReview(page);
  console.log("\nR1-c DUAL review screen: " + text);
  expect(text).toContain("نوع: سند دوبل");
  expect(text).toContain(AMOUNT_FA);
  expect(text).toContain("R1DUAL7722");
  expect(text).toContain("ذینفع");
  await expect(page.getByTestId("wizard-submit")).toBeVisible();
});
