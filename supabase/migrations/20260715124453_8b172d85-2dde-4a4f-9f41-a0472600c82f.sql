CREATE OR REPLACE FUNCTION public.normalize_fa_text(input text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN input IS NULL THEN NULL ELSE
    regexp_replace(
      regexp_replace(
        translate(
          lower(input),
          'يىكٔ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          'ییک 01234567890123456789'
        ),
        '[\u200B-\u200D\uFEFF\s]+', '', 'g'
      ),
      '[\u064B-\u0652\u0670]', '', 'g'
    )
  END;
$$;
