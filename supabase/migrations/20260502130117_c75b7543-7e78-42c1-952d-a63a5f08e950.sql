ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS primary_spec text NULL;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_primary_spec_len_chk;
ALTER TABLE public.products
  ADD CONSTRAINT products_primary_spec_len_chk
  CHECK (primary_spec IS NULL OR char_length(primary_spec) <= 100);