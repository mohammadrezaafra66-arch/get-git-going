
CREATE OR REPLACE FUNCTION public.submit_appeal(p_penalty_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_appeal_id uuid;
  v_penalty record;
  v_manager_id uuid;
  v_rep_id uuid;
  v_neutral_id uuid;
BEGIN
  SELECT * INTO v_penalty
  FROM public.performance_penalties
  WHERE id = p_penalty_id AND user_id = auth.uid() AND is_active = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'تخلف یافت نشد یا دسترسی ندارید'; END IF;
  IF v_penalty.created_at < now() - interval '24 hours' THEN
    RAISE EXCEPTION 'مهلت اعتراض ۲۴ ساعته منقضی شده است';
  END IF;
  IF EXISTS (SELECT 1 FROM public.penalty_appeals WHERE penalty_id = p_penalty_id) THEN
    RAISE EXCEPTION 'قبلاً برای این تخلف اعتراض ثبت شده است';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'دلیل اعتراض الزامی است';
  END IF;

  INSERT INTO public.penalty_appeals (penalty_id, appellant_id, reason)
  VALUES (p_penalty_id, auth.uid(), p_reason)
  RETURNING id INTO v_appeal_id;

  SELECT p.id INTO v_manager_id
  FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'manager' AND p.is_active = true AND p.id <> auth.uid()
  ORDER BY random() LIMIT 1;
  IF v_manager_id IS NOT NULL THEN
    INSERT INTO public.appeal_reviewers (appeal_id, reviewer_id, role)
    VALUES (v_appeal_id, v_manager_id, 'manager');
  END IF;

  SELECT p.id INTO v_rep_id
  FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'manager' AND p.is_active = true AND p.id <> auth.uid()
    AND (v_manager_id IS NULL OR p.id <> v_manager_id)
  ORDER BY random() LIMIT 1;
  IF v_rep_id IS NOT NULL THEN
    INSERT INTO public.appeal_reviewers (appeal_id, reviewer_id, role)
    VALUES (v_appeal_id, v_rep_id, 'representative');
  END IF;

  SELECT p.id INTO v_neutral_id
  FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'admin' AND p.is_active = true AND p.id <> auth.uid()
    AND (v_manager_id IS NULL OR p.id <> v_manager_id)
    AND (v_rep_id IS NULL OR p.id <> v_rep_id)
  ORDER BY random() LIMIT 1;
  IF v_neutral_id IS NOT NULL THEN
    INSERT INTO public.appeal_reviewers (appeal_id, reviewer_id, role)
    VALUES (v_appeal_id, v_neutral_id, 'neutral');
  END IF;

  INSERT INTO public.notification_events (event_type, user_id, channel, payload, status)
  SELECT
    'appeal_assigned', ar.reviewer_id, 'in_app',
    jsonb_build_object(
      'title', 'اعتراض جدید برای بررسی',
      'body', 'یک اعتراض جدید برای بررسی به شما اختصاص یافت.',
      'reference_type', 'appeal',
      'reference_id', v_appeal_id
    ),
    'pending'
  FROM public.appeal_reviewers ar
  WHERE ar.appeal_id = v_appeal_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES ('appeal', v_appeal_id::text, 'submitted', auth.uid(),
          jsonb_build_object('penalty_id', p_penalty_id));

  RETURN v_appeal_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vote_on_appeal(p_appeal_id uuid, p_vote text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_accept_count int;
  v_reject_count int;
  v_final_status text;
  v_penalty_id uuid;
BEGIN
  IF p_vote NOT IN ('accept','reject') THEN RAISE EXCEPTION 'رأی نامعتبر'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.appeal_reviewers
    WHERE appeal_id = p_appeal_id AND reviewer_id = auth.uid() AND vote IS NULL
  ) THEN RAISE EXCEPTION 'دسترسی ندارید یا قبلاً رأی داده‌اید'; END IF;

  UPDATE public.appeal_reviewers
  SET vote = p_vote, vote_note = p_note, voted_at = now()
  WHERE appeal_id = p_appeal_id AND reviewer_id = auth.uid();

  SELECT count(*) FILTER (WHERE vote='accept'), count(*) FILTER (WHERE vote='reject')
  INTO v_accept_count, v_reject_count
  FROM public.appeal_reviewers WHERE appeal_id = p_appeal_id;

  IF v_accept_count >= 2 THEN v_final_status := 'accepted';
  ELSIF v_reject_count >= 2 THEN v_final_status := 'rejected';
  ELSE RETURN jsonb_build_object('status','pending','votes', v_accept_count + v_reject_count);
  END IF;

  UPDATE public.penalty_appeals SET status = v_final_status, reviewed_at = now()
  WHERE id = p_appeal_id RETURNING penalty_id INTO v_penalty_id;

  IF v_final_status = 'accepted' THEN
    UPDATE public.performance_penalties SET is_active = false WHERE id = v_penalty_id;
  END IF;

  INSERT INTO public.notification_events (event_type, user_id, channel, payload, status)
  SELECT
    'appeal_result', pa.appellant_id, 'in_app',
    jsonb_build_object(
      'title', 'نتیجه اعتراض',
      'body', CASE v_final_status
        WHEN 'accepted' THEN 'اعتراض شما پذیرفته شد — کارت قرمز حذف شد.'
        ELSE 'اعتراض شما رد شد — تخلف ثبت‌شده باقی می‌ماند.' END,
      'reference_type', 'appeal',
      'reference_id', p_appeal_id
    ),
    'pending'
  FROM public.penalty_appeals pa WHERE pa.id = p_appeal_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES ('appeal', p_appeal_id::text, v_final_status, auth.uid(),
          jsonb_build_object('vote', p_vote, 'accept', v_accept_count, 'reject', v_reject_count));

  RETURN jsonb_build_object('status', v_final_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_submit_penalty(p_inquiry_id uuid, p_user_id uuid, p_type text, p_severity text, p_description text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_penalty_id uuid;
  v_event_type text;
  v_default_score numeric;
  v_score_value numeric;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM public.performance_penalties
    WHERE inquiry_id = p_inquiry_id AND user_id = p_user_id AND type = p_type AND is_active = true
  ) THEN RETURN NULL; END IF;

  INSERT INTO public.performance_penalties (user_id, inquiry_id, type, severity, description, created_by)
  VALUES (p_user_id, p_inquiry_id, p_type, p_severity, p_description, NULL)
  RETURNING id INTO v_penalty_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES ('penalty', v_penalty_id::text, 'auto_created', p_user_id,
          jsonb_build_object('type', p_type, 'severity', p_severity,
                             'inquiry_id', p_inquiry_id, 'description', p_description));

  INSERT INTO public.notification_events (event_type, user_id, channel, payload, status)
  VALUES (
    'red_card_issued', p_user_id, 'in_app',
    jsonb_build_object(
      'title', 'کارت قرمز جدید',
      'body', 'کارت قرمز در پرونده عملکرد شما ثبت شد.',
      'reference_type', 'penalty',
      'reference_id', v_penalty_id
    ),
    'pending'
  );

  v_event_type := 'penalty_' || p_type;
  v_default_score := CASE lower(coalesce(p_severity,'medium'))
    WHEN 'low' THEN -5 WHEN 'medium' THEN -10 WHEN 'high' THEN -20 WHEN 'critical' THEN -50 ELSE -10 END;
  v_score_value := public.get_kpi_xp(v_event_type, v_default_score);

  INSERT INTO public.employee_score_events (employee_id, event_type, source_table, source_id, triggered_at, payload)
  VALUES (p_user_id, v_event_type, 'performance_penalties', v_penalty_id::text, now(),
          jsonb_build_object('severity', p_severity, 'inquiry_id', p_inquiry_id,
                             'penalty_type', p_type, 'score_value', v_score_value))
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

  RETURN v_penalty_id;
END;
$function$;
