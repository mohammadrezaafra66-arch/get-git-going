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

/**
 * Of the 26, the twenty-one closed to `authenticated` as well: twenty by wave 4, plus
 * expire_pending_documents by wave 2 (470), which wave 4 missed.
 *
 * 399 revoked ONLY the anon path, and the test below used to assert that all 26 remained
 * reachable by `authenticated` — "the revoke cut exactly the unauthenticated path and nothing
 * else". That was the correct assertion for 399 and it is the WRONG assertion after 461-465,
 * which found that `authenticated` is not a privilege level on this database: `viewer` holds it.
 *
 * Every name here has NO direct caller in src/ or server/ — only the generated
 * src/integrations/supabase/types.ts — and reaches its real callers (triggers, nested SECURITY
 * DEFINER calls, or the service-role client) as the function OWNER, for which a session role's
 * grant is irrelevant. That is migration 436's apply_stock_movement reasoning, applied twenty-one
 * more times.
 *
 * This list is enumerated rather than derived ON PURPOSE, and the two assertions below are
 * strictly stronger than the one they replace: a name in this list must be closed, a name NOT in
 * this list must still be open, and nothing can drift in either direction unnoticed. Loosening
 * the old assertion to `toBeGreaterThan(0)` would have hidden both.
 */
const CLOSED_TO_AUTHENTICATED: Record<string, string> = {
  recalculate_settlement_score: "462 — no caller at all",
  update_customer_overdue_status: "462 — no caller at all",
  asan_burn_document_number: "462 — three tg_asan_burn_* triggers only",
  next_sales_quote_number: "462 — sales_quotes_assign_number trigger only; burns a counter value",
  next_product_sku: "464 — products_assign_sku trigger only; burns a counter value",
  apply_required_services_for_quote_item: "464 — trigger + update_sales_quote_status",
  sync_product_stock_status: "464 — apply_stock_movement only",
  check_price_alerts_for_product: "464 — _par_after_price_history_insert trigger only",
  enqueue_pricing_recompute: "464 — four trg_enqueue_on_* triggers only",
  claim_pricing_recompute_jobs: "464 — process-recompute-queue.server.ts, via supabaseAdmin",
  upsert_market_product_match_candidate: "464 — the bot upsert route, via supabaseAdmin",
  cleanup_stale_auto_suppliers: "464 — no caller; DELETEs from product_suppliers",
  sync_product_price_observatory_rows: "464 — no caller",
  refresh_all_sale_list_prices: "464 — no caller; rewrites every sale_list_items row",
  ai_record_provider_health: "465 — src/lib/ai/client.server.ts, via supabaseAdmin",
  award_xp_from_score: "465 — trg_award_xp_after_score only; gamification.ts states this policy",
  check_and_unlock_achievements_for_employee: "465 — trg_check_achievements_after_score only",
  check_and_update_mission_progress_for_employee: "465 — trg_check_missions_after_score only",
  capture_score_snapshots: "465 — no caller; INSERTs then DELETEs on a 90-day retention",
  expire_pending_delivery_receipts: "465 — tick_inquiries only; calls auto_submit_penalty",
  expire_pending_documents:
    "470 — tick_inquiries only, body line 54, exactly like its sibling above. It had NO call " +
    "site in src/ at all; the two source hits that looked like callers are both prose sitting " +
    "beside a call to tick_inquiries (inquiry-status.ts:18 is a docblock, InquiryBoard.tsx:211 " +
    "is a comment in a catch). 465 revoked the other two of the three functions tick_inquiries " +
    "PERFORMs and the board kept working, which is why the nested path surviving is measured " +
    "here rather than predicted.",
};

