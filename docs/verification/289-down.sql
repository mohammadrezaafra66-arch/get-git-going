-- Rollback for migration 289 — drop the Asan product-code normalisation trigger.
-- No BEGIN/COMMIT: transaction control belongs to the caller (mission control rule 2.4).
-- Stored values are left exactly as they are: they are already normalised, and rewriting
-- them on the way out would be a data change disguised as a rollback.
SET client_encoding='UTF8';

DROP TRIGGER IF EXISTS trg_products_normalize_accounting_code ON public.products;
DROP FUNCTION IF EXISTS public.products_normalize_accounting_code();
