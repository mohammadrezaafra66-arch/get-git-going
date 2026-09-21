SET client_encoding = 'UTF8';
DROP TRIGGER IF EXISTS trg_purchases_require_supplier ON public.purchases;
DROP FUNCTION IF EXISTS public.purchases_require_supplier();
