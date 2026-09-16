SET client_encoding TO 'UTF8';

-- ============================================================================
-- 550 — Calm Mind: work_test_reports (soft history) + submit RPC
-- ============================================================================
-- جدول جدید: public.work_test_reports
-- عمداً از public.tasks جداست — هیچ ALTER روی tasks / work_items schema.
-- RLS نقش: همان allowlist 544 (admin|manager|sales|accountant|viewer) + work_can_see_item.
--
-- Reverse (copy/staging only): docs/verification/550-down.sql
-- ============================================================================

SET lock_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1) table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_test_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id       uuid NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  reporter_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT
                       DEFAULT auth.uid(),
  verdict            text NOT NULL
                       CHECK (verdict IN ('approve', 'reject_existing_bug', 'reject_new_bug')),
  notes              text,
  linked_bug_item_id uuid REFERENCES public.work_items(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

COMMENT ON TABLE public.work_test_reports IS
  'Calm Mind test verdict history (soft-delete). Never confuse with public.tasks.';

CREATE INDEX IF NOT EXISTS idx_work_test_reports_item
  ON public.work_test_reports (work_item_id);

CREATE INDEX IF NOT EXISTS idx_work_test_reports_created
  ON public.work_test_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_test_reports_item_active
  ON public.work_test_reports (work_item_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.work_test_reports ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) RLS (mirror 544 role gate + work_can_see_item)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS work_test_reports_select ON public.work_test_reports;
CREATE POLICY work_test_reports_select ON public.work_test_reports
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR public.work_can_see_item(work_item_id)
    )
  );

DROP POLICY IF EXISTS work_test_reports_insert ON public.work_test_reports;
CREATE POLICY work_test_reports_insert ON public.work_test_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND auth.uid() IS NOT NULL
    AND reporter_id = auth.uid()
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR public.work_can_see_item(work_item_id)
    )
  );

-- Soft-delete / note edits: admin|manager OR original reporter
DROP POLICY IF EXISTS work_test_reports_update ON public.work_test_reports;
CREATE POLICY work_test_reports_update ON public.work_test_reports
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR reporter_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR reporter_id = auth.uid()
    )
  );

-- Hard DELETE: admin only (prefer soft-delete via UPDATE deleted_at)
DROP POLICY IF EXISTS work_test_reports_delete ON public.work_test_reports;
CREATE POLICY work_test_reports_delete ON public.work_test_reports
  FOR DELETE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin']::text[])
  );

REVOKE ALL ON TABLE public.work_test_reports FROM PUBLIC;
REVOKE ALL ON TABLE public.work_test_reports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_test_reports TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) RPC: work_submit_test_report
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_submit_test_report(
  p_item_id            uuid,
  p_verdict            text,
  p_notes              text DEFAULT NULL,
  p_linked_bug_item_id uuid DEFAULT NULL,
  p_claimed_due_at     timestamptz DEFAULT NULL
)
RETURNS public.work_test_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_item   public.work_items;
  v_report public.work_test_reports;
  v_due    timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'work_submit_test_report: authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_verdict IS NULL OR p_verdict NOT IN (
    'approve', 'reject_existing_bug', 'reject_new_bug'
  ) THEN
    RAISE EXCEPTION 'work_submit_test_report: invalid verdict %', p_verdict
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.work_can_see_item(p_item_id) THEN
    RAISE EXCEPTION 'work_submit_test_report: not allowed'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_item
    FROM public.work_items
   WHERE id = p_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_submit_test_report: item not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Product: reporter/creator (or admin/manager) can submit
  IF NOT (
    public.has_any_role(v_uid, ARRAY['admin', 'manager']::text[])
    OR v_item.creator_id = v_uid
  ) THEN
    RAISE EXCEPTION 'work_submit_test_report: only creator or admin/manager may submit'
      USING ERRCODE = '42501';
  END IF;

  IF p_linked_bug_item_id IS NOT NULL THEN
    IF p_linked_bug_item_id = p_item_id THEN
      RAISE EXCEPTION 'work_submit_test_report: linked_bug_item_id must differ from item'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.work_items WHERE id = p_linked_bug_item_id) THEN
      RAISE EXCEPTION 'work_submit_test_report: linked bug item missing'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.work_test_reports (
    work_item_id,
    reporter_id,
    verdict,
    notes,
    linked_bug_item_id
  ) VALUES (
    p_item_id,
    v_uid,
    p_verdict,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_linked_bug_item_id
  )
  RETURNING * INTO v_report;

  IF p_verdict = 'approve' THEN
    UPDATE public.work_items
       SET status = 'done'
     WHERE id = p_item_id;
    -- completed_at set by trg_work_items_before_write
  ELSE
    -- reject_* → in_progress; respect claimed_due_at ETA gate (trigger + explicit)
    v_due := v_item.claimed_due_at;
    IF v_due IS NULL THEN
      IF p_claimed_due_at IS NULL THEN
        RAISE EXCEPTION
          'work_submit_test_report: claimed_due_at required when rejecting to in_progress (pass p_claimed_due_at)'
          USING ERRCODE = 'check_violation';
      END IF;
      v_due := p_claimed_due_at;
    ELSIF p_claimed_due_at IS NOT NULL THEN
      v_due := p_claimed_due_at;
    END IF;

    UPDATE public.work_items
       SET status = 'in_progress',
           claimed_due_at = v_due
     WHERE id = p_item_id;
  END IF;

  RETURN v_report;
END;
$fn$;

REVOKE ALL ON FUNCTION public.work_submit_test_report(uuid, text, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_submit_test_report(uuid, text, text, uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.work_submit_test_report(uuid, text, text, uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.work_submit_test_report(uuid, text, text, uuid, timestamptz) IS
  'Calm Mind: ثبت گزارش تست — approve→done؛ reject_*→in_progress با گیت ETA.';

-- ---------------------------------------------------------------------------
-- 4) Assertions
-- ---------------------------------------------------------------------------
DO $chk$
DECLARE
  q text;
BEGIN
  IF to_regclass('public.work_test_reports') IS NULL THEN
    RAISE EXCEPTION '550: work_test_reports missing';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.work_test_reports'::regclass) THEN
    RAISE EXCEPTION '550: RLS not enabled on work_test_reports';
  END IF;

  SELECT with_check INTO q
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'work_test_reports'
     AND policyname = 'work_test_reports_insert';

  IF q IS NULL OR position('sales' IN q) = 0 OR position('viewer' IN q) = 0 THEN
    RAISE EXCEPTION '550: work_test_reports_insert WITH CHECK missing role allowlist: %', q;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'work_submit_test_report'
  ) THEN
    RAISE EXCEPTION '550: work_submit_test_report missing';
  END IF;

  -- Do not touch public.tasks
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'tasks'
      AND t.tgname LIKE '%work_test%'
  ) THEN
    RAISE EXCEPTION '550: unexpected work_test trigger on public.tasks';
  END IF;
END;
$chk$;
