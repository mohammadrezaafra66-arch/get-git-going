-- Rollback for migration 296 — the product video chain.
-- No BEGIN/COMMIT: transaction control belongs to the caller (mission control rule 2.4).
--
-- Order matters: triggers before the functions they call, functions before the tables their
-- bodies reference, and the CHECK is restored last so no `product_video` row can be orphaned by
-- a narrowed constraint.
--
-- ⚠️ `product_video_chain` and `product_video_chain_events` are DROPPED here. They hold the
-- record of which videos were recorded and sent. Run this only while the chain is empty, or
-- snapshot both tables first — rule 3 forbids dropping a table holding data, and this script is
-- written for the "296 was a mistake, undo it now" case, not for a live rollback months later.
SET client_encoding='UTF8';

DROP TRIGGER IF EXISTS trg_product_video_chain_on_accept ON public.sales_quotes;
DROP TRIGGER IF EXISTS trg_product_video_chain_seed ON public.sales_quote_item_services;
DROP TRIGGER IF EXISTS trg_product_video_chain_log ON public.product_video_chain;
DROP TRIGGER IF EXISTS trg_product_video_chain_transition ON public.product_video_chain;

DROP FUNCTION IF EXISTS public.product_videos_waiting();
DROP FUNCTION IF EXISTS public.product_video_advance(uuid, text, text);
DROP FUNCTION IF EXISTS public.product_video_mark_uploaded(uuid, text, text, bigint, text);
DROP FUNCTION IF EXISTS public.tg_product_video_chain_on_accept();
DROP FUNCTION IF EXISTS public.tg_product_video_chain_seed();
DROP FUNCTION IF EXISTS public.tg_product_video_chain_log();
DROP FUNCTION IF EXISTS public.tg_product_video_chain_transition();

DROP TABLE IF EXISTS public.product_video_chain_events;
DROP TABLE IF EXISTS public.product_video_chain;

DELETE FROM public.role_permissions WHERE module = 'product-videos';

-- The service requirement, back to packaging only.
DELETE FROM public.category_required_services crs
 USING public.product_service_types st
 WHERE st.id = crs.service_type_id AND st.code = 'product_video';
DELETE FROM public.product_service_types WHERE code = 'product_video';

-- Any delivery_receipts row of the new type must go before the CHECK is narrowed again,
-- otherwise the ALTER fails and the rollback stops halfway.
DELETE FROM public.delivery_receipts WHERE type = 'product_video';

ALTER TABLE public.delivery_receipts DROP CONSTRAINT IF EXISTS delivery_receipts_type_check;
ALTER TABLE public.delivery_receipts ADD CONSTRAINT delivery_receipts_type_check
  CHECK (type = ANY (ARRAY['shipping_receipt'::text, 'delivery_receipt'::text]));
