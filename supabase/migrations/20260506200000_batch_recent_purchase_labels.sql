-- Batch RPC: get_recent_purchase_labels(p_ids uuid[])
-- بهینه‌سازی: یک round-trip به جای N برای صفحات با چند محصول
-- تابع موجود get_recent_purchase_label دست‌نخورده باقی می‌ماند.

CREATE OR REPLACE FUNCTION public.get_recent_purchase_labels(p_ids uuid[])
RETURNS TABLE (
  product_id uuid,
  status text,
  is_today_purchase boolean,
  last_purchase_at timestamptz,
  hours_since numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limited int;
  v_unavail int;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT limited_after_hours, unavailable_after_hours
    INTO v_limited, v_unavail
  FROM public.recent_purchase_settings
  ORDER BY id LIMIT 1;

  v_limited := COALESCE(v_limited, 6);
  v_unavail := COALESCE(v_unavail, 12);

  RETURN QUERY
  WITH last_p AS (
    SELECT pi.product_id AS pid,
           MAX(p.purchase_date) AS last_at
    FROM public.purchase_items pi
    JOIN public.purchases p ON p.id = pi.purchase_id
    WHERE pi.product_id = ANY(p_ids)
      AND COALESCE(p.status, 'confirmed') <> 'cancelled'
    GROUP BY pi.product_id
  )
  SELECT
    pid AS product_id,
    CASE
      WHEN last_at IS NULL THEN 'none'
      WHEN EXTRACT(EPOCH FROM (now() - last_at)) / 3600.0 < v_limited THEN 'full'
      WHEN EXTRACT(EPOCH FROM (now() - last_at)) / 3600.0 < v_unavail THEN 'limited'
      ELSE 'none'
    END AS status,
    CASE
      WHEN last_at IS NULL THEN false
      WHEN EXTRACT(EPOCH FROM (now() - last_at)) / 3600.0 < v_unavail THEN true
      ELSE false
    END AS is_today_purchase,
    last_at AS last_purchase_at,
    CASE WHEN last_at IS NULL THEN NULL
         ELSE EXTRACT(EPOCH FROM (now() - last_at)) / 3600.0
    END AS hours_since
  FROM last_p;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_purchase_labels(uuid[]) TO authenticated, anon;
