SET client_encoding='UTF8';

-- PASS 3: deal amount from estimated_amount; visibility label; file names on a deal.
-- Additive. Idempotent. Live sales_deal_paid previously used quote amount only.

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS visibility_label text;

ALTER TABLE public.sales_interactions
  DROP CONSTRAINT IF EXISTS sales_interactions_visibility_label_check;

ALTER TABLE public.sales_interactions
  ADD CONSTRAINT sales_interactions_visibility_label_check
  CHECK (
    visibility_label IS NULL
    OR visibility_label IN (
      'فقط مسئول',
      'مسئول و هم گروهی ها',
      'مسئول ،هم گروهی ها و زیر گروه ها',
      'همه افراد شرکت'
    )
  );

CREATE TABLE IF NOT EXISTS public.sales_interaction_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL REFERENCES public.sales_interactions(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

CREATE INDEX IF NOT EXISTS sales_interaction_files_interaction_idx
  ON public.sales_interaction_files (interaction_id);

ALTER TABLE public.sales_interaction_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_interaction_files_select ON public.sales_interaction_files;
CREATE POLICY sales_interaction_files_select
  ON public.sales_interaction_files
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS sales_interaction_files_write ON public.sales_interaction_files;
CREATE POLICY sales_interaction_files_write
  ON public.sales_interaction_files
  FOR INSERT TO authenticated
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.sales_interaction_files TO authenticated, service_role;

CREATE OR REPLACE VIEW public.sales_deal_paid AS
SELECT
  si.id,
  COALESCE(si.estimated_amount, q.amount, 0)::numeric AS deal_amount,
  COALESCE(r.paid_amount, 0)::numeric AS paid_amount,
  (
    COALESCE(r.paid_amount, 0) > 0
    AND COALESCE(r.paid_amount, 0) >= COALESCE(si.estimated_amount, q.amount, 0)
    AND COALESCE(si.estimated_amount, q.amount, 0) > 0
  ) AS is_paid
FROM public.sales_interactions si
LEFT JOIN LATERAL (
  SELECT COALESCE(sq.final_amount, 0)::numeric AS amount
    FROM public.sales_quotes sq
   WHERE sq.interaction_id = si.id
   ORDER BY sq.created_at DESC
   LIMIT 1
) q ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(prl.amount), 0)::numeric AS paid_amount
    FROM public.sales_quotes sq
    JOIN public.payment_receipt_links prl ON prl.quote_id = sq.id
   WHERE sq.interaction_id = si.id
) r ON true
WHERE si.kind = 'request';

GRANT SELECT ON public.sales_deal_paid TO authenticated, service_role;
