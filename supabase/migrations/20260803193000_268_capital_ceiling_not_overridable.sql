SET client_encoding='UTF8';

-- =====================================================================
-- 268 — سقف سرمایه دیگر قابل override نیست (فاز ۲ · تصمیم D8-1)
--
-- تصمیم مالک (D8-1، گزینهٔ «ب»): **هر دو سطح قفل**. نه مجموع سرمایهٔ روز و نه
-- سقف هر کارشناس، پس از آنکه سیستم محاسبه‌شان کرد، دستی قابل تغییر نیست.
--
-- snapshot تعریف‌های زنده پیش از تغییر: docs/verification/pre-268/capital-functions.sql
--
-- ── تفکیک «ورودی» از «خروجی» (خواستهٔ صریح سند) ───────────────────────
--
-- ورودی — **قابل ویرایش می‌ماند.** جدول `daily_capital_inputs`: موجودی بانک،
--   نقد، چک‌های دریافتی/پرداختی، مطالبات و بدهی‌های خارج از سیستم، هزینه‌های
--   نزدیک، ذخیرهٔ ریسک، وجوه مسدود، ارزش نقدشوندگی انبار، و
--   **`manual_adjustment`**. اینها واقعیت کسب‌وکارند که حسابدار اعلام می‌کند.
--   سیاست‌های `dci_insert` و `dci_update` دست‌نخورده می‌مانند.
--
-- خروجی — **فقط‌خواندنی می‌شود.** `system_suggested_capital` که
--   `compute_daily_capital()` از همان ورودی‌ها می‌سازد، و `final_capital` که تا
--   امروز می‌توانست از آن منحرف شود. همچنین `final_amount` در
--   `salesperson_capital_allocations` که سقف هر کارشناس است.
--
-- نکتهٔ مهم برای پاسخ به «اگر حسابدار عدد دیگری لازم داشت چه؟»: راه درست از
-- قبل وجود دارد و `manual_adjustment` نام دارد — یک **ورودیِ** فرمول که ثبت و
-- قابل حسابرسی است، نه بازنویسی **خروجی** فرمول. پس بستن override چیزی را از
-- حسابدار نمی‌گیرد؛ فقط او را به مسیر قابل‌ردیابی هدایت می‌کند.
--
-- ── وضعیت واقعی که پیش از تغییر پیدا شد ───────────────────────────────
--
-- ۱) دو سامانهٔ موازی سرمایه وجود دارد:
--      • «پویا» — `salesperson_capital_allocations_dynamic` با **۱۸۲ ردیف**،
--        که `run_daily_capital_allocation` می‌نویسد. این جدول **اصلاً ستون
--        override ندارد**؛ `allocated_capital` تماماً از امتیاز مشتق می‌شود.
--        یعنی سامانهٔ زنده از قبل قابل override نبود.
--      • «قدیمی» — `salesperson_capital_allocations` با **۰ ردیف**، که
--        `save_salesperson_capital_allocations` می‌نویسد و ستون‌های
--        `system_suggested_amount` / `final_amount` / `override_reason` دارد.
--        مکانیزم override که D8-1 نام می‌برد **اینجاست**.
--    پس این مهاجرت مسیر قدیمی را می‌بندد و مسیر پویا را دست نمی‌زند.
--
-- ۱ب) **چرا آن جدول ۰ ردیف دارد:** هر دو تابع قدیمی
--     (`save_salesperson_capital_allocations` و جفتش
--     `compute_salesperson_capital_allocations`) در **هر** فراخوان خطا می‌دادند،
--     به‌خاطر دو cast که پس از تبدیل `user_roles.role` از `app_role` به `text`
--     جا مانده بودند:
--       • `ARRAY[...]::public.text[]`      ⇒ type "public.text[]" does not exist
--       • `ur.role = 'sales'::public.app_role` ⇒ operator does not exist: text = app_role
--     یعنی مسیر قدیمی **کدِ مرده** بود، نه مسیری کم‌استفاده — و این توضیح می‌دهد
--     چرا جدولش هرگز یک ردیف هم نگرفته. هر دو در همین مهاجرت اصلاح شدند: این
--     توابع به‌هرحال بازنویسی می‌شوند، و اگر اصلاح نشوند قفلی که این فاز روی
--     همان مسیر می‌گذارد اصلاً **قابل اثبات** نیست. تبدیل «همیشه‌خطا» به «کارا»
--     نمی‌تواند هیچ مسیر سالمی را بشکند، چون هیچ مسیر سالمی وجود نداشت.
--     (`run_daily_capital_allocation` این اشکال را ندارد؛ `ur.role = 'sales'`
--      بدون cast می‌نویسد — به همین دلیل مسیر پویا سالم است.)
--
-- ۲) `UPDATE` مستقیم روی `final_capital` امروز **خطا نمی‌داد** — چون سیاست
--    UPDATE روی `daily_capital_snapshots` اصلاً وجود ندارد، RLS صفر ردیف
--    قابل‌دیدن می‌داد و نتیجه `UPDATE 0` بود. «بی‌صدا هیچ‌کاری نکردن» با «رد
--    شدن» یکی نیست: فراخوان فکر می‌کند موفق بوده. حالا صریحاً رد می‌شود.
--
-- ۳) **`anon` روی هر هفت جدول سرمایه همهٔ فعل‌های DML را داشت**، از جمله
--    `TRUNCATE`. `TRUNCATE` اصلاً تابع RLS نیست، پس این یک حفرهٔ واقعی بود و نه
--    نظری — همان الگویی که مورد ۲۵۹ برای `purchases` بست. اینجا هم بسته می‌شود.
--
-- ۴) ۳ ردیف تاریخی override دارند (۱۴۰۵/۰۴/۳۰، `system_suggested = 0` ولی
--    `final = 12.5B` و `125B`). این ردیف‌ها **حذف یا اصلاح نمی‌شوند**؛ تریگر
--    فقط BEFORE INSERT/UPDATE است و به ردیف موجود دست نمی‌زند. تاریخ می‌ماند.
--
-- ── چرا تریگر و نه فقط بازنویسی تابع ─────────────────────────────────
-- سند صریح است: «مسیر override را در سطح دیتابیس ببند، نه فقط UI». تریگر هر
-- مسیری را می‌گیرد — تابع، psql مستقیم، PostgREST — نه فقط مسیری که می‌شناسیم.
-- =====================================================================

