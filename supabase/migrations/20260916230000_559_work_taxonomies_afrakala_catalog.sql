SET client_encoding TO 'UTF8';

-- ============================================================================
-- 559 — Calm Mind: AfraKala work_taxonomies catalog (groups / sections / kind_labels)
-- ============================================================================
-- Replaces the thin 551 seed with the AfraKala-oriented catalog:
--   groups:   فروش، مالی، کالا / قیمت، خرید، پشتیبانی / IT، عملیات / تلفن،
--             عمومی + توسعه + پیگیری مشتری
--   sections: تیکت، میز فروش، جستجوی سریع فروش، پیش‌فاکتور، اشخاص / مشتری،
--             مطالبات / دریافت، کالا، قیمت‌گذاری / قیمت سریع، خرید،
--             فعالیت تلفنی / ایزابل، توروب، کاربران / دسترسی، عمومی
--   kind_labels: سؤال، درخواست تغییر، باگ، یادداشت، پیشنهاد بهبود،
--                انتقاد / گزارش مشکل
--
-- Soft-deletes live rows that are not in the target set (e.g. دستیار، پشتیبانی،
-- مطالبات) then upserts the target names with stable sort_order.
-- Idempotent. No schema change to work_items (names remain free text).
-- ============================================================================

SET lock_timeout = '60s';

DO $mig559$
DECLARE
  n_groups int;
  n_sections int;
  n_labels int;
