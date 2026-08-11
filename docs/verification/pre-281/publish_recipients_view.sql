 SELECT p.id,
    p.full_name,
    array_agg(ur.role ORDER BY ur.role) AS roles
   FROM profiles p
     JOIN user_roles ur ON ur.user_id = p.id
  WHERE p.is_active = true AND (ur.role = ANY (ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]))
  GROUP BY p.id, p.full_name;
