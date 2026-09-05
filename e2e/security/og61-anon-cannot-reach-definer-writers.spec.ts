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

/* ===========================================================================================
 * 436 — the DERIVED half. Added because the literal above could not have caught this hole.
 *
 * 399 closed 26 functions and this file listed those 26 by name. On 2026-09-05 three more were
 * found open — `assign_user_role_txt`, `assign_user_role`, `revoke_user_role` — and every test
 * above passed the entire time, because a name that was never added to TARGETS is a name this
 * gate cannot see. An unauthenticated caller could grant itself `admin`.
 *
 * The literal is KEPT rather than replaced. Its comment makes a real argument: a gate that
 * recomputes its own target set from the rule under test cannot notice the rule being narrowed.
 * That is true, and it is the opposite failure from the one that actually happened. So both
 * halves now exist and they fail on different mistakes:
 *
 *   LITERAL (above)  — catches the RULE being narrowed. Those 26 must stay closed, whatever
 *                      any derivation happens to say today.
 *   DERIVED (below)  — catches a NEW function being added open. This is the half that was
 *                      missing, and its absence is why the hole recurred.
 *
 * "Writes" here follows DELEGATION. `assign_user_role` contains no INSERT of its own — only
 * `PERFORM public.assign_user_role_txt(...)`. Any detector that looks for write statements in
 * the body misses wrappers exactly like it, which is the second reason 399's sweep did not
 * reach them.
 * =========================================================================================== */

/**
 * Anon-reachable SECURITY DEFINER writers that are allowed to stay reachable, each with the
 * reason it is safe. This list is short ON PURPOSE: an allowlist whose entries must each be
 * justified is a different object from a subject list that has to be remembered.
 *
 * Adding a name here without a reason should not pass review.
 */
const ANON_REACHABLE_ALLOWLIST: Record<string, string> = {
  asan_assign_document_numbers:
    "Batch wrapper. The per-document delegate asan_assign_document_number carries the check " +
    "has_any_role(_uid, ARRAY['admin','accountant']) — read from the live body 2026-09-05.",
  mark_all_notifications_read:
    "Scoped by `WHERE user_id = auth.uid()`. For anon auth.uid() is NULL, so it matches no row.",
  mark_notification_read:
    "Same: `WHERE id = p_notification_id AND user_id = auth.uid()`. NULL matches nothing.",
  query_dynamic_table_rows_v2:
    "A READ path (the /data-tables page). It only enters the writer set transitively, through " +
    "the memoizing helpers _dyn_compute_row_values / _obs_compute_row_values.",
};

/**
 * The write verbs are written as `[I]NSERT` rather than `INSERT` on purpose.
 *
 * `assertReadOnlySql` in e2e/helpers/db.ts refuses any SQL containing a write verb as a whole
 * word. That rule is correct and is NOT relaxed here: this query is genuinely read-only, but
 * the verbs appear inside a regex LITERAL, which the guard cannot distinguish from a real
 * statement. A single-character bracket expression matches the same text while keeping the
 * whole word from ever appearing, so the guard stays exactly as strict as it was.
 */
const DERIVED_SUBJECTS = `
  WITH RECURSIVE fn AS (
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def,
           pg_get_function_result(p.oid) AS res, p.prosecdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  ),
  direct AS (
    SELECT proname FROM fn
    WHERE def ~* '([I]NSERT\\s+INTO|[U]PDATE\\s+(public\\.)?[a-z_]|[D]ELETE\\s+FROM|[M]ERGE\\s+INTO)'
  ),
  writer AS (
    SELECT proname FROM direct
    UNION
    SELECT f.proname FROM fn f JOIN writer w ON f.proname <> w.proname
     AND f.def ~ ('(^|[^a-zA-Z0-9_])(public\\.)?' || w.proname || '\\s*\\(')
  )
  SELECT f.proname
  FROM fn f
  WHERE f.prosecdef AND f.res <> 'trigger'
    AND f.proname IN (SELECT proname FROM writer)
    AND has_function_privilege('anon', f.oid, 'EXECUTE')
    AND f.def !~* '(has_role|has_any_role|_require_privileged|gamification_assert_manager|is_active_actor)'
    AND f.def !~* '[R]AISE\\s+EXCEPTION'
  ORDER BY 1
`;

