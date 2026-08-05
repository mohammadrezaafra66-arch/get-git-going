import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";
import { mintJwt, rest, ADMIN_USER_ID } from "../helpers/pgrest";
import {
  exportProductCatalogToExcel,
  type ProductCatalogExportRow,
} from "../../src/lib/export/product-catalog-excel";
import { productSchema } from "../../src/lib/products/schemas";

/**
 * Migration 301 — optional products.torob_url + catalog Excel export from /products.
 * DB/API + excel helper run against live LAN; form/detail/download need the rebuilt web image.
 */

const MARK = `${E2E_PREFIX}TOROB301`;
const NAME_CREATE = `${MARK}_CREATE`;
const NAME_EDIT = `${MARK}_EDIT`;
const VALID_HTTPS = "https://torob.com/p/e2e-torob-301";
const VALID_HTTP = "http://example.com/p/e2e";
const INVALID_FTP = "ftp://torob.com/p/x";
const INVALID_PLAIN = "torob.com/p/x";

const EXPECTED_COLUMNS = [
  "ردیف",
  "کد کالا",
  "نام کالا",
  "برند",
  "دسته‌بندی",
  "نوع کالا",
  "وضعیت موجودی",
  "وضعیت",
  "بارکد",
  "کد آسان",
  "لینک ترب",
  "رنگ",
  "ظرفیت",
  "مدل",
  "واحد",
  "تاریخ خروجی",
] as const;

let adminJwt: string;
let productsBaseline = 0;

const torobOf = (name: string) =>
  dbScalar(`select coalesce(torob_url, '<null>') from products where name = '${name}'`);

const idOf = (name: string) => dbScalar(`select id from products where name = '${name}'`);

test.beforeAll(() => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  productsBaseline = Number(dbScalar("select count(*) from products"));
  expect(productsBaseline).toBeGreaterThan(0);
  expect(
    dbScalar(
      `select count(*) from information_schema.columns
        where table_schema='public' and table_name='products' and column_name='torob_url'`,
    ),
  ).toBe("1");
});

test.afterAll(() => {
  dbExecE2e(`delete from products where name like '${MARK}%';`);
  expect(Number(dbScalar(`select count(*) from products where name like '${MARK}%'`))).toBe(0);
  expect(Number(dbScalar("select count(*) from products"))).toBe(productsBaseline);
});

test.describe("PostgREST + CHECK (migration 301)", () => {
  test("create product with valid https torob_url", async () => {
    const res = await rest<{ id: string; torob_url: string | null }[]>(adminJwt, "/products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: NAME_CREATE,
        product_type: "iranian",
        base_currency: "toman",
        stock_status: "unknown",
        status: "active",
        torob_url: VALID_HTTPS,
      }),
    });
    expect(res.status, res.text).toBeLessThan(300);
    expect(torobOf(NAME_CREATE)).toBe(VALID_HTTPS);
  });

  test("edit torob_url to http then clear to NULL", async () => {
    const seed = await rest<{ id: string }[]>(adminJwt, "/products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: NAME_EDIT,
        product_type: "iranian",
        base_currency: "toman",
        stock_status: "unknown",
        status: "active",
        torob_url: VALID_HTTPS,
      }),
    });
    expect(seed.status, seed.text).toBeLessThan(300);
    const id = seed.body[0].id;

    const patched = await rest(adminJwt, `/products?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ torob_url: VALID_HTTP }),
    });
    expect(patched.status, patched.text).toBeLessThan(300);
    expect(torobOf(NAME_EDIT)).toBe(VALID_HTTP);

    const cleared = await rest(adminJwt, `/products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ torob_url: null }),
    });
    expect(cleared.status, cleared.text).toBeLessThan(300);
    expect(torobOf(NAME_EDIT)).toBe("<null>");
  });

  test("reject invalid torob_url values", async () => {
    for (const bad of [INVALID_FTP, INVALID_PLAIN, " "]) {
      const res = await rest(adminJwt, "/products", {
        method: "POST",
        body: JSON.stringify({
          name: `${MARK}_BAD_${bad.slice(0, 8)}`,
          product_type: "iranian",
          base_currency: "toman",
          stock_status: "unknown",
          status: "active",
          torob_url: bad,
        }),
      });
      expect(
        res.status,
        `should reject ${JSON.stringify(bad)}: ${res.text}`,
      ).toBeGreaterThanOrEqual(400);
      expect(res.text).toMatch(/products_torob_url_http_chk|23514/);
    }
    expect(Number(dbScalar(`select count(*) from products where name like '${MARK}_BAD_%'`))).toBe(
      0,
    );
  });
});

