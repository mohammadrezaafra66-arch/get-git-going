SET client_encoding='UTF8';

-- ============================================================================
-- 217 - Fix: product images are stored but can never be read back
-- ============================================================================
-- ROOT CAUSE (proved with a simulated admin JWT)
--   'product-images' is a PRIVATE bucket, and it is the only bucket in the
--   project with no SELECT policy on storage.objects. It has INSERT and DELETE
--   only:
--
--     product_images_storage_write   INSERT
--     product_images_storage_delete  DELETE
--     (no SELECT)
--
--   Every other bucket - delivery-receipts, documents, feedback-attachments,
--   messenger-attachments, payment-receipt-documents, purchase-receipts - has
--   one.
--
--   Without SELECT, storage cannot resolve the object, so createSignedUrls()
--   returns nothing and every surface that renders a product image falls back
--   to an empty placeholder: /products, /sales/search, /sales/quotes/new,
--   /pricing/live-price-list and SalesProductRecommendations.
--
--   Proof: 13 objects exist in the bucket, but under a real admin JWT
--     SELECT count(*) FROM storage.objects WHERE bucket_id='product-images'
--   returned 0.
--
--   The same gap also makes storage.remove() fail, which is how 13 orphaned
--   files accumulated (the DB rows were deleted, the files were not).
--
-- WHY 'authenticated' AND NOT A ROLE LIST
--   This deliberately matches the visibility of the metadata table it mirrors:
--   public.product_images already has `product_images_select USING (true)`,
--   i.e. readable by any signed-in user. Product photos are shown to every
--   sales-facing role (sales, viewer, accountant, manager, admin) across five
--   pages, so a narrower list would reintroduce the same blank-image bug for
--   whichever role was left out.
--
--   Restricting TO authenticated still keeps anon out, so the bucket stays
--   private and URLs remain signed and time-limited. Making the bucket public
--   was rejected: object paths are guessable and product imagery is tied to
--   purchasing data.
--
-- SAFETY
--   Adds a read-only policy. No data is written, moved or deleted. The 13
--   orphaned files are intentionally left in place - removing them is a
--   destructive action and is left for the user to approve separately.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS product_images_storage_select ON storage.objects;

CREATE POLICY product_images_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'product-images');

-- Post-condition: the bucket must now have a SELECT policy, and must still be
-- private.
DO $$
DECLARE
  v_has_select boolean;
  v_is_public  boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND cmd        = 'SELECT'
      AND qual::text ILIKE '%product-images%'
  ) INTO v_has_select;

  IF NOT v_has_select THEN
    RAISE EXCEPTION '217: post-check failed - no SELECT policy for product-images.';
  END IF;

  SELECT public INTO v_is_public FROM storage.buckets WHERE id = 'product-images';

  IF v_is_public IS TRUE THEN
    RAISE EXCEPTION '217: post-check failed - bucket became public; it must stay private.';
  END IF;

  RAISE NOTICE '217: OK - product-images is readable by authenticated users and still private.';
END $$;

COMMIT;
