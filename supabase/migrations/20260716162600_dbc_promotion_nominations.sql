-- =========================================================================
-- Idea A / DB-C — daily limited sales-rep nomination of products for promotion
-- =========================================================================
-- Two tables:
--   promotion_nomination_policy — configurable per-role / per-user quota and
--     boost (never hard-coded). A NULL role AND NULL user_id row is the default.
--   promotion_nominations — one row per (rep, product, day) nomination.
--
-- Direct INSERT is blocked by RLS; nominations are created only through the
-- SECURITY DEFINER RPC added in DB-D. Cancellation is also RPC-driven.
--
-- Self-host: file only. Owner applies on the server. Nothing runs here.
-- =========================================================================

-- 1) Policy -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotion_nomination_policy (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role                  text NULL,          -- app_role name, or NULL for default
  user_id               uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_quota           integer NOT NULL DEFAULT 3,
  per_product_daily_cap integer NOT NULL DEFAULT 1,
  boost_per_nomination  numeric NOT NULL DEFAULT 0,
  boost_cap_per_product numeric NOT NULL DEFAULT 0,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- At most one active policy per (role, user_id) scope.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_policy_scope
  ON public.promotion_nomination_policy (COALESCE(role, ''), COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active = true;

ALTER TABLE public.promotion_nomination_policy ENABLE ROW LEVEL SECURITY;

-- Everyone may read the policy (the nomination dialog shows remaining quota);
-- only admin/manager may change it.
DROP POLICY IF EXISTS "promo_policy_select_authed" ON public.promotion_nomination_policy;
CREATE POLICY "promo_policy_select_authed"
  ON public.promotion_nomination_policy
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "promo_policy_write_admin_manager" ON public.promotion_nomination_policy;
CREATE POLICY "promo_policy_write_admin_manager"
  ON public.promotion_nomination_policy
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

-- Seed: default = 3/day; boost_per_nomination = 0 until calibration (DB-D5).
INSERT INTO public.promotion_nomination_policy
  (role, user_id, daily_quota, per_product_daily_cap, boost_per_nomination, boost_cap_per_product)
SELECT NULL, NULL, 3, 1, 0, 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.promotion_nomination_policy WHERE role IS NULL AND user_id IS NULL
);
-- Note: a "تازه‌کار" (1–2/day) policy can be added later as a role/user row.

-- 2) Nominations --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotion_nominations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  nominated_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id    uuid NULL REFERENCES public.marketing_channels(id) ON DELETE SET NULL,
  reason_code   text NOT NULL CHECK (reason_code IN (
                  'customer_request','high_stock','good_margin',
                  'competitive_price','new_product','clearance','other')),
  reason_note   text NULL,
  nominated_on  date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tehran')::date),
  cancelled_at  timestamptz NULL,
  cancelled_by  uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  boost_applied numeric NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_promo_nom_rep_product_day UNIQUE (nominated_by, product_id, nominated_on)
);

CREATE INDEX IF NOT EXISTS idx_promo_nom_day_product
  ON public.promotion_nominations (nominated_on, product_id);

ALTER TABLE public.promotion_nominations ENABLE ROW LEVEL SECURITY;

-- SELECT: a rep sees their own today's nominations; admin/manager see all.
DROP POLICY IF EXISTS "promo_nom_select" ON public.promotion_nominations;
CREATE POLICY "promo_nom_select"
  ON public.promotion_nominations
  FOR SELECT TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role])
    OR (
      nominated_by = auth.uid()
      AND nominated_on = (now() AT TIME ZONE 'Asia/Tehran')::date
    )
  );

-- DELETE: a rep may delete only their own not-yet-cancelled nomination made
-- today (cancellation is normally done via the RPC, which sets cancelled_at).
DROP POLICY IF EXISTS "promo_nom_delete_own_today" ON public.promotion_nominations;
CREATE POLICY "promo_nom_delete_own_today"
  ON public.promotion_nominations
  FOR DELETE TO authenticated
  USING (
    nominated_by = auth.uid()
    AND nominated_on = (now() AT TIME ZONE 'Asia/Tehran')::date
  );

-- No INSERT / UPDATE policy: direct writes are denied. Nominate + cancel go
-- through the SECURITY DEFINER RPCs in DB-D.

-- NOTE: after applying on the server, run: supabase gen types → regenerate types.ts.
