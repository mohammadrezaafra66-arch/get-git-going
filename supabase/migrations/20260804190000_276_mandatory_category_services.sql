SET client_encoding='UTF8';

-- ============================================================================
-- 276 — Requirement 223: mandatory packaging for televisions, enforced in depth
-- ============================================================================
--
-- WHY THIS SHAPE (read before changing anything here)
--
-- The execution plan's scope note is explicit: implement the television rule on
-- the smallest CORRECT foundation, and do NOT build a parallel one-off
-- mechanism that a later services phase would have to unpick.
--
-- Measured before designing (2026-08-04, live LAN database):
--   - categories.slug is UNIQUE and the television category is slug='tv'
--     (uuid 1a738b6c-7188-4eb1-a3b7-1cb0881cf224, 16 products). So a STABLE
--     identifier exists and the rule is keyed on it — never on the Persian
--     name, and not on the raw uuid either, because slug survives a re-seed
--     and moves between environments while a uuid does not.
--   - sales_quote_items has NO service/option column, and no services /
--     options / addons / extras table exists anywhere in the schema. The
--     per-line product-services model from audit B2.3 (eight service types)
--     is entirely unbuilt.
--
-- So this migration builds the MINIMUM of that model — three small tables that
-- the later services phase extends with rows, not with schema changes:
--
--   product_service_types      the catalogue. Seeded with ONE row, 'packaging'.
--                              The other seven audit service types are INSERTs.
--   category_required_services the rule: which category forces which service.
--                              Seeded with tv -> packaging.
--   sales_quote_item_services  the per-line facts.
--
-- Nothing here is television-specific. "Televisions must be packaged" is a
-- single seeded ROW, so a later rule ("air conditioners must be installed")
-- needs no migration at all.
--
-- ENFORCEMENT IN DEPTH — the requirement is that bypassing the UI cannot
-- remove the obligation. Five layers, all in the database:
--   1. line added        -> AFTER INSERT trigger auto-attaches the service.
--   2. server-side save  -> the same trigger; it fires whatever writes the row,
--                           the RPC or a direct PostgREST call.
--   3. removal refused   -> BEFORE DELETE/UPDATE trigger rejects it.
--   4. finalisation      -> update_sales_quote_status re-applies and verifies.
--   5. warehouse task    -> a tasks row on acceptance, queue 'store'.
-- Printing and the UI read these rows; they are display, not enforcement.
--
-- ROLLBACK: docs/verification/276-down.sql
-- Transaction control belongs to the CALLER (--single-transaction). An inner
-- BEGIN/COMMIT here would commit the dry-run harness's transaction — the exact
-- trap recorded in Phase 6.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Service catalogue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_service_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name_fa     text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_service_types_code UNIQUE (code)
);

COMMENT ON TABLE public.product_service_types IS
  'کاتالوگ خدمات کالا (نیاز ۲۲۳). فاز خدمات بعدی فقط ردیف اضافه می‌کند، نه ستون.';

INSERT INTO public.product_service_types (code, name_fa, sort_order)
VALUES ('packaging', 'بسته‌بندی', 10)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) The rule: category -> required service
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.category_required_services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL REFERENCES public.product_service_types(id) ON DELETE RESTRICT,
  is_mandatory    boolean NOT NULL DEFAULT true,
  -- The exact sentence the requirement specifies, stored as DATA so changing
  -- the wording never needs a code deploy.
  display_text    text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_category_required_services UNIQUE (category_id, service_type_id)
);

COMMENT ON TABLE public.category_required_services IS
  'قاعدهٔ «این دسته این خدمت را اجباری دارد» (نیاز ۲۲۳). کلید بر categories.slug انتخاب می‌شود، نه بر نام فارسی.';

