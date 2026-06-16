-- MKT-2.4.b: Harden product_interaction_events INSERT
--
-- Context:
--   MKT-2.4.a moved all browser writes to product_interaction_events behind
--   the authenticated serverFn `trackProductInteractionFn`. Browser code no
--   longer calls `/rest/v1/product_interaction_events` directly.
--
-- This migration closes the remaining bypass where any authenticated user
-- could still POST directly to /rest/v1/product_interaction_events under the
-- old `pie_insert_authed` policy (with_check: user_id IS NULL OR
-- user_id = auth.uid()). After this migration, the only path that can insert
-- rows is the serverFn, which uses the service-role client (RLS bypassed
-- server-side, with Zod validation, existence checks, and a server-set
-- user_id from the authenticated context).
--
-- Untouched intentionally:
--   * SELECT policy `pie_select_privileged` (admin/manager/accountant)
--   * UPDATE/DELETE remain denied by default (no policy exists)
--   * Indexes, columns, audit_logs schema
--
-- Reversible by recreating the dropped policy and re-granting INSERT to
-- authenticated.

DROP POLICY IF EXISTS pie_insert_authed ON public.product_interaction_events;
REVOKE INSERT ON public.product_interaction_events FROM authenticated;