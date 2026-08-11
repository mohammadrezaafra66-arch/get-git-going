-- =====================================================================
-- Migration: sale_lists_pdf_column_widths
-- Purpose : Add per-column width configuration for the sale-list PDF.
--
--   Sits alongside the existing PDF appearance settings on sale_lists
--   (pdf_font_size, pdf_row_padding_y, pdf_cell_padding_x).
--
--   Shape: { "row": 48, "name": 25, "brand": 10, ... }
--     - "row"  → the leading row-number column, in PIXELS.
--     - others → SaleListPdfColumn keys, in PERCENT.
--   NULL = default (current behavior, table-layout:auto).
--
-- Connect as: supabase_admin on DB `afrakala`.
-- After applying: docker restart afrakala-lan-rest
-- =====================================================================

ALTER TABLE public.sale_lists
  ADD COLUMN IF NOT EXISTS pdf_column_widths jsonb NULL;
