/**
 * OG-94 — the BEHAVIOURAL witness for the quote customer picker.
 *
 * WHY THIS FILE EXISTS. og93 reads source files. That is a structural check, and on 2026-09-02 a
 * structural check is exactly what failed: the source was correct, the flag was off, and a grep for
 * the flag's name found it inside another variable's corrupted value and reported success. Twice.
 *
 * So this suite asserts the behaviour that is only possible when the flag is genuinely on, against
 * the running app. If the flag is off, the fields stay editable and these tests fail — which is the
 * property the two-witness rule needs and og93 structurally cannot provide.
 *
 * NO CUSTOMER DATA IS PRINTED. The two customers are supplied by name through QT_WITH_PHONE and
 * QT_NO_PHONE and are only ever typed into a search box, never asserted on, never logged. Nothing
 * here submits a quote, so the suite writes nothing: it stops before every save button.
 */
import { expect, test, type Page } from "@playwright/test";

const WITH_PHONE = process.env.QT_WITH_PHONE ?? "";
const NO_PHONE = process.env.QT_NO_PHONE ?? "";
const PRODUCT = process.env.QT_PRODUCT ?? "";

/** Open the form and attach the named customer through the picker. */
async function pick(page: Page, name: string) {
  await page.goto("/sales/quotes/new");
  const search = page.getByTestId("quote-customer-search");
  if (!(await search.isVisible().catch(() => false))) {
    await page.getByText("انتخاب مشتری موجود", { exact: true }).click();
  }
  // Retype once if nothing lands. The query is debounced 350ms and gated on two characters,
  // so a fill that races the debounce can leave the list empty with no error to see.
  const result = page.locator('[data-testid^="quote-customer-result-"]').first();
  await search.fill(name);
  if (!(await result.isVisible({ timeout: 6_000 }).catch(() => false))) {
    await search.fill("");
    await search.fill(name);
  }
  await result.click({ timeout: 15_000 });
  await expect(page.getByTestId("quote-link-badge-linked")).toBeVisible();
}

/**
 * Attach whatever customer the current session can actually see. The commitment tests care that
 * a customer is attached and then detached, not which one — and which customers a given role may
 * read is a separate RLS question they must not depend on. Measured: a salesperson session finds
 * nothing when searching a full 28-character name but does find rows on a short prefix.
 */
async function pickAny(page: Page) {
  await page.goto("/sales/quotes/new");
  const search = page.getByTestId("quote-customer-search");
  if (!(await search.isVisible().catch(() => false))) {
    await page.getByText("انتخاب مشتری موجود", { exact: true }).click();
  }
  await search.fill(WITH_PHONE.slice(0, 2));
  await page.locator('[data-testid^="quote-customer-result-"]').first().click({ timeout: 15_000 });
  await expect(page.getByTestId("quote-link-badge-linked")).toBeVisible();
}

