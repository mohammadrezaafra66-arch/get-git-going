SELECT substring(pg_get_functiondef('public.search_product_ids(text,integer)'::regprocedure) FROM 1 FOR 1200) AS snip;
