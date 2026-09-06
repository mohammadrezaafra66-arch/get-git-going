SET client_encoding='UTF8';

-- 470 - expire_pending_documents() loses its DIRECT grant to `authenticated`. Its only real
--       caller is nested inside tick_inquiries, which reaches it as the definer.
--
-- Wave 2, row C-2. ASCII-only. No body changes anywhere in this file, so there is no
-- CREATE OR REPLACE and therefore no default-grant restoration to order the REVOKEs against
-- (CONTRACTS section 4 rule 3) - this file is grants and nothing else.
--
-- ============================================================================
-- 0. WHY THIS ONE, WHEN THE OTHER TWO SWEEPS KEEP THEIR GRANT
-- ============================================================================
--
-- Three SECURITY DEFINER writers reachable by `authenticated` carry no caller check at all:
-- tick_inquiries(), expire_pending_documents() and refresh_sale_list_prices(uuid). They look
-- like one tier and they are not. The question that separates them is migration 436's question
-- about apply_stock_movement - IS THERE AN ORDINARY-USER PATH THAT NEEDS THE DIRECT GRANT? -
-- and it has to be asked per function, against grep, not against the tier.
--
--   tick_inquiries            KEEPS its grant. It is the browser entry point.
--                             src/lib/messenger/inquiry-status.ts:22 - `supabase.rpc("tick_inquiries")`
--                             src/components/messenger/InquiryBoard.tsx:209 - `await tickInquiries()`,
--                             on a 30-second interval, for any group member. Revoking it breaks
--                             the inquiry board for exactly the people it exists to serve.
--
--   refresh_sale_list_prices  KEEPS its grant. Two real call sites as the signed-in user:
--                             src/lib/public/get-public-sale-list.ts:50 and
--                             src/routes/_app.pricing.sale-lists_.$listId.tsx:224 and :399.
--
--   expire_pending_documents  LOSES it. NO call site exists anywhere in the repository.
--
-- The grep, in full, because the whole decision rests on it:
--
--     $ grep -rn "expire_pending_documents" src/ e2e/ supabase/
--     src/components/messenger/InquiryBoard.tsx:211   <- a COMMENT, inside a catch block
--     src/integrations/supabase/types.ts:10999        <- generated types
--     src/lib/messenger/inquiry-status.ts:18          <- a COMMENT, in a docblock
--     e2e/clusters/new-clusters-jwt.spec.ts:136       <- a COMMENT
--     e2e/security/og61-...spec.ts:53,141,553         <- this gate's own subject list + allowlist
--     supabase/migrations/... , supabase/schema_full_export.sql
--
-- Not one call. Both source hits are prose, and both sit next to a call to a DIFFERENT function:
--
--     inquiry-status.ts:18-22   * Note: as of 2026-08-08 the RPC ends by calling expire_pending_documents(),
--                               export async function tickInquiries() { await supabase.rpc("tick_inquiries") }
--     InquiryBoard.tsx:209-211  await tickInquiries();
--                               } catch { // Best-effort SLA tick (backend may 42P10 inside expire_pending_documents).
--
-- THIS IS WHERE THE ERROR CAME FROM, and it is worth naming so it is not repeated. Migration
-- 399's header (line 41) states "expire_pending_documents is called from the messenger inquiry
-- flow as an authenticated user". That sentence was then copied into og61's comment at line 141
-- and into its AUTHENTICATED_REACHABLE_ALLOWLIST entry, and wave 2 repeated it again from there.
-- Four readers in a row accepted it because it was written down. It describes the CALL CHAIN
-- correctly and the CALL SITE wrongly: the inquiry flow calls tick_inquiries, and
-- tick_inquiries calls this. A justification that names a caller must name a line that calls it.
--
-- ============================================================================
-- 1. WHY THE NESTED PATH SURVIVES - PROVEN BY TWO SIBLINGS, NOT PREDICTED
-- ============================================================================
--
-- tick_inquiries is itself SECURITY DEFINER and ends with three nested calls, read from the
-- live body 2026-09-06 (body lines 42, 54, 55):
--
--     perform public.auto_submit_penalty(...);
--     perform public.expire_pending_documents();
--     perform public.expire_pending_delivery_receipts();
--
-- A nested call from a SECURITY DEFINER function runs as the function OWNER and does not
-- consult the caller's EXECUTE grant. That is the same fact 436 relied on for
-- apply_stock_movement, reaching the opposite conclusion here because there is no ordinary-user
-- path that needs the direct grant.
--
-- And it does not have to be taken on trust, because migration 465 already ran this experiment
-- on the OTHER TWO of those three. Measured immediately before this migration:
--
--   proname                          | anon | authenticated | note
--   ---------------------------------+------+---------------+---------------------------------
--   auto_submit_penalty              | f    | f             | 465 revoked
--   expire_pending_delivery_receipts | f    | f             | 465 revoked
--   expire_pending_documents         | f    | t             | MISSED - this file
--   tick_inquiries                   | f    | t             | correct: the entry point
--
-- The inquiry board has been working since 465 with two of the three already revoked. The
-- nested path surviving a revoke is therefore an OBSERVATION about this exact call site, not a
-- prediction about it. 465 simply did not reach the third.
--
-- WHAT BREAKS IF THIS IS WRONG: if some caller did depend on the direct grant, the inquiry
-- board's 30-second tick would start returning 42501 and document expiry would stall - pending
-- documents would never move to 'expired' and the manager would never be penalised for not
-- confirming. The two siblings above are the evidence that it will not, and the verification
-- block in section 3 asserts the owner and service_role still reach it so the internal path
-- cannot have been cut instead of the external one.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO:
--   - It does not touch tick_inquiries. That grant is correct and load-bearing; section 3
--     asserts it is still `authenticated=t` so a later edit cannot quietly take it.
--   - It does not touch refresh_sale_list_prices.
--   - It changes no function body, so no signature, no overload (CLAUDE.md rule 5), and no
--     behaviour for any caller that still reaches it.
--   - It does not revoke from service_role or the owner. The `_system`/cron path and the nested
--     path both need them.

-- ============================================================================
-- 2. THE REVOKE
--
--    `FROM PUBLIC` is included even though proacl currently shows no PUBLIC entry for this
--    function (399 removed it): the `=X/supabase_admin` form is a PUBLIC grant and survives
--    `REVOKE ... FROM anon` untouched, so the shape is always written out in full rather than
--    trimmed to what today's ACL happens to need. `FROM anon` likewise - already f, kept so the
--    statement states the whole intended end state.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.expire_pending_documents() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_pending_documents() FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_pending_documents() FROM PUBLIC;

-- ============================================================================
-- 3. VERIFICATION, inside the same transaction so a wrong answer rolls the file back.
--    Four assertions, and each one alone would pass for the wrong reason:
--      - "authenticated is closed" also passes if the function was dropped, or if every role
--        was locked out and the nested path is dead;
--      - "the owner still reaches it" also passes if the revoke never happened;
--      - and neither notices tick_inquiries being closed by accident, which is the one
--        regression that would actually reach a user.
-- ============================================================================

DO $verify$
DECLARE
  v_open      int;
  v_owner_ok  boolean;
  v_svc_ok    boolean;
  v_entry_ok  boolean;
BEGIN
  SELECT count(*) INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'),('authenticated')) AS r(rolname)
   WHERE n.nspname = 'public' AND p.proname = 'expire_pending_documents'
     AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');
  IF v_open <> 0 THEN
    RAISE EXCEPTION '470: expire_pending_documents still reachable by % of {anon,authenticated}', v_open;
  END IF;

  SELECT has_function_privilege(r.rolname, p.oid, 'EXECUTE') INTO v_owner_ok
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
   WHERE n.nspname = 'public' AND p.proname = 'expire_pending_documents';
  IF NOT COALESCE(v_owner_ok, false) THEN
    RAISE EXCEPTION
      '470: expire_pending_documents is no longer reachable by its own owner - the nested call from tick_inquiries is dead, not secured';
  END IF;

  SELECT has_function_privilege('service_role', p.oid, 'EXECUTE') INTO v_svc_ok
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'expire_pending_documents';
  IF NOT COALESCE(v_svc_ok, false) THEN
    RAISE EXCEPTION '470: service_role lost EXECUTE on expire_pending_documents';
  END IF;

  SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') INTO v_entry_ok
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'tick_inquiries';
  IF NOT COALESCE(v_entry_ok, false) THEN
    RAISE EXCEPTION
      '470: tick_inquiries lost its authenticated grant - the inquiry board is broken. This file must not touch the entry point';
  END IF;
END;
$verify$;