test.describe("OG-94 — behaviour only possible with the picker flag on", () => {
  test.skip(
    !WITH_PHONE || !NO_PHONE || !PRODUCT,
    "QT_WITH_PHONE, QT_NO_PHONE and QT_PRODUCT must be set",
  );

  test("picking a customer makes name and phone read-only", async ({ page }) => {
    // THE BEHAVIOURAL WITNESS. Under the old rule both fields stayed editable, because editing them
    // was how the link was broken. Read-only is only reachable with the flag on.
    await pick(page, WITH_PHONE);
    await expect(page.getByTestId("quote-customer-name")).toHaveAttribute("readonly", /.*/);
    await expect(page.getByTestId("quote-customer-phone")).toHaveAttribute("readonly", /.*/);
  });

  test("the link survives an edit attempt on the phone field", async ({ page }) => {
    // The original defect, stated as a test: typing in the phone box used to silently drop the
    // customer id and turn a linked quote into a guest one, with no warning and no way to notice.
    await pick(page, WITH_PHONE);
    await page
      .getByTestId("quote-customer-phone")
      .fill("09120000000")
      .catch(() => {});
    await page
      .getByTestId("quote-customer-phone")
      .pressSequentially("123")
      .catch(() => {});
    await expect(page.getByTestId("quote-link-badge-linked")).toBeVisible();
    await expect(page.getByTestId("quote-link-badge-guest")).toHaveCount(0);
  });

  test("a customer with no phone offers to add one instead of blocking the sale", async ({
    page,
  }) => {
    // 51 of 86 active customers have no phone, and the RPC requires a non-empty one. Without this
    // button the read-only rule would make 59% of the register unsellable.
    await pick(page, NO_PHONE);
    await expect(page.getByTestId("quote-customer-no-phone")).toBeVisible();
    await expect(page.getByTestId("quote-add-phone-open")).toBeVisible();
    await page.getByTestId("quote-add-phone-open").click();
    await expect(page.getByTestId("quote-add-phone-input")).toBeVisible();
    // Deliberately not saved — this suite writes nothing to the customer file.
  });

  test("detaching is possible and returns the form to guest", async ({ page }) => {
    await pick(page, WITH_PHONE);
    await expect(page.getByTestId("quote-detach-open")).toBeVisible();
    await page.getByTestId("quote-detach-open").click();
    await page.getByTestId("quote-detach-confirm").click();
    await expect(page.getByTestId("quote-link-badge-guest")).toBeVisible();
    await expect(page.getByTestId("quote-customer-name")).not.toHaveAttribute("readonly", /.*/);
    await expect(page.getByTestId("quote-reattach")).toBeVisible();
  });

  test.describe("1-الف — a salesperson can still record a guest quote", () => {
    test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });

    test("the detach control is offered to sales, not only to admin and manager", async ({
      page,
    }) => {
      // THE REGRESSION THIS GUARDS. A role gate briefly restricted detaching to admin and manager,
      // which closes the walk-in counter: a salesperson facing a customer who will not be entered
      // into the register had no way to finish the sale. It sat inside the flag condition and the
      // flag was off, so it never rendered — but turning the flag on is exactly what would have
      // made it live, which is why the two ship together.
      // Any customer this salesperson can actually see — the point is the control, not the record,
      // and which customers a salesperson may read is a separate RLS question this must not depend on.
      await page.goto("/sales/quotes/new");
      const search = page.getByTestId("quote-customer-search");
      if (!(await search.isVisible().catch(() => false))) {
        await page.getByText("انتخاب مشتری موجود", { exact: true }).click();
      }
      // At least two characters, or the query never fires: enabled: customerSearchTerm.length >= 2.
      await search.fill(WITH_PHONE.slice(0, 2));
      const result = page.locator('[data-testid^="quote-customer-result-"]').first();
      await result.click({ timeout: 15_000 });
      await expect(page.getByTestId("quote-link-badge-linked")).toBeVisible();

      await expect(page.getByTestId("quote-detach-open")).toBeVisible();
      await expect(page.getByTestId("quote-detach-open")).toBeEnabled();
    });
  });

  // ============================================================================
  // 1-ب — the commitment. These are the tests that matter: the invariant is that a
  // salesperson cannot save a quote with no customer file until they have ticked a box
  // saying they accept a named, verbatim commitment.
  // ============================================================================

  /** Put one real item on the quote. The commitment block only appears for a real quote. */
  async function addOneItem(page: Page) {
    await page.getByTestId("quote-add-item").click();
    // Two characters minimum here too: enabled: term.length >= 2 && !selected.
    const psearch = page.getByTestId("quote-product-search");
    const hit = page.locator('[data-testid^="quote-product-result-"]').first();
    await psearch.fill(PRODUCT);
    if (!(await hit.isVisible({ timeout: 6_000 }).catch(() => false))) {
      await psearch.fill("");
      await psearch.fill(PRODUCT);
    }
    await hit.click({ timeout: 15_000 });
    // A price type is required before the confirm button enables (canSubmit needs salePriceTypeId).
    await page.getByTestId("quote-item-price-type").click();
    await page.getByRole("option").first().click();
    await page.getByTestId("quote-item-quantity").fill("1");
    await page.getByTestId("quote-item-unit-price").fill("999999999");
    await page.getByTestId("quote-item-add-confirm").click();
  }

  test.describe("a salesperson must accept the commitment", () => {
    test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });

    test("the save button stays disabled until the box is ticked", async ({ page }) => {
      // FORCED DISTURBANCE, and the whole point of the file. If this passes with the box
      // unticked then the checkbox is decoration and the test is worthless.
      await pickAny(page);
      await page.getByTestId("quote-detach-open").click();
      await page.getByTestId("quote-detach-confirm").click();
      await addOneItem(page);

      const save = page.getByTestId("quote-save");
      const box = page.getByTestId("quote-guest-commitment-check");

      await expect(box).toBeVisible();
      await expect(box).not.toBeChecked();
      await expect(save, "unticked commitment must block saving").toBeDisabled();

      await box.click();
      await expect(box).toBeChecked();
      await expect(save, "ticking the commitment must release the save button").toBeEnabled();

      // and withdrawing it must take the permission away again
      await box.click();
      await expect(save, "unticking must re-block saving").toBeDisabled();
    });

    test("the commitment is the real text, verbatim, naming the person responsible", async ({
      page,
    }) => {
      // A paraphrase is a different promise. This pins the exact sentence a salesperson signs.
      await pickAny(page);
      await page.getByTestId("quote-detach-open").click();
      await page.getByTestId("quote-detach-confirm").click();
      await addOneItem(page);

      const text = await page.getByTestId("quote-guest-commitment-text").innerText();
      expect(text).toContain("اینجانب متعهد می‌شوم");
      expect(text).toContain("خانم ماهرو");
      expect(text).toContain("تمام مسئولیت ثبت این پیش‌فاکتور بر عهده اینجانب خواهد بود");
    });

    test("the detach dialog shows the commitment before the decision, not after", async ({
      page,
    }) => {
      await pickAny(page);
      await page.getByTestId("quote-detach-open").click();
      await expect(page.getByTestId("quote-detach-commitment-preview")).toBeVisible();
      await expect(page.getByTestId("quote-detach-commitment-preview")).toContainText("خانم ماهرو");
    });
  });

  test.describe("an admin is not asked to accept what they were never shown", () => {
    test("no commitment block, and the save button is not gated by one", async ({ page }) => {
      // Recording the salesperson's words for a manager would be a false claim in the audit
      // record. They get a neutral system line instead, and no checkbox.
      await pickAny(page);
      await page.getByTestId("quote-detach-open").click();
      await page.getByTestId("quote-detach-confirm").click();
      await addOneItem(page);

      await expect(page.getByTestId("quote-guest-commitment-check")).toHaveCount(0);
      await expect(page.getByTestId("quote-detach-commitment-preview")).toHaveCount(0);
      await expect(page.getByTestId("quote-save")).toBeEnabled();
    });
  });
});
