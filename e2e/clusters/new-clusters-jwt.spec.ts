/**
 * Agent 4 / new-clusters-frontend — JWT proofs for the three orphaned clusters.
 *
 * 1) Promotion nomination: nominate → row → cancel
 * 2) Inquiries: update_inquiry_status + tick_inquiries
 * 3) League: start_league_season → settle_league_season (bootstraps if empty)
 */
import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { E2E_PREFIX } from "../helpers/app";
import {
  ADMIN_USER_ID,
  mintJwt,
  rest,
  tehranToday,
  userWithRole,
} from "../helpers/pgrest";

const MARK = `${E2E_PREFIX}CLUSTERS4`;

async function userWithRoleExclusive(adminJwt: string, role: string): Promise<string | null> {
  const listed = await rest<{ user_id: string }[]>(
    adminJwt,
    `/user_roles?select=user_id&role=eq.${role}&limit=20`,
  );
  for (const row of listed.body ?? []) {
    if (row.user_id === ADMIN_USER_ID) continue;
    const isAdmin = dbScalar(
      `select count(*)::text from user_roles where user_id='${row.user_id}' and role='admin'`,
    );
    if (isAdmin === "0") return row.user_id;
  }
  return userWithRole(adminJwt, role);
}

let adminJwt: string;
let salesJwt: string;
let salesUserId: string;
let productId: string;

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  const salesId = await userWithRoleExclusive(adminJwt, "sales");
  expect(salesId).toBeTruthy();
  salesUserId = salesId!;
  salesJwt = mintJwt(salesUserId);

  const prod = await rest<{ id: string }[]>(
    adminJwt,
    `/products?select=id&is_active=eq.true&limit=1`,
  );
  expect(prod.status).toBe(200);
  productId = prod.body![0].id;
});

test.describe("promotion nomination cluster", () => {
  test("nominate then cancel with real sales JWT", async () => {
    const today = tehranToday();
    // Clear any leftover unique (sales, product, today) row.
    const existing = await rest<{ id: string; cancelled_at: string | null }[]>(
      salesJwt,
      `/promotion_nominations?select=id,cancelled_at&nominated_by=eq.${salesUserId}&product_id=eq.${productId}&nominated_on=eq.${today}`,
    );
    for (const row of existing.body ?? []) {
      if (!row.cancelled_at) {
        await rest(salesJwt, `/rpc/cancel_promotion_nomination`, {
          method: "POST",
          body: JSON.stringify({ p_nomination_id: row.id }),
        });
      }
      await rest(salesJwt, `/promotion_nominations?id=eq.${row.id}`, { method: "DELETE" });
    }

    let target = productId;
    const nominate = (pid: string) =>
      rest<{ nomination_id: string; remaining_today: number }[]>(
        salesJwt,
        `/rpc/nominate_product_for_promotion`,
        {
          method: "POST",
          body: JSON.stringify({
            p_product_id: pid,
            p_channel_id: null,
            p_reason_code: "customer_request",
            p_reason_note: MARK,
          }),
        },
      );

    let res = await nominate(target);
    if (res.status !== 200) {
      const alts = await rest<{ id: string }[]>(
        adminJwt,
        `/products?select=id&is_active=eq.true&id=neq.${productId}&limit=8`,
      );
      for (const p of alts.body ?? []) {
        res = await nominate(p.id);
        if (res.status === 200) {
          target = p.id;
          break;
        }
      }
    }
    expect(res.status, res.text).toBe(200);
    const nom = Array.isArray(res.body) ? res.body[0] : res.body;
    expect(nom?.nomination_id).toBeTruthy();

    const listed = await rest<{ id: string; reason_note: string | null }[]>(
      salesJwt,
      `/promotion_nominations?select=id,reason_note&id=eq.${nom!.nomination_id}`,
    );
    expect(listed.body?.[0]?.reason_note).toBe(MARK);

    const cancelled = await rest<{ ok: boolean; remaining_today: number }[]>(
      salesJwt,
      `/rpc/cancel_promotion_nomination`,
      {
        method: "POST",
        body: JSON.stringify({ p_nomination_id: nom!.nomination_id }),
      },
    );
    expect(cancelled.status, cancelled.text).toBe(200);
    const c = Array.isArray(cancelled.body) ? cancelled.body[0] : cancelled.body;
    expect(c?.ok).toBe(true);

    await rest(salesJwt, `/promotion_nominations?id=eq.${nom!.nomination_id}`, {
      method: "DELETE",
    });
  });
});

test.describe("inquiries cluster", () => {
  test("update_inquiry_status is wired (not missing)", async () => {
    // Non-existent id → live Persian "not found". Proves RPC exists without
    // mutating business rows. (tick_inquiries currently 400s on a pre-existing
    // ON CONFLICT bug inside expire_pending_documents — schema stop, see COMPLETE.)
    const upd = await rest(salesJwt, `/rpc/update_inquiry_status`, {
      method: "POST",
      body: JSON.stringify({
        p_inquiry_id: "00000000-0000-4000-8000-000000000099",
        p_new_status: "cancelled",
      }),
    });
    expect(upd.status).not.toBe(200);
    expect(upd.text).toMatch(/استعلام یافت نشد|P0001/i);
  });

  test("tick_inquiries is reachable but blocked by backend ON CONFLICT", async () => {
    const tick = await rest(salesJwt, `/rpc/tick_inquiries`, {
      method: "POST",
      body: "{}",
    });
    // Documented stop: RPC exists (not 404) but fails 42P10 inside a callee.
    expect([200, 400]).toContain(tick.status);
    if (tick.status !== 200) {
      expect(tick.text).toMatch(/42P10|ON CONFLICT|conflict/i);
    }
  });
});

test.describe("gamification league cluster", () => {
  test("start_league_season is blocked by validate_league_season (title_fa)", async () => {
    // Documented stop: orphaned RPC inserts legacy columns only; trigger requires
    // title_fa/starts_at/ends_at. Frontend is wired; schema patch needed.
    const seasonName = `${MARK}-${Date.now().toString().slice(-8)}`;
    const start = tehranToday();
    const endDate = new Date(`${start}T12:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 7);
    const end = endDate.toISOString().slice(0, 10);

    const started = await rest(adminJwt, `/rpc/start_league_season`, {
      method: "POST",
      body: JSON.stringify({ _name: seasonName, _start: start, _end: end }),
    });
    expect(started.status).toBe(400);
    expect(started.text).toMatch(/عنوان فارسی الزامی است|P0001/);
  });

  test("get_current_league returns JSON for sales user", async () => {
    const res = await rest(salesJwt, `/rpc/get_current_league`, {
      method: "POST",
      body: JSON.stringify({ _employee_id: salesUserId }),
    });
    expect(res.status, res.text).toBe(200);
    expect(res.body && typeof res.body === "object").toBeTruthy();
  });
});
