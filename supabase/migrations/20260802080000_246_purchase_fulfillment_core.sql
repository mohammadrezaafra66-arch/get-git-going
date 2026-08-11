SET client_encoding='UTF8';

-- =============================================================================
-- 246 — Issue 219 / C1.1: purchase-request fulfillment core
-- =============================================================================
--
-- WHY
--   A purchase request and a real purchase document have never been linked in
--   this schema. Clicking «خرید انجام شد» only flips a status, so a request can
--   read "purchased" while no purchase exists. This table is the missing link.
--
-- GRAIN: one row per (purchase request, purchase LINE).
--   Linking at purchase level was rejected. A single purchase document can carry
--   several lines, and more than one of them may serve the same request — a
--   UNIQUE (purchase_id, purchase_request_id) would have made that
--   unrepresentable. Linking at the line level supports every cardinality the
--   owner asked for:
--     one request / many purchases        (multi-stage)
--     one request / many suppliers        (each purchase has its own supplier)
--     one purchase / many lines / one request
--     one purchase / many requests
--     one line split across many requests
--
-- ALLOCATED QUANTITY IS NOT PURCHASED QUANTITY.
--   If a request asks for 10 and the buyer purchases 12, then
--     purchase_items.quantity   = 12   (this is what enters stock)
--     allocated_quantity        = 10   (this is what the request consumed)
--     excess                    =  2   (a property of the LINE, not the request)
--   Excess is deliberately NOT stored here: when one line is split across two
--   requests, an excess column on this table would be counted once per request.
--   It is computed at line level in migration 249.
--
-- DELETE BEHAVIOUR: RESTRICT on all three foreign keys.
--   Verified against the live database: `purchases` has NO soft-delete and NO
--   void column, and its RLS policy `manager admin write purchases` is FOR ALL,
--   so an admin or manager can hard-DELETE a purchase today. With CASCADE, that
--   deletion would silently erase the record of which request the money was
--   spent for. RESTRICT makes the deletion fail instead.
--
--   ⚠️ BEHAVIOUR CHANGE, DELIBERATE AND REPORTED: once a purchase has a
--   fulfillment row, admins and managers can no longer delete it. Nothing in
--   the product deletes purchases today (no frontend path exists), so no user
--   journey breaks. A proper void/reversal feature is out of scope for issue
--   219 and is listed as future work.
--
-- NOTHING IN THIS MIGRATION IS REACHABLE BY THE APPLICATION YET.
--   No RPC writes to this table (that arrives in C2), no UI reads it. It is
--   additive, backward-compatible and deploy-safe on its own.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Pre-flight: prove the migration cannot break existing data.
--    It creates a new table only, so there is nothing to violate — but the two
--    tables it references must exist with the expected key types.
-- -----------------------------------------------------------------------------
DO $preflight$
BEGIN
  IF to_regclass('public.purchase_requests') IS NULL
     OR to_regclass('public.purchases')      IS NULL
     OR to_regclass('public.purchase_items') IS NULL THEN
    RAISE EXCEPTION 'پیش‌نیاز وجود ندارد: یکی از جدول‌های purchase_requests / purchases / purchase_items یافت نشد.';
  END IF;
  RAISE NOTICE 'Pre-flight passed: all three referenced tables exist.';
END $preflight$;

-- -----------------------------------------------------------------------------
-- 2. The junction table.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_request_fulfillments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  purchase_request_id   uuid NOT NULL REFERENCES public.purchase_requests(id) ON DELETE RESTRICT,
  purchase_id           uuid NOT NULL REFERENCES public.purchases(id)         ON DELETE RESTRICT,
  purchase_item_id      uuid     NULL REFERENCES public.purchase_items(id)    ON DELETE RESTRICT,

  allocated_quantity    numeric NOT NULL CHECK (allocated_quantity > 0),

  is_over_allocation    boolean NOT NULL DEFAULT false,
  over_allocation_note  text,

  source                text NOT NULL DEFAULT 'rpc'
                        CHECK (source IN ('rpc','legacy_import','manual_backfill')),

  -- auth.users, matching purchase_requests.requested_by / purchases.created_by.
  -- There is no public.users in this database; the existing purchase FKs all
  -- point at auth.users.
  created_by            uuid NOT NULL REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- The normal RPC path can never produce a row without a purchase line.
  -- A null line is reserved for legacy/import reconciliation only.
  CONSTRAINT prf_rpc_requires_item
    CHECK (purchase_item_id IS NOT NULL OR source <> 'rpc'),

  -- Allocating more than the request's remaining quantity is allowed, but only
  -- as a recorded, explained decision — never as a silent side effect.
  CONSTRAINT prf_over_allocation_needs_note
    CHECK (is_over_allocation = false
           OR NULLIF(btrim(COALESCE(over_allocation_note,'')),'') IS NOT NULL)
);

COMMENT ON TABLE public.purchase_request_fulfillments IS
  'مورد ۲۱۹: پیوند میان درخواست خرید و قلم سند خرید. هر ردیف یعنی «این مقدار از این درخواست، توسط این قلم خرید تأمین شد». گرین در سطح قلم است تا خرید جزئی، چندمرحله‌ای، چند تأمین‌کننده و پوشش چند درخواست توسط یک سند همگی قابل ثبت باشند. allocated_quantity عمداً با مقدار واقعی خرید یکی نیست: مقدار واقعی وارد موجودی می‌شود، مقدار تخصیص‌یافته وضعیت درخواست را تعیین می‌کند.';
