 SELECT s.id AS allocation_id,
    s.capital_setting_id,
    s.salesperson_id,
    s.weighted_score,
    s.share_ratio,
    COALESCE(s.allocated_capital, 0::numeric) AS allocated_capital,
    u.held AS held_amount,
    u.consumed AS consumed_amount,
    GREATEST(COALESCE(s.allocated_capital, 0::numeric) - u.held - u.consumed, 0::numeric) AS remaining_amount,
    s.created_at
   FROM salesperson_capital_allocations_dynamic s
     CROSS JOIN LATERAL _capital_alloc_used('salesperson'::text, s.id) u(held, consumed);
