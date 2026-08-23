# M3 — نشت سطح‌تابع: OG-33 + OG-31 — PROGRESS

## HANDOFF STATE

```
Mission:              M3 — function EXECUTE leak
Status:               in progress
Branch:               feature/m3-function-execute-leak
Base:                 staging @ 9a661303  (verified: git rev-parse origin/staging)
Items:                OG-33 (close, owner-decided) + OG-31 (decide with measurement)
Migrations:           381 reserved (verified: highest on disk and on origin/staging is 380)
Assertion gates:      1 permitted, 0 used so far
Review rounds:        max 2
Catalogue baseline:   a51ee08e55ff48453d7a2925f1c5d098 / pg_class 1105 / pg_proc 841
```

## پرسش پیش‌پرواز — **مالک پاسخ داد**

> آیا زمان آخرین خرید هر محصول باید عمومی باشد؟

**پاسخ مالک: خیر. ببند.** و صریح گفت از fallback استفاده نکن — یعنی این یک
**تصمیم** است، نه انتخاب پیش‌فرض یک عامل. ثبت می‌شود چون تفاوت دارد: بستن به
پشتوانهٔ تصمیم مالک برگشت‌پذیرتر و قابل‌دفاع‌تر از بستن به پشتوانهٔ fallback است.

---

## فاز ۰ — سنجش. هیچ تغییری.

### ۰.۱ — سطح `EXECUTE` تابع، با **اثر** نه هویت

```
functions in public                          : 841
anon can EXECUTE (effective)                 : 746
  of those, SECURITY DEFINER                 : 347
anon NAMED in proacl (identity test)         : 743
proacl IS NULL (=> PUBLIC default)           : 0
PUBLIC named in proacl (leading '=')         : 712
```

**عدد تعیین‌کننده ۷۱۲ است.** هفتصد و دوازده تابع گرنت `PUBLIC` دارند، یعنی
`REVOKE EXECUTE … FROM anon` روی آن‌ها **هیچ کاری نمی‌کند** — دقیقاً همان تلهٔ
سند مأموریت. اختلاف ۷۴۶ (اثر) و ۷۴۳ (هویت) هم می‌گوید سه تابع را anon
می‌تواند اجرا کند بی‌آنکه نامش در `proacl` باشد.

### ۰.۲ — `pg_stat_statements`: anon واقعاً چه اجرا کرده

این روش شکل‌کد ندارد و به همین دلیل روش دوم است — نه دو جست‌وجوی کد.

```
anon | calls=21315 | set_config(...)                       <- PostgREST role switch
anon | calls=21055 | SELECT shop_settings.key ...          <- /api/healthz
anon | calls=16141 | COMMIT
anon | calls=24    | SELECT products.id, name, ...         <- /api/public/products
anon | calls=15    | SELECT notification_queue...          <- زنگ اعلان، پیش از چسبیدن توکن
anon | calls=4     | vw_account_balances                   <- probeهای بازبینی G-1
anon | calls=3     | rpc get_recent_purchase_label         <- probeهای خودم
```

**فقط ۴ RPC متمایز را anon تا امروز اجرا کرده، و هر چهار probe تحقیقاتی بوده‌اند
— نه ترافیک محصول.** یعنی هیچ مصرف‌کنندهٔ واقعیِ RPC به‌عنوان anon وجود ندارد.

### ۰.۳ — دو تابع OG-33، وضعیت دقیق

```
get_recent_purchase_label(uuid)     secdef=true  anonExec=true
get_recent_purchase_labels(uuid[])  secdef=true  anonExec=true
proacl = {=X/supabase_admin, supabase_admin=X, anon=X, authenticated=X, service_role=X, postgres=X}
          ^^ این «=X» یعنی PUBLIC
```

هر دو **هم** گرنت صریح `anon` دارند **هم** گرنت `PUBLIC`. پس بستنشان به **دو**
REVOKE نیاز دارد، نه یکی.

### ۰.۴ — مصرف‌کنندگان، با پیمایش گذرای import

```
components/products/RecentPurchaseBadge.tsx   -> rpc('get_recent_purchase_label')
components/products/RecentPurchaseGroup.tsx   -> rpc('get_recent_purchase_labels')
```

چهار مسیر به آن‌ها می‌رسند:

| مسیر | نقش |
|---|---|
| `_app.products.$id.tsx` | احرازشده |
| `_app.products.index.tsx` | احرازشده |
| `_app.sales.search.tsx` | احرازشده |
| **`public.sale-lists.$listId.tsx`** | **عمومی** — از راه `components/public/sale-list-table.tsx` |

و آن مسیر عمومی **امروز برای anon کار نمی‌کند**:

```
anon SELECT on sale_lists  : false
published sale lists       : 0
```

