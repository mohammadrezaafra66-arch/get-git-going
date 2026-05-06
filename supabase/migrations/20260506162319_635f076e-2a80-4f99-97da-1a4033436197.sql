
-- ============ مرحله ۱: اصلاح ۲۶ محصول موجود ============
UPDATE public.products SET model = 'md1'                   WHERE sku = 'AFK-2026-00033' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'الگانت'              WHERE sku = 'AFK-2026-00035' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'ECO'                   WHERE sku = 'AFK-2026-00044' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'ENZO T3'               WHERE sku = 'AFK-2026-00045' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'ULTRA T3'              WHERE sku = 'AFK-2026-00046' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'NORD D3'               WHERE sku = 'AFK-2026-00047' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'D BIX T3'              WHERE sku = 'AFK-2026-00048' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'DIVA 5'                WHERE sku = 'AFK-2026-00051' AND (model IS NULL OR model = '');
UPDATE public.products SET model = '4GEAR'                 WHERE sku = 'AFK-2026-00052' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'SPARK 5 T3'            WHERE sku = 'AFK-2026-00053' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'SPARK 5'               WHERE sku = 'AFK-2026-00054' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'MARS 5'                WHERE sku = 'AFK-2026-00055' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'D NIDA T3'             WHERE sku = 'AFK-2026-00057' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'یونیوالوکس'      WHERE sku = 'AFK-2026-00058' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'EXTRA T3'              WHERE sku = 'AFK-2026-00059' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'T3 PRO'                WHERE sku = 'AFK-2026-00061' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'T3 PRO'                WHERE sku = 'AFK-2026-00062' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'T3 ULTRA'              WHERE sku = 'AFK-2026-00063' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'T4 PRO'                WHERE sku = 'AFK-2026-00064' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'ULTRA WALL'            WHERE sku = 'AFK-2026-00065' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'TROPICAL T3'           WHERE sku = 'AFK-2026-00066' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'ZETTA T3'              WHERE sku = 'AFK-2026-00067' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'FROST SCROL T3'        WHERE sku = 'AFK-2026-00068' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'TITANIUM AMP INVERTER' WHERE sku = 'AFK-2026-00070' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'FANTOM5'               WHERE sku = 'AFK-2026-00071' AND (model IS NULL OR model = '');
UPDATE public.products SET model = 'FANTOM5'               WHERE sku = 'AFK-2026-00072' AND (model IS NULL OR model = '');

-- ============ مرحله ۲: تابع نرمال‌سازی فارسی (IMMUTABLE) ============
CREATE OR REPLACE FUNCTION public.normalize_fa(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT NULLIF(
    regexp_replace(
      lower(
        translate(
          coalesce(input, ''),
          'كيىﻱﻲﻳﻴةۀﺁﺂﺃﺄإأﺇﺈؤئﺅﺉ' ||
          '٠١٢٣٤٥٦٧٨٩' ||
          '۰۱۲۳۴۵۶۷۸۹' ||
          E'\u200c\u200f\u200e\u064b\u064c\u064d\u064e\u064f\u0650\u0651\u0652',
          'كيييييههاااااايييي' ||
          '0123456789' ||
          '0123456789' ||
          '            '
        )
      ),
      '\s+', ' ', 'g'
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public.normalize_fa(text) IS
  'نرمال‌سازی متن فارسی برای مقایسه: یکسان‌سازی ی/ک، حذف اعراب/ZWNJ، اعداد فارسی→انگلیسی، lowercase، حذف فاصله‌های اضافی.';

-- ============ مرحله ۳: ستون محاسباتی dedup_key ============
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS dedup_key text
  GENERATED ALWAYS AS (
    CASE
      WHEN brand_id IS NULL OR category_id IS NULL THEN NULL
      ELSE
        brand_id::text || '|' ||
        category_id::text || '|' ||
        coalesce(public.normalize_fa(model), '') || '|' ||
        coalesce(public.normalize_fa(color), '') || '|' ||
        coalesce(public.normalize_fa(capacity), '')
    END
  ) STORED;

-- ============ مرحله ۴: Unique partial index ============
CREATE UNIQUE INDEX IF NOT EXISTS products_dedup_key_unique
  ON public.products (dedup_key)
  WHERE dedup_key IS NOT NULL AND status <> 'discontinued';

-- ============ مرحله ۵: تابع RPC برای بررسی زنده ============
CREATE OR REPLACE FUNCTION public.find_duplicate_product(
  p_brand_id uuid,
  p_category_id uuid,
  p_model text,
  p_color text,
  p_capacity text,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, name text, sku text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.sku
  FROM public.products p
  WHERE p_brand_id IS NOT NULL
    AND p_category_id IS NOT NULL
    AND p.brand_id = p_brand_id
    AND p.category_id = p_category_id
    AND coalesce(public.normalize_fa(p.model), '')    = coalesce(public.normalize_fa(p_model), '')
    AND coalesce(public.normalize_fa(p.color), '')    = coalesce(public.normalize_fa(p_color), '')
    AND coalesce(public.normalize_fa(p.capacity), '') = coalesce(public.normalize_fa(p_capacity), '')
    AND p.status <> 'discontinued'
    AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_product(uuid, uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_duplicate_product(uuid, uuid, text, text, text, uuid) TO authenticated;
