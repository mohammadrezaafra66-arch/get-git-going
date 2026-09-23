CREATE OR REPLACE FUNCTION public.notify_sales_interaction_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_body  text;
  v_person text;
BEGIN
  -- Fire when salesperson_id is non-null on INSERT, or changes on UPDATE.
  IF NEW.salesperson_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.salesperson_id IS NOT DISTINCT FROM OLD.salesperson_id THEN
    RETURN NEW;
  END IF;

  -- Do not notify the actor about assigning themself.
  IF NEW.salesperson_id IS NOT DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.display_name), ''), p.id::text)
    INTO v_person
    FROM public.persons p
   WHERE p.id = NEW.person_id;

  -- «من مسئول شدم»
  v_title := U&'\0645\0646\0020\0645\0633\0626\0648\0644\0020\0634\062F\0645';
  v_body := concat_ws(E'\n',
    U&'\06CC\06A9\0020\062A\0639\0627\0645\0644\0020\0641\0631\0648\0634\0020(' || COALESCE(NEW.kind, U&'\2014') || U&')\0020\0628\0647\0020\0634\0645\0627\0020\0627\0631\062C\0627\0639\0020\0634\062F.',
    U&'\0634\062E\0635:\0020' || COALESCE(v_person, U&'\2014'),
    CASE WHEN NEW.title IS NOT NULL AND btrim(NEW.title) <> ''
         THEN U&'\0639\0646\0648\0627\0646:\0020' || NEW.title ELSE NULL END,
    U&'\0634\0646\0627\0633\0647:\0020' || NEW.id::text
  );

  -- Live catalog: notification_queue.reference_id is uuid (not text).
  INSERT INTO public.notification_queue (
    user_id, title, body, type, reference_type, reference_id
  )
  VALUES (
    NEW.salesperson_id,
    v_title,
    v_body,
    'sales_interaction_assigned',
    'sales_interaction',
    NEW.id
  );

  RETURN NEW;
END
$function$

