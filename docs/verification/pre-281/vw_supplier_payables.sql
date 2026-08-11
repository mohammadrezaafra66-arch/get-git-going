 SELECT p.supplier_id,
    s.name AS supplier_name,
    p.id AS purchase_id,
    p.purchase_date,
    pt.days AS payment_term_days,
        CASE
            WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
            ELSE p.purchase_date
        END AS due_date,
    p.total_amount AS purchase_total_amount,
    p.cash_price,
    COALESCE(p.cash_price_currency, p.currency) AS currency,
    p.paid_at,
    p.paid_at IS NOT NULL AS is_paid,
        CASE
            WHEN p.paid_at IS NOT NULL THEN 0::numeric
            ELSE COALESCE(p.cash_price, p.total_amount, 0::numeric)
        END AS outstanding_amount,
        CASE
            WHEN p.paid_at IS NOT NULL THEN NULL::integer
            WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date - CURRENT_DATE
            ELSE p.purchase_date - CURRENT_DATE
        END AS days_until_due,
    p.paid_at IS NULL AND
        CASE
            WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
            ELSE p.purchase_date
        END < CURRENT_DATE AS is_overdue,
    NULL::text AS product_summary,
    p.created_at,
        CASE
            WHEN p.paid_at IS NOT NULL THEN 'current'::text
            WHEN (CURRENT_DATE -
            CASE
                WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                ELSE p.purchase_date
            END) <= 0 THEN 'current'::text
            WHEN (CURRENT_DATE -
            CASE
                WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                ELSE p.purchase_date
            END) <= 30 THEN 'd1_30'::text
            WHEN (CURRENT_DATE -
            CASE
                WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                ELSE p.purchase_date
            END) <= 60 THEN 'd31_60'::text
            WHEN (CURRENT_DATE -
            CASE
                WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                ELSE p.purchase_date
            END) <= 90 THEN 'd61_90'::text
            ELSE 'd90_plus'::text
        END AS aging_bucket
   FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN payment_terms pt ON pt.id = p.payment_term_id;
