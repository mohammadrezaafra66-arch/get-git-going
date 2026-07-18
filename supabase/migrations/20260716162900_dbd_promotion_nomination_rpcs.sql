-- =========================================================================
-- Idea A / DB-D — nomination RPCs + two-lane promotion suggestions view
-- =========================================================================
-- Adds:
--   * a "sales nomination" boost lane to v_promotion_suggestions
--     (final_score = market_score + sales_nomination_boost). The legacy `score`
--     column is kept as an alias of final_score so the current UI keeps working.
--   * nominate_product_for_promotion / cancel_promotion_nomination /
--     get_promotion_nomination_quota RPCs (SECURITY DEFINER).
--
-- Boost values are 0 until calibration (DB-D5), so final_score == market_score
-- today and nothing about current behaviour changes.
--
-- No types.ts patch: the new function return shapes and view columns are read
-- from the client via the accepted (supabase as any).rpc(...) / cast pattern.
--
-- Self-host: file only. Owner applies on the server. Nothing runs here.
-- =========================================================================

-- 1) Two-lane view ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_promotion_suggestions AS
WITH label_sums AS (
  SELECT pll.product_id,
         COALESCE(SUM(pl.weight), 0)::numeric AS label_weight_sum
  FROM public.product_label_links pll
  JOIN public.product_labels pl ON pl.id = pll.label_id AND pl.is_active = true
  GROUP BY pll.product_id
),
sales_90d AS (
  SELECT ii.product_id,
         COALESCE(SUM(ii.quantity), 0)::numeric AS qty_90d
  FROM public.invoice_items ii
  JOIN public.invoices i ON i.id = ii.invoice_id
  WHERE i.issue_date >= (CURRENT_DATE - INTERVAL '90 days')
    AND COALESCE(i.status, '') <> 'cancelled'
  GROUP BY ii.product_id
),
used_today AS (
  SELECT (diff->>'channel_id')::uuid AS channel_id,
         COUNT(*)::int AS used
  FROM public.audit_logs
  WHERE action = 'promotion_suggestion_used'
    AND created_at >= (date_trunc('day', (now() AT TIME ZONE 'Asia/Tehran')) AT TIME ZONE 'Asia/Tehran')
    AND diff ? 'channel_id'
  GROUP BY 1
),
nom_today AS (
  SELECT pn.product_id,
         COALESCE(SUM(pn.boost_applied), 0)::numeric AS raw_boost,
         COUNT(*)::int AS nomination_count,
         MAX(pn.created_at) AS last_nominated_at
  FROM public.promotion_nominations pn
  WHERE pn.nominated_on = (now() AT TIME ZONE 'Asia/Tehran')::date
    AND pn.cancelled_at IS NULL
  GROUP BY pn.product_id
),
def_policy AS (
  SELECT boost_cap_per_product
  FROM public.promotion_nomination_policy
  WHERE is_active AND role IS NULL AND user_id IS NULL
  LIMIT 1
)
SELECT
  p.id           AS product_id,
  p.name         AS product_name,
  p.sku          AS sku,
  p.stock_status AS stock_status,
  mc.id          AS channel_id,
  mc.name        AS channel_name,
  COALESCE(ls.label_weight_sum, 0)::numeric AS label_weight_sum,
  mc.weight::numeric AS channel_weight,
  (CASE p.stock_status::text
     WHEN 'available' THEN 1.0
     WHEN 'limited'   THEN 0.6
     WHEN 'unknown'   THEN 0.4
     ELSE 0.0
   END)::numeric AS stock_factor,
  LEAST(3.0, 1 + ln(1 + COALESCE(s90.qty_90d, 0)) / 5)::numeric AS recency_factor,
  -- legacy `score` column, now = final_score (market + sales nomination boost)
  (
    (
      COALESCE(ls.label_weight_sum, 0)
      * mc.weight
      * (CASE p.stock_status::text
           WHEN 'available' THEN 1.0 WHEN 'limited' THEN 0.6
           WHEN 'unknown' THEN 0.4 ELSE 0.0 END)
      * LEAST(3.0, 1 + ln(1 + COALESCE(s90.qty_90d, 0)) / 5)
    )
    + (CASE
         WHEN dp.boost_cap_per_product IS NULL OR dp.boost_cap_per_product <= 0
           THEN COALESCE(nt.raw_boost, 0)
         ELSE LEAST(COALESCE(nt.raw_boost, 0), dp.boost_cap_per_product)
       END)
  )::numeric AS score,
  COALESCE(s90.qty_90d, 0)::numeric AS qty_90d,
  mc.daily_quota AS daily_quota,
  COALESCE(ut.used, 0)::int AS used_today,
  CASE
    WHEN mc.daily_quota IS NULL OR mc.daily_quota = 0 THEN NULL
    ELSE GREATEST(mc.daily_quota - COALESCE(ut.used, 0), 0)
  END AS remaining_today,
  -- new two-lane columns (appended to keep CREATE OR REPLACE VIEW valid)
  (
    COALESCE(ls.label_weight_sum, 0)
    * mc.weight
    * (CASE p.stock_status::text
         WHEN 'available' THEN 1.0 WHEN 'limited' THEN 0.6
         WHEN 'unknown' THEN 0.4 ELSE 0.0 END)
    * LEAST(3.0, 1 + ln(1 + COALESCE(s90.qty_90d, 0)) / 5)
  )::numeric AS market_score,
  (CASE
     WHEN dp.boost_cap_per_product IS NULL OR dp.boost_cap_per_product <= 0
       THEN COALESCE(nt.raw_boost, 0)
     ELSE LEAST(COALESCE(nt.raw_boost, 0), dp.boost_cap_per_product)
   END)::numeric AS sales_nomination_boost,
  (
    (
      COALESCE(ls.label_weight_sum, 0)
      * mc.weight
      * (CASE p.stock_status::text
           WHEN 'available' THEN 1.0 WHEN 'limited' THEN 0.6
           WHEN 'unknown' THEN 0.4 ELSE 0.0 END)
      * LEAST(3.0, 1 + ln(1 + COALESCE(s90.qty_90d, 0)) / 5)
    )
    + (CASE
         WHEN dp.boost_cap_per_product IS NULL OR dp.boost_cap_per_product <= 0
           THEN COALESCE(nt.raw_boost, 0)
         ELSE LEAST(COALESCE(nt.raw_boost, 0), dp.boost_cap_per_product)
       END)
  )::numeric AS final_score,
  COALESCE(nt.nomination_count, 0)::int AS nomination_count,
  nt.last_nominated_at AS last_nominated_at