COMMENT ON COLUMN public.purchase_request_fulfillments.allocated_quantity IS
  'مقدار تخصیص‌یافته به درخواست — نه مقدار واقعی خرید. مقدار واقعی در purchase_items.quantity است و مازاد در سطح همان قلم محاسبه می‌شود (view در مهاجرت ۲۴۹).';
COMMENT ON COLUMN public.purchase_request_fulfillments.source IS
  'rpc = مسیر عادی ثبت خرید (همیشه purchase_item_id دارد) · legacy_import / manual_backfill = تعیین تکلیف دستی داده‌های قدیمی.';
COMMENT ON COLUMN public.purchase_request_fulfillments.is_over_allocation IS
  'ذخیره می‌شود و مشتق نیست: «باقی‌مانده» با گذشت زمان تغییر می‌کند، پس یک پرچم مشتق بعداً دربارهٔ گذشته دروغ می‌گفت.';

-- -----------------------------------------------------------------------------
-- 3. Uniqueness — two complementary partial indexes.
--
--    With a line: the same line cannot be allocated twice to the same request,
--    while a different line of the SAME purchase still can.
--    Without a line (legacy rows only): the same purchase cannot be linked
--    twice to the same request. Relying on the first index alone would leave
--    null-line rows completely unprotected, because NULL is never equal to
--    NULL in a unique index.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_prf_request_item
  ON public.purchase_request_fulfillments (purchase_request_id, purchase_item_id)
  WHERE purchase_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_prf_request_purchase_nullitem
  ON public.purchase_request_fulfillments (purchase_request_id, purchase_id)
  WHERE purchase_item_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_prf_request  ON public.purchase_request_fulfillments (purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_prf_purchase ON public.purchase_request_fulfillments (purchase_id);
CREATE INDEX IF NOT EXISTS idx_prf_item     ON public.purchase_request_fulfillments (purchase_item_id);

-- -----------------------------------------------------------------------------
-- 4. Missing index found during the audit.
--
--    purchase_items carries only its primary key — no index on purchase_id,
--    even though a foreign key points at it. PostgreSQL does not create one
--    automatically. Every aggregate added by issue 219 groups by purchase, and
--    the existing FK RESTRICT check on purchases also scans this column.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase
  ON public.purchase_items (purchase_id);

-- -----------------------------------------------------------------------------
-- 5. Allocation guard.
--
--    A line cannot be allocated beyond the quantity actually purchased on it.
--    This is a CROSS-TABLE rule, so a CHECK constraint cannot express it.
--
--    ⚠️ This trigger is the SECOND line of defence, not the only one. Under
--    READ COMMITTED (this database's isolation level), two concurrent
--    transactions each see a pre-commit SUM and both can pass. The real
--    protection is the row lock the RPC will take on purchase_items in C2.
--    The trigger catches logic errors and any path that forgets the lock.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_prf_validate_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _item_qty  numeric;
  _allocated numeric;
BEGIN
  IF NEW.purchase_item_id IS NULL THEN
    RETURN NEW;  -- legacy rows carry no line to measure against
  END IF;

  SELECT pi.quantity INTO _item_qty
  FROM public.purchase_items pi
  WHERE pi.id = NEW.purchase_item_id;

  IF _item_qty IS NULL THEN
    RAISE EXCEPTION 'قلم خرید یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(f.allocated_quantity), 0) INTO _allocated
  FROM public.purchase_request_fulfillments f
  WHERE f.purchase_item_id = NEW.purchase_item_id
    AND f.id IS DISTINCT FROM NEW.id;

  IF _allocated + NEW.allocated_quantity > _item_qty THEN
    RAISE EXCEPTION
      'مجموع تخصیص‌های این قلم خرید (%) از مقدار خریداری‌شده (%) بیشتر می‌شود.',
      _allocated + NEW.allocated_quantity, _item_qty
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_prf_validate_allocation() IS
  'مورد ۲۱۹ (۲۴۶). تضمین می‌کند مجموع تخصیص‌های یک قلم خرید از مقدار واقعی خریداری‌شده بیشتر نشود. لایهٔ دوم دفاع است؛ محافظ اصلی، قفل ردیفی روی purchase_items در RPC مرحلهٔ C2 است، چون در READ COMMITTED دو تراکنش هم‌زمان هرکدام SUM پیش از commit دیگری را می‌بینند.';

DROP TRIGGER IF EXISTS trg_prf_validate_allocation ON public.purchase_request_fulfillments;
CREATE TRIGGER trg_prf_validate_allocation
  BEFORE INSERT OR UPDATE ON public.purchase_request_fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.tg_prf_validate_allocation();

-- -----------------------------------------------------------------------------
-- 6. RLS.
--
--    SELECT mirrors the visibility rules already used by purchase_requests and
--    purchase_receipts: privileged roles see everything, participants see their
--    own request's rows.
--
--    There is deliberately NO insert/update/delete policy. Every write must go
--    through the SECURITY DEFINER RPC added in C2, which is what makes the RPC
--    the single door and keeps allocation arithmetic in one place.
-- -----------------------------------------------------------------------------
ALTER TABLE public.purchase_request_fulfillments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prf_select_participants ON public.purchase_request_fulfillments;
CREATE POLICY prf_select_participants ON public.purchase_request_fulfillments
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','purchase_specialist']::text[])
    OR EXISTS (
      SELECT 1 FROM public.purchase_requests pr
      WHERE pr.id = purchase_request_fulfillments.purchase_request_id
        AND (pr.requested_by = auth.uid() OR pr.assigned_to = auth.uid())
    )
  );

REVOKE ALL ON public.purchase_request_fulfillments FROM PUBLIC, anon;
GRANT SELECT ON public.purchase_request_fulfillments TO authenticated;

NOTIFY pgrst, 'reload schema';
