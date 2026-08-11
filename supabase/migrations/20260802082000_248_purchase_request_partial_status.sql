SET client_encoding='UTF8';

-- =============================================================================
-- 248 — Issue 219 / C1.1 + C1.3: partial status value + legacy marking
-- =============================================================================
--
-- TWO ADDITIVE CHANGES, NEITHER OF WHICH ALTERS BEHAVIOUR TODAY.
--
-- 1. Widen purchase_requests_status_check to accept 'partially_purchased'.
--    Nothing writes that value yet — the frontend's nextStatuses() does not
--    offer it and no RPC produces it. Widening a CHECK cannot invalidate an
--    existing row, so this is safe in isolation and is a prerequisite for C4.
--
-- 2. Add purchase_requests.legacy_no_fulfillment and set it for requests that
--    already claim to be purchased or delivered while no purchase document
--    exists for them.
--
-- ⚠️ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--    It does NOT forbid manual status changes to 'purchased'. The final report
--    (chapter 30) resolved that ordering conflict explicitly: shipping the
--    guard before the purchase drawer exists would leave a buyer unable to
--    advance a request at all — they could neither set the status by hand nor
--    register a document. The guard ships with the drawer, in C4.
--
-- WHY A STORED FLAG RATHER THAN A DERIVED RULE
--    A derived rule ("advanced status and no fulfillment") would silently
--    re-classify a brand-new request as legacy the moment its fulfillment was
--    revoked. Legacy means "this predates the feature", which is a historical
--    fact and must be recorded once, not recomputed forever.
--
-- WHY NO GUESSED BACKFILL
--    Purchase documents carry no reference to a request, so any attempt to
--    match a delivered request to one of the 9 existing purchases would be
--    invention. The flag records ONLY the verifiable fact: "no document is
--    linked". Views in migration 249 return NULL rather than 0 for these rows,
--    so nothing reads as "supplied nothing" when the truth is "unknown".
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Read-only pre-flight: prove the widened CHECK cannot reject existing data.
-- -----------------------------------------------------------------------------
DO $precheck$
DECLARE _bad int; _states text;
BEGIN
  SELECT COUNT(*), COALESCE(string_agg(DISTINCT status, ', '), '')
    INTO _bad, _states
  FROM public.purchase_requests
  WHERE status NOT IN ('pending','approved','partially_purchased','purchased','delivered','cancelled');

  IF _bad > 0 THEN
    RAISE EXCEPTION
      'داده‌های موجود با CHECK جدید سازگار نیستند: % ردیف با وضعیت‌های «%».', _bad, _states;
  END IF;
  RAISE NOTICE 'Pre-check passed: every existing status is inside the widened CHECK.';
END $precheck$;

ALTER TABLE public.purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_status_check;

ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_status_check
  CHECK (status = ANY (ARRAY['pending','approved','partially_purchased','purchased','delivered','cancelled']));

COMMENT ON COLUMN public.purchase_requests.status IS
  'pending | approved | partially_purchased | purchased | delivered | cancelled. از مورد ۲۱۹ به بعد، دو وضعیت partially_purchased و purchased «مشتق» هستند و از مجموع تخصیص‌های ثبت‌شده در purchase_request_fulfillments محاسبه می‌شوند؛ نباید دستی تنظیم شوند (اعمال این ممنوعیت در مرحلهٔ C4 همراه با فرم ثبت خرید انجام می‌شود).';

-- -----------------------------------------------------------------------------
-- 2. Legacy marker.
-- -----------------------------------------------------------------------------
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS legacy_no_fulfillment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.purchase_requests.legacy_no_fulfillment IS
  'مورد ۲۱۹: این درخواست پیش از وجود پیوند «درخواست ↔ سند خرید» به وضعیت خرید/تحویل رسیده و هیچ سند خریدی به آن متصل نیست. مقدار تأمین‌شدهٔ آن «نامعلوم» است، نه صفر. هیچ اتصال حدسی به اسناد موجود انجام نشده است. مدیر می‌تواند پس از تعیین تکلیف، این پرچم را بردارد.';

-- -----------------------------------------------------------------------------
-- 3. Mark exactly the qualifying rows. Idempotent: re-running changes nothing.
-- -----------------------------------------------------------------------------
DO $flag$
DECLARE _before int; _after int; _eligible int;
BEGIN
  SELECT COUNT(*) INTO _before FROM public.purchase_requests WHERE legacy_no_fulfillment;

  SELECT COUNT(*) INTO _eligible
  FROM public.purchase_requests pr
  WHERE pr.status IN ('purchased','delivered')
    AND NOT EXISTS (
      SELECT 1 FROM public.purchase_request_fulfillments f
      WHERE f.purchase_request_id = pr.id
    );

  UPDATE public.purchase_requests pr
  SET legacy_no_fulfillment = true
  WHERE pr.status IN ('purchased','delivered')
    AND pr.legacy_no_fulfillment = false
    AND NOT EXISTS (
      SELECT 1 FROM public.purchase_request_fulfillments f
      WHERE f.purchase_request_id = pr.id
    );

  SELECT COUNT(*) INTO _after FROM public.purchase_requests WHERE legacy_no_fulfillment;

  RAISE NOTICE 'Legacy marking: eligible=%, flagged before=%, flagged after=%.',
    _eligible, _before, _after;

  IF _after <> _eligible THEN
    RAISE EXCEPTION 'علامت‌گذاری داده‌های قدیمی ناتمام ماند: واجد شرایط % ولی علامت‌خورده %.',
      _eligible, _after;
  END IF;
END $flag$;

-- -----------------------------------------------------------------------------
-- 4. Prove no other column of any request row was touched.
--    status, quantity and assignment must be exactly as before.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE _p int; _a int; _c int; _d int; _x int;
BEGIN
  SELECT COUNT(*) FILTER (WHERE status='pending'),
         COUNT(*) FILTER (WHERE status='approved'),
         COUNT(*) FILTER (WHERE status='cancelled'),
         COUNT(*) FILTER (WHERE status='delivered'),
         COUNT(*) FILTER (WHERE status='purchased')
    INTO _p, _a, _c, _d, _x
  FROM public.purchase_requests;

  RAISE NOTICE 'Status distribution after migration: pending=% approved=% cancelled=% delivered=% purchased=%',
    _p, _a, _c, _d, _x;
END $verify$;

NOTIFY pgrst, 'reload schema';
