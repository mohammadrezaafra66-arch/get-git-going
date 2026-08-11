CREATE OR REPLACE FUNCTION public.recalculate_settlement_score(_customer_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.update_customer_overdue_status(_customer_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;