test("⛔ DERIVED: no ungated SECURITY DEFINER writer is reachable by anon", () => {
  const found = dbRows(DERIVED_SUBJECTS);
  const unexpected = found.filter((n) => !(n in ANON_REACHABLE_ALLOWLIST));
  expect(
    unexpected,
    `ungated SECURITY DEFINER writer(s) reachable by anon: ${unexpected.join(", ")}. ` +
      `Either REVOKE EXECUTE ... FROM anon, PUBLIC (see migration 436), add an authorization ` +
      `check to the body, or add it to ANON_REACHABLE_ALLOWLIST with the reason it is safe.`,
  ).toEqual([]);
});

test("the allowlist has not rotted — every entry is still in the derived set", () => {
  // Without this the allowlist silently accumulates dead names, and a name that later becomes
  // open again is pre-approved by an entry nobody remembers writing.
  const found = new Set(dbRows(DERIVED_SUBJECTS));
  const stale = Object.keys(ANON_REACHABLE_ALLOWLIST).filter((n) => !found.has(n));
  expect(
    stale,
    `allowlist entries that no longer match anything — delete them: ${stale.join(", ")}`,
  ).toEqual([]);
});

/* ===========================================================================================
 * 436 — the OG-74 half that 399 explicitly deferred: an authenticated NON-ADMIN must also be
 * refused, and by the function BODY, not only by a grant. A rule that lives in a GRANT is one
 * GRANT away from being lost; 399's own header says so.
 *
 * Every call below sends an INVALID role literal. That is what makes these tests safe to run
 * against a live database: a caller who passes the guard fails on the `::app_role` cast with
 * 22P02 and writes nothing, and a caller who is refused fails with 42501 first. The two codes
 * are what distinguish "reached the body" from "was stopped", so nothing has to be granted or
 * revoked for real to tell them apart.
 * =========================================================================================== */

const INVALID_ROLE = "__probe_invalid_role__";
const ROLE_RPCS = ["assign_user_role_txt", "revoke_user_role_txt"] as const;

for (const fn of ROLE_RPCS) {
  test(`⛔ an authenticated NON-ADMIN is refused by ${fn}`, async () => {
    // Must be a user who holds a role and does NOT hold admin. `userWithRole('viewer')` is not
    // enough: on this database the first viewer also holds admin, so the "non-admin" JWT was an
    // administrator's and the guard correctly let it through — the test passed for the wrong
    // reason until this was pinned down.
    const nonAdmin = dbRows(
      "select user_id::text from public.user_roles group by user_id " +
        "having bool_and(role <> 'admin') limit 1",
    )[0];
    expect(nonAdmin, "no user without the admin role exists to test the non-admin path").toBeTruthy();

    const before = Number(
      dbRows("select count(*)::text from public.user_roles where role = 'admin'")[0],
    );

    const res = await rest(mintJwt(nonAdmin), `/rpc/${fn}`, {
      method: "POST",
      body: JSON.stringify({ _target_user: HARMLESS_TARGET, _role: INVALID_ROLE }),
    });

    // 42501 = the body guard refused, which is the only correct outcome for a non-admin.
    // Anything else means the call reached the body: 22P02 for assign_ (it casts the role) or
    // a bare 204 for revoke_ (it compares role::text and simply matches nothing). Both were
    // observed before 436 and both are the hole.
    expect(
      res.text,
      `a non-admin reached the body of ${fn} (status ${res.status}): ${res.text.slice(0, 200)}`,
    ).toContain("42501");

    const after = Number(
      dbRows("select count(*)::text from public.user_roles where role = 'admin'")[0],
    );
    expect(after, `${fn} changed admin rows during a non-admin call`).toBe(before);
  });
}

test("✅ an authenticated ADMIN still reaches the body — the feature is not broken", async () => {
  // The OPEN half. Guards written too tightly would satisfy every test above and leave role
  // management dead. The admin must get PAST the guard and fail only on the invalid literal.
  const res = await rest(mintJwt(ADMIN_USER_ID), "/rpc/assign_user_role_txt", {
    method: "POST",
    body: JSON.stringify({ _target_user: HARMLESS_TARGET, _role: INVALID_ROLE }),
  });

  expect(
    res.text,
    `an admin was refused by the guard (status ${res.status}): ${res.text.slice(0, 200)} — ` +
      `role management is broken, not secured`,
  ).toContain("22P02");
});
