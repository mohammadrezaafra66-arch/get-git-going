SET client_encoding TO 'UTF8';

-- ============================================================================
-- 544 — Calm Mind RLS: gate work_* by role allowlist (+ merge status RPC gate)
-- ============================================================================
-- Defect (measured): 543 policies check identity (creator/assignee/owner) but NOT the
-- same role allowlist as work_create_item (admin|manager|sales|accountant|viewer).
-- Any authenticated role (e.g. purchase_specialist) can PostgREST INSERT/UPDATE own rows.
--
-- Do NOT edit 543. Forward-only repair.
-- Reverse (copy/staging only): docs/verification/544-down.sql
-- ============================================================================

SET lock_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 0) helper: work_can_see_item — add allowlist (SECURITY DEFINER bypasses table RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_can_see_item(_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM public.work_items wi
     WHERE wi.id = _item_id
       AND public.has_any_role(
             auth.uid(),
             ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
           )
       AND (
         public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
         OR wi.creator_id = auth.uid()
         OR wi.assignee_id = auth.uid()
       )
  );
$fn$;

REVOKE ALL ON FUNCTION public.work_can_see_item(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_can_see_item(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.work_can_see_item(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1) RLS — work_items (allowlist AND identity)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS work_items_select ON public.work_items;
CREATE POLICY work_items_select ON public.work_items
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR creator_id = auth.uid()
      OR assignee_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS work_items_insert ON public.work_items;
CREATE POLICY work_items_insert ON public.work_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND auth.uid() IS NOT NULL
    AND creator_id = auth.uid()
  );

DROP POLICY IF EXISTS work_items_update ON public.work_items;
CREATE POLICY work_items_update ON public.work_items
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR creator_id = auth.uid()
      OR assignee_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR creator_id = auth.uid()
      OR assignee_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS work_items_delete ON public.work_items;
CREATE POLICY work_items_delete ON public.work_items
  FOR DELETE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

-- ---------------------------------------------------------------------------
-- 2) RLS — work_topics
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS work_topics_select ON public.work_topics;
CREATE POLICY work_topics_select ON public.work_topics
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.work_items wi
         WHERE wi.topic_id = work_topics.id
           AND (
             public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
             OR wi.creator_id = auth.uid()
             OR wi.assignee_id = auth.uid()
           )
      )
    )
  );

DROP POLICY IF EXISTS work_topics_insert ON public.work_topics;
CREATE POLICY work_topics_insert ON public.work_topics
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND auth.uid() IS NOT NULL
    AND owner_id = auth.uid()
  );

DROP POLICY IF EXISTS work_topics_update ON public.work_topics;
CREATE POLICY work_topics_update ON public.work_topics
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS work_topics_delete ON public.work_topics;
CREATE POLICY work_topics_delete ON public.work_topics
  FOR DELETE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

-- ---------------------------------------------------------------------------
-- 3) RLS — work_merge_suggestions (allowlist + visibility)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS work_merge_suggestions_select ON public.work_merge_suggestions;
CREATE POLICY work_merge_suggestions_select ON public.work_merge_suggestions
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR (
        public.work_can_see_item(source_item_id)
        AND public.work_can_see_item(target_item_id)
      )
    )
  );

DROP POLICY IF EXISTS work_merge_suggestions_insert ON public.work_merge_suggestions;
CREATE POLICY work_merge_suggestions_insert ON public.work_merge_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND status = 'pending'
    AND public.work_can_see_item(source_item_id)
    AND public.work_can_see_item(target_item_id)
  );

DROP POLICY IF EXISTS work_merge_suggestions_update ON public.work_merge_suggestions;
CREATE POLICY work_merge_suggestions_update ON public.work_merge_suggestions
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR (
        public.work_can_see_item(source_item_id)
        AND public.work_can_see_item(target_item_id)
      )
    )
  )
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR (
        public.work_can_see_item(source_item_id)
        AND public.work_can_see_item(target_item_id)
      )
    )
  );

DROP POLICY IF EXISTS work_merge_suggestions_delete ON public.work_merge_suggestions;
CREATE POLICY work_merge_suggestions_delete ON public.work_merge_suggestions
  FOR DELETE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

-- ---------------------------------------------------------------------------
-- 4) BEFORE UPDATE trigger: status changes only via accept/dismiss RPCs
--    Gate: current_setting('work.merge_rpc', true) = '1'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_merge_suggestions_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF coalesce(current_setting('work.merge_rpc', true), '') IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'work_merge_suggestions: status changes only via work_accept_merge / work_dismiss_merge'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_work_merge_suggestions_status_guard
  ON public.work_merge_suggestions;
CREATE TRIGGER trg_work_merge_suggestions_status_guard
  BEFORE UPDATE ON public.work_merge_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.work_merge_suggestions_status_guard();

