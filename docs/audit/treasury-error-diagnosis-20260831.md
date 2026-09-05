# تشخیص خطای صفحهٔ خزانه — ۲۰۲۶-۰۸-۳۱

**حکم یک‌خطی (تکرار در انتها با شاهد):**
**pre-existing, unrelated to the fix** — این خطا از قبل وجود داشته و ربطی به اصلاح
امروزِ view ندارد.

مأموریت کاملاً فقط‑خواندنی اجرا شد. تنها فایل نوشته‌شده همین گزارش است. هیچ migration،
تغییر داده، restart، دستور git نوشتاری یا تغییر پیکربندی انجام نشد.

---

## هویت ماشین

```
$ hostname
DESKTOP-MT8J1VR
```

سرور تولید. همهٔ کوئری‌ها با `-d postgres` صریح.

---

## ۱. کامپوننت صفحهٔ خزانه و مسیر بارگذاری مانده‌ها

فایل صفحه: `src/routes/_app.accounting.treasury.tsx`

```
src/routes/_app.accounting.treasury.tsx:35     fetchAccountBalances,
src/routes/_app.accounting.treasury.tsx:58     const balancesQ = useQuery({
src/routes/_app.accounting.treasury.tsx:59       queryKey: ["account-balances", typeFilter, includeInactive],
src/routes/_app.accounting.treasury.tsx:60       queryFn: () =>
src/routes/_app.accounting.treasury.tsx:61         fetchAccountBalances({
src/routes/_app.accounting.treasury.tsx:62           accountType: typeFilter === ALL ? null : (typeFilter as AccountType),
src/routes/_app.accounting.treasury.tsx:63           includeInactive,
src/routes/_app.accounting.treasury.tsx:64         }),
```

خط خطا:

```
src/routes/_app.accounting.treasury.tsx:158            ) : balancesQ.isError ? (
src/routes/_app.accounting.treasury.tsx:159              <p className="text-sm text-destructive">
src/routes/_app.accounting.treasury.tsx:160                {isForbidden(balancesQ.error)
src/routes/_app.accounting.treasury.tsx:161                  ? "شما دسترسی مشاهده خزانه را ندارید."
src/routes/_app.accounting.treasury.tsx:162                  : "دریافت ماندهٔ حساب‌ها با خطا مواجه شد."}
```

و تشخیص «دسترسی ندارید» از «خطای عمومی»:

```
src/routes/_app.accounting.treasury.tsx:95   const isForbidden = (e: unknown) =>
src/routes/_app.accounting.treasury.tsx:96     /forbidden|permission denied|42501/i.test((e as { message?: string })?.message ?? "");
```

منبع داده در `src/lib/treasury/queries.ts`:

```
src/lib/treasury/queries.ts:45   const rpc = supabase.rpc as unknown as RpcFn;
src/lib/treasury/queries.ts:62   export async function fetchAccountBalances(opts?: {
src/lib/treasury/queries.ts:66     const { data, error } = await rpc("get_account_balances", {
src/lib/treasury/queries.ts:67       p_account_type: opts?.accountType ?? null,
src/lib/treasury/queries.ts:68       p_include_inactive: opts?.includeInactive ?? false,
src/lib/treasury/queries.ts:69     });
src/lib/treasury/queries.ts:70     if (error) throw new Error(error.message);
src/lib/treasury/queries.ts:71     return (data as AccountBalance[] | null) ?? [];
```

ستون‌هایی که کد انتظار دارد (`src/lib/treasury/queries.ts:47-60`):
`account_id, title, bank_name, account_type, currency, is_active, opening_balance,
total_in, total_out, current_balance, in_count, out_count`

**نتیجهٔ بند ۱:** صفحه یک **RPC** به نام `get_account_balances` صدا می‌زند و
`vw_account_balances` را مستقیم نمی‌خواند.

---

## ۲. آیا منبع داده روی تولید با همان نام و شکل وجود دارد؟ — بله

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_can
  FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
   AND p.proname IN ('get_account_balances','get_account_ledger');
```

```
       proname        |                        args                         | prosecdef | auth_can | anon_can
----------------------+-----------------------------------------------------+-----------+----------+----------
 get_account_balances | p_account_type text, p_include_inactive boolean     | t         | t        | t
 get_account_ledger   | p_account_id uuid, p_from_date date, p_to_date date  | t         | t        | t
```

نام پارامترها دقیقاً همان‌هایی است که کد می‌فرستد (`p_account_type`،
`p_include_inactive`). تابع overload ندارد. `authenticated` می‌تواند اجرا کند.

خروجی تابع:

```
RETURNS TABLE(account_id uuid, title text, bank_name text, account_type text,
              currency text, is_active boolean, opening_balance numeric,
              total_in numeric, total_out numeric, current_balance numeric,
              in_count bigint, out_count bigint)
