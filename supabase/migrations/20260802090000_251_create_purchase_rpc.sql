SET client_encoding='UTF8';

-- =============================================================================
-- 251 — Issue 219 / C2: central atomic purchase-creation RPC
-- =============================================================================
--
-- WHY
--   Purchase registration has never been a backend operation. PurchaseForm.tsx
--   issues TWO independent inserts from the browser (purchases at :196-218,
--   purchase_items at :221-228) with no transaction between them. If the second
--   fails, a purchase document exists with no line — and therefore no stock
--   movement, because the inventory trigger hangs off purchase_items, not
--   purchases. There is also no idempotency anywhere: a double tap, a refresh
--   or a retried request creates a second document, a second stock movement and
--   a second gamification score.
--
--   This function is that missing operation. It does exactly what the form did,
--   in one transaction, with the validation and permission checks moved to
--   where they cannot be bypassed.
--
-- WHAT IT DELIBERATELY DOES NOT CHANGE
--   Every existing trigger keeps firing, untouched:
--     purchases      -> audit_purchase_insert, award_buyer_purchase_score,
--                       tg_purchases_derive_person
--     purchase_items -> trg_purchase_item_stock_in  (inventory + kardex)
--   The column values written are byte-for-byte the ones the form wrote,
--   including status='received' and cash_price_currency mirroring currency.
--   No accounting behaviour is added. No purchase number is generated.
--
-- PERMISSION: admin OR manager — deliberately NOT role_permissions.
--   The dynamic role_permissions table grants purchases.can_create to `sales`
--   and `purchase_specialist`, but the live RLS policy on purchases
--   (`manager admin write purchases`) allows INSERT only to admin/manager.
--   This function is SECURITY DEFINER and therefore bypasses RLS, so gating it
--   on role_permissions would GRANT SALES A CAPABILITY THEY DO NOT HAVE TODAY —
--   a privilege escalation introduced by a refactor. The gate mirrors the
--   current RLS exactly, so behaviour is preserved. Aligning the three
--   permission layers (and adding purchase_specialist) is a separate, isolated
--   migration in a later phase, precisely so it can be reviewed and reverted
--   on its own.
--
-- REQUEST LINKING IS NOT ENABLED IN THIS PHASE.
--   The final signature is created now so the next phase replaces the body
--   without a DROP FUNCTION (rule 5: adding a defaulted parameter overloads
--   rather than replaces). Passing p_request_id is REJECTED with a clear error
--   rather than silently ignored — a half-working path is worse than none.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase(
  p_product_id      uuid,
  p_payment_term_id uuid,
  p_purchase_price  numeric,
  p_currency        text,
  p_quantity        integer,
  p_purchase_date   date,
  p_supplier_id     uuid    DEFAULT NULL,
  p_cash_price      numeric DEFAULT NULL,
  p_warehouse_id    uuid    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  -- reserved for the request-linking phase; rejected below
  p_request_id            uuid    DEFAULT NULL,
  p_allocate_quantity     numeric DEFAULT NULL,
  p_allow_over_allocation boolean DEFAULT false,
  p_over_allocation_note  text    DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  _uid         uuid := auth.uid();
  _notes       text;
  _currency    text;
  _line_total  numeric;
  _cash        numeric;
  _cash_cur    text;
  _purchase_id uuid;
  _item_id     uuid;
  _payload     jsonb;
  _hash        text;
  _existing    public.purchase_idempotency%ROWTYPE;
  _result      jsonb;
  _supplier    record;
  _warehouse   record;
  _term        record;
  _product     record;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Authentication
  ---------------------------------------------------------------------------
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.'
      USING ERRCODE = '42501', HINT = 'PURCHASE_NOT_AUTHENTICATED';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Authorization — mirrors the live RLS policy on purchases exactly.
  ---------------------------------------------------------------------------
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'اجازهٔ ثبت سند خرید ندارید.'
      USING ERRCODE = '42501', HINT = 'PURCHASE_PERMISSION_DENIED';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Request linking is not available yet. Reject loudly, never silently.
  ---------------------------------------------------------------------------
  IF p_request_id IS NOT NULL
     OR p_allocate_quantity IS NOT NULL
     OR COALESCE(p_allow_over_allocation, false)
     OR NULLIF(btrim(COALESCE(p_over_allocation_note,'')),'') IS NOT NULL THEN
    RAISE EXCEPTION 'اتصال سند خرید به درخواست خرید هنوز فعال نشده است.'
      USING ERRCODE = '0A000', HINT = 'PURCHASE_REQUEST_LINK_NOT_ENABLED';
  END IF;

  ---------------------------------------------------------------------------
  -- 4. Validation. The backend is the source of truth; the form's zod schema
  --    stays for UX but decides nothing.
  ---------------------------------------------------------------------------
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'انتخاب محصول الزامی است.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_PRODUCT_REQUIRED';
  END IF;

  SELECT id, name, status INTO _product FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'محصول انتخاب‌شده یافت نشد.'
      USING ERRCODE = '23503', HINT = 'PURCHASE_PRODUCT_INVALID';
  END IF;
  IF _product.status <> 'active' THEN
    RAISE EXCEPTION 'محصول انتخاب‌شده فعال نیست.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_PRODUCT_INACTIVE';
  END IF;

  SELECT id, is_active INTO _term FROM public.payment_terms WHERE id = p_payment_term_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'زمان تسویه انتخاب‌شده یافت نشد.'
      USING ERRCODE = '23503', HINT = 'PURCHASE_PAYMENT_TERM_INVALID';
  END IF;
  IF NOT _term.is_active THEN
    RAISE EXCEPTION 'زمان تسویه انتخاب‌شده فعال نیست.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_PAYMENT_TERM_INACTIVE';
  END IF;

  IF p_supplier_id IS NOT NULL THEN
    SELECT id, is_active INTO _supplier FROM public.suppliers WHERE id = p_supplier_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'تأمین‌کنندهٔ انتخاب‌شده یافت نشد.'
        USING ERRCODE = '23503', HINT = 'PURCHASE_SUPPLIER_INVALID';
    END IF;
    IF NOT _supplier.is_active THEN
      RAISE EXCEPTION 'تأمین‌کنندهٔ انتخاب‌شده فعال نیست.'
        USING ERRCODE = '22023', HINT = 'PURCHASE_SUPPLIER_INACTIVE';
    END IF;
  END IF;

  IF p_warehouse_id IS NOT NULL THEN
    SELECT id, is_active INTO _warehouse FROM public.warehouses WHERE id = p_warehouse_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'انبار انتخاب‌شده یافت نشد.'
        USING ERRCODE = '23503', HINT = 'PURCHASE_WAREHOUSE_INVALID';
    END IF;
    IF NOT _warehouse.is_active THEN
      RAISE EXCEPTION 'انبار انتخاب‌شده فعال نیست.'
        USING ERRCODE = '22023', HINT = 'PURCHASE_WAREHOUSE_INACTIVE';
    END IF;
  END IF;

  -- Currency. The form still offers 'usd_us' («دلار تهران») while
  -- purchases_currency_check accepts only toman/usd/aed, so that choice fails
  -- at the database today with a raw constraint error. This validation turns it
  -- into a readable message. Widening the CHECK (or removing the option) is a
  -- business decision and is deliberately NOT made here.
  _currency := lower(btrim(COALESCE(p_currency, '')));
  IF _currency NOT IN ('toman','usd','aed') THEN
    RAISE EXCEPTION 'ارز انتخاب‌شده برای سند خرید پشتیبانی نمی‌شود.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_CURRENCY_INVALID';
  END IF;

  IF p_purchase_price IS NULL OR p_purchase_price <= 0 THEN
    RAISE EXCEPTION 'قیمت خرید باید بزرگ‌تر از صفر باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_PRICE_INVALID';
  END IF;

  IF p_cash_price IS NOT NULL AND p_cash_price <= 0 THEN
    RAISE EXCEPTION 'قیمت نقدی باید بزرگ‌تر از صفر باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_CASH_PRICE_INVALID';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'تعداد باید عددی صحیح و حداقل ۱ باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_QUANTITY_INVALID';
  END IF;

  IF p_purchase_date IS NULL THEN
    RAISE EXCEPTION 'تاریخ خرید الزامی است.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_DATE_REQUIRED';
  END IF;
  IF p_purchase_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'تاریخ خرید نمی‌تواند در آینده باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_DATE_FUTURE';
  END IF;

  _notes := NULLIF(btrim(COALESCE(p_notes, '')), '');
  IF _notes IS NOT NULL AND length(_notes) > 500 THEN
    RAISE EXCEPTION 'توضیحات نمی‌تواند بیش از ۵۰۰ کاراکتر باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_NOTES_TOO_LONG';
  END IF;

  ---------------------------------------------------------------------------
  -- 5. Derived values computed HERE, never trusted from the client.
  ---------------------------------------------------------------------------
  _line_total := p_purchase_price * p_quantity;
  _cash       := p_cash_price;
  _cash_cur   := CASE WHEN _cash IS NOT NULL THEN _currency ELSE NULL END;

  ---------------------------------------------------------------------------
  -- 6. Idempotency.
  --
  --    Canonical payload with a FIXED key order (built literally, not by
  --    iteration), numerics normalised so 5000 and 5000.00 hash identically,
  --    NULL and '' both collapsing to JSON null.
  --
  --    `notes` is excluded on purpose: fixing a typo must not create a second
  --    purchase. `purchase_date` IS included (the report's minimum list did not
  --    name it) because a corrected date is a materially different operation
  --    and silently returning the earlier document would hide the change.
  ---------------------------------------------------------------------------
  IF p_idempotency_key IS NOT NULL THEN
    _payload := jsonb_build_object(
      'request_id',        NULL,
      'product_id',        p_product_id::text,
      'quantity',          p_quantity::text,
      'allocate_quantity', NULL,
      'purchase_price',    trim_scale(round(p_purchase_price, 2))::text,
      'cash_price',        CASE WHEN _cash IS NULL THEN NULL
                                ELSE trim_scale(round(_cash, 2))::text END,
      'currency',          _currency,
      'supplier_id',       p_supplier_id::text,
      'warehouse_id',      p_warehouse_id::text,
      'purchase_date',     to_char(p_purchase_date, 'YYYY-MM-DD'),
      'created_by',        _uid::text
    );
    _hash := encode(extensions.digest(_payload::text, 'sha256'), 'hex');

    SELECT * INTO _existing FROM public.purchase_idempotency
     WHERE idempotency_key = p_idempotency_key
     FOR UPDATE;

    IF FOUND THEN
      -- A key belongs to the user who created it.
      IF _existing.created_by <> _uid THEN
        RAISE EXCEPTION 'این عملیات قبلاً توسط کاربر دیگری ثبت شده است.'
          USING ERRCODE = '23505', HINT = 'PURCHASE_IDEMPOTENCY_CONFLICT';
      END IF;

      IF _existing.payload_hash <> _hash THEN
        RAISE EXCEPTION 'این عملیات قبلاً با اطلاعات متفاوتی ثبت شده است.'
          USING ERRCODE = '23505', HINT = 'PURCHASE_IDEMPOTENCY_CONFLICT';
      END IF;

      IF _existing.state = 'completed' THEN
        RETURN jsonb_set(_existing.result, '{created}', 'false'::jsonb);
      END IF;

      -- A 'processing' row can only survive a crash: the reservation is written
      -- inside the caller's transaction, so a rollback removes it. Older than
      -- five minutes with no purchase is treated as abandoned and taken over.
      IF _existing.state = 'processing' AND _existing.created_at > now() - interval '5 minutes' THEN
        RAISE EXCEPTION 'این عملیات هم‌اکنون در حال ثبت است. لطفاً چند لحظه صبر کنید.'
          USING ERRCODE = '55006', HINT = 'PURCHASE_IN_PROGRESS';
      END IF;

      DELETE FROM public.purchase_idempotency WHERE idempotency_key = p_idempotency_key;
    END IF;

    INSERT INTO public.purchase_idempotency
      (idempotency_key, created_by, scope, payload_hash, state)
    VALUES (p_idempotency_key, _uid, 'create_purchase', _hash, 'processing');
  END IF;

  ---------------------------------------------------------------------------
  -- 7. The purchase document. Identical column set to the form's insert.
  ---------------------------------------------------------------------------
  INSERT INTO public.purchases (
    product_id, supplier_id, payment_term_id, purchase_price, currency,
    cash_price, cash_price_currency, quantity, purchase_date, notes,
    created_by, total_amount, status, warehouse_id
  )
  VALUES (
    p_product_id, p_supplier_id, p_payment_term_id, p_purchase_price, _currency,
    _cash, _cash_cur, p_quantity, p_purchase_date, _notes,
    _uid, _line_total, 'received', p_warehouse_id
  )
  RETURNING id INTO _purchase_id;

  ---------------------------------------------------------------------------
  -- 8. The line. Same transaction, so the inventory trigger either fires with
  --    the document or neither exists.
  ---------------------------------------------------------------------------
  INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_price, line_total)
  VALUES (_purchase_id, p_product_id, p_quantity, p_purchase_price, _line_total)
  RETURNING id INTO _item_id;

  ---------------------------------------------------------------------------
  -- 9. Result.
  ---------------------------------------------------------------------------
  SELECT jsonb_build_object(
    'created', true,
    'purchase', jsonb_build_object(
      'id',             p.id,
      'short_id',       left(p.id::text, 8),
      'product_id',     p.product_id,
      'product_name',   _product.name,
      'supplier_id',    p.supplier_id,
      'supplier_name',  (SELECT s.name FROM public.suppliers s WHERE s.id = p.supplier_id),
      'warehouse_id',   p.warehouse_id,
      'warehouse_name', (SELECT w.name FROM public.warehouses w WHERE w.id = p.warehouse_id),
      'payment_term_id',p.payment_term_id,
      'purchase_price', p.purchase_price,
      'cash_price',     p.cash_price,
      'currency',       p.currency,
      'quantity',       p.quantity,
      'total_amount',   p.total_amount,
      'purchase_date',  to_char(p.purchase_date, 'YYYY-MM-DD'),
      'status',         p.status
    ),
    'item', jsonb_build_object('id', _item_id, 'quantity', p_quantity, 'line_total', _line_total),
    'request', NULL
  )
  INTO _result
  FROM public.purchases p WHERE p.id = _purchase_id;

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.purchase_idempotency
       SET state='completed', purchase_id=_purchase_id, result=_result, completed_at=now()
     WHERE idempotency_key = p_idempotency_key;
  END IF;

  RETURN _result;
END;
$function$;

COMMENT ON FUNCTION public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text) IS
  'مورد ۲۱۹ (۲۵۱). ثبت اتمیک سند خرید و قلم آن در یک تراکنش — جایگزین دو INSERT مستقل که تا امروز از مرورگر ارسال می‌شد. همهٔ تریگرهای موجود (موجودی، audit، امتیاز، اشتقاق شخص تأمین‌کننده) دست‌نخورده اجرا می‌شوند و هیچ رفتار حسابداری جدیدی اضافه نشده است. مجوز: فقط admin و manager، دقیقاً منطبق بر سیاست RLS فعلی جدول purchases (نه role_permissions، که به sales هم اجازه می‌دهد و استفاده از آن در یک تابع SECURITY DEFINER به ارتقای ناخواستهٔ دسترسی منجر می‌شد). پارامترهای مربوط به درخواست خرید در امضا وجود دارند ولی در این مرحله صریحاً رد می‌شوند.';

REVOKE ALL ON FUNCTION public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