-- Seed keyed on slug. If the tv category is ever missing this inserts nothing
-- rather than guessing, and the gate below catches that.
INSERT INTO public.category_required_services (category_id, service_type_id, is_mandatory, display_text)
SELECT c.id, st.id, true, 'این کالا حتماً باید بسته‌بندی شود.'
FROM public.categories c
CROSS JOIN public.product_service_types st
WHERE c.slug = 'tv' AND st.code = 'packaging'
ON CONFLICT (category_id, service_type_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Per-line services on a proforma
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_quote_item_services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_item_id   uuid NOT NULL REFERENCES public.sales_quote_items(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL REFERENCES public.product_service_types(id) ON DELETE RESTRICT,
  is_mandatory    boolean NOT NULL DEFAULT false,
  display_text    text,
  source          text NOT NULL DEFAULT 'manual',
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  CONSTRAINT uq_sales_quote_item_services UNIQUE (quote_item_id, service_type_id),
  CONSTRAINT sales_quote_item_services_source_chk
    CHECK (source IN ('auto_category', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_sqis_quote_item
  ON public.sales_quote_item_services (quote_item_id);
CREATE INDEX IF NOT EXISTS idx_sqis_service_type
  ON public.sales_quote_item_services (service_type_id);

COMMENT ON TABLE public.sales_quote_item_services IS
  'خدمات هر ردیف پیش‌فاکتور. ردیف اجباری (is_mandatory) با تریگر محافظت می‌شود و فروشنده نمی‌تواند حذفش کند (نیاز ۲۲۳).';

-- ---------------------------------------------------------------------------
-- 4) Apply the rule to one line. Idempotent.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because it INSERTs into a table whose RLS is written for
-- the salesperson, and it is called from a trigger during that salesperson's
-- own INSERT. It reads nothing the caller could not already read.
CREATE OR REPLACE FUNCTION public.apply_required_services_for_quote_item(p_item_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _n integer := 0;
BEGIN
  INSERT INTO public.sales_quote_item_services (
    quote_item_id, service_type_id, is_mandatory, display_text, source
  )
  SELECT i.id, crs.service_type_id, true, crs.display_text, 'auto_category'
  FROM public.sales_quote_items i
  JOIN public.products p                   ON p.id  = i.product_id
  JOIN public.category_required_services crs ON crs.category_id = p.category_id
  JOIN public.product_service_types st      ON st.id = crs.service_type_id
  WHERE i.id = p_item_id
    AND crs.is_active
    AND crs.is_mandatory
    AND st.is_active
  -- A salesperson may have added the same service by hand first. Promote it
  -- to mandatory rather than failing or leaving it optional.
  ON CONFLICT (quote_item_id, service_type_id) DO UPDATE
    SET is_mandatory = true,
        display_text = EXCLUDED.display_text,
        source       = 'auto_category';

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_quote_item_required_services()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.apply_required_services_for_quote_item(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sales_quote_items_required_services ON public.sales_quote_items;
CREATE TRIGGER trg_sales_quote_items_required_services
  AFTER INSERT OR UPDATE OF product_id ON public.sales_quote_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_quote_item_required_services();

-- ---------------------------------------------------------------------------
-- 5) The refusal. This is the layer that makes the rule real.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_protect_mandatory_quote_item_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- ⚠️ Do NOT block a cascade. Deleting the whole PRODUCT LINE is allowed —
    -- what is forbidden is stripping the service off a line that stays. When
    -- sales_quote_items row is deleted, this trigger fires for its children
    -- with the parent already gone, so its absence is the reliable signal that
    -- we are inside ON DELETE CASCADE rather than a targeted delete.
    IF NOT EXISTS (SELECT 1 FROM public.sales_quote_items i WHERE i.id = OLD.quote_item_id) THEN
      RETURN OLD;
    END IF;

    IF OLD.is_mandatory THEN
      SELECT st.name_fa INTO _name
      FROM public.product_service_types st WHERE st.id = OLD.service_type_id;
      RAISE EXCEPTION 'خدمت «%» برای این کالا اجباری است و قابل حذف نیست.',
        COALESCE(_name, 'اجباری')
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: closing the obvious ways to defeat a delete guard.
  IF OLD.is_mandatory
     AND (NEW.is_mandatory IS DISTINCT FROM true
          OR NEW.service_type_id IS DISTINCT FROM OLD.service_type_id
          OR NEW.quote_item_id  IS DISTINCT FROM OLD.quote_item_id) THEN
    SELECT st.name_fa INTO _name
    FROM public.product_service_types st WHERE st.id = OLD.service_type_id;
    RAISE EXCEPTION 'خدمت «%» برای این کالا اجباری است و قابل تغییر یا برداشتن نیست.',
      COALESCE(_name, 'اجباری')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sqis_protect_mandatory ON public.sales_quote_item_services;
CREATE TRIGGER trg_sqis_protect_mandatory
  BEFORE DELETE OR UPDATE ON public.sales_quote_item_services
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_protect_mandatory_quote_item_service();

-- ---------------------------------------------------------------------------
-- 6) RLS — mirrored from sales_quote_items so the two cannot diverge
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_service_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_required_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quote_item_services  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_service_types_select ON public.product_service_types;
CREATE POLICY product_service_types_select ON public.product_service_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS product_service_types_write ON public.product_service_types;
CREATE POLICY product_service_types_write ON public.product_service_types
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

DROP POLICY IF EXISTS category_required_services_select ON public.category_required_services;
CREATE POLICY category_required_services_select ON public.category_required_services
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS category_required_services_write ON public.category_required_services;
CREATE POLICY category_required_services_write ON public.category_required_services
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

DROP POLICY IF EXISTS sales_quote_item_services_select ON public.sales_quote_item_services;
CREATE POLICY sales_quote_item_services_select ON public.sales_quote_item_services
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_quote_items i
    JOIN public.sales_quotes q ON q.id = i.quote_id
    WHERE i.id = sales_quote_item_services.quote_item_id
      AND (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::public.app_role[])
           OR (public.has_role(auth.uid(), 'sales'::public.app_role) AND q.salesperson_id = auth.uid()))
  ));

