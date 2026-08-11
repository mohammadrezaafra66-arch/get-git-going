SET client_encoding='UTF8';

-- =============================================================================
-- 247 — Issue 219 / C1.1: purchase idempotency foundation
-- =============================================================================
--
-- WHY
--   The buyer uses this on a phone, in the street, on a mobile connection. A
--   double tap, a refresh, a retried request or a dropped response must not
--   produce a second purchase document — which today would also produce a
--   second stock movement and a second gamification score, because
--   stock_movements has no unique key on (ref_type, ref_id) either.
--
--   There is no idempotency anywhere in the purchase path today. This table is
--   the mechanism.
--
-- WHY A TABLE AND NOT A COLUMN ON purchases
--   A bare `purchases.idempotency_key` would answer "has this key been used?"
--   but not "by whom", "with what inputs" or "what was the result". All three
--   are required: the same key sent with a DIFFERENT payload must be rejected
--   as a conflict rather than silently returning someone else's purchase.
--   Keeping it in its own table also means the financial table `purchases` is
--   not modified at all by issue 219.
--
-- PATTERN REUSED, NOT INVENTED
--   automation_jobs already carries idempotency_key + payload jsonb +
--   created_by with a unique index. This table follows the same shape and adds
--   the payload hash and the stored result that the purchase flow needs.
--
-- STATE MACHINE: processing -> completed | failed
--   No 'expired' state. The reservation row is inserted INSIDE the caller's
--   transaction, so a rollback removes it and no orphan key can survive. The
--   only case a row can be left in 'processing' is a backend crash between
--   commit points; the takeover rule in the C2 RPC handles that by treating a
--   'processing' row older than 5 minutes with no purchase as abandoned.
--
-- NOTHING WRITES TO THIS TABLE YET. The RPC that uses it arrives in C2.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.purchase_idempotency (
  idempotency_key text PRIMARY KEY,

  -- auth.users, matching every other actor FK on the purchase tables.
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  scope           text NOT NULL DEFAULT 'create_purchase',

  -- sha256 over a canonical payload. Two calls with the same key but different
  -- meaningful inputs must be distinguishable, so the hash is stored, not the
  -- payload: the inputs include prices and supplier identity.
  payload_hash    text NOT NULL,

  state           text NOT NULL DEFAULT 'processing'
                  CHECK (state IN ('processing','completed','failed')),

  purchase_id     uuid REFERENCES public.purchases(id) ON DELETE RESTRICT,
  result          jsonb,
  error_code      text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,

  -- A completed reservation must say what it produced; a processing one must
  -- not pretend to have a result yet.
  CONSTRAINT purchase_idem_completed_has_result
    CHECK (state <> 'completed' OR (purchase_id IS NOT NULL AND result IS NOT NULL))
);

COMMENT ON TABLE public.purchase_idempotency IS
  'مورد ۲۱۹: رزرو کلید یکتای عملیات ثبت خرید. کلید در سمت کلاینت هنگام باز شدن فرم ساخته می‌شود و تا موفقیت نگه داشته می‌شود، پس رفرش، قطع شبکه یا دوبار ثبت به سند دوم منجر نمی‌شود. hash ورودی‌های معنادار ذخیره می‌شود تا «همان کلید با اطلاعات متفاوت» به‌عنوان تعارض رد شود و «همان کلید با همان اطلاعات» نتیجهٔ قبلی را برگرداند. الگو از automation_jobs گرفته شده است.';
COMMENT ON COLUMN public.purchase_idempotency.payload_hash IS
  'sha256 روی payload کانونیکال. ورودی‌ها: request, product, quantity, allocate_quantity, price, currency, supplier, warehouse, created_by. یادداشت عمداً وارد hash نمی‌شود تا اصلاح یک تایپ، سند دوم نسازد.';
COMMENT ON COLUMN public.purchase_idempotency.state IS
  'processing → completed | failed. ردیف رزرو داخل همان تراکنش درج می‌شود، پس rollback آن را پاک می‌کند و کلید یتیم باقی نمی‌ماند.';

CREATE INDEX IF NOT EXISTS idx_purchase_idem_created_at
  ON public.purchase_idempotency (created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_idem_purchase
  ON public.purchase_idempotency (purchase_id);

-- -----------------------------------------------------------------------------
-- RLS: no client access at all.
--
-- This table is written and read exclusively by the SECURITY DEFINER RPC in C2.
-- RLS is enabled with NO policies, which denies every direct client operation.
-- Leaving it readable would expose one user's purchase result payload — which
-- contains price and supplier — to another user who guessed a key.
-- -----------------------------------------------------------------------------
ALTER TABLE public.purchase_idempotency ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.purchase_idempotency FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