-- ── ۱) قفل خروجیِ محاسبه‌شدهٔ سرمایهٔ روز ──────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_daily_capital_not_overridable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.final_capital IS DISTINCT FROM NEW.system_suggested_capital THEN
      RAISE EXCEPTION
        'سرمایهٔ نهایی روز قابل تغییر دستی نیست و باید برابر مقدار محاسبه‌شدهٔ سیستم (%) باشد. برای تغییر نتیجه، ورودی‌های سرمایهٔ همان روز را در «ورودی‌های سرمایه» اصلاح کنید (از جمله «تعدیل دستی»).',
        NEW.system_suggested_capital
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: only the two computed money columns are frozen. is_active must stay
  -- updatable -- trg_archive_prior_allocations fires on UPDATE OF is_active.
  IF NEW.system_suggested_capital IS DISTINCT FROM OLD.system_suggested_capital
     OR NEW.final_capital IS DISTINCT FROM OLD.final_capital THEN
    RAISE EXCEPTION
      'سرمایهٔ محاسبه‌شدهٔ روز پس از ثبت قابل ویرایش نیست (تصمیم D8-1). برای روز جدید، ورودی‌ها را اصلاح و دوباره محاسبه کنید.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_capital_not_overridable ON public.daily_capital_snapshots;
CREATE TRIGGER trg_daily_capital_not_overridable
  BEFORE INSERT OR UPDATE ON public.daily_capital_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_capital_not_overridable();

