CREATE OR REPLACE FUNCTION public.audit_sales_quotes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'sales_quotes', new.id::text, 'sales_quote_created',
      jsonb_build_object(
        'quote_number', new.quote_number,
        'customer_name', new.customer_name,
        'customer_phone', new.customer_phone,
        'salesperson_id', new.salesperson_id,
        'subtotal_amount', new.subtotal_amount,
        'discount_amount', new.discount_amount,
        'final_amount', new.final_amount
      ));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.status IS DISTINCT FROM new.status) THEN
      IF new.status = 'canceled' THEN
        INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        VALUES (auth.uid(), 'sales_quotes', new.id::text, 'sales_quote_canceled',
          jsonb_build_object(
            'quote_number', new.quote_number,
            'canceled_by', new.canceled_by,
            'cancel_reason', new.cancel_reason,
            'canceled_at', new.canceled_at
          ));
      ELSE
        INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        VALUES (auth.uid(), 'sales_quotes', new.id::text, 'sales_quote_status_changed',
          jsonb_build_object(
            'quote_number', new.quote_number,
            'old_status', old.status,
            'new_status', new.status,
            'changed_by', auth.uid()
          ));
      END IF;
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END;
$function$;