-- 387 — repair migration 386's assertion gate. Creates nothing, changes nothing.
--
-- This is a REPAIR, not a second gate. The programme caps each mission at one assertion gate
-- and says that if it is defeated it must be repaired rather than supplemented. 386 is applied
-- and committed and this repository does not edit an applied migration (AGENTS.md rule 6), so
-- the repair ships here and **386's checks 1, 3 and 4 are retired by this file**. 386's checks 2
-- and 5 stand unchanged and are not restated.
--
-- ============================================================================
-- THE DEFECT THAT MATTERS: THE GATE NEVER ASSERTED THE OWNER'S ONE CONSTRAINT
-- ============================================================================
--
-- The owner's decision of 2026-08-22 was: *"Do not change what signed-in roles currently see.
-- Fix only the NULL-uid fail-open."* Two requirements, and 386's gate asserted only the first.
-- It checks that a NULL-uid caller gets ZERO rows. It never checks that a signed-in caller
-- still gets their rows, so **any change that empties the views for real users passes it**.
--
-- Demonstrated by an independent reviewer, and reproduced here before this file was written.
-- Without touching the function at all — the predicate on one view rewritten to
-- `(uid() IS NOT NULL) AND (NOT is_viewer_only(uid())) AND false`:
--
--   ADMIN rows on publish_recipients_view after view-only sabotage = 0   (baseline 24)
--   386 verdict: OK
--
-- and through the function, with `is_viewer_only` replaced by `SELECT true`, every signed-in
-- count collapses to 0 on all six readable views while 386 still reports OK.
--
-- The mission had itself noticed that `is_viewer_only → SELECT false` passes the gate and
-- reasoned that the function was out of scope. That reasoning was wrong in a specific way worth
-- recording: it tested the direction that OPENS the guard, which is indeed OG-28's territory,
-- and never tested the direction that CLOSES it, which is the owner's stated acceptance
-- criterion. A one-sided test of a two-sided requirement.
--
-- **WHY THIS IS NOT ASSERTED AS ROW COUNTS.** The obvious repair is to pin the recorded
-- baseline — 588 / 24 / 14 / 210 / 19880 / 1 — and it is the wrong one. Those are live business
-- data. The same reviewer watched `publish_recipients_view` move from 24 to 25 mid-review
-- because a profile gained an `admin` row in `user_roles`; the count moved identically for all
-- three roles, so nothing was wrong. Pinning it into a migration that must replay whole and in
-- order would make this gate fail for a reason that has nothing to do with the guard — which is
-- the mistake migration 381's census made and 382 had to retire.
--
-- What IS pinned is the PROPERTY those counts were evidence of, which is data-independent:
-- for every user who is not viewer-only the guard expression must evaluate TRUE, and for every
-- viewer-only user it must evaluate FALSE. Measured: 28 users of the first kind, 1 of the
-- second, so neither half is vacuous.
--
-- ============================================================================
-- TWO FURTHER HOLES, BOTH REPRODUCED
-- ============================================================================
--
-- **386 check 3 was an `ILIKE` on the view text, so an INERT predicate defeats it.**
-- `uid() IS NOT NULL OR NOT is_viewer_only(uid())` contains the required substring and is
-- worthless. Check 2's effect test cannot catch it on four of the eight: the two
-- `security_invoker` views return zero rows regardless, and the two views `authenticated`
-- cannot SELECT have their denial swallowed by check 2's `insufficient_privilege` handler.
-- Those are precisely the four whose latency the migration cites to justify changing all eight.
-- Repaired by anchoring on the whole rendered predicate rather than a substring:
--
--   WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));
--
-- **386 check 4 was one-sided: it caught `security_invoker` LOST, not GAINED.**
-- `ALTER VIEW vw_account_balances SET (security_invoker = true)` passed. That is OG-28, which
-- the owner explicitly declined, and it changes signed-in visibility on the spot. Repaired by
-- asserting the SET both ways: present on exactly those two, absent on the other six.
--
-- Also widened: 386 check 1 derived the guard class from `relkind = 'v'` in `public` alone, so a
-- MATERIALIZED view adopting the guard, or a view in another schema, walked past it while
-- holding an `anon` grant. Both are now in scope.
--
-- CHANGES NOTHING. Applying it to a healthy database prints a NOTICE.
-- ROLLBACK: docs/verification/387-down.sql — a documented no-op, written and dry-run proved
-- before this file was applied.

SET client_encoding = 'UTF8';

DO $chk$
DECLARE
  v          text;
  bad        text;
  n          int;
  guarded    text[];
  expected   text[] := ARRAY['product_computed_prices_public','publish_recipients_view',
                             'v_dynamic_customer_capital_balances','v_dynamic_salesperson_capital_balances',
                             'v_promotion_suggestions','vw_account_balances',
                             'vw_customer_receivables','vw_supplier_payables'];
  invoker    text[] := ARRAY['product_computed_prices_public','v_promotion_suggestions'];
  -- the exact rendering `pg_get_viewdef` produces for the intended predicate. Anchored whole,
  -- not matched as a substring, so `OR` in place of `AND` and a trailing `AND false` both fail.
  want       text   := 'WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));';
