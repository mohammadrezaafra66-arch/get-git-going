ALTER TABLE public.sale_lists
  ADD COLUMN IF NOT EXISTS pdf_font_size integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pdf_row_padding_y integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS pdf_cell_padding_x integer NOT NULL DEFAULT 4;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_lists_pdf_font_size_range') THEN
    ALTER TABLE public.sale_lists ADD CONSTRAINT sale_lists_pdf_font_size_range CHECK (pdf_font_size BETWEEN 7 AND 16);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_lists_pdf_row_padding_y_range') THEN
    ALTER TABLE public.sale_lists ADD CONSTRAINT sale_lists_pdf_row_padding_y_range CHECK (pdf_row_padding_y BETWEEN 0 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_lists_pdf_cell_padding_x_range') THEN
    ALTER TABLE public.sale_lists ADD CONSTRAINT sale_lists_pdf_cell_padding_x_range CHECK (pdf_cell_padding_x BETWEEN 0 AND 12);
  END IF;
END $$;