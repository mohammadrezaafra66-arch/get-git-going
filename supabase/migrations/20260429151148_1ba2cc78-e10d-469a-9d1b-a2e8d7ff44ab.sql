-- shop_settings table
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_settings_read_authed"
  ON public.shop_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "shop_settings_write_admin"
  ON public.shop_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed default keys with empty values
INSERT INTO public.shop_settings (key, value) VALUES
  ('shop_name', ''),
  ('shop_address', ''),
  ('shop_phone', ''),
  ('shop_website', ''),
  ('shop_rubika', ''),
  ('shop_whatsapp', ''),
  ('shop_eitaa', ''),
  ('shop_baleh', ''),
  ('default_seller_info', '')
ON CONFLICT (key) DO NOTHING;

-- Add seller_info to sale_lists (nullable)
ALTER TABLE public.sale_lists
  ADD COLUMN IF NOT EXISTS seller_info text;