 SELECT c.id AS allocation_id,
    c.capital_setting_id,
    c.customer_id,
    c.salesperson_id,
    c.weighted_score,
    c.share_ratio,
    c.raw_allocation,
    COALESCE(c.final_limit, 0::numeric) AS final_limit,
    u.held AS held_amount,
    u.consumed AS consumed_amount,
    GREATEST(COALESCE(c.final_limit, 0::numeric) - u.held - u.consumed, 0::numeric) AS remaining_amount,
    c.binding_constraint,
    c.created_at
   FROM customer_capital_allocations_dynamic c
     CROSS JOIN LATERAL _capital_alloc_used('customer'::text, c.id) u(held, consumed);
