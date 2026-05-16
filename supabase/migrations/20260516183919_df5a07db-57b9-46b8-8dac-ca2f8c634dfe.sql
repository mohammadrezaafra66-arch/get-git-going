
-- RLS policies for internal reviewer/admin access
ALTER TABLE public.market_product_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_product_match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mpm_admin_manager_select"
  ON public.market_product_matches
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "mpm_events_admin_manager_select"
  ON public.market_product_match_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

-- Approve a match (human reviewer)
CREATE OR REPLACE FUNCTION public.review_market_product_match_approve(
  p_match_id uuid,
  p_afrakala_product_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS public.market_product_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_product_name text;
  v_row public.market_product_matches;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'manager'::app_role)) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_afrakala_product_id IS NULL THEN
    RAISE EXCEPTION 'afrakala_product_id is required to approve' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_product_name FROM public.products WHERE id = p_afrakala_product_id;
  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'product not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.market_product_matches
  SET afrakala_product_id = p_afrakala_product_id,
      afrakala_product_name_snapshot = v_product_name,
      match_status = 'approved'::market_match_status,
      matched_by = 'human'::market_match_actor,
      reviewed_by = v_uid,
      reviewed_at = now(),
      reject_reason = NULL,
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_match_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

-- Reject a match (human reviewer)
CREATE OR REPLACE FUNCTION public.review_market_product_match_reject(
  p_match_id uuid,
  p_reject_reason text,
  p_notes text DEFAULT NULL
)
RETURNS public.market_product_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.market_product_matches;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'manager'::app_role)) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_reject_reason IS NULL OR length(btrim(p_reject_reason)) = 0 THEN
    RAISE EXCEPTION 'reject_reason is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.market_product_matches
  SET match_status = 'rejected'::market_match_status,
      matched_by = 'human'::market_match_actor,
      reviewed_by = v_uid,
      reviewed_at = now(),
      reject_reason = btrim(p_reject_reason),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_match_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

-- Disable a match (admin/manager)
CREATE OR REPLACE FUNCTION public.review_market_product_match_disable(
  p_match_id uuid,
  p_reason text,
  p_notes text DEFAULT NULL
)
RETURNS public.market_product_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.market_product_matches;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'manager'::app_role)) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.market_product_matches
  SET match_status = 'disabled'::market_match_status,
      matched_by = 'human'::market_match_actor,
      reviewed_by = v_uid,
      reviewed_at = now(),
      reject_reason = btrim(p_reason),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_match_id
    AND match_status IN ('approved'::market_match_status, 'needs_review'::market_match_status, 'pending'::market_match_status)
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'match not found or not disable-able' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.review_market_product_match_approve(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_market_product_match_reject(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_market_product_match_disable(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.review_market_product_match_approve(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_market_product_match_reject(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_market_product_match_disable(uuid, text, text) TO authenticated;