DROP POLICY IF EXISTS sales_quote_item_services_insert ON public.sales_quote_item_services;
CREATE POLICY sales_quote_item_services_insert ON public.sales_quote_item_services
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_quote_items i
    JOIN public.sales_quotes q ON q.id = i.quote_id
    WHERE i.id = sales_quote_item_services.quote_item_id
      AND (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
           OR (public.has_role(auth.uid(), 'sales'::public.app_role)
               AND q.salesperson_id = auth.uid()
               AND q.status = 'draft'::public.sales_quote_status))
  ));

DROP POLICY IF EXISTS sales_quote_item_services_update ON public.sales_quote_item_services;
CREATE POLICY sales_quote_item_services_update ON public.sales_quote_item_services
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_quote_items i
    JOIN public.sales_quotes q ON q.id = i.quote_id
    WHERE i.id = sales_quote_item_services.quote_item_id
      AND (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
           OR (public.has_role(auth.uid(), 'sales'::public.app_role)
               AND q.salesperson_id = auth.uid()
               AND q.status = 'draft'::public.sales_quote_status))
  ));

DROP POLICY IF EXISTS sales_quote_item_services_delete ON public.sales_quote_item_services;
CREATE POLICY sales_quote_item_services_delete ON public.sales_quote_item_services
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_quote_items i
    JOIN public.sales_quotes q ON q.id = i.quote_id
    WHERE i.id = sales_quote_item_services.quote_item_id
      AND (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
           OR (public.has_role(auth.uid(), 'sales'::public.app_role)
               AND q.salesperson_id = auth.uid()
               AND q.status = 'draft'::public.sales_quote_status))
  ));

-- Supabase grants DML to anon by default. Items 259 and 268 both had to claw
-- this back after the fact; do it in the same migration this time.
REVOKE ALL ON public.product_service_types      FROM anon;
REVOKE ALL ON public.category_required_services FROM anon;
REVOKE ALL ON public.sales_quote_item_services  FROM anon;

