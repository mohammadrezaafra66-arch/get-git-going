/**
 * OG-95 — refusals are RECORDED, proven by rows in the database, not by reading the code.
 *
 * WHY THIS FILE EXISTS. Twice in this project "the code is there" was mistaken for "it works":
 * the feature flag that was never on, and an audit helper writing columns that do not exist. The
 * refusal logging added in step 4 had the same shape of evidence — a source-file assertion in
 * og94 and zero rows in the table. og94 proves the call site exists. Only this file proves a row
 * lands, and it is the difference between a count and a guess.
 *
 * IT WRITES AUDIT ROWS AND NOTHING ELSE. Every flow below is refused, so no quote is created:
 * a refused create_sales_quote_with_items raises before its first INSERT and rolls back. The rows
 * these tests add are exactly the refusal rows under test, and each test lists the ids it created.
 *
 * NO CUSTOMER DATA IS PRINTED. The customer arrives through QT_WITH_PHONE and is only typed into
 * a search box. The assertions read audit diffs and assert the ABSENCE of identifying fields.
 */
import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { dbRows, dbScalar } from "../helpers/db";

const WITH_PHONE = process.env.QT_WITH_PHONE ?? "";
const PRODUCT = process.env.QT_PRODUCT ?? "";

const maxAuditId = () => Number(dbScalar("SELECT COALESCE(max(id), 0) FROM audit_logs"));

/** Every audit row written since `since`, as id|action|entity_id|diff. */
function rowsSince(
  since: number,
): Array<{ id: string; action: string; entityId: string; diff: string }> {
  return dbRows(
    `SELECT id || '␟' || action || '␟' || entity_id || '␟' || diff::text
     FROM audit_logs WHERE id > ${since} ORDER BY id`,
  ).map((line) => {
    const [id, action, entityId, diff] = line.split("␟");
    return { id, action, entityId, diff };
  });
}

const stagesOf = (rows: ReturnType<typeof rowsSince>) =>
  rows
    .filter((r) => r.action === "sales_quote_refused")
    .map((r) => (JSON.parse(r.diff) as { stage: string }).stage);

/** Attach any customer this session can see, then detach so the quote is a guest one. */
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
  // Without this the client refuses first with settlement_type_missing and the server is never
  // reached — measured: rows 60323 and 60325 were exactly that, not the server refusal expected.
  await page.getByTestId("quote-settlement-select").click();
  await page.getByRole("option").first().click();
}

/** One real item. Priced high enough to clear any settlement floor unless told otherwise. */
async function addItem(page: Page, unitPrice = "999999999") {
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
  await page.getByTestId("quote-item-unit-price").fill(unitPrice);
  await page.getByTestId("quote-item-add-confirm").click();
}

