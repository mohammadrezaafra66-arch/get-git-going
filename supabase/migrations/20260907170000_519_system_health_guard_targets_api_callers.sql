SET client_encoding='UTF8';

-- 519 - H-10 رگرسیون: گارد باید بپرسد «درخواست از کجا آمده»، نه «uid خالی است یا نه»
--
-- چه چیزی شکست:
--   مهاجرت ۵۱۵ گارد را به شکل «اگر has_role(auth.uid(),'admin') نبود رد کن» نوشت، یعنی
--   fail-closed روی نبود نشست. ولی سیزده spec در e2e/persons تابع
--   person_fk_drift_report() را از راه dbScalar صدا می‌زنند، و dbScalar یک اتصال مستقیم
--   psql بدون هیچ JWT است. آنجا auth.uid() برابر NULL است، پس has_role نادرست شد و
--   همه‌ی آن‌ها با همین خطا قرمز شدند:
--     ERROR: دسترسی به گزارش سلامت سامانه فقط برای مدیر سیستم مجاز است.
--     CONTEXT: PL/pgSQL function person_fk_drift_report() line 4 at RAISE
--   بیشترشان از test.afterAll صدا می‌زنند، برای همین شکست روی آخرین تست فایل می‌نشیند
--   و شبیه یک نقص بی‌ربط به‌نظر می‌رسد. اندازه‌گیری‌شده روی کد دست‌نخورده‌ی origin/staging:
--   e2e/persons از ۹ شکست ثابت به ۲۱ رفت، و هر سیزده فایلِ تازه‌قرمز یکی از این
--   گزارش‌ها را صدا می‌زنند - یک‌به‌یک، بدون هیچ مورد توضیح‌داده‌نشده.
--
--   ریشه‌ی اشتباه: ادعای «هیچ spec ای این‌ها را صدا نمی‌زند» از یک grep با head -10 آمد که
--   دقیقاً پیش از سطرهای e2e بریده شده بود، و از pg_depend که فراخوانِ داخل یک فایل تست
--   را اصلاً نمی‌بیند. کاتالوگ به سؤالی که پرسیده شد درست جواب داد؛ سؤال باریک بود.
--
-- پرسش درست: این فراخوانی از کجا آمده؟
--   اندازه‌گیری‌شده (نه استنتاج‌شده) روی همین پایگاه، داخل یک تابع SECURITY DEFINER:
--     درخواست واقعی PostgREST : session_user=authenticator | role=authenticated | uid=<کاربر>
--     اتصال مستقیم dbScalar   : session_user=supabase_admin | role=none         | uid=NULL
--   یعنی GUC به نام role از SECURITY DEFINER جان سالم به در می‌برد و همان چیزی است که
--   دو حالت را از هم جدا می‌کند.
--
-- گزاره‌ی گارد و چرا نمی‌شود از آن رد شد:
--   اگر role برابر authenticated یا anon باشد، یا session_user برابر authenticator، آنگاه
--   درخواست از مسیر API آمده و بدون نقش admin رد می‌شود. هر درخواست PostgREST هر دو نشانه
--   را با هم دارد، چون PostgREST با نقش authenticator وصل می‌شود و سپس بر اساس claim نقشِ
--   توکن SET ROLE می‌کند - بدون این کار اصلاً RLS کار نمی‌کرد. پس هیچ درخواست PostgREST ای
--   به شاخه‌ی سهل‌گیرانه نمی‌رسد. توکنی هم که role اش authenticated باشد ولی sub نداشته
--   باشد باز هم رد می‌شود، چون has_role(NULL,'admin') نادرست است. anon هم اصلاً EXECUTE
--   ندارد و در انتهای همین فایل assert می‌شود که همان‌طور بماند.
--   شاخه‌ی سهل‌گیرانه فقط به اتصال مستقیم می‌رسد: supabase_admin، postgres، service_role،
--   مهاجرت و cron - که همگی در سطح خودِ اتصال معتبر شده‌اند و یک بررسی نقش داخل بدنه چیزی
--   به آن‌ها اضافه نمی‌کند.
--
--   این همان استدلالی است که در مهاجرت ۵۱۱ برای سقف اعتبار به کار رفت. عدم تقارن میان آن
--   دو تصمیم چیزی بود که اینجا شکست؛ حالا هر دو یک قاعده دارند.
--
-- ویژگی امنیتی H-10 حفظ می‌شود و برگردانده نمی‌شود: کاربر authenticated بدون نقش admin
-- همچنان رد می‌شود. متن پرس‌وجوها عیناً از تعریف زنده برداشته شده و تنها شرط گارد عوض شد.

