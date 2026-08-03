SET client_encoding='UTF8';

-- =============================================================================
-- 250 — Issue 219 / C1 follow-up: revoke default write privileges on
--        purchase_request_fulfillments from `authenticated`
-- =============================================================================
--
-- WHY THIS MIGRATION EXISTS AS A SEPARATE FILE
--   Migration 246 was already applied when this defect was found. Editing an
--   applied migration would leave the file history describing a state the
--   database never passed through, so the correction is forward-only. 246 is
--   preserved exactly as it ran.
--
-- THE DEFECT
--   Supabase configures ALTER DEFAULT PRIVILEGES for supabase_admin on schema
--   public granting `arwdDxt` to BOTH anon and authenticated on every new
--   table. Verified directly:
--
--     SELECT pg_get_userbyid(defaclrole), defaclacl FROM pg_default_acl
--      WHERE defaclnamespace = 'public'::regnamespace AND defaclobjtype='r';
--     -> supabase_admin | {postgres=arwdDxt/…, anon=arwdDxt/…,
--                          authenticated=arwdDxt/…, service_role=arwdDxt/…}
--
--   Migration 246 wrote:
--       REVOKE ALL ON public.purchase_request_fulfillments FROM PUBLIC, anon;
--       GRANT SELECT ON public.purchase_request_fulfillments TO authenticated;
--
--   `anon` was correctly stripped, but `authenticated` was never revoked, so it
--   retained the full default grant and the GRANT SELECT was a no-op. Reproduced
--   on a throwaway table inside a rolled-back transaction:
--       after CREATE TABLE : authenticated=arwdDxt
--       after 246's lines  : authenticated=arwdDxt   <-- unchanged
--       after this fix     : authenticated=r
--
-- WHY IT MATTERS EVEN THOUGH RLS ALREADY BLOCKS THE WRITES
--   purchase_request_fulfillments has RLS enabled and NO insert/update/delete
--   policy, so direct writes are refused today — this was verified per role.
--   But table privileges and RLS are two independent layers. With `arwdDxt`
--   still granted, a single future permissive policy, or one ALTER TABLE …
--   DISABLE ROW LEVEL SECURITY, would immediately expose full write access to
--   every logged-in user on a table that records financial allocations. The
--   grant layer must not depend on the policy layer being perfect.
--
-- SCOPE: ONE TABLE ONLY.
--   purchase_idempotency is NOT touched. Migration 247 already revoked from
--   `authenticated` explicitly, and its live ACL confirms it — the role does
--   not appear in relacl at all:
--       purchase_idempotency | postgres=arwdDxt/…, supabase_admin=arwdDxt/…,
--                              service_role=arwdDxt/…
--   No other table is modified; nothing here was inferred without evidence.
--
-- WHAT IS DELIBERATELY KEPT
--   SELECT for `authenticated`, which the C1 design requires so the request
--   card can read its own fulfillment rows. RLS policy prf_select_participants
--   still narrows that to privileged roles plus the request's own participants.
--
-- IDEMPOTENT: REVOKE of a privilege that is already absent is a no-op in
-- PostgreSQL, so re-running this migration changes nothing.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Pre-flight: the table must exist and RLS must be on before we touch grants.
-- -----------------------------------------------------------------------------
DO $preflight$
DECLARE _rls boolean;
BEGIN
  IF to_regclass('public.purchase_request_fulfillments') IS NULL THEN
    RAISE EXCEPTION 'جدول purchase_request_fulfillments وجود ندارد؛ ابتدا مهاجرت ۲۴۶ باید اجرا شود.';
  END IF;

  SELECT relrowsecurity INTO _rls
  FROM pg_class WHERE oid='public.purchase_request_fulfillments'::regclass;

  IF NOT _rls THEN
    RAISE EXCEPTION 'RLS روی purchase_request_fulfillments فعال نیست؛ اصلاح مجوزها بدون RLS انجام نمی‌شود.';
  END IF;

  RAISE NOTICE 'Pre-flight passed: table exists and RLS is enabled.';
END $preflight$;

-- -----------------------------------------------------------------------------
-- 2. The fix. Explicit privilege list rather than REVOKE ALL, so the SELECT
--    grant the design requires is preserved rather than dropped and re-added.
-- -----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.purchase_request_fulfillments FROM authenticated;

-- Belt and braces: anon and PUBLIC must hold nothing at all.
REVOKE ALL ON public.purchase_request_fulfillments FROM PUBLIC, anon;

-- Re-assert the one privilege the design does grant (no-op if already present).
GRANT SELECT ON public.purchase_request_fulfillments TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Post-condition: fail loudly if the outcome is not exactly SELECT-only.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  _sel boolean; _ins boolean; _upd boolean; _del boolean;
  _trunc boolean; _ref boolean; _trg boolean;
  _anon_any boolean;
BEGIN
  _sel   := has_table_privilege('authenticated','public.purchase_request_fulfillments','SELECT');
  _ins   := has_table_privilege('authenticated','public.purchase_request_fulfillments','INSERT');
  _upd   := has_table_privilege('authenticated','public.purchase_request_fulfillments','UPDATE');
  _del   := has_table_privilege('authenticated','public.purchase_request_fulfillments','DELETE');
  _trunc := has_table_privilege('authenticated','public.purchase_request_fulfillments','TRUNCATE');
  _ref   := has_table_privilege('authenticated','public.purchase_request_fulfillments','REFERENCES');
  _trg   := has_table_privilege('authenticated','public.purchase_request_fulfillments','TRIGGER');

  IF NOT _sel THEN
    RAISE EXCEPTION 'اصلاح مجوز ناموفق: نقش authenticated دیگر حتی SELECT هم ندارد.';
  END IF;

  IF _ins OR _upd OR _del OR _trunc OR _ref OR _trg THEN
    RAISE EXCEPTION
      'اصلاح مجوز ناتمام ماند — authenticated هنوز مجوز نوشتن دارد: insert=% update=% delete=% truncate=% references=% trigger=%',
      _ins, _upd, _del, _trunc, _ref, _trg;
  END IF;

  SELECT bool_or(has_table_privilege('anon','public.purchase_request_fulfillments', p))
    INTO _anon_any
  FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;

  IF COALESCE(_anon_any, false) THEN
    RAISE EXCEPTION 'نقش anon هنوز روی purchase_request_fulfillments مجوز دارد.';
  END IF;

  RAISE NOTICE 'Verified: authenticated holds SELECT only; anon holds nothing.';
END $verify$;

COMMENT ON TABLE public.purchase_request_fulfillments IS
  'مورد ۲۱۹: پیوند میان درخواست خرید و قلم سند خرید. هر ردیف یعنی «این مقدار از این درخواست، توسط این قلم خرید تأمین شد». گرین در سطح قلم است تا خرید جزئی، چندمرحله‌ای، چند تأمین‌کننده و پوشش چند درخواست توسط یک سند همگی قابل ثبت باشند. allocated_quantity عمداً با مقدار واقعی خرید یکی نیست: مقدار واقعی وارد موجودی می‌شود، مقدار تخصیص‌یافته وضعیت درخواست را تعیین می‌کند. مجوزها (۲۵۰): نقش authenticated فقط SELECT دارد؛ همهٔ نوشتن‌ها باید از RPC اختصاصی عبور کنند.';

NOTIFY pgrst, 'reload schema';