FROM public.products p
CROSS JOIN public.marketing_channels mc
LEFT JOIN label_sums ls ON ls.product_id = p.id
LEFT JOIN sales_90d  s90 ON s90.product_id = p.id
LEFT JOIN used_today ut ON ut.channel_id = mc.id
LEFT JOIN nom_today  nt ON nt.product_id = p.id
LEFT JOIN def_policy dp ON true
WHERE p.is_active = true
  AND mc.is_active = true;

ALTER VIEW public.v_promotion_suggestions SET (security_invoker = true);

-- Rebuild RPC (SETOF view type refreshed; order by final_score via score alias).
CREATE OR REPLACE FUNCTION public.compute_promotion_scores(
  _channel_id uuid DEFAULT NULL,
  _min_score  numeric DEFAULT 0,
  _limit      int DEFAULT 200
)
RETURNS SETOF public.v_promotion_suggestions
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.v_promotion_suggestions
  WHERE score > 0
    AND (_channel_id IS NULL OR channel_id = _channel_id)
    AND score >= COALESCE(_min_score, 0)
    AND (daily_quota IS NULL OR daily_quota = 0 OR used_today < daily_quota)
  ORDER BY final_score DESC, score DESC
  LIMIT GREATEST(COALESCE(_limit, 200), 1);
$$;

REVOKE ALL ON FUNCTION public.compute_promotion_scores(uuid, numeric, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compute_promotion_scores(uuid, numeric, int) TO authenticated;

-- 2) Policy resolver helper ---------------------------------------------------
CREATE OR REPLACE FUNCTION public._promo_policy_for(p_uid uuid)
RETURNS public.promotion_nomination_policy
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pol.*
  FROM public.promotion_nomination_policy pol
  WHERE pol.is_active
    AND (
      pol.user_id = p_uid
      OR (
        pol.user_id IS NULL
        AND (
          pol.role IS NULL
          OR pol.role = ANY (SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = p_uid)
        )
      )
    )
  ORDER BY (pol.user_id = p_uid) DESC, (pol.role IS NOT NULL) DESC
  LIMIT 1;
$$;

