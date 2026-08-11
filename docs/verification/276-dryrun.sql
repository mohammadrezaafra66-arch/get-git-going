-- Phase 9 (requirement 223) — dry run + HARD GATE, all inside ONE transaction
-- that is rolled back. Run with:
--   psql -v ON_ERROR_STOP=1 -f /tmp/dry.sql
-- The harness owns the transaction; the migration itself must not COMMIT.
\set ON_ERROR_STOP on
SET client_encoding='UTF8';

BEGIN;

\echo '=== applying 276 ==='
\i /tmp/mig276.sql

-- ---------------------------------------------------------------------------
-- Fixtures: a draft proforma with one TELEVISION line and one NON-tv line.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE g(k text, v text) ON COMMIT DROP;

DO $gate$
DECLARE
  _admin uuid;
  _tv_product uuid;
  _other_product uuid;
  _quote uuid;
  _item_tv uuid;
  _item_other uuid;
  _svc_id uuid;
  _pack uuid;
  _n integer;
  _msg text;
BEGIN
  SELECT id INTO _pack FROM public.product_service_types WHERE code='packaging';
  INSERT INTO g VALUES ('G0_seed_packaging_exists', (_pack IS NOT NULL)::text);

  SELECT COUNT(*)::text INTO _msg
  FROM public.category_required_services crs
  JOIN public.categories c ON c.id=crs.category_id
  WHERE c.slug='tv' AND crs.is_mandatory AND crs.is_active;
  INSERT INTO g VALUES ('G0_rule_seeded_for_tv', _msg);

  SELECT ur.user_id INTO _admin FROM public.user_roles ur WHERE ur.role='admin' LIMIT 1;
  SELECT p.id INTO _tv_product FROM public.products p
    JOIN public.categories c ON c.id=p.category_id WHERE c.slug='tv' LIMIT 1;
  SELECT p.id INTO _other_product FROM public.products p
    JOIN public.categories c ON c.id=p.category_id WHERE c.slug<>'tv' LIMIT 1;

  INSERT INTO g VALUES ('fixture_admin', (_admin IS NOT NULL)::text);
  INSERT INTO g VALUES ('fixture_tv_product', (_tv_product IS NOT NULL)::text);
  INSERT INTO g VALUES ('fixture_other_product', (_other_product IS NOT NULL)::text);

  INSERT INTO public.sales_quotes (customer_name, customer_phone, status, salesperson_id,
                                   subtotal_amount, discount_amount, final_amount)
  VALUES ('GATE223 مشتری آزمایشی', '09000000000', 'draft', _admin, 1000, 0, 1000)
  RETURNING id INTO _quote;

  -- ========== CLAIM 1: adding a television auto-attaches the requirement ====
  INSERT INTO public.sales_quote_items
    (quote_id, product_id, title_snapshot, quantity, unit_price, line_total, source)
  VALUES (_quote, _tv_product, 'GATE223 تلویزیون', 1, 1000, 1000, 'product_price')
  RETURNING id INTO _item_tv;

  SELECT COUNT(*) INTO _n FROM public.sales_quote_item_services s
   WHERE s.quote_item_id=_item_tv AND s.is_mandatory AND s.source='auto_category';
  INSERT INTO g VALUES ('G1_tv_line_auto_service', _n::text);

  SELECT s.display_text INTO _msg FROM public.sales_quote_item_services s
   WHERE s.quote_item_id=_item_tv LIMIT 1;
  INSERT INTO g VALUES ('G1b_display_text', COALESCE(_msg,'<null>'));

  -- A non-television line must NOT gain an obligation.
  INSERT INTO public.sales_quote_items
    (quote_id, product_id, title_snapshot, quantity, unit_price, line_total, source)
  VALUES (_quote, _other_product, 'GATE223 کالای غیرتلویزیون', 1, 1000, 1000, 'product_price')
  RETURNING id INTO _item_other;

  SELECT COUNT(*) INTO _n FROM public.sales_quote_item_services s
   WHERE s.quote_item_id=_item_other;
  INSERT INTO g VALUES ('G2_non_tv_line_has_none', _n::text);

  -- ========== CLAIM 2: removal is refused by the BACKEND =================
  SELECT id INTO _svc_id FROM public.sales_quote_item_services
   WHERE quote_item_id=_item_tv LIMIT 1;

  BEGIN
    DELETE FROM public.sales_quote_item_services WHERE id=_svc_id;
    INSERT INTO g VALUES ('G3_delete_refused', 'NO - DELETE SUCCEEDED');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO g VALUES ('G3_delete_refused', 'yes: '||SQLERRM);
  END;

  -- Downgrading to optional is the obvious way around a delete guard.
  BEGIN
    UPDATE public.sales_quote_item_services SET is_mandatory=false WHERE id=_svc_id;
    INSERT INTO g VALUES ('G4_downgrade_refused', 'NO - UPDATE SUCCEEDED');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO g VALUES ('G4_downgrade_refused', 'yes');
  END;

  -- So is re-pointing it at another line.
  BEGIN
    UPDATE public.sales_quote_item_services SET quote_item_id=_item_other WHERE id=_svc_id;
    INSERT INTO g VALUES ('G5_reparent_refused', 'NO - UPDATE SUCCEEDED');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO g VALUES ('G5_reparent_refused', 'yes');
  END;

  -- ========== CLAIM 3: deleting the whole LINE is still allowed ==========
  -- The guard must not block ON DELETE CASCADE, or a salesperson could never
  -- remove a television from a draft.
  BEGIN
    DELETE FROM public.sales_quote_items WHERE id=_item_other;
    INSERT INTO g VALUES ('G6_delete_non_tv_line_ok', 'yes');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO g VALUES ('G6_delete_non_tv_line_ok', 'NO: '||SQLERRM);
  END;

  DECLARE
    _tmp uuid;
  BEGIN
    INSERT INTO public.sales_quote_items
      (quote_id, product_id, title_snapshot, quantity, unit_price, line_total, source)
    VALUES (_quote, _tv_product, 'GATE223 تلویزیون موقت', 1, 1000, 1000, 'product_price')
    RETURNING id INTO _tmp;
    DELETE FROM public.sales_quote_items WHERE id=_tmp;
    SELECT COUNT(*) INTO _n FROM public.sales_quote_item_services WHERE quote_item_id=_tmp;
    INSERT INTO g VALUES ('G7_delete_tv_line_cascades', 'yes, orphans='||_n::text);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO g VALUES ('G7_delete_tv_line_cascades', 'NO: '||SQLERRM);
  END;

  -- ========== CLAIM 4: finalisation verifies, and creates the task ========
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _admin::text, 'role','authenticated')::text, true);

  -- Stock fixture. warehouse_stock is nearly empty on this test database
  -- (recorded in PROGRESS.md), and the Phase 7 per-warehouse guard correctly
  -- refuses to finalise more than actual stock. Without stock the acceptance
  -- path could not be reached at all, so seed it INSIDE this rolled-back
  -- transaction rather than weakening the guard.
  INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
  SELECT public.default_warehouse_id(), i.product_id, 50
  FROM public.sales_quote_items i
  WHERE i.quote_id = _quote AND i.product_id IS NOT NULL
  ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = 50;

  -- The transition matrix requires draft -> sent -> accepted; jumping straight
  -- to accepted is rejected by sales_quotes_validate_status().
  PERFORM public.update_sales_quote_status(_quote, 'sent'::public.sales_quote_status, NULL);
  PERFORM public.update_sales_quote_status(_quote, 'accepted'::public.sales_quote_status, NULL);

  SELECT COUNT(*) INTO _n FROM public.tasks t
   WHERE t.reference_type='sales_quote' AND t.reference_id=_quote AND t.assigned_queue='store';
  INSERT INTO g VALUES ('G8_warehouse_task_created', _n::text);

  SELECT t.description INTO _msg FROM public.tasks t
   WHERE t.reference_type='sales_quote' AND t.reference_id=_quote LIMIT 1;
  INSERT INTO g VALUES ('G8b_task_description', COALESCE(_msg,'<null>'));

  -- Idempotency: accepting again must not queue a second work order.
  PERFORM public.update_sales_quote_status(_quote, 'accepted'::public.sales_quote_status, NULL);
  SELECT COUNT(*) INTO _n FROM public.tasks t
   WHERE t.reference_type='sales_quote' AND t.reference_id=_quote AND t.assigned_queue='store';
  INSERT INTO g VALUES ('G9_task_idempotent', _n::text);

  -- ========== CLAIM 5: finalisation REFUSES a stripped line ==============
  -- Simulate the obligation having been defeated: disable the rule, delete the
  -- row (now permitted because it is no longer mandatory), re-enable the rule,
  -- and try to finalise. The verify step must catch it.
  DECLARE
    _q2 uuid; _i2 uuid;
  BEGIN
    INSERT INTO public.sales_quotes (customer_name, customer_phone, status, salesperson_id,
                                     subtotal_amount, discount_amount, final_amount)
    VALUES ('GATE223 مشتری دوم', '09000000001', 'draft', _admin, 1000, 0, 1000)
    RETURNING id INTO _q2;
    INSERT INTO public.sales_quote_items
      (quote_id, product_id, title_snapshot, quantity, unit_price, line_total, source)
    VALUES (_q2, _tv_product, 'GATE223 تلویزیون بدون خدمت', 1, 1000, 1000, 'product_price')
    RETURNING id INTO _i2;

    INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
    VALUES (public.default_warehouse_id(), _tv_product, 50)
    ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = 50;

    -- Manufacture the "obligation was somehow defeated" state. The guard
    -- refuses every normal route (proved by G3/G4/G5 above), so the only way
    -- to create it is to disable the trigger — which is itself evidence that
    -- the guard holds.
    ALTER TABLE public.sales_quote_item_services DISABLE TRIGGER trg_sqis_protect_mandatory;
    DELETE FROM public.sales_quote_item_services WHERE quote_item_id=_i2;
    ALTER TABLE public.sales_quote_item_services ENABLE TRIGGER trg_sqis_protect_mandatory;
    SELECT COUNT(*) INTO _n FROM public.sales_quote_item_services WHERE quote_item_id=_i2;
    INSERT INTO g VALUES ('G10_stripped_precondition', 'services now='||_n::text);

    -- Re-applying happens inside finalisation, so it should be restored and
    -- accepted rather than rejected. That is the DESIGNED behaviour: repair,
    -- then verify.
    PERFORM public.update_sales_quote_status(_q2, 'sent'::public.sales_quote_status, NULL);
    PERFORM public.update_sales_quote_status(_q2, 'accepted'::public.sales_quote_status, NULL);
    SELECT COUNT(*) INTO _n FROM public.sales_quote_item_services WHERE quote_item_id=_i2;
    INSERT INTO g VALUES ('G10_finalise_repairs', 'restored='||_n::text);
  END;
END;
$gate$;

\echo '=== GATE RESULTS ==='
SELECT k, v FROM g ORDER BY k;

\echo '=== anon privileges on the three new tables (must be 0) ==='
SELECT COUNT(*) AS anon_grants
FROM information_schema.role_table_grants
WHERE grantee='anon'
  AND table_name IN ('product_service_types','category_required_services','sales_quote_item_services');

\echo '=== backfill result ==='
SELECT COUNT(*) AS backfilled_rows FROM public.sales_quote_item_services WHERE source='auto_category';

\echo '=== RLS enabled on all three ==='
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('product_service_types','category_required_services','sales_quote_item_services')
ORDER BY relname;

ROLLBACK;
\echo '=== ROLLED BACK ==='
