SET client_encoding = 'UTF8';
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_actor uuid;
  v_wh uuid := gen_random_uuid();
  v_zero_product uuid := gen_random_uuid();
  v_low_product uuid := gen_random_uuid();
  v_ok_product uuid := gen_random_uuid();
  v_zero_quote uuid;
  v_low_quote uuid;
  v_ok_quote uuid;
  v_failed boolean := false;
BEGIN
  SELECT user_id INTO v_actor
    FROM public.user_roles
   WHERE role IN ('admin','manager')
   LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No admin/manager user exists for status-finalization simulation';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);

  INSERT INTO public.warehouses (id, name, code, is_active, is_default, created_by)
  VALUES (v_wh, 'E2E_AUDIT_20260729_Stock_Warehouse', 'E2E_AUDIT_20260729_WH', true, false, v_actor);

  INSERT INTO public.products (id, sku, name, stock_status, created_by)
  VALUES
    (v_zero_product, 'E2E_AUDIT_20260729_ZERO', 'E2E_AUDIT_20260729 Zero Stock', 'unavailable', v_actor),
    (v_low_product, 'E2E_AUDIT_20260729_LOW', 'E2E_AUDIT_20260729 Low Stock', 'available', v_actor),
    (v_ok_product, 'E2E_AUDIT_20260729_OK', 'E2E_AUDIT_20260729 Sufficient Stock', 'available', v_actor);

  INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
  VALUES
    (v_wh, v_zero_product, 0),
    (v_wh, v_low_product, 2),
    (v_wh, v_ok_product, 10);

  SELECT (public.create_sales_quote_with_items(
    'E2E_AUDIT_20260729 Zero Stock Customer',
    '09000000001',
    NULL,
    now() + interval '1 day',
    100,
    0,
    100,
    jsonb_build_array(jsonb_build_object(
      'source','product_price',
      'product_id',v_zero_product,
      'title_snapshot','E2E_AUDIT_20260729 Zero Stock',
      'quantity',1,
      'unit_price',100,
      'discount_amount',0,
      'line_total',100
    )),
    NULL,
    NULL,
    false,
    NULL,
    false,
    NULL,
    v_wh,
    'accounting_approval',
    NULL,
    NULL,
    'E2E rollback-only accounting approval'
  )->>'id')::uuid INTO v_zero_quote;

  IF v_zero_quote IS NULL THEN
    RAISE EXCEPTION 'Quote creation with zero stock did not return an id';
  END IF;

  SELECT (public.create_sales_quote_with_items(
    'E2E_AUDIT_20260729 Above Stock Customer',
    '09000000002',
    NULL,
    now() + interval '1 day',
    500,
    0,
    500,
    jsonb_build_array(jsonb_build_object(
      'source','product_price',
      'product_id',v_low_product,
      'title_snapshot','E2E_AUDIT_20260729 Low Stock',
      'quantity',5,
      'unit_price',100,
      'discount_amount',0,
      'line_total',500
    )),
    NULL,
    NULL,
    false,
    NULL,
    false,
    NULL,
    v_wh,
    'accounting_approval',
    NULL,
    NULL,
    'E2E rollback-only accounting approval'
  )->>'id')::uuid INTO v_low_quote;

  IF v_low_quote IS NULL THEN
    RAISE EXCEPTION 'Quote creation above available stock did not return an id';
  END IF;

  BEGIN
    PERFORM * FROM public.update_sales_quote_status(v_low_quote, 'sent'::public.sales_quote_status, NULL);
    PERFORM * FROM public.update_sales_quote_status(v_low_quote, 'accepted'::public.sales_quote_status, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_failed := SQLERRM LIKE '%موجودی کافی نیست%'
             AND SQLERRM LIKE '%E2E_AUDIT_20260729 Low Stock%'
             AND SQLERRM LIKE '%2%'
             AND SQLERRM LIKE '%5%';
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'Finalization with insufficient stock did not fail with the expected clear message';
  END IF;

  SELECT (public.create_sales_quote_with_items(
    'E2E_AUDIT_20260729 Sufficient Stock Customer',
    '09000000003',
    NULL,
    now() + interval '1 day',
    300,
    0,
    300,
    jsonb_build_array(jsonb_build_object(
      'source','product_price',
      'product_id',v_ok_product,
      'title_snapshot','E2E_AUDIT_20260729 Sufficient Stock',
      'quantity',3,
      'unit_price',100,
      'discount_amount',0,
      'line_total',300
    )),
    NULL,
    NULL,
    false,
    NULL,
    false,
    NULL,
    v_wh,
    'accounting_approval',
    NULL,
    NULL,
    'E2E rollback-only accounting approval'
  )->>'id')::uuid INTO v_ok_quote;

  PERFORM * FROM public.update_sales_quote_status(v_ok_quote, 'sent'::public.sales_quote_status, NULL);
  PERFORM * FROM public.update_sales_quote_status(v_ok_quote, 'accepted'::public.sales_quote_status, NULL);

  IF NOT EXISTS (
    SELECT 1
      FROM public.stock_movements
     WHERE ref_type = 'sale_quote_confirm'
       AND ref_id = v_ok_quote
       AND product_id = v_ok_product
       AND quantity = 3
       AND delta = -3
  ) THEN
    RAISE EXCEPTION 'Finalization with sufficient stock did not create the expected stock movement';
  END IF;

  IF (SELECT quantity FROM public.warehouse_stock WHERE warehouse_id = v_wh AND product_id = v_ok_product) <> 7 THEN
    RAISE EXCEPTION 'Finalization with sufficient stock did not deduct stock correctly';
  END IF;

  RAISE NOTICE 'Requirement 215 rollback-only backend scenarios passed';
END $$;

ROLLBACK;
