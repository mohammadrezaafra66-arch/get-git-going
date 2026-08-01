CREATE OR REPLACE FUNCTION public._ensure_credit_balance(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.customer_credit_balance (customer_id, available_credit, held_credit)
  VALUES (
    p_customer_id,
    COALESCE((SELECT credit_limit FROM public.customer_credit_profile WHERE customer_id = p_customer_id LIMIT 1), 0),
    0
  )
  ON CONFLICT (customer_id) DO NOTHING;
END;
$function$
