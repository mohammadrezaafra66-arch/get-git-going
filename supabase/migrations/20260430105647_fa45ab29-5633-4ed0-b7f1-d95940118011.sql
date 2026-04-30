CREATE OR REPLACE FUNCTION public.set_marketing_channels_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.marketing_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  weight integer NOT NULL DEFAULT 50 CHECK (weight >= 0 AND weight <= 100),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_channels_active ON public.marketing_channels(is_active);
CREATE INDEX IF NOT EXISTS idx_marketing_channels_sort ON public.marketing_channels(sort_order);

ALTER TABLE public.marketing_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mc_select_authed ON public.marketing_channels;
CREATE POLICY mc_select_authed ON public.marketing_channels
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS mc_write_admin_accountant ON public.marketing_channels;
CREATE POLICY mc_write_admin_accountant ON public.marketing_channels
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));

DROP TRIGGER IF EXISTS trg_marketing_channels_updated_at ON public.marketing_channels;
CREATE TRIGGER trg_marketing_channels_updated_at
  BEFORE UPDATE ON public.marketing_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_marketing_channels_updated_at();

INSERT INTO public.marketing_channels (name, weight, sort_order)
SELECT * FROM (VALUES
  ('سایت', 80, 10),
  ('روبیکا', 60, 20),
  ('بله', 55, 30),
  ('واتساپ', 70, 40),
  ('اینستاگرام', 75, 50),
  ('استوری', 50, 60),
  ('گروه مشتریان', 65, 70)
) AS v(name, weight, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_channels);
