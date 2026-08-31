-- FORCED DISTURBANCE for migration 419.
--
-- Puts the due date back on q.expires_at -- the exact bug 419 fixed -- while keeping the new
-- column set, so this is a valid CREATE OR REPLACE and the change is surgical: only the source of
-- the date moves. The gate must go red on G1, G2, G3 and G4.
--
-- Everything is inside BEGIN ... ROLLBACK. The real view is untouched.
BEGIN;
SET LOCAL request.jwt.claims = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';

CREATE OR REPLACE VIEW public.vw_customer_receivables AS
SELECT src.customer_id,
    src.customer_name,
    src.invoice_id,
    src.invoice_number,
    src.invoice_type,
    src.invoice_status,
    src.due_date,
    src.total_amount,
    src.deposit_amount,
    src.confirmed_paid_amount,
    src.outstanding_amount,
    src.commitment_confirmed,
        CASE
            WHEN src.due_date IS NOT NULL THEN src.due_date - tehran_today()
            ELSE NULL::integer
        END AS days_until_due,
    src.due_date IS NOT NULL AND src.due_date < tehran_today() AND src.outstanding_amount > 0::numeric AS is_overdue,
    src.created_at,
        CASE
            WHEN src.due_date IS NULL THEN 'current'::text
            WHEN (tehran_today() - src.due_date) <= 0 THEN 'current'::text
            WHEN (tehran_today() - src.due_date) <= 30 THEN 'd1_30'::text
            WHEN (tehran_today() - src.due_date) <= 60 THEN 'd31_60'::text
            WHEN (tehran_today() - src.due_date) <= 90 THEN 'd61_90'::text
            ELSE 'd90_plus'::text
        END AS aging_bucket,
    src.settlement_title,
    src.settlement_days,
    src.settlement_is_active,
    src.due_date IS NULL AS due_date_unknown,
    src.due_date_unknown_reason,
    src.settlement_inactive_flag
   FROM ( WITH paid_quote AS (
                 SELECT prl.quote_id AS doc_id,
                    COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
                   FROM payment_receipt_links prl
                     JOIN payment_receipts pr ON pr.id = prl.receipt_id
                  WHERE prl.quote_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
                  GROUP BY prl.quote_id
                )
         SELECT q.customer_id,
            COALESCE(c.name, q.customer_name) AS customer_name,
            q.id AS invoice_id,
            q.quote_number AS invoice_number,
            'sales_quote'::text AS invoice_type,
            q.status::text AS invoice_status,
            q.expires_at::date AS due_date,          -- <<<< THE DISTURBANCE
            q.final_amount::numeric(18,2) AS total_amount,
            0::numeric AS deposit_amount,
            COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
            GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
            true AS commitment_confirmed,
            q.created_at,
            st.title AS settlement_title,
            st.days AS settlement_days,
            st.is_active AS settlement_is_active,
                CASE
                    WHEN q.accepted_at IS NULL THEN 'no_accepted_at'::text
                    WHEN st.id IS NULL THEN 'no_settlement_type'::text
                    WHEN st.is_active = false AND st.days = 0 THEN 'inactive_zero_days'::text
                    ELSE NULL::text
                END AS due_date_unknown_reason,
            st.id IS NOT NULL AND st.is_active = false AND st.days > 0 AS settlement_inactive_flag
           FROM sales_quotes q
             LEFT JOIN customers c ON c.id = q.customer_id
             LEFT JOIN paid_quote p ON p.doc_id = q.id
             LEFT JOIN settlement_types st ON st.id = q.settlement_type_id
          WHERE q.status = 'accepted'::sales_quote_status AND GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric) src
  WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());

DO $g$
DECLARE _red int := 0; _n int; _def text;
BEGIN
  SELECT pg_get_viewdef('public.vw_customer_receivables'::regclass, true) INTO _def;
  IF _def LIKE '%expires_at%' THEN _red:=_red+1;
    RAISE NOTICE 'G1 RED    the view references expires_at again';
  ELSE RAISE NOTICE 'G1 still green?!'; END IF;

  SELECT count(*) INTO _n FROM public.vw_customer_receivables WHERE due_date IS NOT NULL;
  IF _n <> 7 THEN _red:=_red+1;
    RAISE NOTICE 'G2 RED    dated rows = % (gate wants 7)', _n;
  ELSE RAISE NOTICE 'G2 still green?!'; END IF;

  SELECT count(*) INTO _n FROM public.vw_customer_receivables WHERE is_overdue;
  IF _n = 0 THEN _red:=_red+1;
    RAISE NOTICE 'G4 RED    overdue rows = 0 -- exactly the symptom 419 fixed';
  ELSE RAISE NOTICE 'G4 still green?! overdue=%', _n; END IF;

  RAISE NOTICE '---- DISTURBED: % gate assertions went red (want 3) ----', _red;
  IF _red = 0 THEN RAISE EXCEPTION 'THE 419 GATE IS DECORATION'; END IF;
END
$g$;
ROLLBACK;