GRANT SELECT ON public.product_service_types      TO authenticated;
GRANT SELECT ON public.category_required_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_quote_item_services TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Backfill existing lines
-- ---------------------------------------------------------------------------
-- Existing proformas predate the rule. Attach the service to every line whose
-- product is in a rule-bearing category, so finalisation of an old draft does
-- not fail a check that its lines never had a chance to satisfy.
DO $backfill$
DECLARE
  _n integer := 0;
BEGIN
  INSERT INTO public.sales_quote_item_services (
    quote_item_id, service_type_id, is_mandatory, display_text, source
  )
  SELECT i.id, crs.service_type_id, true, crs.display_text, 'auto_category'
  FROM public.sales_quote_items i
  JOIN public.products p                     ON p.id  = i.product_id
  JOIN public.category_required_services crs ON crs.category_id = p.category_id
  JOIN public.product_service_types st       ON st.id = crs.service_type_id
  WHERE crs.is_active AND crs.is_mandatory AND st.is_active
  ON CONFLICT (quote_item_id, service_type_id) DO NOTHING;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RAISE NOTICE '[276] backfilled % quote-item service rows', _n;
END;
$backfill$;

-- ---------------------------------------------------------------------------
-- 8) Finalisation check + warehouse task
-- ---------------------------------------------------------------------------
-- Rebuilt from the LIVE definition captured in
-- docs/verification/pre-276/update_sales_quote_status.sql (rule 4), NOT from
-- memory. The signature and return type are unchanged, so CREATE OR REPLACE is
-- correct and no DROP is needed (rule 5 does not apply).
--
-- Only the final ELSE branch differs from the snapshot: everything else below
-- is the live text.
CREATE OR REPLACE FUNCTION public.update_sales_quote_status(
  p_quote_id uuid,
  p_next public.sales_quote_status,
  p_reason text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, status public.sales_quote_status, cancel_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quotes%ROWTYPE;
  _reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  _missing text;
  _svc_lines text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.sales_quotes sq
  WHERE sq.id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'پیش‌فاکتور یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF public.has_any_role(_uid, ARRAY['admin','manager']::public.app_role[]) THEN
    NULL;
  ELSIF public.has_role(_uid, 'accountant'::public.app_role)
        AND p_next = 'rejected'::public.sales_quote_status THEN
    NULL;
  ELSIF public.has_role(_uid, 'sales'::public.app_role)
        AND _row.salesperson_id = _uid
        AND p_next IN ('draft'::public.sales_quote_status,
                       'sent'::public.sales_quote_status,
                       'rejected'::public.sales_quote_status,
                       'canceled'::public.sales_quote_status) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'دسترسی لازم برای این عملیات را ندارید.' USING ERRCODE = '42501';
  END IF;

  IF p_next = 'canceled'::public.sales_quote_status AND _reason IS NULL THEN
    RAISE EXCEPTION 'برای لغو پیش‌فاکتور، دلیل لغو الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_next = 'rejected'::public.sales_quote_status AND _reason IS NULL THEN
    RAISE EXCEPTION 'برای رد پیش‌فاکتور، نوشتن دلیل رد الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_next = 'canceled'::public.sales_quote_status THEN
    UPDATE public.sales_quotes AS sq
       SET status = p_next,
           cancel_reason = _reason
     WHERE sq.id = p_quote_id;
  ELSIF p_next = 'rejected'::public.sales_quote_status THEN
    UPDATE public.sales_quotes AS sq
       SET status = p_next,
           reject_reason = _reason
     WHERE sq.id = p_quote_id;

    IF _row.salesperson_id IS NOT NULL THEN
      INSERT INTO public.notification_queue(
        user_id,
        title,
        body,
        type,
        reference_type,
        reference_id
      )
      VALUES (
        _row.salesperson_id,
        'پیش‌فاکتور رد شد',
        concat_ws(E'\n',
          'پیش‌فاکتور ' || COALESCE(_row.quote_number, p_quote_id::text) || ' توسط واحد حسابداری/مدیریت رد شد.',
          'مشتری: ' || COALESCE(NULLIF(_row.customer_name, ''), '—'),
          'دلیل رد: ' || _reason
        ),
        'quote_rejected',
        'sales_quote',
        p_quote_id
      );
    END IF;
  ELSE
    -- ================= requirement 223 — layers 4 and 5 =================
    IF p_next = 'accepted'::public.sales_quote_status THEN
      -- Re-apply first. A line inserted before the rule existed, or one whose
      -- product was re-categorised after the line was created, would otherwise
      -- fail a check it never had the chance to satisfy.
      PERFORM public.apply_required_services_for_quote_item(i.id)
      FROM public.sales_quote_items i
      WHERE i.quote_id = p_quote_id;

      -- Then verify. If anything is still missing the obligation was defeated
      -- somehow, and finalising would ship an unpackaged television.
      SELECT string_agg(DISTINCT COALESCE(NULLIF(i.title_snapshot, ''), 'کالای بدون نام'), '، ')
        INTO _missing
      FROM public.sales_quote_items i
      JOIN public.products p                     ON p.id  = i.product_id
      JOIN public.category_required_services crs ON crs.category_id = p.category_id
      JOIN public.product_service_types st       ON st.id = crs.service_type_id
      WHERE i.quote_id = p_quote_id
        AND crs.is_active AND crs.is_mandatory AND st.is_active
        AND NOT EXISTS (
          SELECT 1 FROM public.sales_quote_item_services s
          WHERE s.quote_item_id = i.id
            AND s.service_type_id = crs.service_type_id
        );

      IF _missing IS NOT NULL THEN
        RAISE EXCEPTION 'خدمت اجباری برای این کالاها ثبت نشده است: %', _missing
          USING ERRCODE = '23514';
      END IF;
    END IF;

    UPDATE public.sales_quotes AS sq
       SET status = p_next
     WHERE sq.id = p_quote_id;

    -- Warehouse preparation must SEE the obligation, not just the document.
    -- Queue 'store' is used because tasks_assigned_queue_check permits only
    -- sales/shipping/store/accounting — inventing a 'warehouse' queue would
    -- mean widening a CHECK that other code already relies on.
    IF p_next = 'accepted'::public.sales_quote_status THEN
      SELECT string_agg(
               COALESCE(NULLIF(i.title_snapshot, ''), 'کالای بدون نام')
                 || ' — ' || COALESCE(s.display_text, st.name_fa),
               E'\n' ORDER BY i.created_at)
        INTO _svc_lines
      FROM public.sales_quote_items i
      JOIN public.sales_quote_item_services s ON s.quote_item_id = i.id
      JOIN public.product_service_types st    ON st.id = s.service_type_id
      WHERE i.quote_id = p_quote_id AND s.is_mandatory;

      IF _svc_lines IS NOT NULL THEN
        INSERT INTO public.tasks (
          title, description, status, priority,
          reference_type, reference_id, assigned_queue, created_by
        )
        SELECT
          'خدمات اجباری پیش‌فاکتور ' || COALESCE(_row.quote_number, p_quote_id::text),
          _svc_lines,
          'pending', 'high',
          'sales_quote', p_quote_id, 'store', _uid
        -- Idempotent: re-accepting an already-accepted proforma must not pile
        -- up duplicate work orders for the warehouse.
        WHERE NOT EXISTS (
          SELECT 1 FROM public.tasks t
          WHERE t.reference_type = 'sales_quote'
            AND t.reference_id = p_quote_id
            AND t.assigned_queue = 'store'
            AND t.status <> 'canceled'
        );
      END IF;
    END IF;
    -- =====================================================================
  END IF;

  RETURN QUERY
  SELECT sq.id, sq.status, sq.cancel_reason
  FROM public.sales_quotes sq
  WHERE sq.id = p_quote_id;
END;
$function$;
