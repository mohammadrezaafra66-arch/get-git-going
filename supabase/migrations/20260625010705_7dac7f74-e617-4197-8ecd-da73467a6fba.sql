
-- ============================================================
-- Slice 8: Red Card / Performance Penalty system
-- ============================================================

-- 1) Tables -------------------------------------------------

CREATE TABLE public.performance_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inquiry_id uuid REFERENCES public.inquiries(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN (
    'no_response_primary',
    'no_response_secondary',
    'no_confirm_store',
    'repeated_invalid_answer',
    'frequent_delay',
    'frequent_price_edit',
    'wrong_inquiry',
    'free_product_attempt'
  )),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.performance_penalties TO authenticated;
GRANT ALL ON public.performance_penalties TO service_role;
ALTER TABLE public.performance_penalties ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_penalties_user_created ON public.performance_penalties(user_id, created_at DESC);
CREATE INDEX idx_penalties_inquiry ON public.performance_penalties(inquiry_id);
CREATE INDEX idx_penalties_active ON public.performance_penalties(is_active);


CREATE TABLE public.penalty_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  penalty_id uuid NOT NULL REFERENCES public.performance_penalties(id) ON DELETE CASCADE,
  appellant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  deadline timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  review_deadline timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE (penalty_id)
);

GRANT SELECT ON public.penalty_appeals TO authenticated;
GRANT ALL ON public.penalty_appeals TO service_role;
ALTER TABLE public.penalty_appeals ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_appeals_status ON public.penalty_appeals(status);
CREATE INDEX idx_appeals_appellant ON public.penalty_appeals(appellant_id);


CREATE TABLE public.appeal_reviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id uuid NOT NULL REFERENCES public.penalty_appeals(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager', 'representative', 'neutral')),
  vote text CHECK (vote IN ('accept', 'reject')),
  vote_note text,
  voted_at timestamptz,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appeal_id, reviewer_id)
);

GRANT SELECT, UPDATE ON public.appeal_reviewers TO authenticated;
GRANT ALL ON public.appeal_reviewers TO service_role;
ALTER TABLE public.appeal_reviewers ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_reviewers_appeal ON public.appeal_reviewers(appeal_id);
CREATE INDEX idx_reviewers_reviewer ON public.appeal_reviewers(reviewer_id);


-- 2) RLS Policies -------------------------------------------

-- performance_penalties: SELECT only (writes through SECURITY DEFINER RPCs)
CREATE POLICY "user sees own penalties"
  ON public.performance_penalties FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "managers see all penalties"
  ON public.performance_penalties FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

-- penalty_appeals
CREATE POLICY "user sees own appeals"
  ON public.penalty_appeals FOR SELECT
  TO authenticated
  USING (appellant_id = auth.uid());

CREATE POLICY "reviewers see assigned appeals"
  ON public.penalty_appeals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appeal_reviewers ar
      WHERE ar.appeal_id = penalty_appeals.id
        AND ar.reviewer_id = auth.uid()
    )
  );

CREATE POLICY "managers see all appeals"
  ON public.penalty_appeals FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

-- appeal_reviewers
CREATE POLICY "reviewer sees own row"
  ON public.appeal_reviewers FOR SELECT
  TO authenticated
  USING (reviewer_id = auth.uid());

CREATE POLICY "appellant sees reviewers of own appeal"
  ON public.appeal_reviewers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.penalty_appeals pa
      WHERE pa.id = appeal_reviewers.appeal_id
        AND pa.appellant_id = auth.uid()
    )
  );

CREATE POLICY "managers see all reviewers"
  ON public.appeal_reviewers FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );


-- 3) RPCs ---------------------------------------------------