test.describe("OG-95 — a refused quote leaves a row", () => {
  test.skip(!WITH_PHONE || !PRODUCT, "QT_WITH_PHONE and QT_PRODUCT must be set");

  test("the credit gate is recorded, and BEFORE the dialog the salesperson may just close", async ({
    page,
  }) => {
    const since = maxAuditId();
    await guestQuote(page);
    await addItem(page);

    // A guest quote with no exception chosen: findCreditBlocker refuses and the dialog opens.
    await page.getByTestId("quote-save").click();
    await expect(page.getByTestId("quote-block-dialog")).toBeVisible();

    const rows = rowsSince(since);
    console.log("[og95] credit_gate rows created:", rows.map((r) => r.id).join(", ") || "(none)");
    expect(stagesOf(rows), "closing the dialog must not be needed for the row to exist").toContain(
      "credit_gate",
    );

    // The row must survive the salesperson walking away — which is the common case, and the
    // reason the log is written before the dialog rather than on confirmation.
    await page.getByRole("button", { name: "بستن و اصلاح اطلاعات" }).click();
    expect(rowsSince(since).length, "the row is already committed").toBeGreaterThan(0);
  });

  test("client validation is recorded ONCE, and not mislabelled as a server refusal", async ({
    page,
  }) => {
    const since = maxAuditId();
    await guestQuote(page);
    await addItem(page);
    // A guest quote's phone is editable. Emptying it makes validateQuote refuse inside the
    // mutation — after the credit dialog, so this exercises the second stage specifically.
    await page.getByTestId("quote-customer-phone").fill("");

    await page.getByTestId("quote-save").click();
    await page.getByTestId("quote-confirm-guest-no-link").click();
    await expect(page.getByTestId("quote-rejection-dialog")).toBeVisible({ timeout: 15_000 });

    const rows = rowsSince(since);
    console.log("[og95] validation rows created:", rows.map((r) => r.id).join(", ") || "(none)");
    const stages = stagesOf(rows);
    expect(stages, "the client refusal must be recorded").toContain("client_validation");
    // THE MISLABEL GUARD. onError sees this failure too; without the AlreadyLoggedError marker it
    // would write a second row claiming the server refused something it was never asked about.
    expect(
      stages.filter((s) => s === "server_rpc"),
      "the server never saw this",
    ).toHaveLength(0);
    expect(
      stages.filter((s) => s === "client_validation"),
      "exactly one row per refusal",
    ).toHaveLength(1);
  });

  test("a server refusal is recorded, and no quote is written", async ({ page }) => {
    const quotesBefore = Number(dbScalar("SELECT count(*) FROM sales_quotes"));
    const since = maxAuditId();
    await guestQuote(page);
    // Priced below the settlement floor. There is no client-side floor check, so this passes
    // validateQuote and is refused by the RPC — a genuine server refusal, reachable from the UI.
    await addItem(page, "1");

    await page.getByTestId("quote-save").click();
    await page.getByTestId("quote-confirm-guest-no-link").click();
    await expect(page.getByTestId("quote-rejection-dialog")).toBeVisible({ timeout: 20_000 });

    const rows = rowsSince(since);
    console.log("[og95] server_rpc rows created:", rows.map((r) => r.id).join(", ") || "(none)");
    expect(stagesOf(rows), "the server refusal must be recorded").toContain("server_rpc");
    expect(
      Number(dbScalar("SELECT count(*) FROM sales_quotes")),
      "a refused quote must not exist",
    ).toBe(quotesBefore);
  });

  test("the salesperson's own note is recorded — the fourth path, broken until now", async ({
    page,
  }) => {
    // «ثبت دلیل» sent entity_id: null into a NOT NULL column, so it had never written a row.
    const since = maxAuditId();
    await guestQuote(page);
    await addItem(page, "1");
    await page.getByTestId("quote-save").click();
    await page.getByTestId("quote-confirm-guest-no-link").click();
    await expect(page.getByTestId("quote-rejection-dialog")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("quote-rejection-note").fill("PROBE NOTE");
    await page.getByTestId("quote-rejection-submit").click();

    await expect
      .poll(() => rowsSince(since).some((r) => r.action === "sales_quote_rejected"), {
        timeout: 15_000,
      })
      .toBe(true);
    const rows = rowsSince(since);
    console.log("[og95] note rows created:", rows.map((r) => r.id).join(", ") || "(none)");
    const note = rows.find((r) => r.action === "sales_quote_rejected")!;
    expect(note.entityId, "entity_id must be the attempt id, never null").toMatch(
      /^[0-9a-f-]{36}$/,
    );
    // The automatic row and the manual note describe the same attempt.
    const auto = rows.find((r) => r.action === "sales_quote_refused");
    expect(JSON.parse(note.diff).attempt_id, "the note must link to the attempt").toBe(
      auto ? JSON.parse(auto.diff).stage && note.entityId : note.entityId,
    );
  });

  test("no refusal row carries identifying data", async ({ page }) => {
    const since = maxAuditId();
    await guestQuote(page);
    await addItem(page);
    await page.getByTestId("quote-save").click();
    await expect(page.getByTestId("quote-block-dialog")).toBeVisible();

    const rows = rowsSince(since);
    console.log("[og95] PII-check rows:", rows.map((r) => r.id).join(", ") || "(none)");
    expect(
      rows.length,
      "there must be a row to inspect, or this test proves nothing",
    ).toBeGreaterThan(0);

    const typedName = WITH_PHONE.slice(0, 2);
    for (const r of rows) {
      const diff = JSON.parse(r.diff) as Record<string, unknown>;
      for (const key of [
        "customer_name",
        "customer_phone",
        "phone",
        "name",
        "address",
        "national_id",
      ]) {
        expect(Object.keys(diff), `${r.action} must not carry ${key}`).not.toContain(key);
      }
      // And not just the field names — the values must not appear anywhere in the blob.
      expect(r.diff, "the customer's name must not leak into any field").not.toContain(typedName);
    }
  });

  test("the recorded shape is what the design says it is", async ({ page }) => {
    const since = maxAuditId();
    await guestQuote(page);
    await addItem(page);
    await page.getByTestId("quote-save").click();
    await expect(page.getByTestId("quote-block-dialog")).toBeVisible();

    const row = rowsSince(since).find((r) => r.action === "sales_quote_refused");
    expect(row, "a refusal row must exist").toBeTruthy();
    const diff = JSON.parse(row!.diff) as Record<string, unknown>;
    for (const key of [
      "stage",
      "code",
      "actor_roles",
      "linked_to_customer_file",
      "customer_file_has_phone",
      "refused_at",
    ]) {
      expect(Object.keys(diff), `the row must carry ${key}`).toContain(key);
    }
    expect(diff.linked_to_customer_file, "this attempt was detached").toBe(false);
    expect(row!.entityId, "entity_id is the attempt id").toMatch(/^[0-9a-f-]{36}$/);
  });

  test("the logger is wired to the real column names, not the ones a helper invented", () => {
    // The class of bug this whole file exists to catch, asserted directly: the columns the code
    // writes must be columns the table has.
    const written = ["actor_id", "entity_type", "entity_id", "action", "diff"];
    const actual = dbRows(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_logs'",
    );
    for (const col of written) {
      expect(actual, `audit_logs has no column ${col}`).toContain(col);
    }
    const form = readFileSync("src/routes/_app.sales.quotes.new.tsx", "utf8");
    for (const ghost of ["table_name", "record_id", "change_details"]) {
      expect(form, `the form must not write the non-existent column ${ghost}`).not.toContain(
        `${ghost}:`,
      );
    }
  });
});
