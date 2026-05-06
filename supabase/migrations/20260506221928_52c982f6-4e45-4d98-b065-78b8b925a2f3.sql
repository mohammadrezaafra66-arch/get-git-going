-- Phase 21.5: batch recompute of customer credit scores
CREATE OR REPLACE FUNCTION public.recompute_customer_credit_scores(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  customer_id uuid,
  score integer,
  credit_limit numeric,
  status text,
  error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer;
  v_offset integer;
  r record;
  v_score integer;
  v_limit_amt numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'manager'::app_role)
    OR public.has_role(v_uid, 'accountant'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden: only admin/manager/accountant may run batch recompute';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));

  FOR r IN
    SELECT c.id
    FROM public.customers c
    WHERE c.is_active = true
    ORDER BY c.id
    LIMIT v_limit OFFSET v_offset
  LOOP
    BEGIN
      SELECT cs.score, cs.credit_limit
        INTO v_score, v_limit_amt
        FROM public.calculate_credit_score(r.id) AS cs;

      customer_id := r.id;
      score := v_score;
      credit_limit := v_limit_amt;
      status := 'ok';
      error := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      customer_id := r.id;
      score := NULL;
      credit_limit := NULL;
      status := 'error';
      error := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_customer_credit_scores(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_customer_credit_scores(integer, integer) TO authenticated;

COMMENT ON FUNCTION public.recompute_customer_credit_scores(integer, integer) IS
'Phase 21.5: batch recompute of credit score for active customers with pagination (1..500). Role guard: admin/manager/accountant. Snapshot/audit performed by calculate_credit_score; this RPC does not duplicate them. No pg_cron scheduled here — schedule separately if required.';