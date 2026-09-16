SET client_encoding TO 'UTF8';

-- ============================================================================
-- 551 — Calm Mind: work_taxonomies (managed groups / sections / kind labels)
-- ============================================================================
-- جدول جدید: public.work_taxonomies
-- عمداً از public.tasks جداست — هیچ ALTER روی tasks / work_items schema.
-- RLS نقش: همان allowlist 544 (admin|manager|sales|accountant|viewer).
--
-- Reverse (copy/staging only): docs/verification/551-down.sql
-- ============================================================================

SET lock_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1) table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_taxonomies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL
                CHECK (kind IN ('group', 'section', 'kind_label')),
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.work_taxonomies IS
  'Calm Mind managed taxonomies (group/section/kind_label). Soft-delete via deleted_at.';

COMMENT ON COLUMN public.work_taxonomies.kind IS
  'group | section | kind_label';

-- Unique among live rows only (soft-deleted names may be reused)
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_taxonomies_kind_name_active
  ON public.work_taxonomies (kind, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_work_taxonomies_kind_active_sort
  ON public.work_taxonomies (kind, sort_order, name)
  WHERE deleted_at IS NULL AND is_active;

DROP TRIGGER IF EXISTS trg_work_taxonomies_updated_at ON public.work_taxonomies;
CREATE TRIGGER trg_work_taxonomies_updated_at
  BEFORE UPDATE ON public.work_taxonomies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.work_taxonomies ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) RLS (mirror 544 role allowlist)
-- SELECT: work roles see active non-deleted; admin|manager see all non-deleted
-- INSERT/UPDATE (soft-delete): admin|manager only
-- Hard DELETE: admin only (prefer soft-delete)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS work_taxonomies_select ON public.work_taxonomies;
CREATE POLICY work_taxonomies_select ON public.work_taxonomies
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
    )
    AND deleted_at IS NULL
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
      OR is_active
    )
  );

DROP POLICY IF EXISTS work_taxonomies_insert ON public.work_taxonomies;
CREATE POLICY work_taxonomies_insert ON public.work_taxonomies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

DROP POLICY IF EXISTS work_taxonomies_update ON public.work_taxonomies;
CREATE POLICY work_taxonomies_update ON public.work_taxonomies
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

DROP POLICY IF EXISTS work_taxonomies_delete ON public.work_taxonomies;
CREATE POLICY work_taxonomies_delete ON public.work_taxonomies
  FOR DELETE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin']::text[])
  );

REVOKE ALL ON TABLE public.work_taxonomies FROM PUBLIC;
REVOKE ALL ON TABLE public.work_taxonomies FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_taxonomies TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) seed defaults (INSERT if not exists among live rows)
-- ---------------------------------------------------------------------------
INSERT INTO public.work_taxonomies (kind, name, sort_order)
SELECT v.kind, v.name, v.sort_order
  FROM (VALUES
    ('group', 'عمومی', 10),
    ('group', 'فروش', 20),
    ('group', 'مالی', 30),
    ('group', 'پشتیبانی', 40),
    ('group', 'توسعه', 50),
    ('group', 'پیگیری مشتری', 60),
    ('section', 'دستیار', 10),
    ('section', 'پیش‌فاکتور', 20),
    ('section', 'مطالبات', 30),
    ('section', 'عمومی', 40),
    ('kind_label', 'سؤال', 10),
    ('kind_label', 'درخواست تغییر', 20),
    ('kind_label', 'باگ', 30),
    ('kind_label', 'یادداشت', 40)
  ) AS v(kind, name, sort_order)
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.work_taxonomies t
    WHERE t.kind = v.kind
      AND t.name = v.name
      AND t.deleted_at IS NULL
 );

-- ---------------------------------------------------------------------------
-- 4) assertions
-- ---------------------------------------------------------------------------
DO $chk$
DECLARE
  n int;
  q text;
BEGIN
  IF to_regclass('public.work_taxonomies') IS NULL THEN
    RAISE EXCEPTION '551: work_taxonomies missing';
  END IF;

  SELECT count(*) INTO n
    FROM public.work_taxonomies
   WHERE kind = 'group' AND deleted_at IS NULL;
  IF n < 6 THEN
    RAISE EXCEPTION '551: expected >=6 live groups, got %', n;
  END IF;

  SELECT count(*) INTO n
    FROM public.work_taxonomies
   WHERE kind = 'section' AND deleted_at IS NULL;
  IF n < 4 THEN
    RAISE EXCEPTION '551: expected >=4 live sections, got %', n;
  END IF;

  SELECT qual INTO q
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'work_taxonomies'
     AND policyname = 'work_taxonomies_select';
  IF q IS NULL OR position('viewer' IN q) = 0 THEN
    RAISE EXCEPTION '551: work_taxonomies_select missing role allowlist: %', q;
  END IF;

  SELECT with_check INTO q
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'work_taxonomies'
     AND policyname = 'work_taxonomies_insert';
  IF q IS NULL OR position('manager' IN q) = 0 THEN
    RAISE EXCEPTION '551: work_taxonomies_insert WITH CHECK missing admin|manager: %', q;
  END IF;

  IF has_table_privilege('anon', 'public.work_taxonomies', 'SELECT') THEN
    RAISE EXCEPTION '551: anon still has SELECT on work_taxonomies';
  END IF;
END;
$chk$;