CREATE OR REPLACE FUNCTION public.person_fk_drift_report()
RETURNS TABLE(table_name text, drifted_rows bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- WHO IS ASKING - see this migration's header. `role` survives SECURITY DEFINER, and a
  -- PostgREST request always arrives with it set to authenticated or anon.
  IF current_setting('role', true) IN ('authenticated', 'anon')
     OR session_user = 'authenticator' THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'دسترسی به گزارش سلامت سامانه فقط برای مدیر سیستم مجاز است.'
        USING ERRCODE = '42501';
    END IF;
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
  -- WHO IS ASKING - see this migration's header. `role` survives SECURITY DEFINER, and a
  -- PostgREST request always arrives with it set to authenticated or anon.
  IF current_setting('role', true) IN ('authenticated', 'anon')
     OR session_user = 'authenticator' THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'دسترسی به گزارش سلامت سامانه فقط برای مدیر سیستم مجاز است.'
        USING ERRCODE = '42501';
    END IF;
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
  -- WHO IS ASKING - see this migration's header. `role` survives SECURITY DEFINER, and a
  -- PostgREST request always arrives with it set to authenticated or anon.
  IF current_setting('role', true) IN ('authenticated', 'anon')
     OR session_user = 'authenticator' THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'دسترسی به گزارش سلامت سامانه فقط برای مدیر سیستم مجاز است.'
        USING ERRCODE = '42501';
    END IF;
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
REVOKE ALL ON FUNCTION public.person_fk_drift_report() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.polymorphic_ref_orphan_report() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_journal_entry_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_fk_drift_report() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.polymorphic_ref_orphan_report() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_journal_entry_balance(uuid) TO authenticated, service_role;

-- --------------------------------------------------------------- assertها
DO $do$
DECLARE _n integer; _bad text; _names text[] := ARRAY[
  'person_fk_drift_report','polymorphic_ref_orphan_report','validate_journal_entry_balance'];
BEGIN
  -- الف) هر سه هنوز گارد دارند (H-10 برگردانده نشده)
  SELECT string_agg(p.proname, ', ') INTO _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname = ANY(_names)
     AND pg_get_functiondef(p.oid) NOT LIKE '%42501%';
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'H-10: بی‌گارد شد: %', _bad; END IF;

  -- ب) و گارد حالا روی مبدأ درخواست تصمیم می‌گیرد
  SELECT string_agg(p.proname, ', ') INTO _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname = ANY(_names)
     AND pg_get_functiondef(p.oid) NOT LIKE '%authenticator%';
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'H-11: گزاره‌ی مبدأ اعمال نشد: %', _bad; END IF;

  -- ج) overload ساخته نشده
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname = ANY(_names);
  IF _n <> 3 THEN RAISE EXCEPTION 'تعداد نسخه‌ها % است، انتظار ۳ بود', _n; END IF;

  -- د) anon همچنان بسته - نتیجه assert می‌شود نه دستور
  SELECT string_agg(p.proname, ', ') INTO _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname = ANY(_names)
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR p.proacl::text ~ '(^|,)=X/');
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'OG-61: anon اجازه‌ی اجرا دارد: %', _bad; END IF;

  RAISE NOTICE 'H-10 fix: هر چهار assert برقرار است.';
END
$do$;
