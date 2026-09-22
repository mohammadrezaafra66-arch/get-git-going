SET client_encoding='UTF8';

-- ============================================================================
-- 568 - sales_interaction_items (C6)
-- ============================================================================
-- Line items on a sales interaction (deal/request).
-- RLS mirrors sales_interactions visibility via parent row:
--   author OR salesperson OR customer responsible (plus admin/manager).
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/568_sales_interaction_items.sql
-- ============================================================================

SET lock_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.sales_interaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL REFERENCES public.sales_interactions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 1,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sales_interaction_items IS
  'Product line items attached to a sales_interactions row. Migration 568.';

CREATE INDEX IF NOT EXISTS sales_interaction_items_interaction_id_idx
  ON public.sales_interaction_items (interaction_id);
CREATE INDEX IF NOT EXISTS sales_interaction_items_product_id_idx
  ON public.sales_interaction_items (product_id);

ALTER TABLE public.sales_interaction_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_interaction_items_select ON public.sales_interaction_items;
CREATE POLICY sales_interaction_items_select ON public.sales_interaction_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales_interactions si
      WHERE si.id = interaction_id
        AND (
          public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
          OR (
            public.has_any_role(auth.uid(), ARRAY['sales', 'admin', 'manager', 'accountant']::text[])
            AND (
              si.author_id = auth.uid()
              OR si.salesperson_id = auth.uid()
              OR si.customer_id IN (
                SELECT c.id FROM public.customers c WHERE c.responsible_id = auth.uid()
              )
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS sales_interaction_items_insert ON public.sales_interaction_items;
CREATE POLICY sales_interaction_items_insert ON public.sales_interaction_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales_interactions si
      WHERE si.id = interaction_id
        AND (
          public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
          OR si.author_id = auth.uid()
          OR si.salesperson_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS sales_interaction_items_update ON public.sales_interaction_items;
CREATE POLICY sales_interaction_items_update ON public.sales_interaction_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales_interactions si
      WHERE si.id = interaction_id
        AND (
          public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
          OR si.author_id = auth.uid()
          OR si.salesperson_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales_interactions si
      WHERE si.id = interaction_id
        AND (
          public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
          OR si.author_id = auth.uid()
          OR si.salesperson_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS sales_interaction_items_delete ON public.sales_interaction_items;
CREATE POLICY sales_interaction_items_delete ON public.sales_interaction_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales_interactions si
      WHERE si.id = interaction_id
        AND (
          public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
          OR si.author_id = auth.uid()
          OR si.salesperson_id = auth.uid()
        )
    )
  );

REVOKE ALL ON TABLE public.sales_interaction_items FROM PUBLIC;
REVOKE ALL ON TABLE public.sales_interaction_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_interaction_items TO authenticated;
GRANT ALL ON TABLE public.sales_interaction_items TO service_role;
