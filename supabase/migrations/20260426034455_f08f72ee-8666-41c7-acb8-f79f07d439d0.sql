-- ============================================================================
-- Phase 3.5 — Lightweight Sales Quotes
-- ============================================================================

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE public.sales_quote_status AS ENUM ('draft','sent','accepted','rejected','canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sales_quote_item_source AS ENUM ('product_price','quick_price','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Counter table for quote numbers
CREATE TABLE IF NOT EXISTS public.sales_quote_counters (
  year integer PRIMARY KEY,
  last_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_quote_counters ENABLE ROW LEVEL SECURITY;

-- 3) next_sales_quote_number function
CREATE OR REPLACE FUNCTION public.next_sales_quote_number(_year integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _next integer;
BEGIN
  INSERT INTO public.sales_quote_counters (year, last_value, updated_at)
  VALUES (_year, 1, now())
  ON CONFLICT (year) DO UPDATE
    SET last_value = public.sales_quote_counters.last_value + 1,
        updated_at = now()
  RETURNING last_value INTO _next;

  RETURN 'SQ-' || _year::text || '-' || lpad(_next::text, 6, '0');
END;
$$;

-- 4) sales_quotes table
CREATE TABLE IF NOT EXISTS public.sales_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_note text,
  salesperson_id uuid,
  status public.sales_quote_status NOT NULL DEFAULT 'draft',
  subtotal_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  final_amount numeric NOT NULL DEFAULT 0,
  expires_at timestamptz,
  canceled_at timestamptz,
  canceled_by uuid,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_quotes_amounts_nonneg CHECK (
    subtotal_amount >= 0 AND discount_amount >= 0 AND final_amount >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_sales_quotes_salesperson ON public.sales_quotes (salesperson_id);
CREATE INDEX IF NOT EXISTS idx_sales_quotes_status ON public.sales_quotes (status);
CREATE INDEX IF NOT EXISTS idx_sales_quotes_created_at ON public.sales_quotes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_quotes_customer_phone ON public.sales_quotes (customer_phone);

ALTER TABLE public.sales_quotes ENABLE ROW LEVEL SECURITY;

-- 5) sales_quote_items table
CREATE TABLE IF NOT EXISTS public.sales_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  product_id uuid,
  free_item_name text,
  sku_snapshot text,
  title_snapshot text,
  sale_price_type_id uuid,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL,
  discount_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL,
  source public.sales_quote_item_source NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_quote_items_qty_pos CHECK (quantity > 0),
  CONSTRAINT sales_quote_items_price_pos CHECK (unit_price > 0),
  CONSTRAINT sales_quote_items_discount_nonneg CHECK (discount_amount >= 0),
  CONSTRAINT sales_quote_items_identity CHECK (
    (source = 'product_price' AND product_id IS NOT NULL)
    OR (source IN ('manual','quick_price') AND free_item_name IS NOT NULL AND length(btrim(free_item_name)) > 0)
  ),
  CONSTRAINT sales_quote_items_discount_le_line CHECK (discount_amount <= quantity * unit_price)
);

CREATE INDEX IF NOT EXISTS idx_sales_quote_items_quote ON public.sales_quote_items (quote_id);
CREATE INDEX IF NOT EXISTS idx_sales_quote_items_product ON public.sales_quote_items (product_id);

ALTER TABLE public.sales_quote_items ENABLE ROW LEVEL SECURITY;

-- 6) updated_at triggers
DROP TRIGGER IF EXISTS trg_sales_quotes_updated_at ON public.sales_quotes;
CREATE TRIGGER trg_sales_quotes_updated_at
BEFORE UPDATE ON public.sales_quotes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) Auto-assign quote_number on insert
CREATE OR REPLACE FUNCTION public.sales_quotes_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _year integer := extract(year from coalesce(new.created_at, now()))::integer;
  _attempts integer := 0;
BEGIN
  IF (tg_op = 'INSERT') THEN
    IF new.quote_number IS NULL OR btrim(new.quote_number) = '' THEN
      LOOP
        new.quote_number := public.next_sales_quote_number(_year);
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.sales_quotes WHERE quote_number = new.quote_number);
        _attempts := _attempts + 1;
        IF _attempts > 5 THEN
          RAISE EXCEPTION 'could not allocate unique quote_number after % attempts', _attempts;
        END IF;
      END LOOP;
    END IF;
    -- stamp salesperson if missing
    new.salesperson_id := coalesce(new.salesperson_id, auth.uid());
  ELSIF (tg_op = 'UPDATE') THEN
    -- Make quote_number immutable
    IF new.quote_number IS DISTINCT FROM old.quote_number THEN
      new.quote_number := old.quote_number;
    END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_quotes_assign_number ON public.sales_quotes;
CREATE TRIGGER trg_sales_quotes_assign_number
BEFORE INSERT OR UPDATE ON public.sales_quotes
FOR EACH ROW EXECUTE FUNCTION public.sales_quotes_assign_number();

-- 8) Status transition validation + canceled_at/by stamping
CREATE OR REPLACE FUNCTION public.sales_quotes_validate_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status) THEN
    -- Final states cannot be changed
    IF old.status IN ('accepted','rejected','canceled') THEN
      RAISE EXCEPTION 'cannot change status of a finalized quote (%, %)', old.quote_number, old.status
        USING ERRCODE = '22023';
    END IF;
    -- Allowed transitions
    IF NOT (
      (old.status = 'draft' AND new.status IN ('sent','canceled'))
      OR (old.status = 'sent' AND new.status IN ('accepted','rejected','canceled'))
    ) THEN
      RAISE EXCEPTION 'invalid status transition: % -> %', old.status, new.status
        USING ERRCODE = '22023';
    END IF;

    IF new.status = 'canceled' THEN
      new.canceled_at := coalesce(new.canceled_at, now());
      new.canceled_by := coalesce(new.canceled_by, auth.uid());
    END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_quotes_validate_status ON public.sales_quotes;
