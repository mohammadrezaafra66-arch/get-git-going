SET client_encoding='UTF8';

-- =============================================================================
-- Issue 219 / C5.1 — aligning role_permissions with what the backend actually does
-- =============================================================================
-- The five permission layers disagreed. `role_permissions` said this:
--
--   sales                can_view=t can_create=t can_update=t can_approve=t
--   purchase_specialist  can_view=t can_create=t can_update=t can_approve=t
--
-- while the RLS policy on `purchases` has only ever allowed admin and manager to
-- write, and `create_purchase` refuses anyone else. The practical effect was a
-- salesperson who could open /purchases/create — the route guard asks for
-- `purchases:create` and nothing else — fill in the whole form, press submit,
-- and only then be told no. A permission that exists solely to be overruled one
-- layer later is worse than no permission at all: it advertises a capability
-- the system will not honour.
--
-- What `purchases:create` actually gates
-- -------------------------------------
-- Exactly one thing: the beforeLoad of /purchases/create. Nothing else in the
-- codebase reads it. So narrowing it denies standalone purchase creation and
-- has no other reach.
--
--   * sales — loses create/update/approve, KEEPS view. It still needs view:
--     /purchase (the request space) is gated on `purchases:view`, and raising a
--     purchase request is a salesperson's job.
--   * purchase_specialist — loses create/update/approve, KEEPS view. C4 gave it
--     the request-bound purchase path, which runs through create_purchase and is
--     authorised inside that function by assignment, not by this table.
--     Standalone purchase creation was never part of the approved design, and
--     the safe default for "not decided" is "not allowed".
--
-- accountant and viewer already had create=false and are left untouched.
-- No user's roles are changed — this is about what a role means, not who holds it.
-- =============================================================================

DO $$
DECLARE
  _actor uuid;
  _before jsonb;
BEGIN
  -- Attributed to the migration, not to a person: nobody clicked anything.
  _actor := NULL;

  SELECT jsonb_agg(jsonb_build_object(
           'role', role_name, 'view', can_view, 'create', can_create,
           'update', can_update, 'approve', can_approve) ORDER BY role_name)
    INTO _before
    FROM public.role_permissions
   WHERE module = 'purchases' AND role_name IN ('sales','purchase_specialist');

  UPDATE public.role_permissions
     SET can_create = false,
         can_update = false,
         can_approve = false,
         updated_at = now()
   WHERE module = 'purchases'
     AND role_name IN ('sales','purchase_specialist');

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES ('role_permissions', 'purchases', 'purchase_permissions_aligned', _actor,
          jsonb_build_object(
            'before', _before,
            'after', (SELECT jsonb_agg(jsonb_build_object(
                        'role', role_name, 'view', can_view, 'create', can_create,
                        'update', can_update, 'approve', can_approve) ORDER BY role_name)
                      FROM public.role_permissions
                      WHERE module='purchases'
                        AND role_name IN ('sales','purchase_specialist')),
            'reason', 'C5: role_permissions advertised purchase creation that RLS and create_purchase refuse'));
END $$;

-- A permission table that disagrees with the enforcement layer is how this
-- started. This makes the intended state explicit rather than implicit.
COMMENT ON TABLE public.role_permissions IS
  'Module-level capability matrix consulted by the frontend route guards. '
  'For module=purchases only admin and manager may create: RLS on purchases '
  'and the in-function check in create_purchase are the enforcement, and this '
  'table must not advertise more than they honour (Issue 219 C5).';
