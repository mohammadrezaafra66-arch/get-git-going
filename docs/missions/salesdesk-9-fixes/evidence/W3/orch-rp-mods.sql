SELECT module, role_name, can_view
  FROM public.role_permissions
 WHERE module IN ('sales-deals-for-others','deal-lost-reasons','deal-lost-report')
 ORDER BY 1,2
 LIMIT 40;
