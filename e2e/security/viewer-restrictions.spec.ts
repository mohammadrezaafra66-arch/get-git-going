import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";
import { ADMIN_USER_ID, lanEnv, mintJwt, rest, restUrl } from "../helpers/pgrest";

/**
 * ASAN M1.3 / migration 281 — the `viewer` role must not see contact details,
 * sales documents or anything financial.
 *
 * Everything here runs against PostgREST with a real JWT rather than through the
 * UI, because RLS is the only layer a direct API call cannot walk around. Hiding
 * a column in React is decoration; hiding it in a policy is the control.
 *
 * Two things this spec is careful about:
 *
 *  - It **counts rows**. RLS on SELECT never raises — it silently returns an
 *    empty set — so a 200 proves nothing and a 404 proves the wrong thing.
 *  - It picks the viewer account **explicitly**. The owner's account also holds
 *    `viewer`, alongside admin/manager/sales/accountant, and probing with it
 *    would measure an administrator while appearing to measure a viewer. The
 *    restriction deliberately applies only to users whose *sole* role is viewer;
 *    roles are additive everywhere else in this system.
 */

const VIEWER_EMAIL = "test.viewer@afrakala.local";
const VIEWER_PASSWORD = "AfraTest!1404";

/** Tables a viewer must not get a single row from. */
const RESTRICTED = [
  "person_identifiers", // phone, national id and IBAN live in value_raw
  "customers", // phone, address, city, tax id
  "suppliers",
  "visitors",
  "sales_quotes",
  "sales_quote_items",
  "payment_receipts",
  "payment_receipt_links",
  "journal_entries",
  "journal_lines",
  "bank_accounts",
  "customer_credit_balance",
  "customer_credit_ledger",
  "daily_capital_settings",
  "salesperson_capital_allocations_dynamic",
  "purchase_prices",
  "purchases",
  "product_computed_prices",
  "pricing_rules",
  "shop_settings", // holds shop_phone, shop_address, global_default_margin, didar_api_key
  "audit_logs",
  "bot_api_keys",
  "user_roles",
  "role_permissions",
];

/** Views that run with their owner's rights and therefore need their own guard. */
const RESTRICTED_VIEWS = [
  "vw_account_balances",
  "v_dynamic_salesperson_capital_balances",
  "v_dynamic_customer_capital_balances",
  "v_promotion_suggestions",
  "product_computed_prices_public",
  "publish_recipients_view",
];

/**
 * What a viewer is still entitled to. Restricting must not mean locking out.
 *
 * `products` is deliberately absent: `role_permissions` has had
 * viewer/products/can_view = false since before this phase, and
 * `products_select_dynamic` keys on it, so a viewer has never seen the product
 * table. Widening that is a grant, not a restriction, and is left to the owner.
 */
const STILL_ALLOWED = ["persons", "brands", "product_labels", "knowledge_documents"];

let viewerJwt: string;
let salesJwt: string;
let adminJwt: string;

async function rows(jwt: string, table: string): Promise<number> {
  const res = await rest<unknown[]>(jwt, `/${table}?select=*&limit=200`);
  expect(
    res.status,
    `${table}: expected a readable endpoint, got ${res.status} ${res.text.slice(0, 200)}`,
  ).toBeLessThan(400);
  return Array.isArray(res.body) ? res.body.length : 0;
}

