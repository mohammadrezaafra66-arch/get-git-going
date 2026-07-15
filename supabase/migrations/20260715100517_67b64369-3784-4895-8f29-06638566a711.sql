
CREATE OR REPLACE FUNCTION public.is_reviewer_of_appeal(_appeal_id uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.appeal_reviewers
    WHERE appeal_id = _appeal_id AND reviewer_id = _user
  );
$$;

CREATE OR REPLACE FUNCTION public.is_appellant_of_appeal(_appeal_id uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.penalty_appeals
    WHERE id = _appeal_id AND appellant_id = _user
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_reviewer_of_appeal(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_appellant_of_appeal(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "appellant sees reviewers of own appeal" ON public.appeal_reviewers;
CREATE POLICY "appellant sees reviewers of own appeal"
  ON public.appeal_reviewers FOR SELECT
  USING (public.is_appellant_of_appeal(appeal_id, auth.uid()));

DROP POLICY IF EXISTS "reviewers see assigned appeals" ON public.penalty_appeals;
CREATE POLICY "reviewers see assigned appeals"
  ON public.penalty_appeals FOR SELECT
  USING (public.is_reviewer_of_appeal(id, auth.uid()));
