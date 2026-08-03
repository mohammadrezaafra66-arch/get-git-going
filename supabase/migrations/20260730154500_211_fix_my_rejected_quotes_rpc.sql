-- Item 211/216 follow-up: keep get_my_rejected_quotes aligned with the
-- current quote rejection flow.
--
-- Root cause:
-- The old RPC returned audit_logs.id while declaring id uuid. audit_logs.id is
-- bigint, so PostgREST returned 400 when the page called the function. It also
-- scoped rows by audit_logs.actor_id, which is the accountant who rejects the
-- quote in the current flow, not the salesperson who must see the rejection.
--
-- New behavior:
-- Return rejected sales_quotes owned by auth.uid(). This preserves the narrow
-- SECURITY DEFINER surface while matching the business requirement.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_rejected_quotes(p_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  reason text,
  note text,
  customer_name text,
  final_amount numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    COALESCE(q.updated_at, q.created_at) AS created_at,
    NULLIF(q.reject_reason, '') AS reason,
    NULL::text AS note,
    NULLIF(q.customer_name, '') AS customer_name,
    q.final_amount
  FROM public.sales_quotes q
  WHERE q.status = 'rejected'::public.sales_quote_status
    AND q.salesperson_id = auth.uid()
  ORDER BY COALESCE(q.updated_at, q.created_at) DESC
  LIMIT v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_rejected_quotes(integer)
  TO anon, authenticated, service_role, postgres;

COMMIT;
