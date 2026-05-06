
-- 1) payment_terms table
CREATE TABLE IF NOT EXISTS public.payment_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  days integer,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_terms_name_unique UNIQUE (name),
  CONSTRAINT payment_terms_days_check CHECK (days IS NULL OR days >= 0)
);

CREATE INDEX IF NOT EXISTS idx_payment_terms_active ON public.payment_terms (is_active);

ALTER TABLE public.payment_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_terms_select_authed" ON public.payment_terms;
CREATE POLICY "payment_terms_select_authed"
  ON public.payment_terms FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "payment_terms_write_admin_accountant" ON public.payment_terms;
CREATE POLICY "payment_terms_write_admin_accountant"
  ON public.payment_terms FOR ALL
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));

-- updated_at trigger
DROP TRIGGER IF EXISTS payment_terms_set_updated_at ON public.payment_terms;
CREATE TRIGGER payment_terms_set_updated_at
  BEFORE UPDATE ON public.payment_terms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Add payment_term_id to purchases (nullable for backward compatibility; required at app level for new rows)
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS payment_term_id uuid REFERENCES public.payment_terms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_payment_term ON public.purchases (payment_term_id);

-- 3) Seed common defaults (idempotent)
INSERT INTO public.payment_terms (name, days, sort_order)
VALUES
  ('نقدی', 0, 1),
  ('۳۰ روزه', 30, 2),
  ('۶۰ روزه', 60, 3),
  ('۹۰ روزه', 90, 4),
  ('چک ۴۵ روزه', 45, 5)
ON CONFLICT (name) DO NOTHING;
