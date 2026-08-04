CREATE OR REPLACE FUNCTION public.tg_person_identifiers_normalize()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.value_normalized := public.normalize_identifier(NEW.kind, NEW.value_raw, true);
  RETURN NEW;
END;
$function$