-- 3) get_promotion_nomination_quota ------------------------------------------
CREATE OR REPLACE FUNCTION public.get_promotion_nomination_quota()
RETURNS TABLE (used_today integer, daily_quota integer, remaining_today integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Tehran')::date;
  v_quota int;
  v_used int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  SELECT COALESCE((SELECT daily_quota FROM public._promo_policy_for(v_user)), 3) INTO v_quota;
  SELECT COUNT(*)::int INTO v_used
  FROM public.promotion_nominations
  WHERE nominated_by = v_user AND nominated_on = v_today AND cancelled_at IS NULL;
  RETURN QUERY SELECT v_used, v_quota, GREATEST(v_quota - v_used, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_promotion_nomination_quota() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_promotion_nomination_quota() TO authenticated;

-- 4) nominate_product_for_promotion ------------------------------------------
CREATE OR REPLACE FUNCTION public.nominate_product_for_promotion(
  p_product_id uuid,
  p_channel_id uuid DEFAULT NULL,
  p_reason_code text DEFAULT NULL,
  p_reason_note text DEFAULT NULL
)
RETURNS TABLE (nomination_id uuid, boost_applied numeric, remaining_today integer, capped boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Tehran')::date;
  v_quota int;
  v_cap int;
  v_boost_per numeric;
  v_used int;
  v_prod_active int;
  v_boost numeric := 0;
  v_capped boolean := false;
  v_id uuid;
  v_existing uuid;
  v_pol public.promotion_nomination_policy;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT has_any_role(v_uid, ARRAY['sales'::app_role,'admin'::app_role,'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_reason_code IS NULL OR p_reason_code NOT IN
     ('customer_request','high_stock','good_margin','competitive_price','new_product','clearance','other') THEN
    RAISE EXCEPTION 'invalid_reason_code';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

  SELECT * INTO v_pol FROM public._promo_policy_for(v_uid);
  v_quota     := COALESCE(v_pol.daily_quota, 3);
  v_cap       := COALESCE(v_pol.per_product_daily_cap, 1);
  v_boost_per := COALESCE(v_pol.boost_per_nomination, 0);

  -- Idempotent: already nominated this product today → return it, no new quota.
  SELECT id INTO v_existing FROM public.promotion_nominations
   WHERE nominated_by = v_uid AND product_id = p_product_id AND nominated_on = v_today;
  IF v_existing IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_used FROM public.promotion_nominations
     WHERE nominated_by = v_uid AND nominated_on = v_today AND cancelled_at IS NULL;
    RETURN QUERY SELECT v_existing,
      (SELECT pn.boost_applied FROM public.promotion_nominations pn WHERE pn.id = v_existing),
      GREATEST(v_quota - v_used, 0), false;
    RETURN;
  END IF;

  -- Daily quota (active nominations today).
  SELECT COUNT(*)::int INTO v_used FROM public.promotion_nominations
   WHERE nominated_by = v_uid AND nominated_on = v_today AND cancelled_at IS NULL;
  IF v_used >= v_quota THEN
    RAISE EXCEPTION 'daily_quota_exceeded';
  END IF;

  -- Per-product daily cap (across all reps): after the cap it is still
  -- recorded but earns no boost.
  SELECT COUNT(*)::int INTO v_prod_active FROM public.promotion_nominations
   WHERE product_id = p_product_id AND nominated_on = v_today AND cancelled_at IS NULL;
  IF v_prod_active >= v_cap THEN
    v_capped := true;
    v_boost := 0;
  ELSE
    v_boost := v_boost_per;
  END IF;

  INSERT INTO public.promotion_nominations
    (product_id, nominated_by, channel_id, reason_code, reason_note, nominated_on, boost_applied)
  VALUES
    (p_product_id, v_uid, p_channel_id, p_reason_code, p_reason_note, v_today, v_boost)
  ON CONFLICT (nominated_by, product_id, nominated_on) DO NOTHING
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'promotion_nomination', COALESCE(v_id, p_product_id)::text, 'promotion_nominated',
    jsonb_build_object(
      'product_id', p_product_id, 'channel_id', p_channel_id,
      'reason_code', p_reason_code, 'boost_applied', v_boost, 'capped', v_capped));

  SELECT COUNT(*)::int INTO v_used FROM public.promotion_nominations
   WHERE nominated_by = v_uid AND nominated_on = v_today AND cancelled_at IS NULL;

  RETURN QUERY SELECT v_id, v_boost, GREATEST(v_quota - v_used, 0), v_capped;
END;
$$;

REVOKE ALL ON FUNCTION public.nominate_product_for_promotion(uuid, uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.nominate_product_for_promotion(uuid, uuid, text, text) TO authenticated;

-- 5) cancel_promotion_nomination ---------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_promotion_nomination(p_nomination_id uuid)
RETURNS TABLE (ok boolean, remaining_today integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Tehran')::date;
  v_row public.promotion_nominations;
  v_quota int;
  v_used int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  SELECT * INTO v_row FROM public.promotion_nominations WHERE id = p_nomination_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nomination_not_found';
  END IF;
  IF v_row.nominated_by <> v_uid OR v_row.nominated_on <> v_today THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_row.cancelled_at IS NULL THEN
    UPDATE public.promotion_nominations
       SET cancelled_at = now(), cancelled_by = v_uid
     WHERE id = p_nomination_id;
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (v_uid, 'promotion_nomination', p_nomination_id::text, 'promotion_nomination_cancelled',
      jsonb_build_object('product_id', v_row.product_id));
  END IF;

  SELECT COALESCE((SELECT daily_quota FROM public._promo_policy_for(v_uid)), 3) INTO v_quota;
  SELECT COUNT(*)::int INTO v_used FROM public.promotion_nominations
   WHERE nominated_by = v_uid AND nominated_on = v_today AND cancelled_at IS NULL;

  RETURN QUERY SELECT true, GREATEST(v_quota - v_used, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_promotion_nomination(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_promotion_nomination(uuid) TO authenticated;

-- NOTE: after applying on the server, run: supabase gen types → regenerate types.ts.
