-- Revert 571 role_permissions salesdesk W3 modules
DELETE FROM public.role_permissions
 WHERE module IN ('sales-deals-for-others', 'deal-lost-reasons', 'deal-lost-report');
