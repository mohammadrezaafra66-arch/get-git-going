SET client_encoding='UTF8';

-- =====================================================================
-- 266 — تغییر وزن پارامتر هرگز تاریخ را بازنویسی نمی‌کند (فاز ۱.۲)
--
-- الزام D8-4: «تغییر وزن‌ها نباید امتیاز تاریخی را عوض کند» — و ماهِ جاری از
-- لحظه‌ای که چیزی از رویش حساب شده، خودش تاریخ است.
--
-- snapshot تعریف زندهٔ پیشین: docs/verification/pre-266/upsert_dynamic_parameter_weight.sql
-- (طبق قاعدهٔ سند، پیش از هر تغییر گرفته شد.)
--
-- ── سه ایرادی که در تعریف زنده پیدا شد ────────────────────────────────
--
-- ۱) شاخهٔ «همان ماه» ردیف نسخه را **درجا بازنویسی می‌کرد**:
--        IF v_cur_valid_from = v_month THEN
--          UPDATE dynamic_parameter_weights SET weight = _new_weight ...
--    یعنی نسخهٔ در حال اجرا پاک می‌شد و هیچ ردی نمی‌ماند که وزن قبلی چه بود.
--    این همان موردی است که سند مأموریت نام برده.
--
-- ۲) شاخهٔ else هم عملاً **عطف به ماسبق** بود — سند مأموریت این را نگفته بود و
--    اینجا پیدا شد. نسخهٔ تازه را با `valid_from = v_month` درج می‌کرد، یعنی
--    **اول همین ماه**. پس تغییر وزن در ۳ مرداد، وزن را از ۱ مرداد اعمال می‌کرد و
--    امتیازهای از پیش محاسبه‌شدهٔ همان ماه را تغییر می‌داد. وضعیت امروزِ داده
--    دقیقاً همین شاخه را فعال می‌کرد: هر ۱۶ ردیف `valid_from = 2026-07-01` و باز
--    هستند، پس هیچ‌کدام در شاخهٔ (۱) نمی‌افتادند و همه از این مسیر عطف‌به‌ماسبق
--    می‌شدند. رفع فقط شاخهٔ (۱) مشکل را حل نمی‌کرد.
--
-- ۳) پس از هر تغییر وزن، `run_daily_capital_allocation` **بی‌صدا دوباره اجرا**
--    می‌شد و تخصیص سرمایهٔ همان روز را بازنویسی می‌کرد.
--
-- ── رفتار تازه ────────────────────────────────────────────────────────
--
--   نسخه‌ای که «در حال اجرا» است هرگز ویرایش نمی‌شود. تغییر وزن همیشه نسخهٔ
--   تازه‌ای با `valid_from` = **اول ماه بعد** می‌سازد و نسخهٔ جاری را در
--   `valid_to = آخر ماه جاری` می‌بندد. امتیازهای ماه جاری دست‌نخورده می‌مانند.
--
--   استثنای عمدی و امن: اگر نسخه‌ای **در انتظار** (valid_from > امروز) وجود
--   داشته باشد، همان به‌روزرسانی می‌شود. آن نسخه هرگز اجرا نشده و هیچ عددی از
--   رویش حساب نشده، پس ویرایشش تاریخ را خراب نمی‌کند. این همان «رویداد اصلاح»
--   سند است: مدیر می‌تواند وزنی را که اشتباه تایپ کرده تا پیش از اجرایی‌شدن
--   اصلاح کند، بدون آنکه سه نسخهٔ هم‌تاریخ ساخته شود. هر اصلاح ردیف audit
--   جداگانهٔ خودش را دارد (`parameter_weight_correction`).
--
--   Bootstrap: اگر پارامتر هنوز هیچ نسخه‌ای ندارد، اولین نسخه از همین ماه
--   اجرایی می‌شود — چیزی از رویش حساب نشده که خراب شود.
--
--   اجرای خودکار تخصیص سرمایه **حذف شد**. حالا که تغییر وزن روی ماه جاری اثری
--   ندارد، اجرای دوبارهٔ تخصیص فقط ۱۸۲ ردیف تخصیص را بی‌دلیل می‌چرخاند.
--   تخصیص ماه بعد به‌طور طبیعی وزن تازه را می‌بیند.
--
-- ── تغییر امضا ────────────────────────────────────────────────────────
-- خروجی از void به jsonb تغییر می‌کند تا UI بتواند بگوید «از چه تاریخی اعمال
-- می‌شود». تغییر نوع خروجی در PostgreSQL نیازمند DROP است (قاعدهٔ ۵ سند: نسخهٔ
-- قبلی را در همان مهاجرت drop کن تا overload مبهم نماند).
-- =====================================================================

DROP FUNCTION IF EXISTS public.upsert_dynamic_parameter_weight(uuid, numeric, boolean);

