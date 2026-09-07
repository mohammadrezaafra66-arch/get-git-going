SET client_encoding='UTF8';

-- 508 — حذف ردیف باقی‌مانده‌ی تخصیص (residue) بر اساس تصمیم مالک D-55
--
-- زمینه:
--   جدول public.allocation_rows در زمان نوشتن این مهاجرت دقیقاً یک ردیف داشت:
--     b8e9286c-26cb-4211-a434-39630466a4e5 · IR-UI-DRIVE · 1000 · «شنبه واریز می‌کنه» · 2026-09-06
--   این ردیف باقی‌مانده‌ی کار موج ۵ است و داده‌ی کسب‌وکاری واقعی نیست.
--
-- چرا حذف با مهاجرت و نه با psql تعاملی:
--   هیچ RPC حذفی برای این جدول وجود ندارد — مجموعه‌ی توابع فقط
--   create_allocation_row / update_allocation_row / set_allocation_row_status /
--   list_allocation_rows است. پس مسیر درست یک DELETE مستقیم است که از همان
--   تریگر ممیزی موجود عبور می‌کند، و به شکل مهاجرت ثبت می‌شود تا ردی از آن بماند.
--
-- ممیزی — این نکته عمداً حفظ شده است:
--   trg_allocation_rows_audit_delete (AFTER DELETE FOR EACH ROW) خودش یک ردیف
--   'allocation_deleted' در public.audit_logs می‌نویسد. چهار ردیف ممیزی قبلی این
--   موجودیت (64654 allocation_created، 64655/64656 allocation_status_changed،
--   64657 allocation_updated) پاک نمی‌شوند و نباید پاک شوند — D-55 صراحتاً نگه
--   داشتن آن‌ها را خواسته است. audit_logs.entity_id از نوع text است و هیچ کلید
--   خارجی به allocation_rows ندارد، پس حذف ردیف هیچ ردیف ممیزی را cascade نمی‌کند.
--
--   actor_id این ردیف پنجم NULL خواهد بود، چون مهاجرت بدون JWT اجرا می‌شود و
--   auth.uid() در نبود claims مقدار NULL برمی‌گرداند. این عمدی است: حذف را یک
--   عملیات سیستمی انجام داده، نه یک کاربر، و نسبت دادن آن به یک شخص واقعی نادرست
--   می‌بود.
--
-- استثنای قاعده‌ی «DELETE روی جدول دارای داده ممنوع است»:
--   این حذف با تصمیم صریح مالک D-55 مجاز شده و فقط همین یک شناسه را هدف می‌گیرد.

DO $$
DECLARE
  _deleted integer;
  _before  integer;
BEGIN
  SELECT count(*) INTO _before FROM public.allocation_rows;

  DELETE FROM public.allocation_rows
   WHERE id = 'b8e9286c-26cb-4211-a434-39630466a4e5'::uuid;

  GET DIAGNOSTICS _deleted = ROW_COUNT;

  -- اگر ردیف قبلاً حذف شده باشد این مهاجرت بی‌اثر است و نباید شکست بخورد؛
  -- ولی حذف شدنِ بیش از یک ردیف یعنی چیزی از فرض ما غلط است.
  IF _deleted > 1 THEN
    RAISE EXCEPTION 'D-55: انتظار حذف حداکثر یک ردیف بود، % ردیف حذف شد', _deleted;
  END IF;

  RAISE NOTICE 'D-55: allocation_rows قبل=% ، حذف‌شده=%', _before, _deleted;
END
$$;