```

**هر ۱۲ ستون دقیقاً با تایپ `AccountBalance` در کد منطبق است. هیچ عدم‌تطابق قراردادی
وجود ندارد.**

---

## ۳. آیا خزانه مستقیم view را می‌خواند؟ — نه، ولی RPC می‌خواند

بدنهٔ `get_account_balances`:

```sql
CREATE OR REPLACE FUNCTION public.get_account_balances(
    p_account_type text DEFAULT NULL::text, p_include_inactive boolean DEFAULT false)
 RETURNS TABLE(account_id uuid, title text, ... out_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v.account_id, v.title, v.bank_name, v.account_type, v.currency, v.is_active,
         v.opening_balance, v.total_in, v.total_out, v.current_balance,
         v.in_count, v.out_count
    FROM public.vw_account_balances v
   WHERE (p_account_type IS NULL OR v.account_type = p_account_type)
     AND (p_include_inactive OR v.is_active)
   ORDER BY v.account_type, v.title;
END;
$function$
```

پس صفحه غیرمستقیم به view وابسته است. حالا اصلاح امروز:

```sql
SELECT pg_get_viewdef('public.vw_account_balances'::regclass, true);
-- خط ۴۳:
  WHERE auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid());
```

ستون‌های فعلی view — همان ۱۲ ستونی که تابع نیاز دارد، همگی موجود و هم‌نوع:

```
 ordinal_position |   column_name   | data_type
------------------+-----------------+-----------
                1 | account_id      | uuid
                2 | title           | text
                3 | bank_name       | text
                4 | account_type    | text
                5 | currency        | text
                6 | is_active       | boolean
                7 | opening_balance | numeric
                8 | total_in        | numeric
                9 | total_out       | numeric
               10 | current_balance | numeric
               11 | in_count        | bigint
               12 | out_count       | bigint
```

### آزمون قطعی — با JWT شبیه‌سازی‌شدهٔ یک ادمین واقعی، داخل `BEGIN … ROLLBACK`

`get_account_balances` تابعی `STABLE` است، یعنی نمی‌تواند بنویسد؛ و کل آزمون در یک
تراکنش برگشت‌خورده انجام شد. فقط شمارش گرفته شد، نه داده.

```sql
BEGIN;
SET LOCAL request.jwt.claims = '{"sub":"4084224a-cd34-4632-9cbc-3b5f3581cf6e","role":"authenticated"}';
SET LOCAL ROLE authenticated;
SELECT auth.uid() IS NOT NULL;
SELECT (auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid()));
SELECT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]);
SELECT count(*) FROM public.get_account_balances(NULL, false);
SELECT count(*) FROM public.bank_accounts;
ROLLBACK;
```

```
        probe         | uid_present
----------------------+-------------
 auth.uid() inside tx | t

   probe    | guard_passes
------------+--------------
 view guard | t

       probe       | rpc_gate_passes
-------------------+-----------------
 has_any_role gate | t

     probe     | rows_returned
---------------+---------------
 RPC row count |             0

       probe        | count
--------------------+-------
 bank_accounts rows |     0

