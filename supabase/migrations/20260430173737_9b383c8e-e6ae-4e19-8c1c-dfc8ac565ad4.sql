CREATE TABLE IF NOT EXISTS public.pricing_board_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_key TEXT NOT NULL UNIQUE,
  sale_price_type_id UUID NOT NULL REFERENCES public.sale_price_types(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_board_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing_board_settings_select_authorized"
ON public.pricing_board_settings
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','sales']::app_role[]));

CREATE POLICY "pricing_board_settings_insert_privileged"
ON public.pricing_board_settings
FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]));

CREATE POLICY "pricing_board_settings_update_privileged"
ON public.pricing_board_settings
FOR UPDATE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]));

CREATE POLICY "pricing_board_settings_delete_admin"
ON public.pricing_board_settings
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_pricing_board_settings_updated_at
BEFORE UPDATE ON public.pricing_board_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pricing_board_settings (board_key, sale_price_type_id, title, is_active)
SELECT 'amin_hozoor_sales_board', spt.id, 'تابلوی قیمت فروش امین حضور', true
FROM public.sale_price_types spt
WHERE spt.is_active = true
ORDER BY spt.sort_order ASC, spt.title ASC
LIMIT 1
ON CONFLICT (board_key) DO NOTHING;