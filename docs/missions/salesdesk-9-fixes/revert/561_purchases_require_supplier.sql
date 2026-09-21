SET client_encoding='UTF8';

-- 561-down: reverse purchases supplier required (copy/staging only).

DROP TRIGGER IF EXISTS trg_purchases_require_supplier ON public.purchases;
DROP TRIGGER IF EXISTS trg_purchases_supplier_required ON public.purchases;
DROP FUNCTION IF EXISTS public.purchases_require_supplier();
DROP FUNCTION IF EXISTS public.tg_purchases_supplier_required();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260921220100';