-- 3.1 auto_submit_penalty (called by cron / server only)
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
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Prevent duplicates for same (inquiry, user, type) while still active
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

  RETURN v_penalty_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_submit_penalty(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_submit_penalty(uuid, uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_submit_penalty(uuid, uuid, text, text, text) TO service_role;


-- 3.2 submit_appeal
CREATE OR REPLACE FUNCTION public.submit_appeal(
  p_penalty_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appeal_id uuid;
  v_penalty record;
  v_manager_id uuid;
  v_rep_id uuid;
  v_neutral_id uuid;
BEGIN
  SELECT * INTO v_penalty
  FROM public.performance_penalties
  WHERE id = p_penalty_id
    AND user_id = auth.uid()
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'تخلف یافت نشد یا دسترسی ندارید';
  END IF;

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

  -- Reviewer 1: manager (نقش manager)
  SELECT p.id INTO v_manager_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'manager'
    AND p.is_active = true
    AND p.id <> auth.uid()
  ORDER BY random()
  LIMIT 1;

  IF v_manager_id IS NOT NULL THEN
    INSERT INTO public.appeal_reviewers (appeal_id, reviewer_id, role)
    VALUES (v_appeal_id, v_manager_id, 'manager');
  END IF;

  -- Reviewer 2: representative (نقش manager دیگر)
  SELECT p.id INTO v_rep_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'manager'
    AND p.is_active = true
    AND p.id <> auth.uid()
    AND (v_manager_id IS NULL OR p.id <> v_manager_id)
  ORDER BY random()
  LIMIT 1;

  IF v_rep_id IS NOT NULL THEN
    INSERT INTO public.appeal_reviewers (appeal_id, reviewer_id, role)
    VALUES (v_appeal_id, v_rep_id, 'representative');
  END IF;

  -- Reviewer 3: neutral (نقش admin)
  SELECT p.id INTO v_neutral_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'admin'
    AND p.is_active = true
    AND p.id <> auth.uid()
    AND (v_manager_id IS NULL OR p.id <> v_manager_id)
    AND (v_rep_id IS NULL OR p.id <> v_rep_id)
  ORDER BY random()
  LIMIT 1;

  IF v_neutral_id IS NOT NULL THEN
    INSERT INTO public.appeal_reviewers (appeal_id, reviewer_id, role)
    VALUES (v_appeal_id, v_neutral_id, 'neutral');
  END IF;

  -- Notify reviewers
  INSERT INTO public.notification_events (
    user_id, title, body, type, reference_type, reference_id
  )
  SELECT
    ar.reviewer_id,
    'اعتراض جدید برای بررسی',
    'یک اعتراض جدید برای بررسی به شما اختصاص یافت.',
    'appeal_assigned',
    'appeal',
    v_appeal_id
  FROM public.appeal_reviewers ar
  WHERE ar.appeal_id = v_appeal_id;

  -- Audit
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'appeal', v_appeal_id::text, 'submitted', auth.uid(),
    jsonb_build_object('penalty_id', p_penalty_id)
  );

  RETURN v_appeal_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_appeal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_appeal(uuid, text) TO authenticated;


-- 3.3 vote_on_appeal
CREATE OR REPLACE FUNCTION public.vote_on_appeal(
  p_appeal_id uuid,
  p_vote text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_accept_count int;
  v_reject_count int;
  v_final_status text;
  v_penalty_id uuid;
BEGIN
  IF p_vote NOT IN ('accept', 'reject') THEN
    RAISE EXCEPTION 'رأی نامعتبر';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.appeal_reviewers
    WHERE appeal_id = p_appeal_id
      AND reviewer_id = auth.uid()
      AND vote IS NULL
  ) THEN
    RAISE EXCEPTION 'دسترسی ندارید یا قبلاً رأی داده‌اید';
  END IF;

  UPDATE public.appeal_reviewers
  SET vote = p_vote, vote_note = p_note, voted_at = now()
  WHERE appeal_id = p_appeal_id
    AND reviewer_id = auth.uid();

  SELECT
    count(*) FILTER (WHERE vote = 'accept'),
    count(*) FILTER (WHERE vote = 'reject')
  INTO v_accept_count, v_reject_count
  FROM public.appeal_reviewers
  WHERE appeal_id = p_appeal_id;

  IF v_accept_count >= 2 THEN
    v_final_status := 'accepted';
  ELSIF v_reject_count >= 2 THEN
    v_final_status := 'rejected';
  ELSE
    RETURN jsonb_build_object(
      'status', 'pending',
      'votes', v_accept_count + v_reject_count
    );
  END IF;

  UPDATE public.penalty_appeals
  SET status = v_final_status, reviewed_at = now()
  WHERE id = p_appeal_id
  RETURNING penalty_id INTO v_penalty_id;

  IF v_final_status = 'accepted' THEN
    UPDATE public.performance_penalties
    SET is_active = false
    WHERE id = v_penalty_id;
  END IF;

  INSERT INTO public.notification_events (
    user_id, title, body, type, reference_type, reference_id
  )
  SELECT
    pa.appellant_id,
    'نتیجه اعتراض',
    CASE v_final_status
      WHEN 'accepted' THEN 'اعتراض شما پذیرفته شد — کارت قرمز حذف شد.'
      ELSE 'اعتراض شما رد شد — تخلف ثبت‌شده باقی می‌ماند.'
    END,
    'appeal_result',
    'appeal',
    p_appeal_id
  FROM public.penalty_appeals pa
  WHERE pa.id = p_appeal_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'appeal', p_appeal_id::text, v_final_status, auth.uid(),
    jsonb_build_object('vote', p_vote, 'accept', v_accept_count, 'reject', v_reject_count)
  );

  RETURN jsonb_build_object('status', v_final_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vote_on_appeal(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vote_on_appeal(uuid, text, text) TO authenticated;


-- 3.4 get_user_penalties
CREATE OR REPLACE FUNCTION public.get_user_penalties(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  type text,
  severity text,
  description text,
  is_active boolean,
  created_at timestamptz,
  inquiry_id uuid,
  has_appeal boolean,
  appeal_status text,
  can_appeal boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target uuid;
BEGIN
  v_target := COALESCE(p_user_id, auth.uid());

  IF v_target <> auth.uid()
     AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  THEN
    RAISE EXCEPTION 'دسترسی ندارید';
  END IF;

  RETURN QUERY
  SELECT
    pp.id,
    pp.type,
    pp.severity,
    pp.description,
    pp.is_active,
    pp.created_at,
    pp.inquiry_id,
    EXISTS (SELECT 1 FROM public.penalty_appeals pa WHERE pa.penalty_id = pp.id) AS has_appeal,
    (SELECT pa.status FROM public.penalty_appeals pa WHERE pa.penalty_id = pp.id) AS appeal_status,
    (
      pp.is_active = true
      AND pp.created_at > now() - interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM public.penalty_appeals pa WHERE pa.penalty_id = pp.id)
    ) AS can_appeal
  FROM public.performance_penalties pp
  WHERE pp.user_id = v_target
  ORDER BY pp.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_penalties(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_penalties(uuid) TO authenticated;


-- 4) Extend tick_inquiries to auto-issue red card at 10min ---
CREATE OR REPLACE FUNCTION public.tick_inquiries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record;
  v_target_user uuid;
BEGIN
  -- pending -> warning_5min after 5 min
  FOR r IN SELECT id, status FROM public.inquiries
    WHERE status = 'pending' AND now() - created_at > interval '5 minutes' FOR UPDATE
  LOOP
    UPDATE public.inquiries SET status = 'warning_5min' WHERE id = r.id;
    INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    VALUES (r.id, r.status, 'warning_5min', NULL, 'auto-tick');
  END LOOP;

  -- warning_5min -> danger_8min after 8 min
  FOR r IN SELECT id, status FROM public.inquiries
    WHERE status = 'warning_5min' AND now() - created_at > interval '8 minutes' FOR UPDATE
  LOOP
    UPDATE public.inquiries SET status = 'danger_8min' WHERE id = r.id;
    INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    VALUES (r.id, r.status, 'danger_8min', NULL, 'auto-tick');
  END LOOP;

  -- danger_8min -> critical_10min after 10 min + issue red card
  FOR r IN SELECT id, status, assigned_to, requested_by FROM public.inquiries
    WHERE status = 'danger_8min' AND now() - created_at > interval '10 minutes' FOR UPDATE
  LOOP
    UPDATE public.inquiries SET status = 'critical_10min' WHERE id = r.id;
    INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    VALUES (r.id, r.status, 'critical_10min', NULL, 'auto-tick');

    v_target_user := COALESCE(r.assigned_to, r.requested_by);
    IF v_target_user IS NOT NULL THEN
      PERFORM public.auto_submit_penalty(
        r.id,
        v_target_user,
        'no_response_primary',
        'medium',
        'عدم پاسخ مسئول اول طی ۱۰ دقیقه'
      );
    END IF;
  END LOOP;

  -- critical_10min -> transfer_available
  FOR r IN SELECT id, status FROM public.inquiries
    WHERE status = 'critical_10min' AND now() - created_at > interval '10 minutes' FOR UPDATE
  LOOP
    UPDATE public.inquiries SET status = 'transfer_available' WHERE id = r.id;
    INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    VALUES (r.id, r.status, 'transfer_available', NULL, 'auto-tick');
  END LOOP;

  -- expired after 30 min
  FOR r IN SELECT id, status FROM public.inquiries
    WHERE status NOT IN ('answered','completed_on_time','completed_late','expired','cancelled','rejected')
    AND now() - created_at > interval '30 minutes' FOR UPDATE
  LOOP
    UPDATE public.inquiries SET status = 'expired', closed_at = now() WHERE id = r.id;
    INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    VALUES (r.id, r.status, 'expired', NULL, 'auto-tick');
  END LOOP;
END;
$function$;