BEGIN
  ---------------------------------------------------------------------------
  -- A. REPLACES 386 CHECK 1. The guard class, across ALL schemas and including
  --    materialized views. 386 looked only at relkind 'v' in public, so a
  --    matview or another schema could adopt the guard and go unasserted.
  ---------------------------------------------------------------------------
  SELECT array_agg(ns.nspname || '.' || c.relname ORDER BY ns.nspname, c.relname) INTO guarded
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE c.relkind IN ('v','m')
     AND ns.nspname NOT IN ('pg_catalog','information_schema')
     AND pg_get_viewdef(c.oid) ILIKE '%is_viewer_only%';

  IF guarded IS DISTINCT FROM (SELECT array_agg('public.' || e ORDER BY 'public.' || e) FROM unnest(expected) e) THEN
    RAISE EXCEPTION '387: the is_viewer_only guard class is %, expected the 8 public views. A relation joined or left the class — including a materialized view or another schema, which migration 386 check 1 could not see — and it must be closed to a NULL uid before any assertion here means anything', guarded;
  END IF;

  ---------------------------------------------------------------------------
  -- B. REPLACES 386 CHECK 3. The predicate anchored WHOLE. An ILIKE on a
  --    substring accepts `OR` for `AND`, and accepts an extra `AND false`.
  ---------------------------------------------------------------------------
  SELECT string_agg(c.relname || ' -> ' || right(pg_get_viewdef(c.oid), 70), ' | ' ORDER BY c.relname) INTO bad
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'v' AND c.relname = ANY (expected)
     AND right(pg_get_viewdef(c.oid), length(want)) <> want;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '387: view predicate(s) do not end in the exact guard: %. The expected tail is %. A substring match would accept OR in place of AND, or an appended AND false, both of which are wrong end states', bad, want;
  END IF;

  ---------------------------------------------------------------------------
  -- C. THE OWNER'S CONSTRAINT, asserted at last, and data-independently.
  --    For every user who is NOT viewer-only the guard must be TRUE; for every
  --    viewer-only user it must be FALSE. This is the property the recorded row
  --    counts were evidence of, without pinning live business data into a
  --    migration that must replay.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO n
    FROM (SELECT DISTINCT user_id AS u FROM public.user_roles) x
   WHERE NOT public.is_viewer_only(x.u)
     AND NOT (x.u IS NOT NULL AND NOT public.is_viewer_only(x.u));
  IF n <> 0 THEN
    RAISE EXCEPTION '387: the guard expression is FALSE for % user(s) who are not viewer-only. Signed-in visibility has moved, which the owner explicitly forbade: "do not change what signed-in roles currently see; fix only the NULL-uid fail-open"', n;
  END IF;

  SELECT count(*) INTO n
    FROM (SELECT DISTINCT user_id AS u FROM public.user_roles) x
   WHERE public.is_viewer_only(x.u)
     AND (x.u IS NOT NULL AND NOT public.is_viewer_only(x.u));
  IF n <> 0 THEN
    RAISE EXCEPTION '387: the guard expression is TRUE for % viewer-only user(s). The viewer restriction has been voided', n;
  END IF;

  -- and neither half may be vacuous
  SELECT count(*) INTO n FROM (SELECT DISTINCT user_id AS u FROM public.user_roles) x
   WHERE NOT public.is_viewer_only(x.u);
  IF n = 0 THEN
    RAISE EXCEPTION '387: no non-viewer-only user exists, so the assertion that signed-in visibility is intact passed against nothing';
  END IF;
  SELECT count(*) INTO n FROM (SELECT DISTINCT user_id AS u FROM public.user_roles) x
   WHERE public.is_viewer_only(x.u);
  IF n = 0 THEN
    RAISE EXCEPTION '387: no viewer-only user exists, so the assertion that the viewer restriction still bites passed against nothing';
  END IF;

  ---------------------------------------------------------------------------
  -- D. REPLACES 386 CHECK 4. security_invoker asserted BOTH ways. 386 caught it
  --    being lost; gaining it on any of the other six is OG-28, which the owner
  --    declined, and it moves signed-in visibility immediately.
  ---------------------------------------------------------------------------
  FOREACH v IN ARRAY invoker LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       LEFT JOIN LATERAL pg_options_to_table(c.reloptions) o ON true
       WHERE ns.nspname = 'public' AND c.relname = v
         AND o.option_name = 'security_invoker' AND lower(o.option_value) IN ('true','on')
    ) THEN
      RAISE EXCEPTION '387: % lost security_invoker. CREATE OR REPLACE VIEW drops reloptions, so a replace without an explicit WITH clause reverts migration 370 — and no anon privilege changes, so no privilege check would catch it', v;
    END IF;
  END LOOP;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO bad
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN LATERAL pg_options_to_table(c.reloptions) o ON true
   WHERE ns.nspname = 'public' AND c.relkind = 'v' AND c.relname = ANY (expected)
     AND NOT (c.relname = ANY (invoker))
     AND o.option_name = 'security_invoker' AND lower(o.option_value) IN ('true','on');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '387: view(s) % GAINED security_invoker. That is OG-28, which the owner declined on 2026-08-22, and it changes what signed-in roles see the moment it is set', bad;
  END IF;

  RAISE NOTICE '387 OK: the guard class is exactly the 8 public views, checked across all schemas and including materialized views; every predicate ends in the exact tail ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid()))), so an OR or an appended AND false fails rather than passing an ILIKE; the guard evaluates TRUE for all % non-viewer-only users and FALSE for all % viewer-only users, which is the owner''s "signed-in visibility must not move" asserted as a property rather than as row counts that drift; and security_invoker is present on exactly product_computed_prices_public and v_promotion_suggestions and absent on the other six. Retires migration 386 checks 1, 3 and 4; its checks 2 and 5 stand',
    (SELECT count(*) FROM (SELECT DISTINCT user_id u FROM public.user_roles) x WHERE NOT public.is_viewer_only(x.u)),
    (SELECT count(*) FROM (SELECT DISTINCT user_id u FROM public.user_roles) x WHERE public.is_viewer_only(x.u));
END
$chk$;
