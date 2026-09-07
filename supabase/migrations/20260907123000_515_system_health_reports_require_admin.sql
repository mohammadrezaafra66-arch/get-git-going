SET client_encoding='UTF8';

-- 515 - H-10: سه گزارشِ SECURITY DEFINER که هیچ گاردی نداشتند
--
-- مسئله (اندازه‌گیری‌شده روی کاتالوگ زنده، پیش از این مهاجرت):
--   person_fk_drift_report        | secdef=true | anon=false | authenticated=true | guarded=false
--   polymorphic_ref_orphan_report | secdef=true | anon=false | authenticated=true | guarded=false
--   validate_journal_entry_balance| secdef=true | anon=false | authenticated=true | guarded=false
--   یعنی در بدنه‌ی هیچ‌کدام has_role و has_any_role و auth.uid() و RAISE 42501 نبود.
--   چون SECURITY DEFINER هستند، خواندن‌شان از RLS جدول journal_lines عبور می‌کند؛ پس هر
--   دارنده‌ی یک JWT از نوع authenticated می‌توانست مستقیم
--   POST /rest/v1/rpc/validate_journal_entry_balance بزند و جمع بدهکار/بستانکار هر سند را
--   بخواند. صفحه‌ی _app.admin.system-health تنها فراخواننده است و گاردش
--   client-side است: route-guards.ts:16 وقتی window تعریف نشده باشد null برمی‌گرداند و
--   requireAdmin آن را قبول می‌شمارد. طبق قواعد این پروژه گارد صرفاً سمت کلاینت کافی نیست.
--
-- چرا گارد داخل بدنه و نه فقط باریک‌کردن grant:
--   PostgREST هر کاربر واردشده را با نقش پستگرسی authenticated اجرا می‌کند و
--   admin/manager فقط سطر در user_roles هستند، نه نقش پستگرس. پس هیچ تنظیم grant ای
--   نمی‌تواند «مدیر سیستم» را از «فروشنده» جدا کند؛ باریک‌کردن grant یا صفحه را برای
--   مدیر هم می‌بست یا حفره را باز می‌گذاشت. گارد باید داخل بدنه باشد.
--
-- تغییر زبان از sql به plpgsql - عمدی، و بررسی‌شده:
--   زبان sql نمی‌تواند RAISE کند؛ تنها جایگزینش این بود که شرط را داخل WHERE ببریم و
--   نتیجه‌ی خالی برگردانیم، که «رد شدن» را با «هیچ اشکالی نیست» اشتباه می‌کند - دقیقاً
--   همان ابهامی که یک گزارش سلامت نباید داشته باشد. پس بدنه‌ها به plpgsql منتقل شدند و
--   خطای 42501 صریح می‌دهند، هم‌شکل با list_allocation_rows و create_allocation_row.
--   بهای این کار از دست رفتن inlining برنامه‌ریز است. اندازه‌گیری شد: هیچ تابع و هیچ view
--   دیگری در دیتابیس به این سه ارجاع نمی‌دهد (صفر ارجاع) و هیچ spec ای صدایشان نمی‌زند،
--   پس inlining هیچ مصرف‌کننده‌ای نداشت. STABLE و امضا و نوع بازگشتی دست‌نخورده ماندند.
--
-- تصمیم درباره‌ی نبود نشست - و چرا برخلاف مهاجرت ۵۱۱ است:
--   اینجا fail-closed است: auth.uid() برابر NULL یعنی has_role نادرست و درخواست رد می‌شود.
--   در ۵۱۱ عکس این را انتخاب کردم، چون آنجا نویسندگان بی‌JWTِ مشروعی وجود داشتند
--   (مهاجرت، cron، service_role). اینجا هیچ فراخواننده‌ی بی‌JWT ای وجود ندارد - صفر ارجاع
--   داخل دیتابیس - و داده هم جزئیات مالی هر سند است. پس بستن، هزینه‌ای ندارد.
--
-- متن پرس‌وجوها عیناً از تعریف زنده برداشته شده و یک کلمه‌اش هم عوض نشده؛ تنها پوسته‌ی
-- گارد دورشان اضافه شده است.

