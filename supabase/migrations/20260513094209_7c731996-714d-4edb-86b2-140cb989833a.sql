ALTER TABLE public.sale_lists
  ADD COLUMN IF NOT EXISTS pdf_brand_order jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pdf_product_order_by_brand jsonb DEFAULT NULL;

COMMENT ON COLUMN public.sale_lists.pdf_brand_order IS 'Saved brand display order for PDF export. JSON array of brand names; "__NO_BRAND__" represents the no-brand group.';
COMMENT ON COLUMN public.sale_lists.pdf_product_order_by_brand IS 'Saved product display order inside each brand for PDF export. JSON object mapping brand key (or "__NO_BRAND__") to ordered array of product UUIDs.';