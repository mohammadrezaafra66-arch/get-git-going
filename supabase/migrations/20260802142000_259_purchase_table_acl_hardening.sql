SET client_encoding='UTF8';

-- =============================================================================
-- Issue 219 / C5.1 — closing the direct-write path into purchase documents
-- =============================================================================
-- Supabase's default privileges grant every DML verb on every new table in
-- `public` to BOTH `anon` and `authenticated`. On the purchase tables that
-- currently reads:
--
--   purchases        anon, authenticated : SELECT INSERT UPDATE DELETE TRUNCATE …
--   purchase_items   anon, authenticated : SELECT INSERT UPDATE DELETE TRUNCATE …
--   purchase_requests anon, authenticated: SELECT INSERT UPDATE DELETE TRUNCATE …
--
-- RLS still stands behind those grants, and `anon` has no matching policy
-- because every policy tests auth.uid(). So this is not an open door today.
-- It is the absence of a second one, on tables where C1–C4 built an entire
-- atomic write path specifically so that nothing would write to them directly.
--
-- What the application actually does with these tables — established by reading
-- every call site, not assumed:
--
--   purchases          SELECT  (accounting: /accounting/purchase-payments)
--                      UPDATE  (accountant marking paid_at/paid_by — matches the
--                              existing RLS policy "accountant can mark purchase paid")
--                      no INSERT anywhere in the client
--   purchase_items     no client access at all
--   purchase_requests  SELECT  (several dashboards and pickers)
--                      UPDATE  (requester editing their own pending request)
--                      no INSERT — creation goes through create_purchase_request
--
-- So the verbs below are removed as unused, and the ones the app relies on are
-- left exactly as they are. `create_purchase`, `create_purchase_request` and
-- `assign_purchase_request` are SECURITY DEFINER and run as the function owner,
-- so none of this touches them.
--
-- No RLS policy is dropped. A policy that grants nothing because the underlying
-- privilege is gone is harmless, and removing policies on evidence this thin is
-- how a future migration ends up re-introducing a hole it cannot see.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- anon has no business with any of these
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.purchases        FROM anon;
REVOKE ALL ON public.purchase_items   FROM anon;
REVOKE ALL ON public.purchase_requests FROM anon;

REVOKE ALL ON public.purchases        FROM PUBLIC;
REVOKE ALL ON public.purchase_items   FROM PUBLIC;
REVOKE ALL ON public.purchase_requests FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- purchases — read, and the accountant's payment update. Nothing else.
-- -----------------------------------------------------------------------------
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.purchases FROM authenticated;
GRANT SELECT, UPDATE ON public.purchases TO authenticated;

-- -----------------------------------------------------------------------------
-- purchase_items — read only. A line is created by create_purchase and by
-- nothing else; there is no client code that touches this table.
-- -----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.purchase_items FROM authenticated;
GRANT SELECT ON public.purchase_items TO authenticated;

-- -----------------------------------------------------------------------------
-- purchase_requests — read, and the requester's edit of their own pending row.
-- INSERT goes, because create_purchase_request owns creation and is the only
-- place the assignment chain runs.
-- -----------------------------------------------------------------------------
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.purchase_requests FROM authenticated;
GRANT SELECT, UPDATE ON public.purchase_requests TO authenticated;

-- -----------------------------------------------------------------------------
-- Already correct — re-stated so a future reader can see it was considered
-- rather than overlooked.
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.purchase_request_fulfillments FROM PUBLIC, anon;
GRANT SELECT ON public.purchase_request_fulfillments TO authenticated;

REVOKE ALL ON public.purchase_idempotency FROM PUBLIC, anon, authenticated;

-- The C3 views stay unreadable by client roles: they exist for the RPCs, which
-- run as their owner. security_invoker means a direct grant here would expose
-- rows the caller's own policies would otherwise hide.
REVOKE ALL ON public.v_purchase_item_allocation        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.v_purchase_request_fulfillment    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.v_purchase_requests_legacy_unknown FROM PUBLIC, anon, authenticated;