-- ── ۲) قفل سقف هر کارشناس ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_allocation_not_overridable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.final_amount IS DISTINCT FROM NEW.system_suggested_amount THEN
      RAISE EXCEPTION
        'سقف سرمایهٔ کارشناس قابل تغییر دستی نیست و باید برابر مقدار محاسبه‌شدهٔ سیستم (%) باشد.',
        NEW.system_suggested_amount
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- held_amount / consumed_amount / status must stay updatable: they are the
  -- day-to-day lifecycle of an allocation, not the allocation decision itself.
  IF NEW.system_suggested_amount IS DISTINCT FROM OLD.system_suggested_amount
     OR NEW.final_amount IS DISTINCT FROM OLD.final_amount THEN
    RAISE EXCEPTION
      'سقف محاسبه‌شدهٔ کارشناس پس از ثبت قابل ویرایش نیست (تصمیم D8-1).'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_allocation_not_overridable ON public.salesperson_capital_allocations;
CREATE TRIGGER trg_allocation_not_overridable
  BEFORE INSERT OR UPDATE ON public.salesperson_capital_allocations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_allocation_not_overridable();

-- ── ۳) تابع ثبت سرمایهٔ روز: پارامترهای override حذف شدند ─────────────
-- تغییر امضا ⇒ DROP الزامی است (قاعدهٔ ۵ سند: نسخهٔ قبلی نماند تا فراخوان مبهم
-- نشود). هیچ فراخوانی در فرانت‌اند وجود ندارد — جست‌وجو فقط `types.ts` تولیدشده
-- را برگرداند — پس حذف پارامترها هیچ مسیر UI را نمی‌شکند.
DROP FUNCTION IF EXISTS public.save_daily_capital_snapshot(date, numeric, text);

CREATE OR REPLACE FUNCTION public.save_daily_capital_snapshot(p_capital_date date)
RETURNS public.daily_capital_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  s public.daily_capital_snapshots;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_capital_date IS NULL THEN
    RAISE EXCEPTION 'capital_date is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO c FROM public.compute_daily_capital(p_capital_date);

  -- final_capital is no longer an argument: it IS the computed result.
  INSERT INTO public.daily_capital_snapshots(
    capital_date, system_suggested_capital, final_capital,
    total_receivables, overdue_receivables, due_today_receivables, future_receivables,
    total_payables, overdue_payables, due_today_payables, future_payables,
    input_id, formula_version, override_reason, approved_by, created_by
  ) VALUES (
    p_capital_date, c.system_suggested_capital, c.system_suggested_capital,
    c.total_receivables, c.overdue_receivables, c.due_today_receivables, c.future_receivables,
    c.total_payables, c.overdue_payables, c.due_today_payables, c.future_payables,
    c.input_id, c.formula_version, NULL, auth.uid(), auth.uid()
  )
  RETURNING * INTO s;

  RETURN s;
END;
$function$;

COMMENT ON FUNCTION public.save_daily_capital_snapshot(date) IS
  'Records the day''s capital snapshot. final_capital is always the computed system_suggested_capital -- the override parameters were removed by migration 268 (D8-1). To change the result, change the INPUTS in daily_capital_inputs.';

