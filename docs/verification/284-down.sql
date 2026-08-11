-- Rollback for migration 284 — phone normalization and the collision queue.
-- No BEGIN/COMMIT: transaction control belongs to the caller (mission control rule 2.4).
--
-- Written during M5.2, when the final sweep found 284 and 285 were the only two migrations in
-- this program without a down script. Recorded as a gap that was closed, not as one that never
-- existed.
--
-- ⚠️ WHAT THIS DOES **NOT** UNDO. 284's backfill rewrote phone values into the canonical
-- `09XXXXXXXXX` form. On this database it changed **0 rows** — every phone was already canonical,
-- which is why the backfill was safe — so there is nothing to restore here. On a database where
-- it did change rows, the original values are not recoverable from this script and would have to
-- come from a backup. Dropping the triggers stops future normalization; it does not un-normalize
-- the past.
--
-- `phone_collisions` holds the review queue. On this database it holds the 3 collisions R2.4
-- predicted, which are the owner's to resolve — rule 3 forbids dropping a table holding data, so
-- take a snapshot first if those rows still matter.
SET client_encoding='UTF8';

DROP TRIGGER IF EXISTS trg_normalize_phone ON public.customers;
DROP TRIGGER IF EXISTS trg_normalize_phone ON public.suppliers;
DROP TRIGGER IF EXISTS trg_normalize_phone ON public.external_parties;
DROP TRIGGER IF EXISTS trg_normalize_phone ON public.profiles;
DROP TRIGGER IF EXISTS trg_normalize_phone ON public.visitors;
DROP TRIGGER IF EXISTS trg_normalize_phone ON public.sales_quotes;
DROP TRIGGER IF EXISTS trg_normalize_phone ON public.payment_receipts;
DROP TRIGGER IF EXISTS trg_normalize_phone ON public.waybills;
DROP TRIGGER IF EXISTS trg_normalize_phone ON public.stock_alert_requests;

DROP FUNCTION IF EXISTS public.tg_normalize_phone_columns();
DROP FUNCTION IF EXISTS public.detect_phone_collisions();

-- `normalize_phone_local` is dropped last because the trigger function above calls it.
DROP FUNCTION IF EXISTS public.normalize_phone_local(text);

DROP TABLE IF EXISTS public.phone_collisions;
