SET client_encoding='UTF8';

-- =====================================================================
-- 270 — کارمندان به مدل شخص وصل می‌شوند، فقط افزودنی (فاز ۴ · تصمیم D8-3)
--
-- تصمیم مالک (D8-3، گزینهٔ «الف»): بله، ولی **فقط افزودنی**. هیچ ستون یا کلید
-- موجودی جابه‌جا نمی‌شود و هیچ جدول `employee_*` بازساختاردهی نمی‌شود.
--
-- ── گام ۱ سند: شکل واقعی سمت کارمند، پیش از هر تغییر ─────────────────
--
-- `profiles` — ۴۱ ردیف، کلیدش همان `auth.users.id` است. ستون‌های هویتی‌اش:
--   full_name (۴۱ پر)، phone (**فقط ۱۴ پر**)، birth_date، position، status،
--   is_active. یعنی نقطهٔ اتصال حساب کاربری به انسان همین جدول است.
--
-- ۱۲ جدول مرتبط با دادهٔ کارمند وجود دارد (همان حدودی که ممیزی گفته بود):
--   employee_achievements، employee_leagues، employee_level_up_events،
--   employee_mission_progress، employee_monthly_hours، employee_profiles،
--   employee_progress، employee_score_events، employee_scores،
--   employee_streaks، staff_daily_performance_metrics، و profiles.
--   **هیچ‌کدام در این فاز لمس نمی‌شوند.** همه با `employee_id`/`user_id` به
--   `auth.users` وصل‌اند و همان‌طور می‌مانند.
--
-- `persons` — ۳۰ ردیف و **هیچ ستونی که به auth.users یا profiles وصل باشد**.
--   این همان شکافی است که بند «شخص بتواند رکورد خودش را ببیند» در مهاجرت ۲۶۴
--   به‌خاطرش به این فاز موکول شد.
--
-- ── زمینهٔ اتصال: `staff_link` — نوع تازه‌ای ساخته نشد ────────────────
-- `PERSON_CONTEXT_KINDS` و CHECK جدول از قبل `staff_link` را دارند (استفاده‌نشده،
-- ۰ ردیف). قاعدهٔ ۱۴ سند: وقتی پیاده‌سازی موجود هست، موازی نساز.
-- زمینه‌های امروز: customer ۱۴، supplier ۱۵، accounting_party ۱.
--
-- ── تطبیق هویت: matcher دوم نوشته نشد ────────────────────────────────
-- سند صریح است: «همان منطق تطبیقی که `person_import_batch` استفاده می‌کند».
-- آن تابع `public.person_find_by_identifiers(jsonb)` است و همین‌جا هم همان
-- صدا زده می‌شود — با همان بررسی `conflict` که آنجا هم هست.
--
-- ── پیش‌بینی backfill (اندازه‌گیری‌شده، نه حدس) ───────────────────────
--   ۴۱ profile  =  **۲ لینک‌شده  +  ۳۹ ساخته‌شده**
--   هیچ دو profileای شمارهٔ یکسان ندارند (بررسی شد ⇒ ۰ گروه تکراری).
--
-- ── ⚠️ دو موردی که مالک باید تأیید کند ───────────────────────────────
-- هر دو «لینک‌شده» شماره‌شان با شخص موجود می‌خورد ولی **نامشان نمی‌خورد**:
--
--   profile «پورچیستا سعادت مبارکی» (۰۹۹۰۳۸۵۸۶۵۴) ⇒ شخص «12» (تأمین‌کننده)
--   profile «حانیه ماهرو»          (۰۹۰۲۶۰۰۹۸۹۸) ⇒ شخص «محمدزین الدین» (مشتری)
--
-- چرا با این حال لینک می‌شوند: از مهاجرت ۲۴۱ (فاز ۸.۴) موبایل **کلید هویت
-- سراسری** این سامانه است — یک موبایل = یک شخص. کنار گذاشتن آن کلید به‌نفع
-- مقایسهٔ نام، دقیقاً یعنی نوشتن matcher دوم که سند منع کرده. ضمناً کل هدف مدل
-- شخص یکپارچه این است که «یک انسان می‌تواند هم‌زمان کارمند و مشتری باشد».
--
-- چرا این کار خطرناک **نیست**: این فاز افزودنی و برگشت‌پذیر است. `person_id`
-- روی `profiles` nullable است، هیچ کلید خارجی جابه‌جا نشده، و **هیچ عدد
-- اعتباری به profiles کلید نخورده** — اعتبار روی `customers`/`customer_id`
-- محاسبه می‌شود. پس لینک‌کردن یک profile هیچ پولی را جابه‌جا نمی‌کند.
-- برابری عددی اعتبار پیش و پس از این مهاجرت آزموده و گزارش شده است.
--
-- اگر مالک بگوید این دو یکی نیستند، اصلاحش یک `UPDATE` ساده روی
-- `profiles.person_id` است (به‌علاوهٔ ساخت شخص تازه) — چیزی نابود نشده.
--
-- ── آنچه عمداً انجام **نشد** ─────────────────────────────────────────
-- `NOT NULL` اعمال نشد و هیچ FK موجودی repoint نشد (خواستهٔ صریح D8-3).
-- برای اجباری‌کردن در فازی دیگر لازم است: (۱) هر profile تازه در لحظهٔ ساخت
-- شخص بگیرد — یعنی مسیر ثبت‌نام/تأیید کاربر باید به `person_create_*` وصل شود،
-- (۲) تکلیف profileهای بدون شماره و بدون نام معتبر روشن شود، و (۳) تازه بعد
-- `SET NOT NULL`. هیچ‌کدام کار این فاز نیست.
-- =====================================================================

