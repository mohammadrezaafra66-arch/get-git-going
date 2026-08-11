SET client_encoding='UTF8';

-- =====================================================================
-- 301 — products.torob_url (optional Torob product page URL)
--
-- Additive only. Nullable. Empty values must be stored as NULL by the app.
-- CHECK: when present, must be http(s) and ≤ 500 chars.
-- Down: docs/verification/301-down.sql
-- =====================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS torob_url text;

COMMENT ON COLUMN public.products.torob_url IS
  'Optional URL of this product on Torob (https://torob.com/...). Nullable; empty means unset.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_torob_url_http_chk'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_torob_url_http_chk
      CHECK (
        torob_url IS NULL
        OR (
          char_length(torob_url) BETWEEN 1 AND 500
          AND torob_url ~* '^https?://'
        )
      );
  END IF;
END $$;
