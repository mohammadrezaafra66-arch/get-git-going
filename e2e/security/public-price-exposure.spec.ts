import { expect, test } from "@playwright/test";

import { appUrl, lanEnv, mintJwt, restUrl } from "../helpers/pgrest";

/**
 * M5 · OG-29 — THE assertion gate for this mission, and the only one it is allowed.
 *
 * The property asserted is one sentence: **no public surface returns a real, non-zero price to
 * an unauthenticated caller.**
 *
 * ## Why it is written two-sided
 *
 * M4's gate 386 failed review for testing only the direction that OPENS a guard and never the
 * direction that CLOSES it: a change that emptied the views for every user passed it. So this
 * gate asserts BOTH halves —
 *
 *   1. the unauthenticated caller gets no real price, AND
 *   2. a privileged caller still gets the price data it got before.
 *
 * A change that simply empties `product_computed_prices` for everyone must FAIL here. Publishing
 * nothing because there is nothing left is not the same outcome as publishing nothing because
 * the surface is closed, and only the second one is what the owner asked for.
 *
 * ## Why it pins no row counts
 *
 * Two acceptance numbers moved mid-mission during M4 because the owner was working in the same
 * database in parallel. So the gate asserts SHAPE and DIRECTION: "zero products carry a non-zero
 * price", "the privileged caller sees more than zero price rows". Both survive the catalogue
 * growing or shrinking.
 *
 * ## Vacuity
 *
 * "No product carries a non-zero price" is trivially true of an empty list, so the gate first
 * insists the endpoint actually returned products. Migration 383 needed exactly this guard.
 *
 * ## Nothing here writes
 *
 * Only GETs, and only against `/api/public/products` and `/rest/v1`. No document, row or fixture
 * is created. That matters because the repo suite as a whole is NOT read-only and OG-43/OG-46
 * are open on `payment_receipts`.
 */

const ADMIN_USER_ID = "05098088-2849-43f4-8eb5-7c473c3832ec"; // test.admin@afrakala.local

const PRICE_KEYS = ["price", "final_sale_price", "rounded_sale_price", "sale_price", "amount"];

interface PublicProduct {
  id: string;
  [k: string]: unknown;
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

test.describe("M5 / OG-29 — no real price on any public surface", () => {
  test("the public product feed carries no non-zero price, and it is not empty", async () => {
    const { status, body } = await getJson(`${appUrl()}/api/public/products`);
    expect(status, "the public feed must answer at all").toBe(200);

    const products = (body as { products?: PublicProduct[] }).products ?? [];

    // vacuity guard first: "none of them has a price" is worthless over an empty list
    expect(
      products.length,
      "the feed returned no products at all, so the price assertion below would pass against nothing",
    ).toBeGreaterThan(0);

    // A numeric string counts. PostgREST renders `numeric` columns as JSON STRINGS, so a
    // `typeof v === "number"` test alone would wave `"12500000"` straight through — found by
    // attacking this predicate before trusting it.
    const offenders = products.filter((p) =>
      PRICE_KEYS.some((k) => {
        const v = p[k];
        if (typeof v === "number") return v !== 0;
        if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
          return Number(v) !== 0;
        return false;
      }),
    );

    expect(
      offenders.map((p) => ({ id: p.id, ...Object.fromEntries(PRICE_KEYS.filter((k) => k in p).map((k) => [k, p[k]])) })),
      "a public product carries a non-zero price - OG-29 says real prices must not be published",
    ).toEqual([]);
  });

  test("the price source itself is closed to anon", async () => {
    const env = lanEnv();
    const { status } = await getJson(
      `${restUrl()}/product_computed_prices_public?select=rounded_sale_price&limit=1`,
      { apikey: env.ANON_KEY, Authorization: `Bearer ${env.ANON_KEY}` },
    );
    // 401 is the privilege denial migration 370 installed; 200 with zero rows would also be
    // closed, but a 200 carrying rows would not be.
    expect(
      status,
      "anon reached the computed-price view - migration 370's revoke has been undone",
    ).toBe(401);
  });

  test("THE OTHER DIRECTION: an authenticated staff caller still sees price data", async () => {
    const env = lanEnv();
    // An admin who really exists on this server. The counterparty is deliberately an
    // AUTHENTICATED caller and not the service-role key: measured 2026-08-24, the service-role
    // JWT carries no `sub`, so `auth.uid()` is NULL for it and migration 386's
    // `uid() IS NOT NULL` predicate closes all eight guard-class views to it — zero rows, no
    // error. Asserting `service_role > 0` here would make this gate permanently red; asserting
    // `service_role = 0` would bake that surprise in as intended behaviour. Neither is honest,
    // so it is recorded as an Owner-Gate instead and the gate uses the caller whose visibility
    // the owner's M4 constraint actually protects.
    const jwt = mintJwt(ADMIN_USER_ID);
    const { status, body } = await getJson(
      `${restUrl()}/product_computed_prices_public?select=product_id,rounded_sale_price&limit=5`,
      { apikey: env.ANON_KEY, Authorization: `Bearer ${jwt}` },
    );
    expect(status, "an authenticated staff caller could not read the price view at all").toBe(200);
    const rows = Array.isArray(body) ? (body as unknown[]) : [];
    expect(
      rows.length,
      "the price view is empty for an authenticated staff caller too - the data has been emptied rather than the surface closed, which is a different and worse outcome than the one OG-29 asked for",
    ).toBeGreaterThan(0);
  });
});