test("the 26 minus the twenty-one closed are STILL reachable by authenticated", () => {
  const reachable = new Set(
    dbRows(`
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (${nameList})
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     order by 1
  `),
  );
  const shouldBeOpen = TARGETS.filter((n) => !(n in CLOSED_TO_AUTHENTICATED));
  const wronglyClosed = shouldBeOpen.filter((n) => !reachable.has(n));

  // If this fires, a revoke went too far and broke a legitimate caller — the inquiry board
  // calls tick_inquiries as an ordinary group member, ProductForm calls find_or_create_model,
  // and the bot-api-keys page calls delete_bot_api_key_secure.
  //
  // This comment used to name expire_pending_documents here instead of tick_inquiries, a claim
  // inherited from migration 399's header (line 41) and repeated by every reader after it. It
  // was wrong: expire_pending_documents has no call site anywhere, and the inquiry flow reaches
  // it only nested inside tick_inquiries. Migration 470 revoked it and moved it to the closed
  // list above. A justification that names a caller must name a line that calls it.
  expect(
    wronglyClosed,
    `these have a live authenticated caller and must keep EXECUTE: ${wronglyClosed.join(", ")}`,
  ).toEqual([]);

  // And the other direction: a name listed as closed must actually BE closed. Without this the
  // list becomes a place to park names to make the suite quiet.
  const notActuallyClosed = Object.keys(CLOSED_TO_AUTHENTICATED).filter((n) =>
    reachable.has(n),
  );
  expect(
    notActuallyClosed,
    `listed as closed to authenticated by wave 4, but still reachable: ${notActuallyClosed.join(", ")}`,
  ).toEqual([]);
});

