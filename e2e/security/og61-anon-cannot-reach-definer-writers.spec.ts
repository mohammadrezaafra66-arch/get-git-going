/**
 * OG-61 / migration 399 — an UNAUTHENTICATED caller must not reach any SECURITY DEFINER
 * function that writes and carries no authorization check of its own.
 *
 * This gate exists because the hole was real and was proven, not suspected. Before 399:
 *
 *     SET ROLE anon;
 *     SELECT public.revoke_user_role_txt('<a real admin uuid>', 'admin');
 *     -- admin role rows: 14 -> 13
 *
 * An unauthenticated caller stripped the admin role from a real administrator. PostgREST
 * exposes every function in `public`, so it needed no credentials at all — only reachability.
 * Repeated across `user_roles` it locks the company out of its own system. The probe ran
 * inside a rollback; nothing was changed.
 *
 * Two-sided (A2.10), and both halves are load-bearing:
 *   CLOSED — `anon` must be refused on all 26. Asserting this alone would also pass if the
 *            functions had been dropped, or if every role had been locked out.
 *   OPEN   — `authenticated` must still execute all 26, so the revoke is proven to have cut
 *            exactly the unauthenticated path and nothing else. Mission 4 measured what the
 *            blanket form costs: it strips EXECUTE from every role and reaches
 *            `pgbouncer.get_auth()`, which depends entirely on its PUBLIC grant.
 *
 * The live attack is re-run here as a REAL call through PostgREST as `anon`, not merely as a
 * catalogue lookup — a grant can be correct in `pg_proc.proacl` and still be reachable by some
 * path the catalogue does not describe.
 */
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

/**
 * The 26, by name. None is overloaded (verified against `pg_proc`), so a name identifies each
 * one exactly. Kept as a literal rather than re-derived by the same heuristic that selected
 * them: a gate that recomputes its own target set from the rule under test cannot detect the
 * rule being narrowed.
 */
const TARGETS = [
  "ai_record_provider_health",
  "apply_required_services_for_quote_item",
  "asan_burn_document_number",
  "award_xp_from_score",
  "bot_authenticate_key",
  "capture_score_snapshots",
  "check_and_unlock_achievements_for_employee",
  "check_and_update_mission_progress_for_employee",
  "check_price_alerts_for_product",
  "claim_pricing_recompute_jobs",
  "cleanup_stale_auto_suppliers",
  "detect_phone_collisions",
  "enqueue_pricing_recompute",
  "expire_pending_delivery_receipts",
  "expire_pending_documents",
  "next_product_sku",
  "next_sales_quote_number",
  "recalculate_settlement_score",
  "refresh_all_sale_list_prices",
  "refresh_sale_list_prices",
  "revoke_user_role_txt",
  "settle_league_season",
  "sync_product_price_observatory_rows",
  "sync_product_stock_status",
  "update_customer_overdue_status",
  "upsert_market_product_match_candidate",
];

const nameList = TARGETS.map((n) => `'${n}'`).join(",");

test("⛔ anon executes NONE of the 26 definer writers", () => {
  const stillOpen = dbRows(`
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (${nameList})
       and has_function_privilege('anon', p.oid, 'EXECUTE')
     order by 1
  `);
  expect(
    stillOpen,
    `anon can still execute: ${stillOpen.join(", ")} — an unauthenticated caller reaches a SECURITY DEFINER function that writes`,
  ).toEqual([]);
});

test("authenticated still executes ALL 26 — the revoke cut only the anonymous path", () => {
  const reachable = dbRows(`
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (${nameList})
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     order by 1
  `);
  // If this drops, the revoke went too far and broke legitimate callers — the messenger
  // inquiry flow calls expire_pending_documents as an authenticated user.
  expect(reachable.length, `only ${reachable.length} of 26 remain reachable by authenticated`).toBe(
    TARGETS.length,
  );
});

test("all 26 still EXIST — the closed half must not pass by deletion", () => {
  // Without this, dropping every function would satisfy the CLOSED half perfectly.
  const present = dbRows(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (${nameList}) order by 1
  `);
  expect(present.length).toBe(TARGETS.length);
});

/**
 * A NON-EXISTENT target, and that is the whole point.
 *
 * An earlier draft aimed this at a REAL admin — `order by user_id limit 1` — and asserted the
 * call was refused. That is safe only while the refusal holds, and the forced-disturbance
 * exercise exists precisely to REMOVE the refusal. When the anon grant was restored to prove
 * this gate catches it, the gate's own call went through and **actually stripped the admin role
 * from `ADMIN_USER_ID`, the harness account the whole suite runs as.** It was restored
 * immediately, but the run in flight was invalidated by it.
 *
 * The rule this encodes: **a gate proving a destructive action is REFUSED must never aim at a
 * target whose loss would matter**, because the disturbance that validates the gate is exactly
 * the removal of the protection it relies on. The refusal is the assertion; the target only has
 * to be shaped correctly. Nothing here can destroy anything even if every guard is gone.
 */
const HARMLESS_TARGET = "00000000-0000-0000-0000-000000000000";

test("⛔ the live attack: anon cannot revoke an admin role through PostgREST", async () => {
  const before = Number(
    dbRows("select count(*)::text from public.user_roles where role = 'admin'")[0],
  );
  expect(before, "there must be admin roles for this attack to be meaningful").toBeGreaterThan(0);

  // `jwt = null` makes the helper send the ANON key as the bearer — a genuinely
  // unauthenticated request, exactly what an outsider who can reach the API would send.
  const res = await rest(null, "/rpc/revoke_user_role_txt", {
    method: "POST",
    body: JSON.stringify({ _target_user: HARMLESS_TARGET, _role: "admin" }),
  });

  expect(
    res.status,
    `an unauthenticated caller was not refused (status ${res.status}): ${res.text.slice(0, 200)}`,
  ).toBeGreaterThanOrEqual(400);

  // The assertion that actually matters. A 4xx could still accompany a completed side effect,
  // so the count is what proves nothing happened.
  const after = Number(
    dbRows("select count(*)::text from public.user_roles where role = 'admin'")[0],
  );
  expect(after, "an admin role disappeared during an unauthenticated call").toBe(before);
});

test("authenticated admin is NOT locked out of the same RPC", async () => {
  // The open half of the live attack. A 401/403 for everyone would satisfy the test above and
  // would mean the feature is broken rather than secured. Same harmless target: what is under
  // test is that the call is ACCEPTED, not that it changes anything.
  const jwt = mintJwt(ADMIN_USER_ID);
  const before = Number(
    dbRows("select count(*)::text from public.user_roles where role = 'admin'")[0],
  );

  const res = await rest(jwt, "/rpc/revoke_user_role_txt", {
    method: "POST",
    body: JSON.stringify({ _target_user: HARMLESS_TARGET, _role: "admin" }),
  });

  expect(
    res.status,
    `an authenticated admin must not be refused by RLS/grants (status ${res.status}): ${res.text.slice(0, 200)}`,
  ).toBeLessThan(400);

  const after = Number(
    dbRows("select count(*)::text from public.user_roles where role = 'admin'")[0],
  );
  expect(after, "the open half must not actually revoke anything").toBe(before);
});
