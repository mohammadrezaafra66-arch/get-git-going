import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";
import { mintJwt, rest, ADMIN_USER_ID } from "../helpers/pgrest";

/**
 * ASAN M3 addendum — the Asan product code as a first-class, human-entered field.
 *
 * Owner decision, docs/execution/OWNER_ANSWERS_AND_OVERRIDES.md:
 *   "The product creation form must expose this field... It is optional, not required...
 *    Wire it end to end: the column exists, the create form writes to it, the edit form
 *    updates it, and it survives a round-trip."
 *
 * The first three cases are driven **through the real browser form**, because that is
 * precisely the claim being made: not that the column accepts a value, but that a human
 * typing into the page ends up with that value in the database. The DB is the oracle —
 * the toast is not evidence of what was stored.
 *
 * The last two cases are API-level, because they assert rules that must survive a client
 * that never opens the form: migration 289's normalisation trigger and 283's partial
 * unique index. A rule that only the form enforces is not a rule.
 */

const MARK = `${E2E_PREFIX}ASAN_CODE`;
const NAME_WITH_CODE = `${MARK}_WITH`;
const NAME_WITHOUT_CODE = `${MARK}_WITHOUT`;
const NAME_RIVAL = `${MARK}_RIVAL`;

/** Deliberately Persian digits with surrounding whitespace: the form must not be the only
 *  thing standing between a paste from Asan and a code that does not match itself. */
const TYPED_CODE = "  ۹۹۹۱۲۳۴ ";
const TYPED_CODE_NORMALIZED = "9991234";
const EDIT_CODE = "9995678";

const NAME_PLACEHOLDER = "مثلاً: موتور القایی ۳ کیلووات";
const CODE_PLACEHOLDER = "کد کالا در نرم‌افزار آسان (اختیاری)";

let adminJwt: string;
let productsBaseline = 0;

const codeOf = (name: string) =>
  dbScalar(`select coalesce(accounting_code, '<null>') from products where name = '${name}'`);

const idOf = (name: string) => dbScalar(`select id from products where name = '${name}'`);

test.beforeAll(() => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  productsBaseline = Number(dbScalar("select count(*) from products"));
  expect(productsBaseline).toBeGreaterThan(0);
});

test.afterAll(async () => {
  dbExecE2e(`delete from products where name like '${MARK}%';`);
  const remaining = Number(dbScalar(`select count(*) from products where name like '${MARK}%'`));
  expect(remaining, "test products must not survive the phase (rule 2.10)").toBe(0);
  expect(Number(dbScalar("select count(*) from products"))).toBe(productsBaseline);
});

test.describe("the create form", () => {
  test("a product created through the form with an Asan code stores it", async ({ page }) => {
    await page.goto("/products/new");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder(NAME_PLACEHOLDER).fill(NAME_WITH_CODE);
    await expect(page.getByPlaceholder(CODE_PLACEHOLDER)).toBeVisible();
    await page.getByPlaceholder(CODE_PLACEHOLDER).fill(TYPED_CODE);
    await page.getByRole("button", { name: "ایجاد محصول" }).click();

    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}/, { timeout: 20_000 });

    // Persian digits folded, whitespace gone — the value Asan would recognise.
    expect(codeOf(NAME_WITH_CODE)).toBe(TYPED_CODE_NORMALIZED);
  });

  test("a product created without an Asan code still saves", async ({ page }) => {
    await page.goto("/products/new");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder(NAME_PLACEHOLDER).fill(NAME_WITHOUT_CODE);
    await page.getByRole("button", { name: "ایجاد محصول" }).click();

    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}/, { timeout: 20_000 });

    // Not the empty string: an empty string would claim a code, and two blank products
    // would then collide on the partial unique index from migration 283.
    expect(codeOf(NAME_WITHOUT_CODE)).toBe("<null>");
  });
});

test.describe("the edit form", () => {
  test("an existing product gets its Asan code set by hand and it survives a round-trip", async ({
    page,
  }) => {
    const id = idOf(NAME_WITHOUT_CODE);
    expect(id, "the previous test must have created this product").toMatch(/[0-9a-f-]{36}/);

    await page.goto(`/products/${id}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "ویرایش" }).first().click();

    const field = page.getByPlaceholder(CODE_PLACEHOLDER);
    await expect(field).toBeVisible();
    await expect(field).toHaveValue("");
    await field.fill(EDIT_CODE);
    await page.getByRole("button", { name: "ذخیره" }).first().click();

    await expect.poll(() => codeOf(NAME_WITHOUT_CODE), { timeout: 20_000 }).toBe(EDIT_CODE);

    // The round trip the owner asked for: reload the page and the field still reads it back.
    await page.goto(`/products/${id}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(EDIT_CODE).first()).toBeVisible();
  });
});

test.describe("the rules live in the database, not in the form", () => {
  test("a direct PostgREST PATCH is normalised by the trigger", async () => {
    const id = idOf(NAME_WITH_CODE);
    const res = await rest(adminJwt, `/products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ accounting_code: "  ۷۷۷۰۰۱ " }),
    });
    expect(res.status, res.text).toBeLessThan(300);
    expect(codeOf(NAME_WITH_CODE)).toBe("777001");

    // And a cleared field becomes NULL rather than an empty-string code.
    const cleared = await rest(adminJwt, `/products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ accounting_code: "   " }),
    });
    expect(cleared.status, cleared.text).toBeLessThan(300);
    expect(codeOf(NAME_WITH_CODE)).toBe("<null>");
  });

  test("two products cannot claim one Asan code", async () => {
    const rival = await rest<{ id: string }[]>(adminJwt, "/products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: NAME_RIVAL,
        product_type: "iranian",
        base_currency: "toman",
        stock_status: "unknown",
        status: "active",
        // The code the edit-form test parked on NAME_WITHOUT_CODE.
        accounting_code: EDIT_CODE,
      }),
    });
    expect(rival.status, "a duplicate Asan code must be rejected").toBe(409);
    expect(rival.text).toMatch(/products_accounting_code_unique/);
    expect(Number(dbScalar(`select count(*) from products where name = '${NAME_RIVAL}'`))).toBe(0);
  });
});
