SET client_encoding = 'UTF8';

-- PASS 4: owner/delete guard must not block supabase_admin / service_role (auth.uid() is NULL).
CREATE OR REPLACE FUNCTION public.trg_sales_deal_owner_or_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.kind IS DISTINCT FROM 'request' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.salesperson_id IS NOT DISTINCT FROM OLD.salesperson_id
       AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
      RETURN NEW;
    END IF;
    IF NEW.salesperson_id IS DISTINCT FROM OLD.salesperson_id
       AND NOT public.sales_deal_actor_can_own_mutate(OLD.salesperson_id) THEN
      RAISE EXCEPTION 'شما مجوز تغییر مسئول این معامله را ندارید.' USING ERRCODE = '42501';
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       AND NEW.deleted_at IS NOT NULL
       AND NOT public.sales_deal_actor_can_own_mutate(OLD.salesperson_id) THEN
      RAISE EXCEPTION 'شما مجوز حذف این معامله را ندارید.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION public.trg_sales_deal_owner_or_delete_guard() OWNER TO supabase_admin;
