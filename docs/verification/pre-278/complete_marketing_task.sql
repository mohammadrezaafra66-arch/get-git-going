CREATE OR REPLACE FUNCTION public.complete_marketing_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_task  record;
  v_score numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'برای ثبت وظیفه باید وارد شده باشید.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'وظیفه یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_task.reference_type, '') <> 'marketing_recurring_task' THEN
    RAISE EXCEPTION 'این وظیفه یک وظیفهٔ بازاریابی تکرارشونده نیست.' USING ERRCODE = '22023';
  END IF;

  -- No manager approval step (owner rule): the assignee ticks their own task.
  IF v_task.assigned_to IS DISTINCT FROM v_user
     AND NOT public.has_any_role(v_user, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'فقط مسئول همین وظیفه می‌تواند آن را تیک بزند.' USING ERRCODE = '42501';
  END IF;

  -- Expiry / already-done / wrong-day are raised by trg_marketing_task_guard
  -- with their own Persian messages, so they are not duplicated here.
  UPDATE public.tasks
     SET status       = 'done',
         completed_at = now(),
         updated_at   = now()
   WHERE id = p_task_id;

  SELECT total_score INTO v_score
    FROM public.employee_scores WHERE employee_id = v_task.assigned_to;

  RETURN jsonb_build_object(
    'task_id',     p_task_id,
    'status',      'done',
    'for_date',    v_task.due_date,
    'assigned_to', v_task.assigned_to,
    'total_score', v_score
  );
END;
$function$