CREATE OR REPLACE FUNCTION public.upsert_dynamic_parameter_weight(
  _parameter_id  uuid,
  _new_weight    numeric,
  _new_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_before jsonb;
  v_cur_weight numeric;
  v_cur_row_id uuid;
  v_pending_row_id uuid;
  v_pending_weight numeric;
  v_today date := CURRENT_DATE;
  v_month date := date_trunc('month', CURRENT_DATE)::date;
  v_next_month date := (date_trunc('month', CURRENT_DATE) + interval '1 month')::date;
  v_effective_from date;
  v_outcome text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') OR public.has_role(v_uid,'accountant')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _new_weight IS NULL OR _new_weight < 0 OR _new_weight > 1 THEN
    RAISE EXCEPTION 'INVALID_WEIGHT';
  END IF;

  SELECT jsonb_build_object(
    'is_active', p.is_active,
    'weight', (SELECT w.weight FROM public.dynamic_parameter_weights w
               WHERE w.parameter_id = p.id AND w.valid_to IS NULL
               ORDER BY w.valid_from DESC LIMIT 1)
  )
  INTO v_before
  FROM public.dynamic_scoring_parameters p
  WHERE p.id = _parameter_id;

  IF v_before IS NULL THEN RAISE EXCEPTION 'PARAMETER_NOT_FOUND'; END IF;

  -- is_active still applies immediately: it is an on/off switch on the parameter
  -- itself, not a versioned numeric input to a historical score.
  UPDATE public.dynamic_scoring_parameters
     SET is_active = _new_is_active, updated_at = now()
   WHERE id = _parameter_id;

  -- A version that has NOT taken effect yet (scheduled for a future date).
  SELECT id, weight INTO v_pending_row_id, v_pending_weight
    FROM public.dynamic_parameter_weights
   WHERE parameter_id = _parameter_id
     AND valid_to IS NULL
     AND valid_from > v_today
   ORDER BY valid_from DESC LIMIT 1;

  -- The version currently in force.
  SELECT id, weight INTO v_cur_row_id, v_cur_weight
    FROM public.dynamic_parameter_weights
   WHERE parameter_id = _parameter_id
     AND valid_to IS NULL
     AND valid_from <= v_today
   ORDER BY valid_from DESC LIMIT 1;

  IF v_pending_row_id IS NOT NULL THEN
    -- Correct the not-yet-effective version in place. Safe: nothing has ever
    -- been computed from it.
    v_effective_from := (SELECT valid_from FROM public.dynamic_parameter_weights
                          WHERE id = v_pending_row_id);
    IF v_pending_weight <> _new_weight THEN
      UPDATE public.dynamic_parameter_weights
         SET weight = _new_weight, created_by = v_uid
       WHERE id = v_pending_row_id;
      v_outcome := 'pending_version_corrected';

      INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
      VALUES (v_uid, 'dynamic_scoring_parameter', _parameter_id, 'parameter_weight_correction',
              jsonb_build_object(
                'corrected_version_id', v_pending_row_id,
                'from_weight', v_pending_weight,
                'to_weight', _new_weight,
                'effective_from', v_effective_from,
                'note', 'pending version corrected before it took effect'));
    ELSE
      v_outcome := 'unchanged';
    END IF;

  ELSIF v_cur_row_id IS NULL THEN
    -- Bootstrap: first ever weight for this parameter, effective now.
    INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
    VALUES (_parameter_id, _new_weight, v_month, v_uid);
    v_effective_from := v_month;
    v_outcome := 'bootstrapped';

  ELSIF v_cur_weight <> _new_weight THEN
    -- The in-force version is CLOSED, never rewritten. The new value takes
    -- effect at the next period boundary.
    UPDATE public.dynamic_parameter_weights
       SET valid_to = v_next_month - 1
     WHERE id = v_cur_row_id;

    INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
    VALUES (_parameter_id, _new_weight, v_next_month, v_uid);
    v_effective_from := v_next_month;
    v_outcome := 'scheduled_next_period';

  ELSE
    v_effective_from := NULL;
    v_outcome := 'unchanged';
  END IF;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'dynamic_scoring_parameter', _parameter_id, 'parameter_weight_upserted',
          jsonb_build_object('before', v_before,
                             'after', jsonb_build_object('is_active', _new_is_active, 'weight', _new_weight),
                             'outcome', v_outcome,
                             'effective_from', v_effective_from));

  -- NOTE: the automatic run_daily_capital_allocation() re-run that used to live
  -- here was REMOVED (migration 266). A weight change no longer affects the
  -- current period, so re-running allocation would only churn existing rows.

  RETURN jsonb_build_object(
    'outcome', v_outcome,
    'effective_from', v_effective_from,
    'weight', _new_weight,
    'is_active', _new_is_active
  );
END;
$function$;

COMMENT ON FUNCTION public.upsert_dynamic_parameter_weight(uuid, numeric, boolean) IS
  'Weight changes never rewrite a version that is or was in force (migration 266, D8-4). A change closes the current version and schedules a new one from the next period boundary; a version that has not taken effect yet may still be corrected in place. Does NOT re-run capital allocation.';

REVOKE EXECUTE ON FUNCTION public.upsert_dynamic_parameter_weight(uuid, numeric, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_dynamic_parameter_weight(uuid, numeric, boolean) TO authenticated;