BEGIN
  IF to_regclass('public.work_taxonomies') IS NULL THEN
    RAISE EXCEPTION '559: work_taxonomies missing (apply 551 first)';
  END IF;

  -- Soft-delete live rows that are not in the target catalog
  UPDATE public.work_taxonomies t
     SET deleted_at = now(),
         is_active = false,
         updated_at = now()
   WHERE t.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM (VALUES
           ('group', 'عمومی'),
           ('group', 'فروش'),
           ('group', 'مالی'),
           ('group', 'کالا / قیمت'),
           ('group', 'خرید'),
           ('group', 'پشتیبانی / IT'),
           ('group', 'عملیات / تلفن'),
           ('group', 'توسعه'),
           ('group', 'پیگیری مشتری'),
           ('section', 'تیکت'),
           ('section', 'میز فروش'),
           ('section', 'جستجوی سریع فروش'),
           ('section', 'پیش‌فاکتور'),
           ('section', 'اشخاص / مشتری'),
           ('section', 'مطالبات / دریافت'),
           ('section', 'کالا'),
           ('section', 'قیمت‌گذاری / قیمت سریع'),
           ('section', 'خرید'),
           ('section', 'فعالیت تلفنی / ایزابل'),
           ('section', 'توروب'),
           ('section', 'کاربران / دسترسی'),
           ('section', 'عمومی'),
           ('kind_label', 'سؤال'),
           ('kind_label', 'درخواست تغییر'),
           ('kind_label', 'باگ'),
           ('kind_label', 'یادداشت'),
           ('kind_label', 'پیشنهاد بهبود'),
           ('kind_label', 'انتقاد / گزارش مشکل')
         ) AS keep(kind, name)
        WHERE keep.kind = t.kind
          AND keep.name = t.name
     );

  -- Insert missing target rows
  INSERT INTO public.work_taxonomies (kind, name, sort_order, is_active)
  SELECT v.kind, v.name, v.sort_order, true
    FROM (VALUES
      ('group'::text, 'عمومی'::text, 10),
      ('group', 'فروش', 20),
      ('group', 'مالی', 30),
      ('group', 'کالا / قیمت', 35),
      ('group', 'خرید', 37),
      ('group', 'پشتیبانی / IT', 40),
      ('group', 'عملیات / تلفن', 45),
      ('group', 'توسعه', 50),
      ('group', 'پیگیری مشتری', 60),
      ('section', 'تیکت', 10),
      ('section', 'میز فروش', 20),
      ('section', 'جستجوی سریع فروش', 30),
      ('section', 'پیش‌فاکتور', 40),
      ('section', 'اشخاص / مشتری', 50),
      ('section', 'مطالبات / دریافت', 60),
      ('section', 'کالا', 70),
      ('section', 'قیمت‌گذاری / قیمت سریع', 80),
      ('section', 'خرید', 90),
      ('section', 'فعالیت تلفنی / ایزابل', 100),
      ('section', 'توروب', 110),
      ('section', 'کاربران / دسترسی', 120),
      ('section', 'عمومی', 130),
      ('kind_label', 'سؤال', 10),
      ('kind_label', 'درخواست تغییر', 20),
      ('kind_label', 'باگ', 30),
      ('kind_label', 'یادداشت', 40),
      ('kind_label', 'پیشنهاد بهبود', 50),
      ('kind_label', 'انتقاد / گزارش مشکل', 60)
    ) AS v(kind, name, sort_order)
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.work_taxonomies t
      WHERE t.kind = v.kind
        AND t.name = v.name
        AND t.deleted_at IS NULL
   );

  -- Align sort_order + reactivate for every live target row
  UPDATE public.work_taxonomies t
     SET sort_order = v.sort_order,
         is_active = true,
         updated_at = now()
    FROM (VALUES
      ('group'::text, 'عمومی'::text, 10),
      ('group', 'فروش', 20),
      ('group', 'مالی', 30),
      ('group', 'کالا / قیمت', 35),
      ('group', 'خرید', 37),
      ('group', 'پشتیبانی / IT', 40),
      ('group', 'عملیات / تلفن', 45),
      ('group', 'توسعه', 50),
      ('group', 'پیگیری مشتری', 60),
      ('section', 'تیکت', 10),
      ('section', 'میز فروش', 20),
      ('section', 'جستجوی سریع فروش', 30),
      ('section', 'پیش‌فاکتور', 40),
      ('section', 'اشخاص / مشتری', 50),
      ('section', 'مطالبات / دریافت', 60),
      ('section', 'کالا', 70),
      ('section', 'قیمت‌گذاری / قیمت سریع', 80),
      ('section', 'خرید', 90),
      ('section', 'فعالیت تلفنی / ایزابل', 100),
      ('section', 'توروب', 110),
      ('section', 'کاربران / دسترسی', 120),
      ('section', 'عمومی', 130),
      ('kind_label', 'سؤال', 10),
      ('kind_label', 'درخواست تغییر', 20),
      ('kind_label', 'باگ', 30),
      ('kind_label', 'یادداشت', 40),
      ('kind_label', 'پیشنهاد بهبود', 50),
      ('kind_label', 'انتقاد / گزارش مشکل', 60)
    ) AS v(kind, name, sort_order)
   WHERE t.kind = v.kind
     AND t.name = v.name
     AND t.deleted_at IS NULL
     AND (t.sort_order IS DISTINCT FROM v.sort_order OR t.is_active IS DISTINCT FROM true);

  SELECT count(*) INTO n_groups
    FROM public.work_taxonomies
   WHERE kind = 'group' AND deleted_at IS NULL AND is_active;
  SELECT count(*) INTO n_sections
    FROM public.work_taxonomies
   WHERE kind = 'section' AND deleted_at IS NULL AND is_active;
  SELECT count(*) INTO n_labels
    FROM public.work_taxonomies
   WHERE kind = 'kind_label' AND deleted_at IS NULL AND is_active;

  IF n_groups <> 9 THEN
    RAISE EXCEPTION '559: expected 9 live groups, got %', n_groups;
  END IF;
  IF n_sections <> 13 THEN
    RAISE EXCEPTION '559: expected 13 live sections, got %', n_sections;
  END IF;
  IF n_labels <> 6 THEN
    RAISE EXCEPTION '559: expected 6 live kind_labels, got %', n_labels;
  END IF;
END;
$mig559$;
