ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS naming_template text NULL,
  ADD COLUMN IF NOT EXISTS primary_spec_label text NULL;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_naming_template_len_chk;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_naming_template_len_chk
  CHECK (naming_template IS NULL OR char_length(naming_template) <= 300);

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_primary_spec_label_len_chk;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_primary_spec_label_len_chk
  CHECK (primary_spec_label IS NULL OR char_length(primary_spec_label) <= 80);