REVOKE ALL ON FUNCTION public.work_merge_suggestions_status_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_merge_suggestions_status_guard() FROM anon;
-- trigger functions need EXECUTE for table owner / invoker path; keep authenticated revoked
REVOKE ALL ON FUNCTION public.work_merge_suggestions_status_guard() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5) RPCs: set work.merge_rpc before status UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_accept_merge(
  p_suggestion_id uuid,
  p_keep_item_id  uuid
)
RETURNS public.work_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_sug     public.work_merge_suggestions;
  v_keep    public.work_items;
  v_absorb  public.work_items;
  v_absorb_id uuid;
  v_body    text;
  v_sum     text;
  v_tr      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'work_accept_merge: authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_sug
    FROM public.work_merge_suggestions
   WHERE id = p_suggestion_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_accept_merge: suggestion not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_sug.status <> 'pending' THEN
    RAISE EXCEPTION 'work_accept_merge: suggestion is %', v_sug.status
      USING ERRCODE = 'P0001';
  END IF;

  IF p_keep_item_id IS DISTINCT FROM v_sug.source_item_id
     AND p_keep_item_id IS DISTINCT FROM v_sug.target_item_id THEN
    RAISE EXCEPTION 'work_accept_merge: keep id must be source or target'
      USING ERRCODE = '22023';
  END IF;

  v_absorb_id := CASE
    WHEN p_keep_item_id = v_sug.source_item_id THEN v_sug.target_item_id
    ELSE v_sug.source_item_id
  END;

  IF NOT (
    public.has_any_role(v_uid, ARRAY['admin', 'manager']::text[])
    OR (
      public.work_can_see_item(v_sug.source_item_id)
      AND public.work_can_see_item(v_sug.target_item_id)
    )
  ) THEN
    RAISE EXCEPTION 'work_accept_merge: not allowed'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_keep FROM public.work_items WHERE id = p_keep_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_accept_merge: keep item missing'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_absorb FROM public.work_items WHERE id = v_absorb_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_accept_merge: absorb item missing'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_any_role(v_uid, ARRAY['admin', 'manager']::text[])
    OR v_keep.creator_id = v_uid
    OR v_keep.assignee_id = v_uid
  ) THEN
    RAISE EXCEPTION 'work_accept_merge: cannot update keep item'
      USING ERRCODE = '42501';
  END IF;

  v_body := coalesce(v_keep.body, '');
  IF v_absorb.body IS NOT NULL AND length(btrim(v_absorb.body)) > 0 THEN
    v_body := nullif(btrim(
      v_body || E'\n\n--- merged from ' || v_absorb.id::text || E' ---\n' || v_absorb.body
    ), '');
  END IF;

  v_sum := coalesce(v_keep.intake_summary, '');
  IF v_absorb.intake_summary IS NOT NULL AND length(btrim(v_absorb.intake_summary)) > 0 THEN
    v_sum := nullif(btrim(
      v_sum || E'\n\n--- merged ---\n' || v_absorb.intake_summary
    ), '');
  END IF;

  v_tr := coalesce(v_keep.intake_transcript, '');
  IF v_absorb.intake_transcript IS NOT NULL AND length(btrim(v_absorb.intake_transcript)) > 0 THEN
    v_tr := nullif(btrim(
      v_tr || E'\n\n--- merged ---\n' || v_absorb.intake_transcript
    ), '');
  END IF;

  UPDATE public.work_items
     SET body = v_body,
         intake_summary = v_sum,
         intake_transcript = v_tr
   WHERE id = p_keep_item_id
   RETURNING * INTO v_keep;

  UPDATE public.work_items
     SET status = 'cancelled'
   WHERE id = v_absorb_id;

  PERFORM set_config('work.merge_rpc', '1', true);

  UPDATE public.work_merge_suggestions
     SET status = 'accepted'
   WHERE id = p_suggestion_id;

  RETURN v_keep;
END;
$fn$;

REVOKE ALL ON FUNCTION public.work_accept_merge(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_accept_merge(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.work_accept_merge(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.work_accept_merge(uuid, uuid) IS
  'Calm Mind: پذیرش صریح پیشنهاد ادغام — بدنه/intake را به keep می‌چسباند، absorb را cancelled می‌کند.';

CREATE OR REPLACE FUNCTION public.work_dismiss_merge(p_suggestion_id uuid)
RETURNS public.work_merge_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_sug public.work_merge_suggestions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'work_dismiss_merge: authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_sug
    FROM public.work_merge_suggestions
   WHERE id = p_suggestion_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_dismiss_merge: suggestion not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_any_role(v_uid, ARRAY['admin', 'manager']::text[])
    OR (
      public.work_can_see_item(v_sug.source_item_id)
      AND public.work_can_see_item(v_sug.target_item_id)
    )
  ) THEN
    RAISE EXCEPTION 'work_dismiss_merge: not allowed'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('work.merge_rpc', '1', true);

  UPDATE public.work_merge_suggestions
     SET status = 'dismissed'
   WHERE id = p_suggestion_id
   RETURNING * INTO v_sug;

  RETURN v_sug;
END;
$fn$;

REVOKE ALL ON FUNCTION public.work_dismiss_merge(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_dismiss_merge(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.work_dismiss_merge(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Assertions
-- ---------------------------------------------------------------------------
DO $chk$
DECLARE
  q text;
BEGIN
  SELECT qual INTO q
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'work_items'
     AND policyname = 'work_items_insert';

  IF q IS NOT NULL THEN
    RAISE EXCEPTION '544: work_items_insert should have empty USING (INSERT), got %', q;
  END IF;

  SELECT with_check INTO q
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'work_items'
     AND policyname = 'work_items_insert';

  IF q IS NULL OR position('sales' IN q) = 0 OR position('viewer' IN q) = 0 THEN
    RAISE EXCEPTION '544: work_items_insert WITH CHECK missing role allowlist: %', q;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_work_merge_suggestions_status_guard'
       AND tgrelid = 'public.work_merge_suggestions'::regclass
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '544: status guard trigger missing';
  END IF;
END;
$chk$;
