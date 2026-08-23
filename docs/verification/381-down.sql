-- 381-down.sql — reverse migration 381 (close the anon function-EXECUTE leak: OG-33 + OG-31).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction
-- (Gate A phase-2 M7, the rule from migration 350 onward). An embedded COMMIT commits the *outer*
-- transaction, which is how an earlier phase produced a rollback proof that could not have happened.
--
-- WHAT 381 DID
--
--   (a) OG-33 — revoked EXECUTE on `get_recent_purchase_label(uuid)` and
--       `get_recent_purchase_labels(uuid[])` from **both `anon` and `PUBLIC`**.
--
--       Both revokes were necessary. Measured 2026-08-23, the proacl on both functions read:
--         {=X/supabase_admin, supabase_admin=X, anon=X, authenticated=X, service_role=X, postgres=X}
--       The leading `=X` is PUBLIC. PostgreSQL grants EXECUTE on functions to PUBLIC by default, so
--       revoking from `anon` alone leaves `has_function_privilege('anon', …, 'EXECUTE')` true and
--       changes nothing. 712 of the 841 functions in `public` carry that PUBLIC grant.
--
--       WHY: `SECURITY DEFINER`, so an unauthenticated caller learned the exact last-purchase
--       timestamp of any product UUID while `purchases` itself returned 401 to the same caller —
--       the G-1 defect class surviving in a function rather than a view. **The owner decided this
--       on 2026-08-23: the timestamp must not be public. It was not closed on a fallback.**
--
--   (b) OG-31 — NOTHING. 381 measured the FUNCTIONS default privilege and handed the gate back
--       unchanged, because the intended remedy is a no-op: `pg_default_acl`'s `f` row has no PUBLIC
--       entry, PostgreSQL's built-in EXECUTE-to-PUBLIC default is not represented there, and
--       `ALTER DEFAULT PRIVILEGES … REVOKE … FROM PUBLIC` therefore removes nothing. Four variants
--       were tried inside BEGIN … ROLLBACK and a freshly created function stayed anon-executable in
--       all four. So this file has nothing to restore for OG-31 either.
--
-- WHAT THIS FILE RESTORES
--
-- Exactly the state measured on 2026-08-23 before 381: PUBLIC and anon both hold EXECUTE on the two
-- functions. `pg_default_acl` is not touched in either direction — 381 never changed it.
--
-- CONSEQUENCE OF RUNNING THIS. An unauthenticated caller can once more read the exact last-purchase
-- timestamp of any product UUID, against the owner's explicit decision of 2026-08-23. Run it only as
-- a deliberate rollback.
--
-- WHAT 381 DID NOT DO, so this file does not undo it. It did not touch the other 744 functions
-- `anon` can execute, and it did not touch `authenticated`, `service_role`, `postgres` or
-- `supabase_admin` on the two functions above — all four hold explicit grants that neither the
-- forward file nor this one goes near. That is what keeps the three `_app` routes
-- (`_app.products.$id`, `_app.products.index`, `_app.sales.search`) working across both directions.

SET client_encoding = 'UTF8';

GRANT EXECUTE ON FUNCTION public.get_recent_purchase_label(uuid)    TO anon;
GRANT EXECUTE ON FUNCTION public.get_recent_purchase_label(uuid)    TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recent_purchase_labels(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_recent_purchase_labels(uuid[]) TO PUBLIC;
