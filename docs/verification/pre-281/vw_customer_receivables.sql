 WITH paid_inv AS (
         SELECT prl.invoice_id AS doc_id,
            COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
           FROM payment_receipt_links prl
             JOIN payment_receipts pr ON pr.id = prl.receipt_id
          WHERE prl.invoice_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
          GROUP BY prl.invoice_id
        ), paid_quote AS (
         SELECT prl.quote_id AS doc_id,
            COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
           FROM payment_receipt_links prl
             JOIN payment_receipts pr ON pr.id = prl.receipt_id
          WHERE prl.quote_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
          GROUP BY prl.quote_id
        )
 SELECT i.customer_id,
    c.name AS customer_name,
    i.id AS invoice_id,
    i.number AS invoice_number,
    i.invoice_type,
    i.status AS invoice_status,
    i.due_date,
    i.total_amount,
    COALESCE(i.deposit_amount, 0::numeric) AS deposit_amount,
    COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
    GREATEST(i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
    i.commitment_confirmed,
        CASE
            WHEN i.due_date IS NOT NULL THEN i.due_date - CURRENT_DATE
            ELSE NULL::integer
        END AS days_until_due,
    i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE AND (i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
    i.created_at,
        CASE
            WHEN i.due_date IS NULL THEN 'current'::text
            WHEN (CURRENT_DATE - i.due_date) <= 0 THEN 'current'::text
            WHEN (CURRENT_DATE - i.due_date) <= 30 THEN 'd1_30'::text
            WHEN (CURRENT_DATE - i.due_date) <= 60 THEN 'd31_60'::text
            WHEN (CURRENT_DATE - i.due_date) <= 90 THEN 'd61_90'::text
            ELSE 'd90_plus'::text
        END AS aging_bucket
   FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     LEFT JOIN paid_inv p ON p.doc_id = i.id
  WHERE i.commitment_confirmed = true AND COALESCE(i.status, ''::text) <> 'cancelled'::text AND GREATEST(i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric
UNION ALL
 SELECT q.customer_id,
    COALESCE(c.name, q.customer_name) AS customer_name,
    q.id AS invoice_id,
    q.quote_number AS invoice_number,
    'sales_quote'::text AS invoice_type,
    q.status::text AS invoice_status,
    q.expires_at::date AS due_date,
    q.final_amount::numeric(18,2) AS total_amount,
    0::numeric AS deposit_amount,
    COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
    GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
    true AS commitment_confirmed,
        CASE
            WHEN q.expires_at IS NOT NULL THEN q.expires_at::date - CURRENT_DATE
            ELSE NULL::integer
        END AS days_until_due,
    q.expires_at IS NOT NULL AND q.expires_at::date < CURRENT_DATE AND (q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
    q.created_at,
        CASE
            WHEN q.expires_at IS NULL THEN 'current'::text
            WHEN (CURRENT_DATE - q.expires_at::date) <= 0 THEN 'current'::text
            WHEN (CURRENT_DATE - q.expires_at::date) <= 30 THEN 'd1_30'::text
            WHEN (CURRENT_DATE - q.expires_at::date) <= 60 THEN 'd31_60'::text
            WHEN (CURRENT_DATE - q.expires_at::date) <= 90 THEN 'd61_90'::text
            ELSE 'd90_plus'::text
        END AS aging_bucket
   FROM sales_quotes q
     LEFT JOIN customers c ON c.id = q.customer_id
     LEFT JOIN paid_quote p ON p.doc_id = q.id
  WHERE q.status = 'accepted'::sales_quote_status AND GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric;