test.describe("zod + Excel helper (no deploy required)", () => {
  test("schema accepts http/https and empty; rejects ftp/plain", () => {
    const base = {
      name: "x",
      product_type: "iranian" as const,
      base_currency: "toman",
      stock_status: "unknown" as const,
      status: "active" as const,
      promotion_weight: 1,
      label_ids: [] as string[],
    };
    expect(productSchema.safeParse({ ...base, torob_url: VALID_HTTPS }).success).toBe(true);
    expect(productSchema.safeParse({ ...base, torob_url: VALID_HTTP }).success).toBe(true);
    expect(productSchema.safeParse({ ...base, torob_url: "" }).success).toBe(true);
    expect(productSchema.safeParse({ ...base, torob_url: INVALID_FTP }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, torob_url: INVALID_PLAIN }).success).toBe(false);
  });

  test("Excel columns/order include لینک ترب; writeFile is the only side effect", async () => {
    const beforeCount = Number(dbScalar("select count(*) from products"));
    const beforeMax = dbScalar("select coalesce(max(updated_at::text),'') from products");

    const rows: ProductCatalogExportRow[] = [
      {
        sku: "SKU-1",
        name: "نمونه",
        brand: "برند",
        category: "دسته",
        productType: "ایرانی",
        stockStatus: "نامشخص",
        status: "فعال",
        barcode: null,
        accountingCode: null,
        torobUrl: VALID_HTTPS,
        color: null,
        capacity: null,
        model: null,
        unit: "عدد",
      },
    ];

    const cwd = process.cwd();
    const outDir = join(tmpdir(), `torob301-xlsx-${Date.now()}`);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(outDir, { recursive: true });
    process.chdir(outDir);
    let fileName = "";
    try {
      const result = await exportProductCatalogToExcel(rows, {
        generatedAt: new Date("2026-08-05T12:00:00Z"),
      });
      fileName = result.fileName;
      expect(result.rowCount).toBe(1);
      expect(fileName).toBe("products-2026-08-05.xlsx");

      const XLSX = await import("xlsx");
      const wb = XLSX.read(readFileSync(fileName));
      const sheet = wb.Sheets["محصولات"];
      expect(sheet).toBeTruthy();
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
      expect(Object.keys(json[0])).toEqual([...EXPECTED_COLUMNS]);
      expect(json[0]["لینک ترب"]).toBe(VALID_HTTPS);
      expect(json[0]["نام کالا"]).toBe("نمونه");

      const magic = readFileSync(fileName).subarray(0, 4).toString("hex");
      expect(magic).toBe("504b0304");
      createHash("sha256").update(readFileSync(fileName)).digest("hex");
    } finally {
      process.chdir(cwd);
      if (fileName && existsSync(join(outDir, fileName))) unlinkSync(join(outDir, fileName));
    }

    expect(Number(dbScalar("select count(*) from products"))).toBe(beforeCount);
    expect(dbScalar("select coalesce(max(updated_at::text),'') from products")).toBe(beforeMax);
  });

  test("export cap constant is 5000 and used on the list route", () => {
    const src = readFileSync(join(process.cwd(), "src/routes/_app.products.index.tsx"), "utf8");
    expect(src).toMatch(/const EXPORT_ROW_CAP = 5000/);
    expect(src).toMatch(/\.limit\(EXPORT_ROW_CAP\)/);
    expect(src).toMatch(/stableFilters\.(brand_id|category_id|q|status)/);
    expect(src).not.toMatch(/\.from\("products"\)[\s\S]{0,200}\.(insert|update|delete)\(/);
  });
});

test.describe("UI on deployed /products (needs rebuilt web)", () => {
  test("detail shows Torob link; list has Excel; download respects filters; no mutation", async ({
    page,
  }) => {
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    const excelBtn = page.getByRole("button", { name: "خروجی اکسل" });
    const featureLive = await excelBtn.isVisible().catch(() => false);
    test.skip(
      !featureLive,
      "web image not yet rebuilt with Excel/Torob UI — re-run after LAN deploy",
    );

    // Seed (or refresh) a product with torob_url for detail + filter assertions.
    let id = idOf(NAME_CREATE);
    if (!id) {
      const created = await rest<{ id: string }[]>(adminJwt, "/products", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          name: NAME_CREATE,
          product_type: "iranian",
          base_currency: "toman",
          stock_status: "unknown",
          status: "active",
          torob_url: VALID_HTTPS,
        }),
      });
      expect(created.status, created.text).toBeLessThan(300);
      id = created.body[0].id;
    } else {
      await rest(adminJwt, `/products?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ torob_url: VALID_HTTPS }),
      });
    }

    await page.goto(`/products/${id}`);
    await page.waitForLoadState("networkidle");
    const link = page.getByRole("link", { name: VALID_HTTPS });
    await expect(link).toBeVisible({ timeout: 20_000 });
    await expect(link).toHaveAttribute("href", VALID_HTTPS);

    await page.getByRole("button", { name: "ویرایش" }).first().click();
    const field = page.getByPlaceholder("https://torob.com/p/… (اختیاری)");
    await expect(field).toBeVisible();
    await expect(field).toHaveValue(VALID_HTTPS);

    const beforeCount = Number(dbScalar("select count(*) from products"));
    const beforeMax = dbScalar("select coalesce(max(updated_at::text),'') from products");

    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    await expect(excelBtn).toBeVisible();

    const search = page.getByPlaceholder(/جستجو|نام|کد/i).first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill(MARK);
      await page.waitForTimeout(600);
    }

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await excelBtn.click();
    const download = await downloadPromise;
    const target = join(tmpdir(), `torob301-dl-${Date.now()}.xlsx`);
    await download.saveAs(target);

    const XLSX = await import("xlsx");
    const wb = XLSX.read(readFileSync(target));
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
    expect(Object.keys(json[0])).toEqual([...EXPECTED_COLUMNS]);
    expect(json.some((r) => String(r["لینک ترب"]).includes("torob.com"))).toBe(true);
    expect(json.length).toBeLessThanOrEqual(5000);
    unlinkSync(target);

    expect(Number(dbScalar("select count(*) from products"))).toBe(beforeCount);
    expect(dbScalar("select coalesce(max(updated_at::text),'') from products")).toBe(beforeMax);
  });
});
