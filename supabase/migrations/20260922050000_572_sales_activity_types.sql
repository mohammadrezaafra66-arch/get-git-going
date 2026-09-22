SET client_encoding='UTF8';

-- ============================================================================
-- 572 - sales_activity_types seed (Didar 17 + simple note) -- Wave 4 D2
-- ============================================================================
-- Schema: id uuid PK, title text NOT NULL, sort_order int NOT NULL,
--         is_active boolean NOT NULL DEFAULT true
-- Seed titles via Unicode escapes (ASCII-only source; AGENTS.md).
-- RLS: SELECT all authenticated; INSERT/UPDATE admin/manager.
-- No DELETE policy (deactivate never delete).
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/572_sales_activity_types.sql
-- ============================================================================

SET lock_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.sales_activity_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.sales_activity_types IS
  'Catalog of sales activity types (Didar seed + simple note). Deactivate never delete. Migration 572.';

CREATE UNIQUE INDEX IF NOT EXISTS sales_activity_types_sort_order_uidx
  ON public.sales_activity_types (sort_order);

INSERT INTO public.sales_activity_types (title, sort_order, is_active)
SELECT v.title, v.sort_order, v.is_active
FROM (
  VALUES
  (U&'\06CC\0627\062F\062F\0627\0634\062A \0633\0627\062F\0647', 0, true),
  (U&'\062A\0645\0627\0633 \0648\0631\0648\062F\06CC', 1, true),
  (U&'\062A\0645\0627\0633 \062E\0631\0648\062C\06CC', 2, true),
  (U&'\0627\0639\0644\0627\0645 \0642\06CC\0645\062A', 3, true),
  (U&'\067E\06CC\06AF\06CC\0631\06CC \0648 \0641\0639\0627\0644\06CC\062A \06CC\0627 \062D\0633\0627\0628 \0631\0633\0627\0646\06CC', 4, true),
  (U&'\0648\06CC\062F\0626\0648 \0686\06A9', 5, true),
  (U&'\062A\0645\0627\0633 \062E\0631\0648\062C\06CC \0646\0627 \0645\0648\0641\0642', 6, true),
  (U&'\0648\0638\06CC\0641\0647', 7, true),
  (U&'\0641\06CC\0634 \0686\06A9', 8, true),
  (U&'\067E\06CC\0627\0645 \0648\0627\062A\0633 \0627\067E \06CC\0627 sms', 9, true),
  (U&'\0628\0631\0633\06CC \0627\0639\062A\0628\0627\0631 \0648 \0645\0627\0646\062F\0647 \0645\0639\0648\0642 \0645\0634\062A\0631\06CC \0628\0631\0627\06CC \0627\0639\0644\0627\0645 \0642\06CC\0645\062A', 10, true),
  (U&'\062E\0631\06CC\062F \0648 \0686\06A9 \06A9\0627\0644\0627', 11, true),
  (U&'\0627\0631\0633\0627\0644 \0641\0627\06A9\062A\0648\0631 \062F\0631 \06AF\0631\0648\0647 \0645\0634\062A\0631\06CC \0648 \0641\0627\06A9\062A\0648\0631 \062F\0633\062A\06CC', 12, true),
  (U&'\0627\06A9\0633\0644 \0627\062C\0646\0627\0633 \0627\0631\0633\0627\0644 \0646\0634\062F\0647', 13, true),
  (U&'\0627\0631\0633\0627\0644 \0646\0647\0627\06CC\06CC', 14, true),
  (U&'\0627\0631\0633\0627\0644 \0628\06CC\062C\06A9 \06CC\0627 \0631\0633\06CC\062F \062F\0631 \06AF\0631\0648\0647 \0645\0634\062A\0631\06CC', 15, true),
  (U&'\062B\0628\062A \062D\0633\0627\0628\062F\0627\0631\06CC', 16, true),
  (U&'\0641\0627\06A9\062A\0648\0631\0644\0627\06CC\0646', 17, true)
) AS v(title, sort_order, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sales_activity_types t WHERE t.sort_order = v.sort_order
);

ALTER TABLE public.sales_activity_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_activity_types_select ON public.sales_activity_types;
CREATE POLICY sales_activity_types_select ON public.sales_activity_types
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS sales_activity_types_insert ON public.sales_activity_types;
CREATE POLICY sales_activity_types_insert ON public.sales_activity_types
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

DROP POLICY IF EXISTS sales_activity_types_update ON public.sales_activity_types;
CREATE POLICY sales_activity_types_update ON public.sales_activity_types
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

REVOKE ALL ON TABLE public.sales_activity_types FROM PUBLIC;
REVOKE ALL ON TABLE public.sales_activity_types FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sales_activity_types TO authenticated;
GRANT ALL ON TABLE public.sales_activity_types TO service_role;