REVOKE EXECUTE ON FUNCTION public.save_daily_capital_snapshot(date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.save_daily_capital_snapshot(date) TO authenticated;

-- ── ۴) تابع ثبت سقف کارشناسان: مقدار دستی رد می‌شود ──────────────────
-- امضا عمداً تغییر نکرد: `p_allocations` همچنان تعیین می‌کند کدام کارشناسان ثبت
-- شوند. تنها تفاوت این است که `final_amount` دیگر پذیرفته نمی‌شود اگر با مقدار
-- محاسبه‌شده فرق داشته باشد — بی‌صدا اصلاحش نمی‌کنیم، چون فراخوانی که عدد
-- دیگری فرستاده باید بفهمد که آن عدد ثبت نشده.
CREATE OR REPLACE FUNCTION public.save_salesperson_capital_allocations(
  p_capital_snapshot_id uuid,
  p_allocations jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
  v_actor uuid := auth.uid();
  v_count integer := 0;
  v_item jsonb;
  v_sp uuid;
  v_requested numeric;
  v_score numeric;
  v_suggested numeric;
  v_existing public.salesperson_capital_allocations%ROWTYPE;
  v_alloc_id uuid;
BEGIN
  -- NOTE: the previous definition cast to `public.text[]`, which is not a real
  -- type (text lives in pg_catalog), so this line raised
  -- `type "public.text[]" does not exist` on EVERY call. That is why
  -- salesperson_capital_allocations has 0 rows: this path never worked. Fixed
  -- to text[] here rather than faithfully reproducing a fatal typo.
  IF NOT public.has_any_role(v_actor, ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.daily_capital_snapshots WHERE id = p_capital_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily capital snapshot not found' USING ERRCODE = '22023';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'p_allocations must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(es.monthly_score), 0)
    INTO v_total
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_sp        := NULLIF(v_item->>'salesperson_id','')::uuid;
    v_requested := (v_item->>'final_amount')::numeric;   -- NULL when omitted

    IF v_sp IS NULL THEN
      RAISE EXCEPTION 'salesperson_id required' USING ERRCODE = '22023';
    END IF;

    SELECT es.monthly_score INTO v_score
    FROM public.employee_scores es
    JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'
    WHERE es.employee_id = v_sp;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'user % is not a salesperson with score', v_sp USING ERRCODE = '22023';
    END IF;

    v_suggested := CASE
      WHEN v_total > 0 THEN ROUND(v_snap.final_capital * (v_score / v_total))
      ELSE 0
    END;

    -- D8-1: a supplied amount that differs from the computed one is refused,
    -- not quietly replaced.
    IF v_requested IS NOT NULL AND ROUND(v_requested) <> v_suggested THEN
      RAISE EXCEPTION
        'سقف سرمایهٔ کارشناس قابل تغییر دستی نیست. مقدار محاسبه‌شدهٔ سیستم % است (مقدار ارسالی: %).',
        v_suggested, ROUND(v_requested)
        USING ERRCODE = '42501';
    END IF;

    IF (v_item ? 'override_reason') AND NULLIF(v_item->>'override_reason','') IS NOT NULL THEN
      RAISE EXCEPTION
        'ثبت «دلیل override» دیگر پذیرفته نمی‌شود؛ سقف سرمایه از تصمیم D8-1 به بعد فقط محاسبه‌شدنی است.'
        USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_existing
    FROM public.salesperson_capital_allocations
    WHERE capital_snapshot_id = p_capital_snapshot_id AND salesperson_id = v_sp;

    IF FOUND THEN
      UPDATE public.salesperson_capital_allocations
        SET score = v_score,
            total_score = v_total,
            system_suggested_amount = v_suggested,
            final_amount = v_suggested,
            override_reason = NULL,
            status = 'approved',
            approved_by = v_actor,
            updated_at = now()
        WHERE id = v_existing.id
        RETURNING id INTO v_alloc_id;
    ELSE
      INSERT INTO public.salesperson_capital_allocations(
        capital_snapshot_id, capital_date, salesperson_id,
        score, total_score, system_suggested_amount, final_amount,
        override_reason, status, created_by, approved_by
      ) VALUES (
        p_capital_snapshot_id, v_snap.capital_date, v_sp,
        v_score, v_total, v_suggested, v_suggested,
        NULL, 'approved', v_actor, v_actor
      ) RETURNING id INTO v_alloc_id;
    END IF;

    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (v_actor, 'salesperson_capital_allocation', v_alloc_id, 'allocation_saved',
            jsonb_build_object('salesperson_id', v_sp,
                               'system_suggested_amount', v_suggested,
                               'final_amount', v_suggested,
                               'capital_snapshot_id', p_capital_snapshot_id));

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.save_salesperson_capital_allocations(uuid, jsonb) IS
  'Records per-salesperson capital ceilings. final_amount is always the computed share -- a differing final_amount or any override_reason is refused (migration 268, D8-1).';

REVOKE EXECUTE ON FUNCTION public.save_salesperson_capital_allocations(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.save_salesperson_capital_allocations(uuid, jsonb) TO authenticated;

-- ── ۴ب) رفع تایپِ کشندهٔ تابع پیش‌نمایش تخصیص ────────────────────────
-- `compute_salesperson_capital_allocations` دقیقاً همان اشکال را دارد:
-- `::public.text[]` نوع واقعی نیست، پس این تابع هم در **هر** فراخوان با
-- `type "public.text[]" does not exist` می‌افتاد. این تابعِ جفتِ تابع بالاست
-- (یکی پیش‌نمایش می‌دهد، دیگری ثبت می‌کند) و هر دو مرده بودند. چون تنها تغییر،
-- تبدیل یک تایپِ همیشه‌خطاده به کد کارا است، هیچ مسیر سالمی نمی‌تواند به رفتار
-- قبلی وابسته باشد. بقیهٔ بدنه بایت‌به‌بایت از snapshot زنده آمده است
-- (docs/verification/pre-268/capital-functions.sql).
CREATE OR REPLACE FUNCTION public.compute_salesperson_capital_allocations(p_capital_snapshot_id uuid)
RETURNS TABLE(capital_snapshot_id uuid, capital_date date, daily_final_capital numeric,
              salesperson_id uuid, score numeric, total_score numeric,
              system_suggested_amount numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.daily_capital_snapshots WHERE id = p_capital_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily capital snapshot not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(es.monthly_score), 0)
    INTO v_total
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales';

  RETURN QUERY
  SELECT
    v_snap.id,
    v_snap.capital_date,
    v_snap.final_capital,
    es.employee_id AS salesperson_id,
    es.monthly_score AS score,
    v_total AS total_score,
    CASE
      WHEN v_total > 0 THEN ROUND(v_snap.final_capital * (es.monthly_score / v_total))
      ELSE 0
    END AS system_suggested_amount
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'
  ORDER BY es.monthly_score DESC NULLS LAST;
END;
$function$;

-- ── ۵) ستون‌های override: منسوخ، ولی داده حفظ می‌شود ─────────────────
COMMENT ON COLUMN public.daily_capital_snapshots.override_reason IS
  'DEPRECATED 2026-08-03 (migration 268, owner decision D8-1): the day capital override was closed at both levels. Existing rows are KEPT as history -- 3 rows dated 2026-07-21 carry a real override. Nothing new is written here.';

