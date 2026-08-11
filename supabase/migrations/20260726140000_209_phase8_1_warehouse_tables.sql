-- Phase 8.1 — چندانباره: جداول پایه + RLS + seed ماژول
--
-- هیچ جدول موجودی تغییر نمی‌کند و هیچ داده‌ای حذف نمی‌شود؛ فقط پنج جدول جدید.
-- مدل: `warehouse_stock` موجودی عددی جاری است و `stock_movements` منبع حقیقت
-- حرکت (کاردکس). هر تغییر موجودی باید یک ردیف کاردکس بسازد.

BEGIN;

-- ===========================================================================
-- ۱) انبارها
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouses_name_not_blank CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE public.warehouses IS 'انبارها (۱۷۶). حداقل ۳۰ انبار پشتیبانی می‌شود.';
COMMENT ON COLUMN public.warehouses.is_default IS
  'انبار پیش‌فرض عملیات. تنها یک ردیف می‌تواند true باشد (uq_warehouses_single_default).';

-- تنها یک انبار پیش‌فرض
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_single_default
  ON public.warehouses ((is_default)) WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_warehouses_active ON public.warehouses (is_active, name);

-- ===========================================================================
-- ۲) موجودی عددی به‌ازای انبار
--    سیستم فعلی فقط `products.stock_status` متنی دارد؛ این جدول عدد را می‌آورد.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.warehouse_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);

COMMENT ON TABLE public.warehouse_stock IS 'موجودی عددی هر محصول در هر انبار (۱۷۶).';

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_product ON public.warehouse_stock (product_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_warehouse ON public.warehouse_stock (warehouse_id);

-- ===========================================================================
-- ۳) کاردکس (لاگ حرکت کالا) — منبع حقیقت حرکت
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  movement_type text NOT NULL
    CHECK (movement_type IN ('in','out','transfer_in','transfer_out','adjust')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  ref_type text CHECK (ref_type IS NULL OR ref_type IN
    ('purchase','sale_quote_confirm','transfer','manual')),
  ref_id uuid,
  related_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stock_movements IS
  'کاردکس: هر تغییر موجودی یک ردیف اینجا می‌سازد (۱۸۳). quantity همیشه مثبت است؛ جهت از movement_type می‌آید.';

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date
  ON public.stock_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_date
  ON public.stock_movements (warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref
  ON public.stock_movements (ref_type, ref_id);

-- ===========================================================================
-- ۴) سند انتقال بین‌انباری
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed')),
  note text,
  created_by uuid,
  confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  CONSTRAINT stock_transfers_distinct_warehouses CHECK (from_warehouse_id <> to_warehouse_id)
);

COMMENT ON TABLE public.stock_transfers IS 'سند انتقال بین‌انباری (۱۷۷). اثر موجودی فقط هنگام confirmed اعمال می‌شود.';

CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON public.stock_transfers (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transfer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer
  ON public.stock_transfer_items (transfer_id);

-- ===========================================================================
-- ۵) updated_at triggers (الگوی موجود پروژه)
-- ===========================================================================
DROP TRIGGER IF EXISTS trg_warehouses_updated_at ON public.warehouses;
CREATE TRIGGER trg_warehouses_updated_at
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

DROP TRIGGER IF EXISTS trg_warehouse_stock_updated_at ON public.warehouse_stock;
CREATE TRIGGER trg_warehouse_stock_updated_at
  BEFORE UPDATE ON public.warehouse_stock
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- ===========================================================================
-- ۶) RLS — از روز اول، هماهنگ با الگوی نقش‌های موجود (has_role)
--    مدیریت انبار: admin/manager. خواندن: نقش‌های عملیاتی.
--    نوشتن موجودی/کاردکس فقط از طریق توابع SECURITY DEFINER فازهای ۸.۲–۸.۴
--    انجام می‌شود، پس policy نوشتن مستقیم محدود به admin/manager است.
-- ===========================================================================
ALTER TABLE public.warehouses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- warehouses
DROP POLICY IF EXISTS warehouses_select_operational ON public.warehouses;
CREATE POLICY warehouses_select_operational ON public.warehouses
  FOR SELECT USING (
    public.has_any_role(auth.uid(),
      ARRAY['admin','manager','accountant','sales','purchase_specialist']::text[])
  );

