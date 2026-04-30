ALTER TABLE public.product_labels
  ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

ALTER TABLE public.product_labels
  DROP CONSTRAINT IF EXISTS product_labels_weight_check;
ALTER TABLE public.product_labels
  ADD CONSTRAINT product_labels_weight_check CHECK (weight >= 0 AND weight <= 100);

ALTER TABLE public.product_labels
  DROP CONSTRAINT IF EXISTS product_labels_visibility_check;
ALTER TABLE public.product_labels
  ADD CONSTRAINT product_labels_visibility_check CHECK (visibility IN ('public','internal'));

CREATE INDEX IF NOT EXISTS idx_product_labels_visibility ON public.product_labels(visibility);
