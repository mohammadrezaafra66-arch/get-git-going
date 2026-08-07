CREATE OR REPLACE FUNCTION public.trg_person_identifiers_propagate_asan_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.kind <> 'asan_person_code' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'revoked' THEN
    -- Clear the mirror only where it still carries the value being revoked.
    -- A blanket NULL would wipe a code that some other active row provides.
    UPDATE public.customers
       SET accounting_code = NULL
     WHERE person_id = NEW.person_id
       AND accounting_code IS NOT DISTINCT FROM NEW.value_raw;
    UPDATE public.suppliers
       SET accounting_code = NULL
     WHERE person_id = NEW.person_id
       AND accounting_code IS NOT DISTINCT FROM NEW.value_raw;
    RETURN NEW;
  END IF;

  IF NEW.value_raw IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.customers
     SET accounting_code = NEW.value_raw
   WHERE person_id = NEW.person_id
     AND accounting_code IS DISTINCT FROM NEW.value_raw;

  UPDATE public.suppliers
     SET accounting_code = NEW.value_raw
   WHERE person_id = NEW.person_id
     AND accounting_code IS DISTINCT FROM NEW.value_raw;

  RETURN NEW;
END;
$function$