پس بستن این دو تابع **هیچ صفحهٔ کارکننده‌ای را نمی‌شکند**. سه مسیر `_app` هم
دست‌نخورده می‌مانند، چون هر دو تابع گرنت **صریح** `authenticated=X` دارند که
REVOKEِ `anon` و `PUBLIC` به آن نمی‌خورد.

### ۰.۵ — OG-31: چه چیزی به پیش‌فرض `FUNCTIONS` وابسته است

**مسیر ربات به `anon` وابسته نیست.** هر ده تابع `bot_*` برای anon اجراشدنی‌اند،
ولی `src/server/bot-api.ts` از **service role** استفاده می‌کند — پس
`authenticateBot` و بقیه از آن راه نمی‌آیند. این را سند مأموریت خواسته بود
صریحاً بررسی شود.

**مسیر احراز هویت** — این‌ها برای anon اجراشدنی‌اند و توابع کمکیِ داخل سیاست‌های
RLS هستند:

```
has_any_role(uuid, app_role[])   anonExec=true      212 policies call has_any_role
has_any_role(uuid, text[])       anonExec=true      165 policies call has_role
has_role(uuid, app_role)         anonExec=true       91 policies call is_viewer_only
has_role(uuid, text)             anonExec=true
is_viewer_only(uuid)             anonExec=true
log_event, normalize_identifier, tehran_today        anonExec=true
has_dynamic_permission           anonExec=FALSE
```

### ۰.۶ — یک فرضیهٔ من که سنجش ردش کرد، و کامل توضیحش نمی‌توانم بدهم

فرض کرده بودم گرفتن `EXECUTE` از anon روی یک تابع کمکیِ سیاست، رفتار را از
«صفر ردیف» به `42501` عوض می‌کند. داخل `BEGIN … ROLLBACK` آزمودم:

```
BEFORE  customers as anon = 0
REVOKE EXECUTE ON has_any_role(uuid, text[]) FROM anon;  و FROM PUBLIC;
AFTER   customers as anon = 0        <- تغییری نکرد
```

ولی سر دیگر طیف واقعی است و همان‌جا سنجیده شد:

```
pricing_rules as anon -> ERROR: permission denied for function has_dynamic_permission
anon EXECUTE on has_dynamic_permission = false
```

یعنی هر دو رفتار وجود دارد. `has_any_role` دو overload دارد
(`uuid,app_role[]` و `uuid,text[]`) و در کل شِما **۱۶** تابع بیش از یک امضا
دارند، که یک توضیح محتمل است — ولی سیاست `customers` صراحتاً
`ARRAY['admin'::text, …]` می‌نویسد که همان `text[]` است، پس این توضیح کامل جا
نمی‌افتد.

**ثبت می‌کنم به‌عنوان سنجیده‌ولی‌توضیح‌نداده، نه اینکه سازوکاری از خودم
بسازم.** برای M3 تعیین‌کننده نیست — این مأموریت هیچ REVOKE دسته‌جمعی روی
توابع موجود نمی‌کند — ولی هر مأموریت آینده‌ای که بخواهد بکند باید بداند اثرش
**جدول‌به‌جدول و امضا‌به‌امضا** فرق می‌کند و از «هیچ تغییری» تا `42501` نوسان
دارد.

---

## تصمیم‌ها

### OG-33 — بسته می‌شود

تصمیم مالک. `REVOKE EXECUTE` از **`anon` و `PUBLIC`** روی هر دو تابع. سه نقش
دیگر گرنت صریح دارند و دست‌نخورده می‌مانند.

### OG-31 — پیش‌فرض بسته می‌شود، موجودها دست نمی‌خورند

`ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM anon` — قرینهٔ
دقیق کاری که مهاجرت ۳۷۳ برای `TABLES` و `SEQUENCES` کرد. **فقط توابع آینده.**

چرا توابع موجود دست نمی‌خورند، با دلیل نه با احتیاط:

1. ۷۴۶ تابع درگیرند و ۲۱۲ سیاست RLS به آن‌ها تکیه می‌کنند. این دامنهٔ M10 است،
   نه M3 — و سند مأموریت صریحاً حصار زده: «به گرنت‌های جدول گسترش نده».
2. اثرش، طبق بند ۰.۶، **قابل پیش‌بینی نیست** بی‌آنکه هر ۷۴۶ تا جداگانه سنجیده
   شود.
3. شواهد زمان اجرا می‌گوید هیچ RPCی به‌عنوان anon در محصول فراخوانده نمی‌شود،
   پس بستن شیرِ آینده تمام سودِ در دسترس را می‌گیرد و هیچ ریسکی برنمی‌دارد.

## گام بعدی

فاز ۱ — فایل بازگشت پیش از مهاجرت ۳۸۱.
