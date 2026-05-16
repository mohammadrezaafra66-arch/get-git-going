UPDATE public.bot_api_keys SET is_active = false WHERE id = 'd3cf4dbe-2874-46ee-9ee7-8493261deb01' AND name = 'observatory-e2e-test-temporary';
DELETE FROM public.bot_api_key_table_access WHERE api_key_id = 'd3cf4dbe-2874-46ee-9ee7-8493261deb01';
DELETE FROM public.bot_api_keys WHERE id = 'd3cf4dbe-2874-46ee-9ee7-8493261deb01' AND name = 'observatory-e2e-test-temporary';