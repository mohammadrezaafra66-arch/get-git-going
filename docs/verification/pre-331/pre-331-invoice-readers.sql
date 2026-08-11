CREATE OR REPLACE FUNCTION public.calculate_salesperson_collected_sales(p_employee_id uuid, p_window_months integer DEFAULT 6)
 RETURNS TABLE(employee_id uuid, window_months integer, window_start date, collected_amount numeric, linked_invoice_count integer, qualifying_receipt_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_window int;
  v_start date;
  v_is_priv boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'p_employee_id is required' USING ERRCODE = '22023';
  END IF;

  v_is_priv := public.has_any_role(v_uid, ARRAY['admin','manager','accountant']::public.text[]);

  -- sales role: only own data; viewer or others: forbidden
  IF NOT v_is_priv THEN
    IF public.has_role(v_uid, 'sales'::public.app_role) THEN
      IF p_employee_id <> v_uid THEN
        RAISE EXCEPTION 'forbidden: sales may only query own collected sales' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_window := GREATEST(1, LEAST(COALESCE(p_window_months, 6), 60));
  v_start := (now() - (v_window || ' months')::interval)::date;

  RETURN QUERY
  WITH eligible AS (
    SELECT
      i.id              AS invoice_id,
      i.total_amount    AS invoice_total,
      prl.id            AS link_id,
      prl.amount        AS link_amount,
      pr.id             AS receipt_id
    FROM public.invoices i
    JOIN public.payment_receipt_links prl ON prl.invoice_id = i.id
    JOIN public.payment_receipts pr       ON pr.id = prl.receipt_id
    WHERE i.created_by = p_employee_id
      AND COALESCE(i.status, '') NOT IN ('draft','cancelled')
      AND pr.status IN ('approved','verified','confirmed','posted')
      AND pr.payment_date >= v_start
  ),
  per_invoice AS (
    SELECT
      invoice_id,
      LEAST(COALESCE(invoice_total, 0), COALESCE(SUM(link_amount), 0)) AS capped_amount,
      COUNT(DISTINCT receipt_id) AS receipt_cnt
    FROM eligible
    GROUP BY invoice_id, invoice_total
  )
  SELECT
    p_employee_id,
    v_window,
    v_start,
    COALESCE(SUM(capped_amount), 0)::numeric        AS collected_amount,
    COALESCE(COUNT(*), 0)::int                      AS linked_invoice_count,
    COALESCE(SUM(receipt_cnt), 0)::int              AS qualifying_receipt_count
  FROM per_invoice;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.create_delivery_receipt(p_type text, p_storage_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_invoice_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_receipt_id uuid;
  v_timer_minutes int;
  v_deadline timestamptz;
  v_video_required boolean;
  v_is_video boolean;
begin
  if not (
    public.has_role(auth.uid(), 'manager') or
    public.has_role(auth.uid(), 'admin') or
    public.has_role(auth.uid(), 'sales')
  ) then
    raise exception 'دسترسی ندارید';
  end if;

  if p_type not in ('shipping_receipt','delivery_receipt','product_video') then
    raise exception 'نوع رسید نامعتبر است';
  end if;

  v_is_video := coalesce(p_mime_type,'') like 'video/%';

  if p_invoice_id is not null then
    select coalesce(product_video_required, false)
      into v_video_required
    from public.invoices where id = p_invoice_id;

    if coalesce(v_video_required, false) and not v_is_video then
      raise exception 'برای این فاکتور آپلود ویدئوی محصول الزامی است';
    end if;
  end if;

  select timer_minutes into v_timer_minutes
  from public.workflow_settings
  where process_key = p_type and is_active = true;

  v_timer_minutes := coalesce(v_timer_minutes, 180);
  v_deadline := now() + (v_timer_minutes || ' minutes')::interval;

  insert into public.delivery_receipts (
    type, storage_path, file_name, file_size, mime_type,
    invoice_id, customer_id, uploaded_by, notes, review_deadline
  ) values (
    p_type, p_storage_path, p_file_name, p_file_size, p_mime_type,
    p_invoice_id, p_customer_id, auth.uid(), p_notes, v_deadline
  ) returning id into v_receipt_id;

  insert into public.delivery_receipt_status_history(receipt_id, from_status, to_status, changed_by, note)
  values (v_receipt_id, null, 'pending_review', auth.uid(), null);

  return v_receipt_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.get_receivable_detail(p_customer_id uuid DEFAULT NULL::uuid, p_invoice_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(customer_id uuid, customer_name text, customer_phone text, invoice_id uuid, invoice_number text, invoice_type text, invoice_status text, issue_date date, due_date date, total_amount numeric, deposit_amount numeric, confirmed_paid_amount numeric, outstanding_amount numeric, is_overdue boolean, receipt_id uuid, receipt_amount numeric, receipt_status text, receipt_payment_date date, receipt_tracking_number text, receipt_bank_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NULL AND p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id or p_invoice_id required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.customer_id, v.customer_name, COALESCE(c.phone, q.customer_phone) AS customer_phone,
    v.invoice_id, v.invoice_number, v.invoice_type, v.invoice_status,
    -- a quote has no issue_date; the receivable row's created_at is the date it
    -- became a commitment
    COALESCE(i.issue_date, v.created_at::date) AS issue_date,
    v.due_date,
    v.total_amount, v.deposit_amount, v.confirmed_paid_amount,
    v.outstanding_amount, v.is_overdue,
    pr.id AS receipt_id, prl.amount AS receipt_amount, pr.status AS receipt_status,
    pr.payment_date AS receipt_payment_date,
    pr.tracking_number AS receipt_tracking_number,
    pr.bank_name AS receipt_bank_name
  FROM public.vw_customer_receivables v
  -- LEFT: a quote-sourced row has no matching invoice
  LEFT JOIN public.invoices i          ON i.id = v.invoice_id
  LEFT JOIN public.sales_quotes q      ON q.id = v.invoice_id
  LEFT JOIN public.customers c         ON c.id = v.customer_id
  -- v.invoice_id carries an invoice id or a quote id; the two id spaces are
  -- disjoint, and the migration-148 CHECK guarantees a link row sets exactly one
  LEFT JOIN public.payment_receipt_links prl
         ON (prl.invoice_id = v.invoice_id OR prl.quote_id = v.invoice_id)
  LEFT JOIN public.payment_receipts    pr   ON pr.id = prl.receipt_id
  WHERE (p_invoice_id  IS NULL OR v.invoice_id  = p_invoice_id)
    AND (p_customer_id IS NULL OR v.customer_id = p_customer_id)
  ORDER BY v.due_date NULLS LAST, pr.payment_date NULLS LAST;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.person_fk_drift_report()
 RETURNS TABLE(table_name text, drifted_rows bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Phase 5 (migration 231)
  SELECT 'sales_quotes'::text, count(*)
    FROM public.sales_quotes q
    LEFT JOIN public.customers c ON c.id = q.customer_id
   WHERE q.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'purchases'::text, count(*)
    FROM public.purchases p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
   WHERE p.supplier_person_id IS DISTINCT FROM s.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'payment_vouchers'::text, count(*)
    FROM public.payment_vouchers v
    LEFT JOIN public.suppliers s ON s.id = v.payee_supplier_id
    LEFT JOIN public.customers c ON c.id = v.payee_customer_id
    LEFT JOIN public.external_parties ep ON ep.id = v.payee_party_id
   WHERE v.payee_person_id IS DISTINCT FROM coalesce(s.person_id, c.person_id, ep.person_id)
  HAVING count(*) > 0
  -- Phase 7.1 (Group A, migration 235)
  UNION ALL
  SELECT 'product_suppliers'::text, count(*)
    FROM public.product_suppliers ps
    LEFT JOIN public.suppliers s ON s.id = ps.supplier_id
   WHERE ps.supplier_person_id IS DISTINCT FROM s.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'purchase_prices'::text, count(*)
    FROM public.purchase_prices pp
    LEFT JOIN public.suppliers s ON s.id = pp.supplier_id
   WHERE pp.supplier_person_id IS DISTINCT FROM s.person_id
  HAVING count(*) > 0
  -- Phase 7.2 (Group B, migration 236)
  UNION ALL
  SELECT 'payment_receipts.customer'::text, count(*)
    FROM public.payment_receipts pr
    LEFT JOIN public.customers c ON c.id = pr.customer_id
   WHERE pr.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'payment_receipts.receiver_party'::text, count(*)
    FROM public.payment_receipts pr
    LEFT JOIN public.external_parties ep ON ep.id = pr.receiver_party_id
   WHERE pr.receiver_party_person_id IS DISTINCT FROM ep.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'delivery_receipts'::text, count(*)
    FROM public.delivery_receipts dr
    LEFT JOIN public.customers c ON c.id = dr.customer_id
   WHERE dr.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  -- Phase 7.3 (Group C, migration 237)
  UNION ALL
  SELECT 'credit_requests'::text, count(*)
    FROM public.credit_requests x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'credit_score_snapshots'::text, count(*)
    FROM public.credit_score_snapshots x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_capital_allocations_dynamic'::text, count(*)
    FROM public.customer_capital_allocations_dynamic x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_credit_balance'::text, count(*)
    FROM public.customer_credit_balance x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_credit_ledger'::text, count(*)
    FROM public.customer_credit_ledger x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_credit_profile'::text, count(*)
    FROM public.customer_credit_profile x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  -- Phase 7.4 (Group D, this migration)
  UNION ALL
  SELECT 'invoices'::text, count(*)
    FROM public.invoices x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'didar_activities'::text, count(*)
    FROM public.didar_activities x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0;
$function$

;

CREATE OR REPLACE FUNCTION public.recalculate_settlement_score(_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_score   INTEGER := 0;
  v_delta   INTEGER;
  inv       RECORD;
BEGIN
  FOR inv IN
    SELECT expected_settlement_date, actual_settlement_date
    FROM public.invoices
    WHERE customer_id = _customer_id
      AND expected_settlement_date IS NOT NULL
      AND actual_settlement_date IS NOT NULL
  LOOP
    v_delta := (inv.actual_settlement_date::date - inv.expected_settlement_date);
    IF    v_delta <= 0  THEN v_score := v_score + 10;
    ELSIF v_delta <= 7  THEN v_score := v_score - 5;
    ELSIF v_delta <= 30 THEN v_score := v_score - 15;
    ELSE                     v_score := v_score - 30;
    END IF;
  END LOOP;

  v_score := GREATEST(-100, LEAST(100, v_score));

  INSERT INTO public.customer_credit_profile (customer_id, settlement_score, last_overdue_check_at)
    VALUES (_customer_id, v_score, NOW())
  ON CONFLICT (customer_id) DO UPDATE
    SET settlement_score       = EXCLUDED.settlement_score,
        last_overdue_check_at  = NOW();
END;
$function$

;

CREATE OR REPLACE FUNCTION public.recompute_all_employee_scores()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _emp uuid;
  _count int := 0;
BEGIN
  FOR _emp IN
    SELECT DISTINCT employee_id FROM (
      SELECT created_by AS employee_id FROM public.invoices WHERE created_by IS NOT NULL
      UNION
      SELECT employee_id FROM public.call_logs WHERE employee_id IS NOT NULL
      UNION
      SELECT employee_id FROM public.employee_scores
    ) src
  LOOP
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN _count;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.update_customer_overdue_status(_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_overdue_since DATE;
BEGIN
  SELECT MIN(expected_settlement_date)
  INTO   v_overdue_since
  FROM   public.invoices
  WHERE  customer_id             = _customer_id
    AND  expected_settlement_date < CURRENT_DATE
    AND  actual_settlement_date   IS NULL
    AND  status NOT IN ('cancelled','draft');

  IF v_overdue_since IS NOT NULL THEN
    INSERT INTO public.customer_credit_profile (customer_id, has_overdue, overdue_since, last_overdue_check_at)
      VALUES (_customer_id, true, v_overdue_since, NOW())
    ON CONFLICT (customer_id) DO UPDATE
      SET has_overdue           = true,
          overdue_since         = EXCLUDED.overdue_since,
          last_overdue_check_at = NOW();
  ELSE
    INSERT INTO public.customer_credit_profile (customer_id, has_overdue, overdue_since, last_overdue_check_at)
      VALUES (_customer_id, false, NULL, NOW())
    ON CONFLICT (customer_id) DO UPDATE
      SET has_overdue           = false,
          overdue_since         = NULL,
          last_overdue_check_at = NOW();
  END IF;
END;
$function$

;

