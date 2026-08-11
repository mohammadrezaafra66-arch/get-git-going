-- Requirement 213: allow trusted trigger validation to see referenced entities.
--
-- Root cause:
-- validate_dynamic_entity_score() validates salesperson scores by checking
-- public.profiles. Accountants are allowed to write dynamic_entity_scores, but
-- profiles RLS does not allow accountants to read every salesperson profile.
-- The invoker-mode trigger therefore raises a false "salesperson not found".
--
-- Fix:
-- Keep the exact validation rules and error messages, but run the trigger
-- function as its trusted owner with a fixed search_path. This does not broaden
-- normal SELECT access to profiles and does not change dynamic_entity_scores
-- table RLS: salespersons still cannot write score rows.

CREATE OR REPLACE FUNCTION public.validate_dynamic_entity_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.entity_type = 'customer' THEN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = NEW.entity_id) THEN
      RAISE EXCEPTION 'مشتری با شناسه % یافت نشد', NEW.entity_id;
    END IF;
  ELSIF NEW.entity_type = 'salesperson' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.entity_id) THEN
      RAISE EXCEPTION 'کارشناس با شناسه % یافت نشد', NEW.entity_id;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

ALTER FUNCTION public.validate_dynamic_entity_score() OWNER TO supabase_admin;
