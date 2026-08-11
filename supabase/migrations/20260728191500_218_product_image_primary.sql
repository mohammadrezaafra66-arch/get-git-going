SET client_encoding='UTF8';

-- ============================================================================
-- 218 - Product images: choosable primary image + automatic succession
-- ============================================================================
-- WHAT WAS MISSING
--   is_primary already existed and was already honoured everywhere that reads
--   images (ordering is_primary DESC, sort_order ASC; useProductThumbnails
--   picks the first row). But nothing could ever CHANGE it:
--
--   1. is_primary was set to true only for the very first upload
--      (ProductImagesSection.tsx: `const isFirst = existing.length === 0`).
--      There was no way to promote a different photo.
--
--   2. Deleting the primary photo left the product with NO primary at all.
--      Reads then fell back to whatever sorted first, so the "main photo"
--      silently changed - or, with is_primary false everywhere, ordering was
--      decided by sort_order alone.
--
-- WHAT THIS ADDS
--   a) set_primary_product_image(uuid) - promotes one image and demotes the
--      rest of that product's images, atomically.
--   b) An AFTER DELETE trigger that promotes the lowest sort_order survivor
--      when the primary is removed, so a product with photos always has
--      exactly one primary.
--   c) A partial unique index enforcing at most one primary per product.
--
-- SECURITY MODEL - deliberately SECURITY INVOKER
--   A SECURITY DEFINER function would bypass RLS and silently widen who can
--   reorder product imagery. This runs as the caller so the existing
--   product_images_write policy (admin OR manager) applies unchanged.
--
--   Because RLS filters rows rather than raising on UPDATE, an unprivileged
--   caller would otherwise get a silent no-op. So the function checks the same
--   condition up front and raises a Persian message, which the UI surfaces
--   directly (ProductImagesSection toasts e?.message).
--
-- ORDER OF THE TWO UPDATES MATTERS
--   Demote first, then promote. That way the intermediate state has zero
--   primaries, which the partial unique index accepts. Doing it as one
--   `SET is_primary = (id = p_image_id)` statement could trip the index
--   transiently depending on row order.
--
-- SAFETY
--   public.product_images currently holds 0 rows, so the unique index builds
--   cleanly. Nothing is dropped or truncated.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- (c) At most one primary image per product.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS product_images_one_primary_per_product
  ON public.product_images (product_id)
  WHERE is_primary;

-- ---------------------------------------------------------------------------
-- (a) Promote a specific image to primary.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_primary_product_image(p_image_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id uuid;
BEGIN
  IF p_image_id IS NULL THEN
    RAISE EXCEPTION 'شناسه تصویر الزامی است.';
  END IF;

  -- Mirrors the product_images_write RLS policy so the caller gets a clear
  -- error instead of a silent no-op.
  IF NOT (public.has_role(auth.uid(), 'admin'::text)
          OR public.has_role(auth.uid(), 'manager'::text)) THEN
    RAISE EXCEPTION 'برای تعیین تصویر اصلی، دسترسی مدیر یا مدیر سیستم لازم است.';
  END IF;

  SELECT product_id INTO v_product_id
  FROM public.product_images
  WHERE id = p_image_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'تصویر یافت نشد.';
  END IF;

  -- Demote first (intermediate state: zero primaries - index-safe).
  UPDATE public.product_images
     SET is_primary = false
   WHERE product_id = v_product_id
     AND is_primary
     AND id <> p_image_id;

  -- Then promote.
  UPDATE public.product_images
     SET is_primary = true
   WHERE id = p_image_id
     AND NOT is_primary;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_primary_product_image(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_primary_product_image(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- (b) When the primary image is deleted, promote a survivor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_next_product_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only act when the deleted row was the primary one.
  IF NOT OLD.is_primary THEN
    RETURN OLD;
  END IF;

  -- If another primary already exists (e.g. a concurrent promotion), leave it.
  IF EXISTS (
    SELECT 1 FROM public.product_images
    WHERE product_id = OLD.product_id AND is_primary
  ) THEN
    RETURN OLD;
  END IF;

  -- Promote the lowest sort_order survivor. Matches the read ordering used by
  -- useProductThumbnails (is_primary DESC, sort_order ASC), so the thumbnail
  -- does not jump to a different photo than the one now marked primary.
  UPDATE public.product_images
     SET is_primary = true
   WHERE id = (
     SELECT id FROM public.product_images
      WHERE product_id = OLD.product_id
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 1
   );

  RETURN OLD;
END;
$function$;

-- SECURITY DEFINER here is intentional and different from the RPC above: this
-- is bookkeeping that must complete regardless of who performed the delete,
-- and it cannot be steered - it only ever promotes a surviving row of the same
-- product. The delete itself is still gated by product_images_write RLS.
REVOKE ALL ON FUNCTION public.promote_next_product_image() FROM public, anon;

DROP TRIGGER IF EXISTS trg_promote_next_product_image ON public.product_images;
CREATE TRIGGER trg_promote_next_product_image
  AFTER DELETE ON public.product_images
  FOR EACH ROW
  EXECUTE FUNCTION public.promote_next_product_image();

-- ---------------------------------------------------------------------------
-- Post-conditions
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='set_primary_product_image'
  ) THEN
    RAISE EXCEPTION '218: post-check failed - set_primary_product_image missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname='product_images' AND t.tgname='trg_promote_next_product_image'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION '218: post-check failed - succession trigger missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='product_images_one_primary_per_product'
  ) THEN
    RAISE EXCEPTION '218: post-check failed - unique primary index missing.';
  END IF;

  RAISE NOTICE '218: OK - primary image RPC, succession trigger and unique index in place.';
END $$;

COMMIT;