CREATE OR REPLACE FUNCTION public.person_fk_drift_report()
RETURNS TABLE(table_name text, drifted_rows bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'دسترسی به گزارش سلامت سامانه فقط برای مدیر سیستم مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  -- Phase 5 (migration 231)
  SELECT 'sales_quotes'::text, count(*)
    FROM public.sales_quotes q
    LEFT JOIN public.customers c ON c.id = q.customer_id
   WHERE q.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'purchases'::text, count(*)
    FROM public.purchases p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
   WHERE p.supplier_person_id IS DISTINCT FROM s.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'payment_vouchers'::text, count(*)
    FROM public.payment_vouchers v
    LEFT JOIN public.suppliers s ON s.id = v.payee_supplier_id
    LEFT JOIN public.customers c ON c.id = v.payee_customer_id
    LEFT JOIN public.external_parties ep ON ep.id = v.payee_party_id
   WHERE v.payee_person_id IS DISTINCT FROM coalesce(s.person_id, c.person_id, ep.person_id)
  HAVING count(*) > 0
  -- Phase 7.1 (Group A, migration 235)
  UNION ALL
  SELECT 'product_suppliers'::text, count(*)
    FROM public.product_suppliers ps
    LEFT JOIN public.suppliers s ON s.id = ps.supplier_id
   WHERE ps.supplier_person_id IS DISTINCT FROM s.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'purchase_prices'::text, count(*)
    FROM public.purchase_prices pp
    LEFT JOIN public.suppliers s ON s.id = pp.supplier_id
   WHERE pp.supplier_person_id IS DISTINCT FROM s.person_id
  HAVING count(*) > 0
  -- Phase 7.2 (Group B, migration 236)
  UNION ALL
  SELECT 'payment_receipts.customer'::text, count(*)
    FROM public.payment_receipts pr
    LEFT JOIN public.customers c ON c.id = pr.customer_id
   WHERE pr.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'payment_receipts.receiver_party'::text, count(*)
    FROM public.payment_receipts pr
    LEFT JOIN public.external_parties ep ON ep.id = pr.receiver_party_id
   WHERE pr.receiver_party_person_id IS DISTINCT FROM ep.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'delivery_receipts'::text, count(*)
    FROM public.delivery_receipts dr
    LEFT JOIN public.customers c ON c.id = dr.customer_id
   WHERE dr.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  -- Phase 7.3 (Group C, migration 237)
  UNION ALL
  SELECT 'credit_requests'::text, count(*)
    FROM public.credit_requests x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'credit_score_snapshots'::text, count(*)
    FROM public.credit_score_snapshots x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_capital_allocations_dynamic'::text, count(*)
    FROM public.customer_capital_allocations_dynamic x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_credit_balance'::text, count(*)
    FROM public.customer_credit_balance x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_credit_ledger'::text, count(*)
    FROM public.customer_credit_ledger x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  UNION ALL
  SELECT 'customer_credit_profile'::text, count(*)
    FROM public.customer_credit_profile x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0
  -- 331: the 'invoices' drift arm was removed with the table. It reported rows whose
  -- customer_person_id had drifted from customers.person_id; with 0 rows it never
  -- reported anything. Every other table is still checked.
  UNION ALL
  SELECT 'didar_activities'::text, count(*)
    FROM public.didar_activities x LEFT JOIN public.customers c ON c.id = x.customer_id
   WHERE x.customer_person_id IS DISTINCT FROM c.person_id
  HAVING count(*) > 0;
END
$function$;

CREATE OR REPLACE FUNCTION public.polymorphic_ref_orphan_report()
RETURNS TABLE(source_table text, kind text, problem text, rows bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'دسترسی به گزارش سلامت سامانه فقط برای مدیر سیستم مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 'stock_movements'::text, sm.ref_type, 'orphan'::text, count(*)
    FROM public.stock_movements sm
   WHERE sm.ref_id IS NOT NULL
     AND ((sm.ref_type = 'purchase'
           AND NOT EXISTS (SELECT 1 FROM public.purchases t WHERE t.id = sm.ref_id))
      OR  (sm.ref_type = 'sale_quote_confirm'
           AND NOT EXISTS (SELECT 1 FROM public.sales_quotes t WHERE t.id = sm.ref_id))
      OR  (sm.ref_type = 'transfer'
           AND NOT EXISTS (SELECT 1 FROM public.stock_transfers t WHERE t.id = sm.ref_id)))
   GROUP BY 2
  HAVING count(*) > 0

  UNION ALL
  SELECT 'stock_movements'::text, sm.ref_type, 'unmapped_kind_with_ref'::text, count(*)
    FROM public.stock_movements sm
   WHERE sm.ref_id IS NOT NULL
     AND sm.ref_type IS NOT NULL
     AND sm.ref_type NOT IN ('purchase', 'sale_quote_confirm', 'transfer')
   GROUP BY 2
  HAVING count(*) > 0

  UNION ALL
  SELECT 'journal_lines'::text, jl.account_kind, 'orphan'::text, count(*)
    FROM public.journal_lines jl
   WHERE jl.account_ref_id IS NOT NULL
     AND ((jl.account_kind = 'customer_credit'
           AND NOT EXISTS (SELECT 1 FROM public.customers t WHERE t.id = jl.account_ref_id))
      OR  (jl.account_kind = 'bank'
           AND NOT EXISTS (SELECT 1 FROM public.bank_accounts t WHERE t.id = jl.account_ref_id))
      OR  (jl.account_kind = 'external_party'
           AND NOT EXISTS (SELECT 1 FROM public.external_parties t WHERE t.id = jl.account_ref_id))
      OR  (jl.account_kind = 'supplier_payable'
           AND NOT EXISTS (SELECT 1 FROM public.suppliers t WHERE t.id = jl.account_ref_id)))
   GROUP BY 2
  HAVING count(*) > 0

  UNION ALL
  SELECT 'journal_lines'::text, jl.account_kind, 'unmapped_kind_with_ref'::text, count(*)
    FROM public.journal_lines jl
   WHERE jl.account_ref_id IS NOT NULL
     AND jl.account_kind NOT IN ('customer_credit', 'bank', 'external_party', 'supplier_payable')
   GROUP BY 2
  HAVING count(*) > 0;
END
$function$;

CREATE OR REPLACE FUNCTION public.validate_journal_entry_balance(p_journal_entry_id uuid)
RETURNS TABLE(total_debit numeric, total_credit numeric, is_balanced boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'دسترسی به گزارش سلامت سامانه فقط برای مدیر سیستم مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(debit), 0)  AS total_debit,
    COALESCE(SUM(credit), 0) AS total_credit,
    COALESCE(SUM(debit), 0) = COALESCE(SUM(credit), 0)
      AND COALESCE(SUM(debit), 0) > 0 AS is_balanced
  FROM public.journal_lines
  WHERE journal_entry_id = p_journal_entry_id;
END
$function$;

-- --------------------------------------------------------------- مجوزها
-- با نقش supabase_admin که مالک هر سه تابع است اجرا می‌شود؛ REVOKE ای که نقش postgres
-- روی تابعِ متعلق به supabase_admin صادر کند بی‌صدا بی‌اثر است. نتیجه‌ی proacl پایین
-- assert می‌شود، نه صرفِ اجرا شدن REVOKE. anon همچنان بسته می‌ماند و هیچ‌چیز باز نمی‌شود.
REVOKE ALL ON FUNCTION public.person_fk_drift_report() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.polymorphic_ref_orphan_report() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_journal_entry_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_fk_drift_report() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.polymorphic_ref_orphan_report() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_journal_entry_balance(uuid) TO authenticated, service_role;

-- --------------------------------------------------------------- assertها
DO $do$
DECLARE
  _n integer;
  _bad text;
BEGIN
  -- الف) هر سه بدنه حالا گارد نقش دارند
  SELECT string_agg(p.proname, ', ') INTO _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('person_fk_drift_report','polymorphic_ref_orphan_report',
                       'validate_journal_entry_balance')
     AND pg_get_functiondef(p.oid) NOT LIKE '%42501%';
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'H-10: این توابع هنوز بی‌گاردند: %', _bad;
  END IF;

  -- ب) overload ساخته نشده - هر نام دقیقاً یک نسخه
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('person_fk_drift_report','polymorphic_ref_orphan_report',
                       'validate_journal_entry_balance');
  IF _n <> 3 THEN RAISE EXCEPTION 'تعداد نسخه‌ها % است، انتظار ۳ بود', _n; END IF;

  -- ج) anon همچنان بسته، PUBLIC هم بسته - نتیجه assert می‌شود نه دستور
  SELECT string_agg(p.proname, ', ') INTO _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('person_fk_drift_report','polymorphic_ref_orphan_report',
                       'validate_journal_entry_balance')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR p.proacl::text ~ '(^|,)=X/');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'OG-61: anon يا PUBLIC اجازه‌ی اجرا دارد: %', _bad;
  END IF;

  -- د) authenticated همچنان EXECUTE دارد - گارد باید داخل بدنه رد کند، نه در لایه‌ی grant
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('person_fk_drift_report','polymorphic_ref_orphan_report',
                       'validate_journal_entry_balance')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF _n <> 3 THEN RAISE EXCEPTION 'authenticated باید EXECUTE داشته باشد تا مدیر بتواند صفحه را ببیند'; END IF;

  RAISE NOTICE 'H-10: هر چهار assert برقرار است.';
END
$do$;
