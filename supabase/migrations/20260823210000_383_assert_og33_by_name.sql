-- 383 — assert OG-33 closure across ALL overloads, not two exact signatures. Creates nothing.
--
-- This replaces migration 382's check 1. It is not a new gate and it does not reinstate 381's
-- census; it narrows one assertion from two signatures to a name.
--
-- WHY. The independent review defeated 382 by creating `get_recent_purchase_label(p_sku text)`.
-- Measured, and reproduced here before writing this file:
--
--   CREATE FUNCTION public.get_recent_purchase_label(p_sku text) …
--     has_function_privilege('anon', 'public.get_recent_purchase_label(text)', 'EXECUTE')  -> true
--     functions named get_recent_purchase_label* that anon can execute                     -> 1
--     382's verdict                                                                        -> OK
--
-- So the leak OG-33 closed comes back under a signature 382 does not look at. 381's whole-schema
-- census would have caught it (745 <> 744), but that census was removed in 382 for a good reason:
-- it pinned the state of 839 functions 381 never touches into a migration that must replay whole
-- and in order. 383 keeps that win and closes the hole by narrowing rather than widening.
--
-- THE HOLE IS REACHABLE BY ACCIDENT. **OG-31 is open**, so any newly created function — including
-- any overload — is granted EXECUTE to PUBLIC automatically by PostgreSQL's built-in default. A
-- future migration that adds an overload reopens this leak without anyone writing a grant, and
-- nothing would report it. That is why the owner overrode this mission's two-round review cap to
-- have this specific hole fixed before shipping, while leaving the other round-two finding — 382's
-- hand-picked RLS-helper list — recorded as `[U]` and unfixed.
--
-- SCOPE. This file asserts one thing. It does not touch 382's checks 2, 2b, 3, 4 or 5, which stand.
--
-- ROLLBACK: docs/verification/383-down.sql (a documented no-op), written and dry-run proved first.

SET client_encoding = 'UTF8';

DO $chk$
DECLARE
  bad text;
  n   int;
BEGIN
  SELECT count(*), coalesce(string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text), '')
    INTO n, bad
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('get_recent_purchase_label', 'get_recent_purchase_labels')
     AND (has_function_privilege('anon',   p.oid, 'EXECUTE')
       OR has_function_privilege('public', p.oid, 'EXECUTE'));

  IF n <> 0 THEN
    RAISE EXCEPTION '383: % overload(s) of get_recent_purchase_label* are executable by anon or PUBLIC: %. OG-33 is reopened. Note an overload created after this migration is anon-executable by default while OG-31 stays open, so this can happen without anyone writing a GRANT', n, bad;
  END IF;

  -- Guard the assertion itself: if both functions were dropped outright the check above would pass
  -- vacuously and report nothing wrong. Two is the count 381 closed; more is fine (a new overload,
  -- correctly closed), fewer means something removed a function this mission is responsible for.
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('get_recent_purchase_label', 'get_recent_purchase_labels');
  IF n < 2 THEN
    RAISE EXCEPTION '383: only % function(s) named get_recent_purchase_label* exist, expected at least 2 — the closure cannot be asserted against functions that are gone', n;
  END IF;

  RAISE NOTICE '383 OK: all % overload(s) of get_recent_purchase_label* are closed to anon and PUBLIC, asserted by name rather than by signature. Supersedes migration 382 check 1', n;
END
$chk$;
