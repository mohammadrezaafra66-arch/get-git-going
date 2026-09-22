-- Revert 574 role_permissions sales-activities + count RPC
DROP FUNCTION IF EXISTS public.count_open_activities_due_today_or_overdue(uuid);
DELETE FROM public.role_permissions WHERE module = 'sales-activities';
