SET client_encoding='UTF8';
-- Reverse of 546.
DROP FUNCTION IF EXISTS public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text);
DROP FUNCTION IF EXISTS public.sales_interaction_update_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.sales_interaction_set_follow_up(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.sales_my_month_stats();
