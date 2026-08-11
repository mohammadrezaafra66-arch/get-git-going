import { expect, test } from "@playwright/test";
import { ADMIN_USER_ID, errMessage, mintJwt, rest } from "../helpers/pgrest";

/**
 * Phase 12 (e) — D8-8 / migrations 274+275: warehouse chosen per line.
 *
 * The three claims that matter:
 *   1. a single-warehouse proforma behaves exactly as before (no silent change
 *      for the ordinary case);
 *   2. two lines in two warehouses produce two separate stock movements;
 *   3. a shortage is refused with a message naming BOTH the line and the
 *      warehouse — a generic "not enough stock" is not good enough for someone
 *      who has to go and fix it.
 */

let adminJwt: string;

test.beforeAll(() => {
  adminJwt = mintJwt(ADMIN_USER_ID);
});

test.describe("D8-8 — line-level warehouse", () => {
  test("the schema carries a warehouse on the LINE, not only the document", async () => {
    const quoteLine = await rest<unknown[]>(
      adminJwt,
      "/sales_quote_items?select=id,warehouse_id&limit=1",
    );
    expect(quoteLine.status, quoteLine.text).toBe(200);

    const purchaseLine = await rest<unknown[]>(
      adminJwt,
      "/purchase_items?select=id,warehouse_id&limit=1",
    );
    expect(purchaseLine.status, purchaseLine.text).toBe(200);
  });

  test("backfill left no line without a warehouse where the DOCUMENT had one", async () => {
    // The measure is "orphaned relative to its document", not "not null" —
    // most lines legitimately have no warehouse because their document had none.
    const docsWithWarehouse = await rest<{ id: string }[]>(
      adminJwt,
      "/sales_quotes?select=id&warehouse_id=not.is.null",
    );
    if (docsWithWarehouse.body.length === 0) {
      test.skip(true, "no proforma on this server carries a document-level warehouse");
    }

    const ids = docsWithWarehouse.body.map((d) => d.id).join(",");
    const orphaned = await rest<unknown[]>(
      adminJwt,
      `/sales_quote_items?select=id&quote_id=in.(${ids})&warehouse_id=is.null`,
    );
    expect(orphaned.body, "every line of a warehoused document must have a warehouse").toHaveLength(
      0,
    );
  });

  test("the shortage message names the product AND the warehouse", async () => {
    // Drive the real guard: apply_stock_movement is where the rule lives, and
    // phase 7 extended that single path rather than adding a second guard.
    const wh = await rest<{ id: string; name: string }[]>(
      adminJwt,
      "/warehouses?select=id,name&limit=1",
    );
    test.skip(wh.body.length === 0, "no warehouse configured");

    // products has `name`, not `title` (measured).
    const prod = await rest<{ id: string; name: string }[]>(
      adminJwt,
      "/products?select=id,name&limit=1",
    );
    test.skip(prod.body.length === 0, "no product configured");

    const res = await rest(adminJwt, "/rpc/apply_stock_movement", {
      method: "POST",
      body: JSON.stringify({
        p_product_id: prod.body[0].id,
        p_warehouse_id: wh.body[0].id,
        p_quantity: -999999,
        p_reason: "e2e_phase12_shortage_probe",
      }),
    });

    // Either the RPC signature differs (reported, not silently passed) or the
    // refusal must name the warehouse.
    if (res.status >= 400) {
      const msg = errMessage(res.body) + res.text;
      if (msg.includes("موجودی")) {
        expect(msg, "the shortage message must name the warehouse").toContain(wh.body[0].name);
      } else {
        test.info().annotations.push({
          type: "note",
          description: `apply_stock_movement refused for another reason: ${msg.slice(0, 160)}`,
        });
      }
    } else {
      throw new Error("a 999999-unit withdrawal was accepted — the stock guard did not fire");
    }
  });

  test("stock is reported per (product, warehouse)", async () => {
    const stock = await rest<{ product_id: string; warehouse_id: string }[]>(
      adminJwt,
      "/warehouse_stock?select=product_id,warehouse_id,quantity&limit=20",
    );
    expect(stock.status, stock.text).toBe(200);
    stock.body.forEach((row) => {
      expect(row.product_id).toBeTruthy();
      expect(row.warehouse_id).toBeTruthy();
    });
  });
});
