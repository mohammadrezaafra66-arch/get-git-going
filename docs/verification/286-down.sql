-- Rollback for migration 286 (ASAN M3.4 — staged Asan product import).
--
-- No BEGIN/COMMIT: transaction control belongs to the caller (rule 2.4). A previous session
-- lost a rollback because a down script committed the harness transaction.
--
-- This does NOT unset `products.accounting_code` values a commit may have written. Those are
-- the point of the feature and are indistinguishable from the three that migration 283
-- backfilled, so removing them would destroy data this script did not create. Unlinking a
-- product is an UPDATE the owner can make deliberately.
SET client_encoding='UTF8';

DROP TRIGGER IF EXISTS trg_asan_product_row_guard ON public.asan_import_product_rows;
DROP FUNCTION IF EXISTS public.tg_asan_product_row_guard();

DROP FUNCTION IF EXISTS public.asan_commit_product_batch(uuid);
DROP FUNCTION IF EXISTS public.asan_classify_product_batch(uuid);

DROP TABLE IF EXISTS public.asan_import_product_rows;

DROP FUNCTION IF EXISTS public.asan_normalize_code(text);
DROP FUNCTION IF EXISTS public.asan_normalize_name(text);
DROP FUNCTION IF EXISTS public.asan_fold_chars(text);