DROP POLICY IF EXISTS warehouses_insert_admin_manager ON public.warehouses;
CREATE POLICY warehouses_insert_admin_manager ON public.warehouses
  FOR INSERT WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

DROP POLICY IF EXISTS warehouses_update_admin_manager ON public.warehouses;
CREATE POLICY warehouses_update_admin_manager ON public.warehouses
  FOR UPDATE USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]))
          WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

DROP POLICY IF EXISTS warehouses_delete_admin_manager ON public.warehouses;
CREATE POLICY warehouses_delete_admin_manager ON public.warehouses
  FOR DELETE USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

-- warehouse_stock
DROP POLICY IF EXISTS warehouse_stock_select_operational ON public.warehouse_stock;
CREATE POLICY warehouse_stock_select_operational ON public.warehouse_stock
  FOR SELECT USING (
    public.has_any_role(auth.uid(),
      ARRAY['admin','manager','accountant','sales','purchase_specialist']::text[])
  );

DROP POLICY IF EXISTS warehouse_stock_write_admin_manager ON public.warehouse_stock;
CREATE POLICY warehouse_stock_write_admin_manager ON public.warehouse_stock
  FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]))
          WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

-- stock_movements — کاردکس فقط خواندنی از دید کاربر؛ درج توسط توابع سیستمی.
DROP POLICY IF EXISTS stock_movements_select_operational ON public.stock_movements;
CREATE POLICY stock_movements_select_operational ON public.stock_movements
  FOR SELECT USING (
    public.has_any_role(auth.uid(),
      ARRAY['admin','manager','accountant','sales','purchase_specialist']::text[])
  );

DROP POLICY IF EXISTS stock_movements_insert_admin_manager ON public.stock_movements;
CREATE POLICY stock_movements_insert_admin_manager ON public.stock_movements
  FOR INSERT WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

-- stock_transfers
DROP POLICY IF EXISTS stock_transfers_select_operational ON public.stock_transfers;
CREATE POLICY stock_transfers_select_operational ON public.stock_transfers
  FOR SELECT USING (
    public.has_any_role(auth.uid(),
      ARRAY['admin','manager','accountant','purchase_specialist']::text[])
  );

DROP POLICY IF EXISTS stock_transfers_write_admin_manager ON public.stock_transfers;
CREATE POLICY stock_transfers_write_admin_manager ON public.stock_transfers
  FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]))
          WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

-- stock_transfer_items
DROP POLICY IF EXISTS stock_transfer_items_select_operational ON public.stock_transfer_items;
CREATE POLICY stock_transfer_items_select_operational ON public.stock_transfer_items
  FOR SELECT USING (
    public.has_any_role(auth.uid(),
      ARRAY['admin','manager','accountant','purchase_specialist']::text[])
  );

DROP POLICY IF EXISTS stock_transfer_items_write_admin_manager ON public.stock_transfer_items;
CREATE POLICY stock_transfer_items_write_admin_manager ON public.stock_transfer_items
  FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]))
          WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

-- ===========================================================================
-- ۷) seed ماژول `warehouse` در role_permissions
--    ماژول seed نشده باعث می‌شود has_dynamic_permission به fallback باز بیفتد.
-- ===========================================================================
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT v.role_name, 'warehouse', v.can_view, v.can_create, v.can_update, v.can_delete,
       v.can_approve, v.can_export, v.can_view_sensitive
FROM (VALUES
  ('admin',               true,  true,  true,  true,  true,  true,  true),
  ('manager',             true,  true,  true,  true,  true,  true,  true),
  ('accountant',          true,  false, false, false, false, true,  false),
  ('purchase_specialist', true,  false, false, false, false, false, false),
  ('sales',               true,  false, false, false, false, false, false)
) AS v(role_name, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.module = 'warehouse' AND rp.role_name = v.role_name
);

COMMIT;
