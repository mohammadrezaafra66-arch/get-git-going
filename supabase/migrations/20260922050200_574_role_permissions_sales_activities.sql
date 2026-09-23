SET client_encoding TO 'UTF8';

-- ============================================================================
-- 574 — role_permissions for sales-activities + badge count RPC (Wave 4 D4)
-- ============================================================================
-- Module: sales-activities — صفحه «فعالیت‌ها»
-- RPC: count_open_activities_due_today_or_overdue — uses public.tehran_today()
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/574_role_permissions_sales_activities.sql
-- ============================================================================

SET lock_timeout = '60s';

INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name,
       'sales-activities',
       r.role_name IN ('admin', 'manager', 'sales'),
       r.role_name IN ('admin', 'manager', 'sales'),
       r.role_name IN ('admin', 'manager', 'sales'),
       false,
       false,
       false,
       false
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'sales-activities'
 );

CREATE OR REPLACE FUNCTION public.count_open_activities_due_today_or_overdue(
  p_salesperson_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
  SELECT count(*)::bigint
    FROM public.sales_interactions si
   WHERE si.done_at IS NULL
     AND si.activity_type_id IS NOT NULL
     AND si.due_at IS NOT NULL
     AND (si.due_at AT TIME ZONE 'Asia/Tehran')::date <= public.tehran_today()
     AND (
       p_salesperson_id IS NULL
       OR si.salesperson_id = p_salesperson_id
     )
     AND (
       p_salesperson_id IS NOT NULL
       OR si.salesperson_id = auth.uid()
     );
$fn$;

COMMENT ON FUNCTION public.count_open_activities_due_today_or_overdue(uuid) IS
  'Wave 4 D4: open activities due today or overdue; day from tehran_today(). Default scope = auth.uid().';

GRANT EXECUTE ON FUNCTION public.count_open_activities_due_today_or_overdue(uuid)
  TO authenticated;