-- ── ۱) ستون اتصال ────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id);

COMMENT ON COLUMN public.profiles.person_id IS
  'D8-3 (migration 270): links a user account to its person record. Nullable on purpose -- this phase is additive only. Making it mandatory needs the signup path to create a person first; see the migration header.';

CREATE INDEX IF NOT EXISTS idx_profiles_person_id
  ON public.profiles (person_id) WHERE person_id IS NOT NULL;

-- ── ۲) backfill ──────────────────────────────────────────────────────
DO $backfill$
DECLARE
  r         record;
  _idents   jsonb;
  _match    jsonb;
  _pid      uuid;
  _linked   int := 0;
  _created  int := 0;
  _name     text;
BEGIN
  FOR r IN
    SELECT id, full_name, phone
      FROM public.profiles
     WHERE person_id IS NULL
     ORDER BY created_at, id
  LOOP
    _idents := CASE
      WHEN r.phone IS NOT NULL AND btrim(r.phone) <> ''
        THEN jsonb_build_array(jsonb_build_object('kind','mobile_e164','value_raw', btrim(r.phone)))
      ELSE '[]'::jsonb
    END;

    -- The SAME matcher person_import_batch uses. No second implementation.
    _match := public.person_find_by_identifiers(_idents);

    IF COALESCE((_match->>'conflict')::boolean, false) THEN
      RAISE EXCEPTION
        'profile % به بیش از یک شخص موجود اشاره می‌کند؛ backfill متوقف شد تا دستی تعیین تکلیف شود.', r.id
        USING ERRCODE = '22023';
    END IF;

    _pid := (_match->>'person_id')::uuid;

    IF _pid IS NULL THEN
      _name := NULLIF(btrim(COALESCE(r.full_name, '')), '');
      IF _name IS NULL THEN
        _name := 'کاربر بدون نام';
      END IF;

      INSERT INTO public.persons (kind, display_name, visibility_scope, is_active)
      VALUES ('individual', _name, 'internal_general', true)
      RETURNING id INTO _pid;

      IF _idents <> '[]'::jsonb THEN
        INSERT INTO public.person_identifiers (person_id, kind, value_raw)
        VALUES (_pid, 'mobile_e164', btrim(r.phone));
      END IF;

      _created := _created + 1;
    ELSE
      _linked := _linked + 1;
    END IF;

    UPDATE public.profiles SET person_id = _pid WHERE id = r.id;

    INSERT INTO public.person_context_links (
      person_id, context_kind, ref_table, ref_id, started_at
    )
    VALUES (_pid, 'staff_link', 'profiles', r.id, now())
    ON CONFLICT DO NOTHING;
  END LOOP;

  RAISE NOTICE 'D8-3 backfill: % linked to an existing person, % new persons created', _linked, _created;
END
$backfill$;
