SET client_encoding TO 'UTF8';

-- ============================================================================
-- 571 — role_permissions for Wave 3 FE modules (C5/C8)
-- ============================================================================
-- Modules:
--   sales-deals-for-others  — گزارش معاملات ثبت‌شده برای دیگران
--   deal-lost-reasons       — تنظیمات دلایل شکست معامله
--   deal-lost-report        — گزارش دلایل شکست
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/571_role_permissions_salesdesk_w3.sql
-- ============================================================================

SET lock_timeout = '60s';

INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name,
       'sales-deals-for-others',
       r.role_name IN ('admin', 'manager', 'sales'),
       false,
       false,
       false,
       false,
       r.role_name IN ('admin', 'manager'),
       false
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'sales-deals-for-others'
 );

INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name,
       'deal-lost-reasons',
       r.role_name IN ('admin', 'manager', 'sales'),
       r.role_name IN ('admin', 'manager'),
       r.role_name IN ('admin', 'manager'),
       false,
       false,
       false,
       false
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'deal-lost-reasons'
 );

INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name,
       'deal-lost-report',
       r.role_name IN ('admin', 'manager', 'sales'),
       false,
       false,
       false,
       false,
       r.role_name IN ('admin', 'manager'),
       false
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'deal-lost-report'
 );
