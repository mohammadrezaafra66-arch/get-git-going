-- 339-down.sql -- rollback for migration 339
-- Restores the (insecure) default grants 338 left in place. Only for rollback completeness;
-- restoring these re-opens the burn path to anon. Prefer rolling 338 back entirely instead.
SET client_encoding='UTF8';
GRANT EXECUTE ON FUNCTION public.burn_document_number(text, uuid, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_document_number(text, uuid) TO anon;
