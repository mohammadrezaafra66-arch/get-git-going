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
import { readFileSync } from "node:fs";

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

  // ============================================================================
  // Step 4 — the data written in step 3 must be readable, and refusals must leave a trace.
  // ============================================================================

  test("every exception value has a Persian label, and the map is exhaustive", () => {
    // The union is what makes a missing label a compile error. If someone adds a fifth value to
    // the CHECK and the union without a label, this catches the half that TypeScript cannot: a
    // label that is present but empty, or one that is still the raw English key.
    const src = readFileSync("src/lib/sales/quotes.ts", "utf8");
    const values = [
      "overdue_salesperson_commitment",
      "credit_shortfall_salesperson_commitment",
      "accounting_approval",
      "guest_no_link",
    ];
    for (const v of values) {
      const row = new RegExp(`${v}:\\s*"([^"]+)"`).exec(src);
      expect(row, `${v} needs an entry in QUOTE_EXCEPTION_TYPE_LABELS`).not.toBeNull();
      const label = row![1];
      expect(label.length, `${v}'s label must not be empty`).toBeGreaterThan(2);
      expect(label, `${v}'s label must be Persian, not the raw key`).not.toContain(v);
      expect(/[؀-ۿ]/.test(label), `${v}'s label must contain Persian`).toBe(true);
    }
  });

  test("the detail page actually selects the exception columns", () => {
    // Rendering without selecting is the failure that reads as success: the block is in the JSX,
    // the value is undefined, and nothing shows. Both halves have to be present.
    const page = readFileSync("src/routes/_app.sales.quotes.$quoteId.tsx", "utf8");
    expect(page, "the select string must fetch the exception type").toContain(
      "quote_exception_type",
    );
    expect(page, "the select string must fetch the commitment text").toContain(
      "quote_exception_text",
    );
    expect(page, "the detail page must render the exception").toContain("quote-detail-exception");
    expect(page, "it must use the shared label map, not its own strings").toContain(
      "QUOTE_EXCEPTION_TYPE_LABELS",
    );
  });

  test("the list can filter guests, and the filter is a real query not a client slice", () => {
    const list = readFileSync("src/routes/_app.sales.quotes.index.tsx", "utf8");
    expect(list, "the badge needs customer_id in the select").toMatch(
      /select\([\s\S]{0,400}customer_id/,
    );
    expect(list, "the guest filter must reach the query").toContain('q.is("customer_id", null)');
    expect(list, "the linked filter must reach the query").toContain(
      'q.not("customer_id", "is", null)',
    );
    expect(list, "the filter must be in the query key or the cache lies").toContain("linkFilter");
    expect(list, "guest rows need a badge").toContain("quote-list-guest-badge");
  });

  test("refusals are recorded, with no identifying data and never blocking the user", () => {
    const form = readFileSync("src/routes/_app.sales.quotes.new.tsx", "utf8");
    const fn = form.slice(form.indexOf("function logQuoteRefusal"));
    // The whole function, from its declaration to the first line that is flush against the
    // left margin after it — robust to reformatting, unlike matching a brace.
    // The whole function: from its declaration to the next top-level declaration. Robust to
    // reformatting, unlike matching a brace.
    const end = fn.search(/\n(?=(function|const|type|export)\s)/);
    const body = end > 0 ? fn.slice(0, end) : fn;

    // NO PII. This is the assertion that matters most: the previous version of this write put
    // customer_name into the audit diff.
    for (const leak of ["customerName", "customerPhone", "customer_name", "customer_phone"]) {
      expect(body, `the refusal row must not carry ${leak}`).not.toContain(leak);
    }
    // Fire-and-forget by construction, not by convention.
    expect(body, "the refusal write must not be awaited").toContain("void supabase");
    expect(body, "a failed refusal write must be logged, not shown").toContain("console.error");
    // entity_id was null into a NOT NULL column — 0 rows had ever been written.
    // Code only — the prose above logQuoteRefusal explains the old bug and names the literal,
    // so a whole-file match would fail on the comment that documents the fix.
    const codeLines = form
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    expect(
      codeLines.some((l) => l.includes("entity_id: null")),
      "entity_id must never be null again — audit_logs.entity_id is NOT NULL",
    ).toBe(false);
    // Pre-submit stages must be covered, or most refusals are invisible.
    expect(form, "client validation refusals must be logged").toContain('"client_validation"');
    expect(form, "credit-gate refusals must be logged").toContain('"credit_gate"');
    expect(form, "server refusals must be logged").toContain('"server_rpc"');
  });

  test("the credit gate is logged BEFORE the dialog opens, not after confirmation", () => {
    // Non-vacuous ordering check. Most credit refusals end with the salesperson closing the
    // dialog, so a log written on confirmation would miss the majority — the exact under-count
    // the feature exists to avoid.
    const form = readFileSync("src/routes/_app.sales.quotes.new.tsx", "utf8");
    const logAt = form.indexOf('recordRefusal("credit_gate"');
    const dialogAt = form.indexOf("setBlockReason(creditBlocker)");
    expect(logAt, "the credit-gate log must exist").toBeGreaterThan(-1);
    expect(dialogAt, "the block dialog must still open").toBeGreaterThan(-1);
    expect(logAt, "the log must come before the dialog").toBeLessThan(dialogAt);
  });

  test("the guest refusal message no longer claims accounting approval is the only way", () => {
    // Migration 421. The message is the server's, so this reads the migration rather than the DB.
    const mig = readFileSync(
      "supabase/migrations/20260903140000_421_guest_refusal_message_tells_the_truth.sql",
      "utf8",
    );
    expect(mig, "the corrected message must name the guest route").toContain("مسیر مهمان");
    expect(mig, "the stale message must be gone").not.toContain(
      "وصل نیست و بدون تأیید حسابداری قابل ثبت نیست",
    );
  });

  test("the commitment flag controls BOTH copies of the checkbox, or neither", () => {
    // THE WHOLE POINT OF THE THIRD FLAG. The commitment exists twice — the block on the form and
    // the variant inside QuoteCreationBlockDialog. Gating only the form copy would MOVE the
    // checkbox into the dialog rather than remove it, which is the weaker design the form's own
    // comment argues against. One boolean feeds both, so this asserts the wiring, not the render.
    const form = readFileSync("src/routes/_app.sales.quotes.new.tsx", "utf8");

    // guestCommitmentRequired is the single source of truth and it must carry the flag.
    const decl = new RegExp(
      "const guestCommitmentRequired =\\s*\\n?\\s*FEATURE_QUOTE_GUEST_COMMITMENT",
    ).exec(form);
    expect(
      decl,
      "guestCommitmentRequired must be gated by FEATURE_QUOTE_GUEST_COMMITMENT",
    ).not.toBeNull();

    // …and it must reach all four sites: form block, save gate, detach preview, and the blocker
    // payload that carries it into the dialog.
    const uses = [...form.matchAll(/guestCommitmentRequired/g)].length;
    expect(
      uses,
      "the flag must reach every commitment site through one boolean",
    ).toBeGreaterThanOrEqual(5);
    expect(form, "the blocker must carry it into the dialog").toContain(
      "requiresCommitment: guestCommitmentRequired",
    );

    // The dialog must NOT read the flag itself — it takes requiresCommitment from the blocker.
    const dialog = readFileSync("src/components/sales/quotes/QuoteCreationBlockDialog.tsx", "utf8");
    expect(dialog, "the dialog must not import flags; it obeys requiresCommitment").not.toContain(
      "feature-flags",
    );
    expect(dialog, "and it must actually honour it").toContain("reason.requiresCommitment");
  });

  test("with the commitment flag off, a guest quote is no harder than it is today", () => {
    // The release must be behaviourally inert for the 76% of production quotes that have no
    // customer file. With the flag off, guestCommitmentRequired is false everywhere, so: no
    // checkbox on the form, no checkbox in the dialog, and no extra condition on the save button.
    const form = readFileSync("src/routes/_app.sales.quotes.new.tsx", "utf8");

    // The save gate's commitment clause must be the one that goes false, not a separate literal.
    const saveGate = form.slice(
      form.indexOf("disabled={"),
      form.indexOf('data-testid="quote-save"'),
    );
    expect(saveGate, "the save gate must depend on the same boolean").toContain(
      "!guestCommitmentAccepted",
    );
    expect(saveGate, "…which is itself flag-gated").toContain("guestCommitmentRequired");

    // guest_no_link must NOT be gated — ending the false "accounting approval" label is worth
    // having whether or not a commitment is demanded on top.
    const blocker = form.slice(
      form.indexOf("const findCreditBlocker"),
      form.indexOf("exceptionMatchesBlocker"),
    );
    expect(blocker, "the guest reason must still be produced").toContain('kind: "guest_no_link"');
    expect(blocker, "and it must not be behind the commitment flag").not.toContain(
      "FEATURE_QUOTE_GUEST_COMMITMENT",
    );
  });

  test("the deploy chain covers all three flags, not just the first two", () => {
    const flags = [
      ...readFileSync("src/lib/feature-flags.ts", "utf8").matchAll(/envFlag\(\s*"(VITE_[A-Z_]+)"/g),
    ].map((m) => m[1]);
    expect(flags, "the commitment flag must be declared").toContain(
      "VITE_FEATURE_QUOTE_GUEST_COMMITMENT",
    );
    expect(flags.length, "three flags are expected").toBe(3);
  });
});
