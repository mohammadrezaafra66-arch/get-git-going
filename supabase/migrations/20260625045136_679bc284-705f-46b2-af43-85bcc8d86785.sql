-- =========================================================================
-- اتصال inquiries به سیستم گیمیفیکیشن
-- 
-- توضیحات:
--   1) Trigger امتیاز مثبت بر اساس سرعت پاسخ به استعلام (set شدن answered_at)
--   2) توسعه auto_submit_penalty برای ثبت event منفی در employee_score_events
-- 
-- نکته double-count: trigger پاسخ سریع فقط زمانی اجرا می‌شود که answered_at
-- از NULL به NOT NULL تغییر کند. در مسیر tick_inquiries که کارت قرمز صادر
-- می‌شود (status=critical_10min/expired) answered_at همچنان NULL است،
-- پس event مثبت و منفی هم‌زمان روی یک inquiry رخ نمی‌دهد.
-- 
-- triggerهای موجود روی employee_score_events (XP, mission, achievement)
-- پس از INSERT اجرا می‌شوند و کار بعدی را خودکار انجام می‌دهند — دست‌نخورده.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0) Idempotency: unique partial index روی (source_table, source_id, event_type)
-- -------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_score_events_source
  ON public.employee_score_events (source_table, source_id, event_type)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- 1) Helper: خواندن xp_amount از gamification_kpi_rules با fallback
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_kpi_xp(p_event_key text, p_default numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT xp_amount
       FROM public.gamification_kpi_rules
      WHERE event_key = p_event_key
        AND is_active = true
      LIMIT 1),
    p_default
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_kpi_xp(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kpi_xp(text, numeric) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 2) Trigger function: امتیاز مثبت برای پاسخ سریع inquiries
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_inquiry_response_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user uuid;
  v_response_seconds numeric;
  v_event_type text;
  v_score_value numeric;
BEGIN
  -- فقط زمانی که answered_at تازه set شده
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
    -- محدوده کارت قرمز — بدون event
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
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_inquiry_response_score() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_award_inquiry_response_score ON public.inquiries;
CREATE TRIGGER trg_award_inquiry_response_score
  AFTER UPDATE OF answered_at ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.award_inquiry_response_score();

-- -------------------------------------------------------------------------
-- 3) توسعه auto_submit_penalty: ثبت event منفی در employee_score_events
--    امضای تابع و رفتار قبلی حفظ می‌شود.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_submit_penalty(
  p_inquiry_id uuid,
  p_user_id uuid,
  p_type text,
  p_severity text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_penalty_id uuid;
  v_event_type text;
  v_default_score numeric;
  v_score_value numeric;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- جلوگیری از تکرار برای (inquiry, user, type) فعال
  IF EXISTS (
    SELECT 1 FROM public.performance_penalties
    WHERE inquiry_id = p_inquiry_id
      AND user_id = p_user_id
      AND type = p_type
      AND is_active = true
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.performance_penalties (
    user_id, inquiry_id, type, severity, description, created_by
  ) VALUES (
    p_user_id, p_inquiry_id, p_type, p_severity, p_description, NULL
  )
  RETURNING id INTO v_penalty_id;

  -- Audit
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'penalty', v_penalty_id::text, 'auto_created', p_user_id,
    jsonb_build_object(
      'type', p_type,
      'severity', p_severity,
      'inquiry_id', p_inquiry_id,
      'description', p_description
    )
  );

  -- In-app notification
  INSERT INTO public.notification_events (
    user_id, title, body, type, reference_type, reference_id
  ) VALUES (
    p_user_id,
    'کارت قرمز جدید',
    'کارت قرمز در پرونده عملکرد شما ثبت شد.',
    'red_card_issued',
    'penalty',
    v_penalty_id
  );

  -- ---- جدید: ثبت event منفی در سیستم گیمیفیکیشن ----
  v_event_type := 'penalty_' || p_type;
  v_default_score := CASE lower(coalesce(p_severity, 'medium'))
    WHEN 'low' THEN -5
    WHEN 'medium' THEN -10
    WHEN 'high' THEN -20
    WHEN 'critical' THEN -50
    ELSE -10
  END;
  v_score_value := public.get_kpi_xp(v_event_type, v_default_score);

  INSERT INTO public.employee_score_events (
    employee_id, event_type, source_table, source_id, triggered_at, payload
  ) VALUES (
    p_user_id,
    v_event_type,
    'performance_penalties',
    v_penalty_id::text,
    now(),
    jsonb_build_object(
      'severity', p_severity,
      'inquiry_id', p_inquiry_id,
      'penalty_type', p_type,
      'score_value', v_score_value
    )
  )
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

  RETURN v_penalty_id;
END;
$$;

-- بازگردانی grantها مانند قبل (CREATE OR REPLACE حفظ می‌کند، اما محکم‌کاری)
REVOKE EXECUTE ON FUNCTION public.auto_submit_penalty(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_submit_penalty(uuid, uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_submit_penalty(uuid, uuid, text, text, text) TO service_role;