ROLLBACK
PSQL_EXIT_CODE=0
```

**تفسیر:** برای یک ادمین واردشده، `auth.uid()` غیر‑NULL است، guard جدیدِ view **پاس
می‌شود**، گیت `has_any_role` **پاس می‌شود**، و RPC **بدون هیچ خطایی اجرا می‌شود** و
صفر ردیف برمی‌گرداند — چون `bank_accounts` صفر ردیف دارد.

مسیر پایگاه‌داده سالم است. هیچ view ای به‌عنوان `anon` خوانده نشد.

### با صفر ردیف، رفتار درستِ کد این است — نه خطای قرمز

```
src/routes/_app.accounting.treasury.tsx:163   ) : accounts.length === 0 ? (
src/routes/_app.accounting.treasury.tsx:164     <EmptyState
src/routes/_app.accounting.treasury.tsx:166       title="حسابی برای نمایش نیست"
```

اگر RPC اجرا می‌شد، کاربر باید «حسابی برای نمایش نیست» می‌دید. اینکه خطای قرمز
می‌بیند یعنی `balancesQ.isError` درست است، یعنی `queryFn` استثنا داده — و چون
پایگاه‌داده استثنا نمی‌دهد، منشأ سمت کلاینت است.

---

## ۴. تازه است یا از قبل بوده؟ — از قبل بوده، و RPC هرگز حتی یک بار فراخوانی نشده

### شاهد اول — Kong هرگز چنین درخواستی ندیده

```
$ docker logs afrakala-lan-kong | grep -c "get_account_balances"
0
```

پنجرهٔ نگه‌داری لاگ:

```
$ docker logs afrakala-lan-kong | head -1
2026/08/14 12:50:16 [warn] 1#0: the "user" directive makes sense only if ...
$ docker logs afrakala-lan-kong | wc -l
2555596
```

یعنی **۱۷ روز ترافیک واقعی تولید، ۲٬۵۵۵٬۵۹۶ خط لاگ، و صفر درخواست به این RPC.**
در همان بازه RPC های دیگر همین برنامه ثبت شده‌اند:

```
    114 "POST /rest/v1/rpc/bot_check_rate_limit
    114 "POST /rest/v1/rpc/bot_authenticate_key
     79 "POST /rest/v1/rpc/is_user_online
     64 "POST /rest/v1/rpc/bot_list_products_for_key
     50 "POST /rest/v1/rpc/bot_get_product_for_key
      2 "POST /rest/v1/rpc/list_trusted_credit_customers
      1 "POST /rest/v1/rpc/get_receivables_summary
      1 "POST /rest/v1/rpc/get_receivables_list
```

PostgREST هم هیچ خطایی با `get_account_balances`، `vw_account_balances` یا `42501`
ثبت نکرده. درخواست اصلاً به سرور نمی‌رسد — دقیقاً همان چیزی که مرورگر گزارش داد.

### شاهد دوم — علتِ مکانیکی، از خودِ باندل مستقر

پیاده‌سازی `rpc` در supabase-js داخل باندل:

```js
rpc(e,t={},n={head:!1,get:!1,count:void 0}){return this.rest.rpc(e,t,n)}
```

و لایهٔ زیرین:

```js
rpc(t,n={},{head:i=!1,get:a=!1,count:l}={}){ ... const h=new URL(`${this.url}/rpc/${t}`); ... }
```

**هر دو به `this` وابسته‌اند.**

حالا ببینید کد خزانه چطور کامپایل شده — از فایل واقعی داخل کانتینر
`/app/.output/public/assets/queries-D4D3ZzIv.js`:

```js
u = r.rpc;
async function d(e){
  const {data:a,error:t} = await u("get_account_balances",
    {p_account_type:e?.accountType??null, p_include_inactive:e?.includeInactive??!1});
  if(t) th...
```

`u = r.rpc` متد را از گیرنده‌اش **جدا** می‌کند و بعد `u(...)` بدون گیرنده صدا زده
می‌شود. ماژول‌های ES در حالت strict اجرا می‌شوند، پس `this` برابر `undefined` است و
`this.rest` بلافاصله `TypeError` می‌دهد — **پیش از آنکه هیچ URL ساخته شود یا هیچ
درخواستی فرستاده شود.**

زنجیرهٔ کامل:
1. `queryFn` یک `TypeError` همگام پرتاب می‌کند.
2. هیچ درخواست شبکه‌ای فرستاده نمی‌شود → صفر ورودی در Kong.
3. react-query مقدار `isError` را true می‌کند.
4. پیام `TypeError` با الگوی `/forbidden|permission denied|42501/i` منطبق نیست، پس
   `isForbidden` مقدار false می‌دهد.
5. شاخهٔ عمومی رندر می‌شود: «دریافت ماندهٔ حساب‌ها با خطا مواجه شد.»
6. `accounts = balancesQ.data ?? []` خالی می‌ماند، پس همهٔ جمع‌ها صفر نشان داده
   می‌شوند.

### شاهد سوم — یک پیش‌بینی آزمون‌پذیر که درست از آب درآمد

فقط **دو** فایل در کل `src/` شکل «انتساب به const و فراخوانی بعدی» را دارند:

```
src/lib/accounting/mutual-settlement.ts:17   const rpc = supabase.rpc as unknown as RpcFn;
src/lib/treasury/queries.ts:45               const rpc = supabase.rpc as unknown as RpcFn;
```

بقیهٔ موارد شکل درون‌خطی `(supabase.rpc as unknown as T)(...)` را دارند که در
جاوااسکریپت هنوز فراخوانی متد است و `this` را حفظ می‌کند.

اگر فرضیه درست باشد، صفحهٔ تسویهٔ متقابل هم باید دقیقاً همین باگ را داشته باشد.
نتیجه:

| ماژول | شکل فراخوانی | RPC | ورودی در Kong |
|---|---|---|---|
| `treasury/queries.ts` | `const rpc = …` (جدا) | `get_account_balances` | **۰** |
| `treasury/queries.ts` | `const rpc = …` (جدا) | `get_account_ledger` | **۰** |
| `treasury/queries.ts` | `const rpc = …` (جدا) | `pay_purchase_with_voucher` | **۰** |
| `accounting/mutual-settlement.ts` | `const rpc = …` (جدا) | `list_mutual_settlement_candidates` | **۰** |
| `accounting/mutual-settlement.ts` | `const rpc = …` (جدا) | `person_settlement_position` | **۰** |
| `accounting/mutual-settlement.ts` | `const rpc = …` (جدا) | `post_mutual_settlement` | **۰** |
| `_app.sales.credit-customers.tsx` | `(supabase.rpc as …)(…)` (درون‌خطی) | `list_trusted_credit_customers` | **۱۱۰** |

شش از شش RPC ای که از مسیر «ارجاع جدا» می‌روند هرگز فراخوانی نشده‌اند؛ کنترلِ
درون‌خطی ۱۱۰ بار موفق فراخوانی شده.

### پاسخ صریح بند ۴

کد فعلی از کامیت `bfcc723a` است و ایمیج در ۲۰۲۶-۰۸-۱۵ از همان ساخته شده. این باگ
از زمان استقرار همین باندل وجود داشته و **این صفحه هرگز، حتی یک بار، در برابر این
پایگاه‌داده کار نکرده است**. اصلاح امروزِ view به‌طور قطعی علت نیست: با JWT
شبیه‌سازی‌شدهٔ ادمین ثابت شد RPC از میان guard جدید بدون خطا عبور می‌کند.

نکتهٔ فرعی: خالی بودن `bank_accounts` هم علت خطا نیست — علت صفر بودنِ اعداد است. اگر
باگ کلاینت نبود، کاربر «حسابی برای نمایش نیست» می‌دید.

---

## ۵. اصلاح پیشنهادی — توضیح، اعمال نشد

علت یک ناسازگاری کد است که پیش از امروز وجود داشته، پس طبق دستورالعمل فقط توصیف
می‌شود.

در `src/lib/treasury/queries.ts` خط ۴۵:

```diff
-const rpc = supabase.rpc as unknown as RpcFn;
+const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn;
```

و همان تغییر در `src/lib/accounting/mutual-settlement.ts` خط ۱۷.

جایگزین هم‌ارز، اگر ترجیح بر پرهیز از `bind` باشد: فراخوانی درون‌خطی، همان الگویی که
در بقیهٔ برنامه کار می‌کند —
`await (supabase.rpc as unknown as RpcFn)("get_account_balances", { … })`.

**انتظار پس از اصلاح:** خطای قرمز جای خود را به «حسابی برای نمایش نیست» می‌دهد، چون
`bank_accounts` صفر ردیف دارد. برای دیدن عدد واقعی باید ابتدا در صفحهٔ «حساب‌های
بانکی» حساب تعریف شود. صفحهٔ تسویهٔ متقابل هم با همین اصلاح درست می‌شود.

این تغییر نیازمند build و deploy مجدد است، چون در باندل مرورگر پخته می‌شود.

**بازگشتِ اصلاح view لازم نیست** — آن اصلاح علت نیست و برداشتنش نشتی
`vw_account_balances` را دوباره باز می‌کند بدون آنکه این خطا را حل کند.

---

## تأیید نشده

1. **خطای واقعی در کنسول مرورگر دیده نشد.** زنجیرهٔ علّی از کد مستقر و لاگ سرور
   بازسازی شد، نه از یک stack trace واقعی. **چه چیزی قطعی‌ترش می‌کند:** باز کردن
   `/accounting/treasury` با کنسول باز و دیدن `TypeError` — که نیازمند ورود با کاربر
   واقعی بود و در حدود مجاز نبود.
2. **اصلاح آزمایش نشد.** نه اعمال شد و نه build گرفت.
3. **`pay_purchase_with_voucher` نوشتاری است** و صفر بودن فراخوانی‌اش با همین باگ
   توضیح داده می‌شود، ولی مسیر دیگری هم ممکن است داشته باشد که بررسی نشد.
4. **تاریخچهٔ پیش از ۲۰۲۶-۰۸-۱۴ ۱۲:۵۰ در دسترس نبود.** «صفر فراخوانی» یعنی صفر در
   ۱۷ روز نگه‌داری لاگ، نه در کل عمر سیستم. **چه چیزی این را کامل می‌کند:** لاگ‌های
   آرشیوی قدیمی‌تر، اگر وجود داشته باشند.
5. **بقیهٔ برنامه برای همین الگو اسکن شد ولی الگوهای مشابه دیگر (مثلاً جدا کردن
   `supabase.from`) بررسی نشد.**

---

## حکم

**pre-existing, unrelated to the fix.**

قوی‌ترین شاهد واحد: در ۱۷ روز و ۲٬۵۵۵٬۵۹۶ خط لاگ Kong، RPC یعنی
`get_account_balances` **صفر بار** فراخوانی شده — در حالی که RPC های دیگر همین
برنامه در همان بازه ثبت شده‌اند. درخواست هرگز از مرورگر خارج نمی‌شود، پس هیچ تغییری
در پایگاه‌داده — از جمله اصلاح امروزِ view — نمی‌توانسته علت باشد.