COMMENT ON COLUMN public.salesperson_capital_allocations.override_reason IS
  'DEPRECATED 2026-08-03 (migration 268, owner decision D8-1): the per-salesperson ceiling override was closed. Existing rows are KEPT as history. Nothing new is written here.';

-- ── ۶) بستن DML نقش anon روی جدول‌های سرمایه ─────────────────────────
-- Supabase به‌صورت پیش‌فرض این‌ها را می‌دهد. `TRUNCATE` تابع RLS **نیست**، پس
-- نگه‌داشتنش یک حفرهٔ واقعی بود. `authenticated` هم فقط SELECT نگه می‌دارد؛
-- همهٔ نوشتن‌ها از توابع SECURITY DEFINER بالا عبور می‌کنند.
REVOKE ALL ON public.daily_capital_snapshots                 FROM anon;
REVOKE ALL ON public.daily_capital_settings                  FROM anon;
REVOKE ALL ON public.daily_capital_inputs                    FROM anon;
REVOKE ALL ON public.salesperson_capital_allocations         FROM anon;
REVOKE ALL ON public.customer_capital_allocations            FROM anon;
REVOKE ALL ON public.salesperson_capital_allocations_dynamic FROM anon;
REVOKE ALL ON public.customer_capital_allocations_dynamic    FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.daily_capital_snapshots                 FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.salesperson_capital_allocations         FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.customer_capital_allocations            FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.salesperson_capital_allocations_dynamic FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.customer_capital_allocations_dynamic    FROM authenticated;
-- daily_capital_inputs and daily_capital_settings keep their authenticated
-- write grants: those are the INPUT side, which stays editable by design.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.daily_capital_inputs   FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.daily_capital_settings FROM authenticated;