test.beforeAll(async () => {
  const env = lanEnv();
  const res = await fetch(`${restUrl().replace("/rest/v1", "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: VIEWER_EMAIL, password: VIEWER_PASSWORD }),
  });
  const body = (await res.json()) as { access_token?: string };
  expect(res.status, `viewer login failed: ${JSON.stringify(body).slice(0, 200)}`).toBe(200);
  expect(body.access_token, "no access token for the viewer").toBeTruthy();
  viewerJwt = body.access_token as string;

  adminJwt = mintJwt(ADMIN_USER_ID);

  // test.sales has a different password, so its token is minted the way the rest
  // of this suite mints tokens. The salesperson must be one who actually owns
  // quotes — sales_quotes_select scopes to salesperson_id = uid(), so "any sales
  // user" would return zero rows for a reason that has nothing to do with this
  // phase and the assertion below would be measuring the wrong thing.
  const owner = dbRows(`
    select salesperson_id::text from public.sales_quotes
     where salesperson_id is not null
     group by salesperson_id order by count(*) desc limit 1
  `);
  expect(owner.length, "no salesperson owns a quote on this server").toBeGreaterThan(0);
  salesJwt = mintJwt(owner[0]);
});

test.describe("M1.3 — the viewer role is restricted at the database", () => {
  test("the account under test really is viewer-only", async () => {
    const roles = await rest<{ role: string }[]>(
      adminJwt,
      `/user_roles?select=role&user_id=eq.${JSON.parse(
        Buffer.from(viewerJwt.split(".")[1], "base64url").toString(),
      ).sub}`,
    );
    expect(roles.body.map((r) => r.role).sort()).toEqual(["viewer"]);
  });

  for (const table of RESTRICTED) {
    test(`viewer gets zero rows from ${table}`, async () => {
      expect(await rows(viewerJwt, table), `${table} leaked rows to a viewer`).toBe(0);
    });
  }

  for (const view of RESTRICTED_VIEWS) {
    test(`viewer gets zero rows from view ${view}`, async () => {
      expect(await rows(viewerJwt, view), `${view} leaked rows to a viewer`).toBe(0);
    });
  }

  test("no sensitive column reaches the viewer through an embed", async () => {
    // persons stays readable for names, so the identifiers have to be empty on
    // the nested resource too, not merely on the top-level table.
    const res = await rest<{ id: string; display_name: string; person_identifiers: unknown[] }[]>(
      viewerJwt,
      "/persons?select=id,display_name,person_identifiers(kind,value_raw,value_normalized)&limit=50",
    );
    expect(res.status, res.text).toBeLessThan(400);
    expect(res.body.length, "the viewer lost access to names as well").toBeGreaterThan(0);
    const leaked = res.body.flatMap((p) => p.person_identifiers ?? []);
    expect(leaked, "identifiers leaked through the persons embed").toEqual([]);
  });

  for (const table of STILL_ALLOWED) {
    test(`viewer still reads ${table}`, async () => {
      expect(await rows(viewerJwt, table), `${table} became unreadable — this over-restricted`).
        toBeGreaterThan(0);
    });
  }

  test("aggregate statistics still resolve for a viewer", async () => {
    const res = await rest<unknown[]>(viewerJwt, "/v_pricing_recompute_queue_summary?select=*");
    expect(res.status, res.text).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("a salesperson is unaffected", async () => {
    for (const table of ["customers", "sales_quotes", "persons", "products"]) {
      expect(await rows(salesJwt, table), `${table} became unreadable for sales`).toBeGreaterThan(
        0,
      );
    }
  });

  test("the viewer cannot write either", async () => {
    const res = await rest(viewerJwt, "/customers", {
      method: "POST",
      body: JSON.stringify({ name: "QA-viewer-should-not-write" }),
    });
    expect(res.status, "a viewer managed to insert a customer").toBeGreaterThanOrEqual(400);
    // and prove it by counting, since PostgREST can report success on zero rows
    const after = await rest<{ id: string }[]>(
      adminJwt,
      "/customers?select=id&name=eq.QA-viewer-should-not-write",
    );
    expect(after.body.length, "a row was actually created").toBe(0);
  });

  test("every table in public has row level security enabled", async () => {
    // Four 2026-07-22 backup tables had RLS switched off entirely, which made any
    // policy on them decorative — including this phase's. Migration 281 turned it
    // on; this keeps it on, and catches the next table created without it.
    const offenders = dbRows(`
      select c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
       order by c.relname
    `);
    expect(offenders, "tables in public without RLS").toEqual([]);
  });
});