CREATE TRIGGER trg_sales_quotes_validate_status
BEFORE UPDATE ON public.sales_quotes
FOR EACH ROW EXECUTE FUNCTION public.sales_quotes_validate_status();

-- 9) Audit triggers
CREATE OR REPLACE FUNCTION public.audit_sales_quotes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _item_count integer;
BEGIN
  IF (tg_op = 'INSERT') THEN
    SELECT count(*) INTO _item_count FROM public.sales_quote_items WHERE quote_id = new.id;
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'sales_quotes', new.id::text, 'sales_quote_created',
      jsonb_build_object(
        'quote_number', new.quote_number,
        'customer_name', new.customer_name,
        'customer_phone', new.customer_phone,
        'salesperson_id', new.salesperson_id,
        'final_amount', new.final_amount,
        'item_count', _item_count
      ));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.status IS DISTINCT FROM new.status) THEN
      IF new.status = 'canceled' THEN
        INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        VALUES (auth.uid(), 'sales_quotes', new.id::text, 'sales_quote_canceled',
          jsonb_build_object(
            'quote_number', new.quote_number,
            'canceled_by', new.canceled_by,
            'cancel_reason', new.cancel_reason,
            'canceled_at', new.canceled_at
          ));
      ELSE
        INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        VALUES (auth.uid(), 'sales_quotes', new.id::text, 'sales_quote_status_changed',
          jsonb_build_object(
            'quote_number', new.quote_number,
            'old_status', old.status,
            'new_status', new.status,
            'changed_by', auth.uid()
          ));
      END IF;
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_sales_quotes ON public.sales_quotes;
CREATE TRIGGER trg_audit_sales_quotes
AFTER INSERT OR UPDATE ON public.sales_quotes
FOR EACH ROW EXECUTE FUNCTION public.audit_sales_quotes();

-- 10) RLS policies — sales_quotes
DROP POLICY IF EXISTS sales_quotes_select ON public.sales_quotes;
CREATE POLICY sales_quotes_select ON public.sales_quotes
FOR SELECT
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role])
  OR (has_role(auth.uid(), 'sales'::app_role) AND salesperson_id = auth.uid())
);

DROP POLICY IF EXISTS sales_quotes_insert ON public.sales_quotes;
CREATE POLICY sales_quotes_insert ON public.sales_quotes
FOR INSERT
WITH CHECK (
  (
    has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role])
  )
  OR (
    has_role(auth.uid(), 'sales'::app_role) AND salesperson_id = auth.uid()
  )
);

-- Privileged update: admin/manager can do anything
DROP POLICY IF EXISTS sales_quotes_update_privileged ON public.sales_quotes;
CREATE POLICY sales_quotes_update_privileged ON public.sales_quotes
FOR UPDATE
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

-- Sales: only own quotes; cannot move to 'accepted'
DROP POLICY IF EXISTS sales_quotes_update_sales_own ON public.sales_quotes;
CREATE POLICY sales_quotes_update_sales_own ON public.sales_quotes
FOR UPDATE
USING (has_role(auth.uid(), 'sales'::app_role) AND salesperson_id = auth.uid())
WITH CHECK (
  has_role(auth.uid(), 'sales'::app_role)
  AND salesperson_id = auth.uid()
  AND status IN ('draft','sent','rejected','canceled')
);

-- 11) RLS policies — sales_quote_items
DROP POLICY IF EXISTS sales_quote_items_select ON public.sales_quote_items;
CREATE POLICY sales_quote_items_select ON public.sales_quote_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.sales_quotes q
    WHERE q.id = quote_id
      AND (
        has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role])
        OR (has_role(auth.uid(), 'sales'::app_role) AND q.salesperson_id = auth.uid())
      )
  )
);

DROP POLICY IF EXISTS sales_quote_items_insert ON public.sales_quote_items;
CREATE POLICY sales_quote_items_insert ON public.sales_quote_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales_quotes q
    WHERE q.id = quote_id
      AND (
        has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role])
        OR (has_role(auth.uid(), 'sales'::app_role) AND q.salesperson_id = auth.uid() AND q.status = 'draft')
      )
  )
);

DROP POLICY IF EXISTS sales_quote_items_update ON public.sales_quote_items;
CREATE POLICY sales_quote_items_update ON public.sales_quote_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.sales_quotes q
    WHERE q.id = quote_id
      AND (
        has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role])
        OR (has_role(auth.uid(), 'sales'::app_role) AND q.salesperson_id = auth.uid() AND q.status = 'draft')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales_quotes q
    WHERE q.id = quote_id
      AND (
        has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role])
        OR (has_role(auth.uid(), 'sales'::app_role) AND q.salesperson_id = auth.uid() AND q.status = 'draft')
      )
  )
);

DROP POLICY IF EXISTS sales_quote_items_delete ON public.sales_quote_items;
CREATE POLICY sales_quote_items_delete ON public.sales_quote_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.sales_quotes q
    WHERE q.id = quote_id
      AND (
        has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role])
        OR (has_role(auth.uid(), 'sales'::app_role) AND q.salesperson_id = auth.uid() AND q.status = 'draft')
      )
  )
);