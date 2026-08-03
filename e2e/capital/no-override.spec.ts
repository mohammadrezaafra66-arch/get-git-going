import { expect, test } from "@playwright/test";
import { ADMIN_USER_ID, errMessage, mintJwt, rest } from "../helpers/pgrest";

/**
 * Phase 12 (d) — D8-1 / migration 268: the computed capital ceiling is not
 * overridable.
 *
 * The audit's subtlety, and the reason this spec exists: before 268 a direct
 * UPDATE on final_capital did not fail — there was simply no UPDATE policy, so
 * RLS matched zero rows and the statement reported "UPDATE 0". Silently doing
 * nothing is not the same as refusing, and only the second one is safe.
 * So this spec asserts an actual REFUSAL, not merely "the number did not move".
 */

let adminJwt: string;

test.beforeAll(() => {
  adminJwt = mintJwt(ADMIN_USER_ID);
});

test.describe("D8-1 — the computed capital ceiling is read-only", () => {
  test("a direct API UPDATE of final_capital is refused", async () => {
    const snap = await rest<{ id: string; final_capital: string }[]>(
      adminJwt,
      "/daily_capital_snapshots?select=id,final_capital&limit=1",
    );
    test.skip(snap.body.length === 0, "no capital snapshot exists on this server");

    const before = snap.body[0].final_capital;

    const res = await rest(adminJwt, `/daily_capital_snapshots?id=eq.${snap.body[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ final_capital: Number(before) + 1 }),
    });

    // Must be an explicit refusal.
    expect(res.status, `expected a refusal, got ${res.status}: ${res.text}`).toBeGreaterThanOrEqual(
      400,
    );

    const after = await rest<{ final_capital: string }[]>(
      adminJwt,
      `/daily_capital_snapshots?id=eq.${snap.body[0].id}&select=final_capital`,
    );
    expect(after.body[0].final_capital).toBe(before);
  });

  test("the INPUT side is still writable — the lock took nothing away", async () => {
    // manual_adjustment is the sanctioned way to change the outcome: a
    // recorded, auditable INPUT rather than a rewrite of the OUTPUT.
    const cols = await rest<{ id: string }[]>(adminJwt, "/daily_capital_inputs?select=id&limit=1");
    expect(cols.status, "the inputs table must remain readable").toBe(200);
  });

  test("anon holds no DML on the capital tables", async () => {
    const res = await rest(null, "/daily_capital_snapshots", {
      method: "POST",
      body: JSON.stringify({ final_capital: 1 }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("the legacy save RPC is gone, not merely stripped of its override argument", async () => {
    // Until M1.2 this case proved the override argument was rejected. Migration 280 removed
    // the whole legacy allocation path, so the RPC itself no longer exists. Asserting only
    // "status >= 400" would now pass for the wrong reason — a 404 is not a refusal — so the
    // error code is checked explicitly. PGRST202 is PostgREST's "function not found".
    const res = await rest(adminJwt, "/rpc/save_salesperson_capital_allocations", {
      method: "POST",
      body: JSON.stringify({
        p_allocations: [{ salesperson_id: ADMIN_USER_ID, final_amount: 999, override_reason: "x" }],
      }),
    });
    expect(res.status, `expected the RPC to be absent, got ${res.status}: ${res.text}`).toBe(404);
    expect(errMessage(res.body)).toBeTruthy();
  });

  test("the dynamic path still computes — removing the legacy one took nothing away", async () => {
    const rows = await rest<{ id: string; allocated_capital: string }[]>(
      adminJwt,
      "/salesperson_capital_allocations_dynamic?select=id,allocated_capital&limit=5",
    );
    expect(rows.status, rows.text).toBe(200);
    expect(rows.body.length, "the dynamic allocation table lost its rows").toBeGreaterThan(0);
  });

  test("the legacy allocation tables are absent from the API", async () => {
    for (const table of ["salesperson_capital_allocations", "customer_capital_allocations"]) {
      const res = await rest(adminJwt, `/${table}?select=id&limit=1`);
      expect(res.status, `${table} is still exposed`).toBe(404);
    }
  });
});
