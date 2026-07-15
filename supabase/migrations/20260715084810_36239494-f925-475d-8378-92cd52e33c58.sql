CREATE OR REPLACE FUNCTION public.award_inquiry_response_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_user uuid;
  v_response_seconds numeric;
  v_event_type text;
  v_score_value numeric;
BEGIN
  IF NEW.answered_at IS NULL OR OLD.answered_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_target_user := COALESCE(NEW.assigned_to, NEW.requested_by);
  IF v_target_user IS NULL THEN
    RETURN NEW;
  END IF;

  v_response_seconds := EXTRACT(EPOCH FROM (NEW.answered_at - NEW.created_at));

  IF v_response_seconds < 120 THEN
    v_event_type := 'inquiry_answered_fast';
    v_score_value := public.get_kpi_xp(v_event_type, 10);
  ELSIF v_response_seconds < 300 THEN
    v_event_type := 'inquiry_answered_normal';
    v_score_value := public.get_kpi_xp(v_event_type, 5);
  ELSIF v_response_seconds < 600 THEN
    v_event_type := 'inquiry_answered_slow';
    v_score_value := public.get_kpi_xp(v_event_type, 2);
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.employee_score_events (
    employee_id, event_type, source_table, source_id, triggered_at, payload
  ) VALUES (
    v_target_user,
    v_event_type,
    'inquiries',
    NEW.id::text,
    NEW.answered_at,
    jsonb_build_object(
      'response_seconds', v_response_seconds,
      'score_value', v_score_value,
      'inquiry_id', NEW.id
    )
  )
  ON CONFLICT (source_table, source_id, event_type)
    WHERE source_table IS NOT NULL AND source_id IS NOT NULL
    DO NOTHING;

  RETURN NEW;
END;
$function$;