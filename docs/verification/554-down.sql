-- Down for 554: drop the two enqueue triggers and functions.
DROP TRIGGER IF EXISTS trg_prq_settlement_types ON public.settlement_types;
DROP TRIGGER IF EXISTS trg_prq_sale_price_types ON public.sale_price_types;
DROP FUNCTION IF EXISTS public.trg_enqueue_on_settlement_type_change();
DROP FUNCTION IF EXISTS public.trg_enqueue_on_sale_price_type_change();
