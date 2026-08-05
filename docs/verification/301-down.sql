SET client_encoding='UTF8';

-- Down for migration 301 (products.torob_url)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_torob_url_http_chk;
ALTER TABLE public.products DROP COLUMN IF EXISTS torob_url;
