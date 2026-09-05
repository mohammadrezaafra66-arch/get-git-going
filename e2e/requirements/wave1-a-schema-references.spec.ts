/**
 * Wave 1 / Agent A — every table and column these screens read must actually
 * exist in the live schema.
 *
 * Why this shape. The defects in A-1, A-2 and A-3 were all the same defect:
 * source code naming a relation or a column that the database does not have.
 * `invoices` was dropped by migration 332 on 2026-08-08; `inquiries` never had
 * a `product_name` or `customer_name`; `product_computed_prices_public` has
 * `final_sale_price`/`rounded_sale_price` and never `sale_price`;
 * `purchase_prices` has `effective_at` and never `effective_from`.
 *
 * None of that is visible from the TypeScript types, because every one of these
 * calls goes out as an untyped string to PostgREST. So the test does not assert
 * "the code says sales_quotes" — a test written that way passes the moment
 * someone writes the name it was told to expect. It reads whatever table and
 * column names the source *currently* contains and asks the live database
 * whether they resolve. It therefore stays honest against future edits, and it
 * fails for exactly the right reason today.
 *
 * Measured before the fix (2026-09-05, live PostgREST):
 *   invoices                        -> 404 42P01  relation "public.invoices" does not exist
 *   inquiries.product_name          -> 400 42703  column inquiries.product_name does not exist
 *   pcpp.sale_price                 -> 400 42703  column ... .sale_price does not exist
 *   purchase_prices.effective_from  -> 400 42703  column ... .effective_from does not exist
 *
 * Run:
 *   npx playwright test e2e/requirements/wave1-a-schema-references.spec.ts \
 *     --workers=1 --reporter=line
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

import { rest, mintJwt, ADMIN_USER_ID } from "../helpers/pgrest";

/** The files Agent A owns. Each reads from PostgREST with string identifiers. */
const FILES = [
  "src/hooks/dashboard/useDashboardStats.ts",
  "src/hooks/dashboard/useDashboardChart.ts",
  "src/routes/_app.reports.tsx",
  "src/components/purchase/PurchaseRequestForm.tsx",
  "src/routes/_app.pricing.market-intelligence.tsx",
];

/** Filter/order builders whose first argument is a column name. */
const COLUMN_ARG_METHODS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "order"];

interface Usage {
  file: string;
  table: string;
  /** The literal passed to .select() */
  select: string;
  /** Columns named as the first argument of a filter/order builder. */
  columns: string[];
}

/** Whole-line `//` comments only — prose in them must never be read as code. */
function stripLineComments(src: string): string {
  return src
    .split(/\r?\n/)
    .map((l) => (/^\s*\/\//.test(l) ? "" : l))
    .join("\n");
}

/**
 * Pull every `.from("t") … .select("cols") … .eq("col", …)` chain out of a file.
 *
 * A chain is taken to run from its `.from(` to the next `.from(` or the end of
 * the file, which is exactly how these query builders are written here (one
 * chain per queryFn).
 */
function usagesIn(repoRoot: string, file: string): Usage[] {
  const src = stripLineComments(fs.readFileSync(path.join(repoRoot, file), "utf8"));
  const starts: { table: string; at: number; end: number }[] = [];
  const fromRe = /\.from\(\s*"([a-z0-9_]+)"\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(src)) !== null) {
    starts.push({ table: m[1], at: m.index, end: src.length });
  }
  starts.forEach((s, i) => {
    if (i + 1 < starts.length) s.end = starts[i + 1].at;
  });

  return starts.map((s) => {
    const chunk = src.slice(s.at, s.end);
    const sel = /\.select\(\s*"([^"]*)"/.exec(chunk);
    const columns: string[] = [];
    for (const method of COLUMN_ARG_METHODS) {
      const re = new RegExp(`\\.${method}\\(\\s*"([a-z0-9_]+)"`, "g");
      let c: RegExpExecArray | null;
      while ((c = re.exec(chunk)) !== null) columns.push(c[1]);
    }
    return { file, table: s.table, select: sel ? sel[1] : "*", columns: [...new Set(columns)] };
  });
}

const repoRoot = process.cwd();
const jwt = mintJwt(ADMIN_USER_ID);

/**
 * PostgREST validates the whole `select` (and every filter column) before it
 * looks at a single row, so RLS returning zero rows still proves the shape.
 * A missing relation is 404/42P01; a missing column is 400/42703.
 */
async function assertResolves(table: string, select: string, extra: string[]) {
  const selectParam = select.replace(/\s+/g, "");
  const r = await rest(jwt, `/${table}?select=${encodeURIComponent(selectParam)}&limit=1`);
  expect(
    r.status,
    `select on "${table}" did not resolve: ${r.text.slice(0, 300)}`,
  ).toBe(200);

  for (const col of extra) {
    const c = await rest(jwt, `/${table}?select=${encodeURIComponent(col)}&limit=1`);
    expect(
      c.status,
      `filter/order column "${table}.${col}" does not resolve: ${c.text.slice(0, 300)}`,
    ).toBe(200);
  }
}

test.describe("wave 1 / A — dashboard, reports, purchase form and pricing read real columns", () => {
  for (const file of FILES) {
    const usages = usagesIn(repoRoot, file);

    test(`${file} — every table and column it reads exists`, async () => {
      // A file that suddenly has no query at all would otherwise pass silently.
      expect(usages.length, `no .from("…") query found in ${file}`).toBeGreaterThan(0);
      for (const u of usages) {
        await assertResolves(u.table, u.select, u.columns);
      }
    });
  }

  test("the dropped `invoices` table is referenced by none of them", async () => {
    // Migration 332 dropped it on 2026-08-08. Guarding the name directly keeps
    // a future edit from reintroducing the exact bug this wave repaired.
    for (const file of FILES) {
      for (const u of usagesIn(repoRoot, file)) {
        expect(u.table, `${file} still queries the dropped table "invoices"`).not.toBe("invoices");
      }
    }
    // And it really is gone, so the guard above is not guarding a ghost.
    const r = await rest(jwt, "/invoices?select=id&limit=1");
    expect(r.status, `expected "invoices" to be absent, got ${r.status}`).not.toBe(200);
  });
});