test("the twenty-one closed to authenticated are still reachable by their INTERNAL path", () => {
  // The OPEN half of wave 4's revokes, and the reason they are safe. A trigger or a nested
  // SECURITY DEFINER call runs with current_user = the function owner, so what has to remain
  // true is that the OWNER still holds EXECUTE. Revoking from the owner too would satisfy every
  // closed-half assertion above and would silently break twenty-one internal paths.
  const names = Object.keys(CLOSED_TO_AUTHENTICATED);
  const list = names.map((n) => `'${n}'`).join(",");
  const ownerReachable = dbRows(`
    select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles r on r.oid = p.proowner
     where n.nspname = 'public'
       and p.proname in (${list})
       and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
     order by 1
  `);
  expect(
    ownerReachable.length,
    `only ${ownerReachable.length} of ${names.length} are still reachable by their own owner — ` +
      `a revoke went too far and an internal path is dead, not secured`,
  ).toBe(names.length);
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
 * Signals that a body refuses a CALLER rather than an ARGUMENT. A single source of truth for
 * BOTH derived queries in this file, so they cannot drift apart, and quoted into the failure
 * messages so a future reader sees what "guarded" was taken to mean at the moment a gate fired.
 *
 * WAVE 2 MOVED THIS UP HERE, and the move is the point. Until now only the `authenticated`
 * half used it; the `anon` half below ended with the far weaker
 *
 *     AND f.def !~* '[R]AISE\\s+EXCEPTION'
 *
 * — "it raises, therefore it is guarded". That inference is false on this codebase, and it was
 * false in exactly the case that mattered. The four `bot_*` table writers were granted to
 * `anon` and refused nothing but a bad argument:
 *
 *     IF _can_update IS NULL THEN RAISE EXCEPTION 'forbidden_table'; END IF;
 *
 * A bare RAISE with no ERRCODE, guarding a lookup keyed by a UUID the CALLER supplies. Under
 * the old filter all four read as guarded and never entered the derived set at all — so the
 * anon half of this gate, whose entire job is to notice a new function added open, was blind
 * to them for as long as they existed. Migration 468 closed those four; this filter is what
 * makes the NEXT one visible.
 *
 * KNOWN WEAKNESS, recorded rather than silently accepted: `bot_api_key_table_access` is still
 * treated as an authorization signal below, and wave 2 established that it is not one. That
 * table is looked up BY AN ARGUMENT, with no session identity involved, which is precisely why
 * a revoked key id kept working. Removing it from this list is the right next step and is
 * deliberately NOT done here: it would put four functions into the derived set in the same
 * commit that another mission is still changing them, and their disposition (an allowlist
 * entry, or a revoke from `authenticated`) belongs to whoever owns those bodies.
 *
 * The SQLSTATE literals are matched with `.` in place of the surrounding single quotes. This
 * string is interpolated into a SQL string literal, and a real quote here would close it early
 * — the first draft did exactly that and the query died with a syntax error instead of
 * asserting, which is a test that fails for the wrong reason.
 */
const AUTHZ_SIGNALS =
  "(has_role|has_any_role|_require_privileged|gamification_assert_manager|is_active_actor" +
  "|ERRCODE\\s*=\\s*.42501.|ERRCODE\\s*=\\s*.28000." +
  "|is_messenger_group_member|messenger_group_members|bot_api_key_table_access|appeal_reviewers)";

/**
 * Anon-reachable SECURITY DEFINER writers that are allowed to stay reachable, each with the
 * reason it is safe. This list is short ON PURPOSE: an allowlist whose entries must each be
 * justified is a different object from a subject list that has to be remembered.
 *
 * Adding a name here without a reason should not pass review.
 */
const ANON_REACHABLE_ALLOWLIST: Record<string, string> = {
  // EMPTY SINCE MIGRATION 476, AND THAT IS THE POINT - it is not an oversight and it is not a
  // list nobody has filled in yet.
  //
  // It held five names: asan_assign_document_numbers, mark_all_notifications_read,
  // mark_notification_read, submit_quiz_attempt, query_dynamic_table_rows_v2. Every one was
  // tolerated for the same reason - the body refuses an anonymous caller anyway, so the EXECUTE
  // grant bought an attacker nothing. That reasoning was sound and each entry carried it.
  //
  // 476 removed the grant as well, so all five dropped out of DERIVED_SUBJECTS (which selects on
  // `has_function_privilege('anon', ...)`) and the rot check below correctly reported them as
  // stale. They are deleted rather than kept, exactly as that check instructs: an allowlist that
  // accumulates dead names pre-approves a function that later becomes reachable again, and
  // nobody remembers writing the entry that waved it through.
  //
  // If a name has to come back here, it needs the reason it is safe - not the observation that
  // it used to be listed.
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
    AND f.def !~* '${AUTHZ_SIGNALS}'
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

/* ===========================================================================================
 * WAVE 4 / S-6 — the EXTENSION to `authenticated`.
 *
 * Everything above this line asks one question: can an UNAUTHENTICATED caller reach a
 * SECURITY DEFINER writer? That question is now answered. It is not the whole question.
 *
 * `authenticated` on this database is not a privilege level. It is the floor: `viewer` holds
 * it, and so does every account that has ever logged in. A SECURITY DEFINER function owned by
 * `supabase_admin` (superuser, bypassrls) that carries no authorization check of its own and
 * grants EXECUTE to `authenticated` is therefore reachable by the LEAST privileged real user
 * in the company, with the definer's full rights and RLS bypassed.
 *
 * WHY THE ANON HALF COULD NOT HAVE CAUGHT THIS. The derived anon query above ends with
 *
 *     AND f.def !~* '[R]AISE\\s+EXCEPTION'
 *
 * "it raises, therefore it is guarded". On this codebase that inference is false, and it is
 * false in the money tier specifically. Read the live body of `hold_credit`:
 *
 *     IF p_amount IS NULL OR p_amount <= 0 THEN
 *       RAISE EXCEPTION '<Persian: the reserved amount must be greater than zero>'
 *         USING ERRCODE = '22023';
 *
 * That is ARGUMENT VALIDATION. 22023 is invalid_parameter_value. It refuses a bad number, not
 * a bad caller. Under the filter above, `hold_credit` reads as guarded and disappears from the
 * subject list — while a `viewer` could move a customer's credit ceiling and sign the audit
 * trail with somebody else's user id, because `p_user_id` was taken from the caller.
 *
 * So this half does not ask "does it raise". It asks "does it raise AT A CALLER", and it
 * recognises exactly four signals, all of them read from live bodies on 2026-09-06:
 *
 *   1. a role helper       - has_role / has_any_role / _require_privileged /
 *                            gamification_assert_manager / is_active_actor
 *   2. ERRCODE 42501       - insufficient_privilege. The SQLSTATE that MEANS "not you".
 *   3. ERRCODE 28000       - invalid_authorization_specification.
 *   4. a membership table  - is_messenger_group_member / messenger_group_members /
 *                            bot_api_key_table_access / appeal_reviewers. These are the
 *                            codebase's non-role authorization checks: ownership of a group,
 *                            possession of a capability row, standing as an appeal reviewer.
 *                            They are real authorization and must not be mistaken for absence.
 *
 * Everything else that raises - 22023, 22P02, P0001, P0002, check_violation, or a bare
 * `RAISE EXCEPTION 'invalid_key'` - is validation, and validation is not a gate.
 * =========================================================================================== */

/**
 * AUTHZ_SIGNALS is declared ABOVE, beside the anon half, because wave 2 made BOTH halves use
 * it and a `const` cannot be referenced from a template literal that is evaluated earlier in
 * the file. See its comment there for what each signal means and why the anon half needed it.
 */

/**
 * SECURITY DEFINER writers that may keep EXECUTE for `authenticated` without a role check.
 *
 * Every entry states WHY, and the reason is a property of the body that was read, not a
 * category. An entry with no reason should not pass review; an entry whose reason no longer
 * matches the body is a defect even while the test is green.
 */
const AUTHENTICATED_REACHABLE_ALLOWLIST: Record<string, string> = {
  asan_assign_document_numbers:
    "Batch wrapper only - a FOREACH over public.asan_assign_document_number, which carries " +
    "has_any_role(_uid, ARRAY['admin','accountant']). Gating the wrapper would duplicate a " +
    "check that already exists one call down. Read from the live body 2026-09-06.",
  bot_authenticate_key:
    "This function IS the authenticator. It takes a raw key, hashes it with sha256 and refuses " +
    "unless the hash matches an active, unexpired row in bot_api_keys. Requiring a role to " +
    "call it would make it impossible to authenticate. Its only write is last_used_at on the " +
    "row the caller just proved it holds.",
  cancel_promotion_nomination:
    "Ownership check, not a role check: it refuses unless nominated_by = auth.uid() AND the " +
    "nomination is from today. A caller can only cancel a nomination it made itself, so there " +
    "is no cross-user reach to gate.",
  delete_bot_api_key_secure:
    "Carries a real check that reads user_roles directly rather than through has_role, which " +
    "is why the signal regex does not see it: it refuses unless the caller is 'admin' or holds " +
    "the key's own managed_by_role. Migration 463 revokes anon and PUBLIC; authenticated stays " +
    "because src/routes/_app.bot-api-keys.index.tsx calls it as the signed-in user.",
  // expire_pending_documents was here, on the reason "called on the inquiry board by any group
  // member (src/lib/messenger/inquiry-status.ts)". That reason was false — that file calls
  // tick_inquiries, and the only mention of expire_pending_documents in it is a docblock.
  // Migration 470 revoked the direct grant; the entry now lives in the closed list at the top
  // of this file. Left as a comment, not deleted silently, because the allowlist's own rule is
  // that an entry whose reason no longer matches the body is a defect even while it is green.
  tick_inquiries:
    "Same shape: no parameters, advances inquiry statuses purely on elapsed time, and is " +
    "invoked from the inquiry board by ordinary members (src/lib/messenger/inquiry-status.ts, " +
    "src/routes/_app.messages.inquiries.tsx).",
  mark_all_notifications_read:
    "Scoped by `WHERE user_id = auth.uid()`. The caller's own identity IS the filter, so the " +
    "write set is exactly the caller's own notifications and cannot be aimed elsewhere.",
  mark_notification_read:
    "Same: `WHERE id = p_notification_id AND user_id = auth.uid()`. A notification id belonging " +
    "to somebody else matches no row.",
  query_dynamic_table_rows_v2:
    "A READ path (the /data-tables page). It enters the writer set only transitively, through " +
    "the memoizing helpers _dyn_compute_row_values / _obs_compute_row_values.",
  submit_quiz_attempt:
    "Writes exactly one academy_quiz_attempts row for `auth.uid()` and audits it under the same " +
    "uid. The score is computed in the body from academy_quiz_questions.correct_value, so the " +
    "caller cannot supply its own result.",
  refresh_sale_list_prices:
    "Recomputes sale_list_items from product_computed_prices rows that are already committed. " +
    "It copies derived numbers forward and accepts no value from the caller other than which " +
    "list to refresh, so there is nothing a low-privilege caller can inject. Invoked on " +
    "sale-list page load (src/lib/public/get-public-sale-list.ts and the sale-list route); a " +
    "role gate would blank the page for viewers who are allowed to see it.",
};

/**
 * Same recursive writer closure as the anon half - INSERT/UPDATE/DELETE/MERGE in the body, or a
 * call to something that has one, so delegating wrappers are caught. The difference is the last
 * two lines: `authenticated` instead of `anon`, and AUTHZ_SIGNALS instead of "contains RAISE".
 *
 * Write verbs are bracketed (`[I]NSERT`) for assertReadOnlySql in e2e/helpers/db.ts, exactly as
 * above and for exactly the same reason: the query is read-only, but the guard cannot tell a
 * regex literal from a statement, and the guard is not being relaxed.
 */
const DERIVED_SUBJECTS_AUTHENTICATED = `
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
    AND has_function_privilege('authenticated', f.oid, 'EXECUTE')
    AND f.def !~* '${AUTHZ_SIGNALS}'
  ORDER BY 1
`;

test("⛔ DERIVED: no SECURITY DEFINER writer without a CALLER check is reachable by authenticated", () => {
  const found = dbRows(DERIVED_SUBJECTS_AUTHENTICATED);
  const unexpected = found.filter((n) => !(n in AUTHENTICATED_REACHABLE_ALLOWLIST));
  expect(
    unexpected,
    `SECURITY DEFINER writer(s) reachable by every authenticated user - a 'viewer' included - ` +
      `with no check that refuses a CALLER: ${unexpected.join(", ")}.\n` +
      `A body may raise and still be listed here: only these count as authorization - ` +
      `${AUTHZ_SIGNALS}. An ERRCODE of 22023/22P02/P0001/P0002 is argument validation.\n` +
      `Fix by one of: add a body guard (see migration 461), REVOKE EXECUTE ... FROM ` +
      `authenticated, anon, PUBLIC when there is no direct caller in src/ or server/ ` +
      `(see migration 436's reasoning for apply_stock_movement), or add the name to ` +
      `AUTHENTICATED_REACHABLE_ALLOWLIST with the property of the body that makes it safe.`,
  ).toEqual([]);
});

test("the authenticated allowlist has not rotted — every entry is still in the derived set", () => {
  const found = new Set(dbRows(DERIVED_SUBJECTS_AUTHENTICATED));
  const stale = Object.keys(AUTHENTICATED_REACHABLE_ALLOWLIST).filter((n) => !found.has(n));
  expect(
    stale,
    `allowlist entries that no longer match anything. Either the function was gated (delete the ` +
      `entry) or it was dropped (delete the entry): ${stale.join(", ")}`,
  ).toEqual([]);
});

/**
 * The INVERTED guard — its own test, because it is the opposite mistake from everything above
 * and no count of "ungated writers" can express it.
 *
 * Three market-rate ingestion functions are written service-role-only like this:
 *
 *     IF auth.uid() IS NOT NULL THEN
 *       RAISE EXCEPTION 'system RPC: not callable by authenticated users';
 *     END IF;
 *
 * The intent is right — only the cron ingester should write market rates. The implementation
 * inverts it. `auth.uid()` is NULL for the service role, and it is ALSO NULL for `anon`. So the
 * guard admits precisely the unauthenticated internet, and these three held an explicit
 * `anon=X` grant in proacl. `record_external_market_rate_tick_system` inserts into
 * market_rate_ticks — which feeds `_par_latest_usd_rate()` and therefore product pricing — and
 * writes an audit_logs row with actor_id NULL.
 *
 * A guard that refuses everyone EXCEPT the anonymous caller must never be paired with a grant
 * to a role whose auth.uid() is NULL. The fix (migration 462) leaves the body alone, because
 * the body is correct FOR service_role, and removes anon, PUBLIC and authenticated from the
 * grant so service_role is the only role left that can reach it.
 */
const INVERTED_GUARD_SUBJECTS = `
  SELECT p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
     AND p.prosrc ~* 'auth\\.uid\\(\\)\\s+IS\\s+NOT\\s+NULL'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
   ORDER BY 1
`;

test("⛔ INVERTED GUARD: a function that only admits an unauthenticated caller is service_role-only", () => {
  const open = dbRows(INVERTED_GUARD_SUBJECTS);
  expect(
    open,
    `these refuse every caller for whom auth.uid() IS NOT NULL, which means the only callers ` +
      `they ACCEPT are service_role and anon — and they still grant EXECUTE to anon and/or ` +
      `authenticated: ${open.join(", ")}. REVOKE EXECUTE ... FROM anon, authenticated, PUBLIC ` +
      `so service_role is the only role that can reach them (migration 462).`,
  ).toEqual([]);
});

test("the three system ingest RPCs still EXIST and service_role still reaches them", () => {
  // The OPEN half of the inverted-guard fix. Revoking from every role would satisfy the test
  // above perfectly and would silently kill market-rate ingestion, which
  // src/routes/api/public/hooks/ingest-market-rates.ts drives with supabaseAdmin.
  const reachable = dbRows(`
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('start_market_rate_ingestion_run_system',
                         'finish_market_rate_ingestion_run_system',
                         'record_external_market_rate_tick_system')
       and has_function_privilege('service_role', p.oid, 'EXECUTE')
     order by 1
  `);
  expect(
    reachable.length,
    `only ${reachable.length} of 3 ingest RPCs are reachable by service_role — the revoke went ` +
      `too far and market-rate ingestion is dead, not secured`,
  ).toBe(3);
});

/**
 * The credit ledger, by name and on purpose.
 *
 * D-13: the credit ledger IS hold_credit / release_credit. This is the LITERAL half for the
 * money tier and it exists for the same reason the 26 above are still listed literally — a
 * derivation can be narrowed, and the next narrowing should not be able to drop these two
 * quietly. `increase_credit` is included because its entire body is
 * `PERFORM public.release_credit(...)`: an ungated wrapper is an ungated function.
 */
for (const fn of ["hold_credit", "release_credit", "increase_credit"] as const) {
  test(`⛔ the credit ledger refuses a caller by ROLE: ${fn}`, () => {
    const guarded = dbRows(`
      select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = '${fn}'
         and p.prosrc ~ 'has_any_role'
    `);
    expect(
      guarded,
      `${fn} carries no has_any_role check. Its RAISEs are Persian argument validation ` +
        `(ERRCODE 22023 / P0001), which refuse a bad number and not a bad caller.`,
    ).toEqual([fn]);

    const stillOpen = dbRows(`
      select r.rolname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) as r(rolname)
       where n.nspname = 'public' and p.proname = '${fn}'
         and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
       order by 1
    `);
    expect(
      stillOpen,
      `${fn} still grants EXECUTE to ${stillOpen.join(", ")}. It has no direct caller in src/ ` +
        `or server/ — only the generated src/integrations/supabase/types.ts — so the grant ` +
        `should be gone and the internal path (hold_credit_for_quote, expire_stale_credit_holds, ` +
        `increase_credit) reaches it as the definer regardless.`,
    ).toEqual([]);
  });
}

test("✅ the credit ledger is still reachable from its internal path", () => {
  // The OPEN half for the money tier. Revoking EXECUTE from every role, or gating to a role set
  // that excludes sales, would satisfy every credit test above and would break the quote flow:
  // src/routes/_app.sales.quotes.new.tsx calls expire_stale_credit_holds as the signed-in
  // salesperson, and that function PERFORMs release_credit.
  const owner = dbRows(`
    select r.rolname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles r on r.oid = p.proowner
     where n.nspname = 'public' and p.proname in ('hold_credit','release_credit')
     group by r.rolname
  `);
  expect(owner.length, "hold_credit and release_credit must still exist and share an owner").toBe(1);

  const rolesInGate = dbRows(`
    select 'sales' where exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'release_credit'
         and p.prosrc ~ 'sales')
  `);
  expect(
    rolesInGate,
    "release_credit's role set must include 'sales' — expire_stale_credit_holds is called by a " +
      "salesperson on the new-quote page and PERFORMs release_credit under that uid",
  ).toEqual(["sales"]);
});

/* ===========================================================================================
 * WAVE 2 / C-3 — the inverted guard again, this time INDEPENDENT OF THE GRANT.
 *
 * The INVERTED GUARD test above is real and stays. But read what it actually asserts: it
 * selects functions carrying `auth.uid() IS NOT NULL` **and** still granting EXECUTE to `anon`
 * or `authenticated`. Migration 462 removed those grants, so from that moment the test passes
 * on an empty set — and it passes just as happily whether the three bodies were fixed or never
 * touched. They were never touched. The inverted logic sat in all three for a full wave with a
 * green suite over it.
 *
 * That is not a criticism of 462; 462 said so itself ("THE FIX IS A REVOKE, NOT A BODY
 * CHANGE"). It is the reason a second assertion is needed. The whole hazard of a rule that
 * lives only in a GRANT is that ONE statement can lose it, and for a function the statement is
 * ordinary and innocent-looking:
 *
 *     CREATE OR REPLACE FUNCTION public.record_external_market_rate_tick_system(...)
 *
 * A future author fixing an unrelated bug in the ingester writes exactly that, the default
 * privileges hand EXECUTE back, and an inverted guard that admits precisely the unauthenticated
 * caller is live again — inside a diff whose subject line is about market rates. Nothing above
 * this comment would go red, because the grant and the body would have been restored together.
 *
 * So this half asks a question that has no reference to any grant at all:
 *
 *     is there a SECURITY DEFINER function whose ONLY authorization is the ABSENCE of a uid?
 *
 * The rule is deliberately narrower than "contains auth.uid() IS NOT NULL". That form is
 * LEGITIMATE as a supplement — `generate_marketing_tasks` and `recompute_dynamic_capital_setting`
 * both use it to mean "a NULL uid is the service-role cron; a non-NULL uid must additionally be
 * admin/manager", and both carry the role test in the same condition. Measured 2026-09-06, both
 * match `IS NOT NULL` and both match the role-test regex, so both are correctly excluded. What
 * is never legitimate is the form with NO positive test anywhere in the body, because
 * `auth.uid()` is NULL for `service_role` and equally NULL for `anon`.
 *
 * Migration 469 rewrites all three to the positive form — `COALESCE(auth.role(), '') <>
 * 'service_role'` with ERRCODE 42501 — which names the one role that may call them instead of
 * naming the many that may not.
 * =========================================================================================== */

/**
 * A positive caller test, in any of the forms this codebase actually uses. `auth.role()` is
 * included here and deliberately NOT added to AUTHZ_SIGNALS above: it is a genuine positive
 * test, but only when compared against a privileged role, and the authenticated-half detector
 * must not start reading `auth.role() = 'authenticated'` as a gate.
 */
const POSITIVE_CALLER_TEST =
  "(has_role|has_any_role|_require_privileged|gamification_assert_manager|is_active_actor" +
  "|auth\\.role\\(\\))";

const SOLE_AUTHZ_IS_ABSENCE_OF_UID = `
  SELECT p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
     AND p.prosrc ~* 'auth\\.uid\\(\\)\\s+IS\\s+NOT\\s+NULL'
     AND p.prosrc !~* '${POSITIVE_CALLER_TEST}'
   ORDER BY 1
`;

test("⛔ INVERTED GUARD, in the BODY: no definer function is authorized by the absence of a uid", () => {
  const inverted = dbRows(SOLE_AUTHZ_IS_ABSENCE_OF_UID);
  expect(
    inverted,
    `these are authorized ONLY by "auth.uid() IS NOT NULL" and carry no positive caller test ` +
      `at all: ${inverted.join(", ")}.\n` +
      `auth.uid() is NULL for service_role AND for anon, so that guard refuses every ` +
      `legitimate caller and admits the unauthenticated internet. It is inert only while the ` +
      `EXECUTE grant happens to be closed, and a bare CREATE OR REPLACE restores the grant.\n` +
      `Fix in the BODY: test for the service role positively — ` +
      `IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE ... USING ERRCODE = 42501 ` +
      `(migration 469). Supplementing a role test with an IS NOT NULL branch is fine and is ` +
      `not matched here.`,
  ).toEqual([]);
});

test("✅ the three ingest RPCs carry the POSITIVE service_role test — not merely no guard", () => {
  // The OPEN half, and it is not decoration. Deleting the guard outright, or deleting the three
  // functions, satisfies the CLOSED half above perfectly. What has to be true is that a
  // POSITIVE test replaced the inverted one.
  const guarded = dbRows(`
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('start_market_rate_ingestion_run_system',
                         'finish_market_rate_ingestion_run_system',
                         'record_external_market_rate_tick_system')
       and p.prosrc ~* 'auth\\.role\\(\\)'
       and p.prosrc ~ 'service_role'
       and p.prosrc ~ '42501'
     order by 1
  `);
  expect(
    guarded,
    `only ${guarded.length} of 3 name service_role positively with ERRCODE 42501: ` +
      `${guarded.join(", ")} — a guard was removed rather than corrected`,
  ).toEqual([
    "finish_market_rate_ingestion_run_system",
    "record_external_market_rate_tick_system",
    "start_market_rate_ingestion_run_system",
  ]);
});

test("the SUPPLEMENT form is still allowed — the rule above has not become a blanket ban", () => {
  // Without this, tightening SOLE_AUTHZ_IS_ABSENCE_OF_UID into "no IS NOT NULL anywhere" would
  // look like a stricter gate and would actually be a wrong one: both functions below use a
  // NULL uid to mean "the service-role cron is calling", and both then require admin/manager of
  // any caller that DOES have a uid. That is correct and must keep passing.
  const supplements = dbRows(`
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.proname in ('generate_marketing_tasks','recompute_dynamic_capital_setting')
       and p.prosrc ~* 'IS\\s+NOT\\s+NULL'
       and p.prosrc ~* '${POSITIVE_CALLER_TEST}'
     order by 1
  `);
  expect(
    supplements,
    "the supplement form must remain recognised as authorized, or the rule is a blanket ban",
  ).toEqual(["generate_marketing_tasks", "recompute_dynamic_capital_setting"]);
});

test("service_role still reaches all three, and anon/authenticated still do not", () => {
  // 469 re-asserts the ACL after its CREATE OR REPLACEs. This proves the re-assertion landed:
  // the closed half (a body fix must not quietly re-open the grant) and the open half (the
  // re-grant must not have been forgotten, which would kill ingestion) in one place.
  const acl = dbRows(`
    select p.proname || '|' ||
           has_function_privilege('anon', p.oid, 'EXECUTE')::text || '|' ||
           has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || '|' ||
           has_function_privilege('service_role', p.oid, 'EXECUTE')::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('start_market_rate_ingestion_run_system',
                         'finish_market_rate_ingestion_run_system',
                         'record_external_market_rate_tick_system')
     order by 1
  `);
  expect(acl).toEqual([
    "finish_market_rate_ingestion_run_system|false|false|true",
    "record_external_market_rate_tick_system|false|false|true",
    "start_market_rate_ingestion_run_system|false|false|true",
  ]);
});
