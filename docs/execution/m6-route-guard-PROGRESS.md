# M6 — OG-24 · نگهبان مشترک مسیرها که fail-open است — PROGRESS

## HANDOFF STATE

```
Mission:              M6 — OG-24, نگهبان مسیر. مأموریت FRONTEND، نه پایگاه‌داده.
Status:               فاز ۳ کامل — R9 سبز. استقرار و بازبینی مستقل در جریان
Branch:               feature/m6-route-guard
Base:                 staging @ f0257d2e  (تأیید شد: git rev-parse origin/staging)
Migration expected:   هیچ. این مأموریت هیچ شیء schema را لمس نمی‌کند.
Assertion gate:       یک عدد، و یک spec پلی‌رایت است نه مهاجرت
Review rounds:        حداکثر ۲
Catalogue baseline:   a51ee08e55ff48453d7a2925f1c5d098 / pg_class 1105 / pg_proc 841
Deployed APP_GIT_SHA: dbe46fe1  (عقب‌تر از HEAD — این مأموریت src/ را عوض می‌کند، پس
                      برخلاف چهار مأموریت قبل، بازسازی تصویر اجباری است)
```

---

## فاز ۰ — سنجش. هیچ تغییری.

### ۰.۱ — هر دو مسیر fail-open، در متن زندهٔ `src/lib/rbac/route-guards.ts`

```ts
async function resolveAuthWithRetry() {
  if (typeof window === "undefined") return null;      // ← مسیر ۱ (SSR)
  let auth = await ensureAuthReady();
  if (!auth.user && (auth.loading || !auth.initialized)) auth = await ensureAuthReady(true);
  return auth;
}

export async function requireAnyRole(allowed: readonly AppRole[]) {
  const auth = await resolveAuthWithRetry();
  if (!auth) return { user: null, roles: [] as AppRole[] };   // ← مسیر ۱ بدون throw برمی‌گردد
  const user = auth.user;
  if (!user) { … throw redirect({ to: "/login" }); }
  if (auth.rolesLoading || auth.profileLoading || auth.loading)
    return { user, roles: auth.roles };                        // ← مسیر ۲، باز هم بدون throw
  if (auth.rolesError) throw new Error(`بارگذاری نقش‌های کاربر ناموفق بود: ${auth.rolesError}`);
  const roles = auth.roles as AppRole[];
  if (!roles.some((r) => allowed.includes(r))) throw redirect({ to: "/unauthorized" });
  return { user, roles };
}
```

`requirePermission` (خط ۲۲ و ۳۲) و `requireAdmin` (خط ۵۰ و ۵۷) **دقیقاً همین دو خط را
دارند**. هر سه نگهبان، هر دو مسیر. ادعای سند مأموریت تأیید شد.

و مسیر ۱ عمدی است، نه سهو: کامنت خطوط ۶۵–۷۶ می‌گوید فاز ۶.۷ سه مسیر را که
`ensureAuthReady` را دستی صدا می‌زدند اصلاح کرد، چون کاربرِ واردشده را در هر ناوبری
سمت‌سرور به `/login` پرت می‌کردند. **این همان تلهٔ «با deny در SSR درستش کن» است که سند
مأموریت هشدارش را می‌دهد، و در همین مخزن یک بار افتاده‌اند.**

### ۰.۱ب — سطح واقعی

```
requireAnyRole      62 فایل مسیر
requirePermission   74 فایل مسیر
requireAdmin        15 فایل مسیر
مجموع فایل‌های متمایز که هر نگهبانی را import می‌کنند:  149
همه زیر _app:                                          149 از 149
```

سند مأموریت گفته بود «حدود ۷۳ `requirePermission`»؛ عدد واقعی **۷۴** است. بقیه خواندند.

**پیمایش گذرا در همان گام اول تمام می‌شود:** هیچ ماژولی بیرون از `src/routes/` فایل
`route-guards` را import نمی‌کند، پس هیچ hook یا کامپوننتی نگهبان را با واسطه حمل نمی‌کند.
این را سنجیدم چون دو بار در این برنامه طبقه‌بندی از روی محتوای خود فایل نتیجهٔ غلط داده.

### ۰.۱ج — **فرض سند مأموریت که رد شد: خود ویزارد از پیش بسته است**

سند می‌گوید «کاربری با نقش `sales` در بارگذاری کامل صفحه به ویزارد ثبت سند می‌رسد».
**دیگر نمی‌رسد.** `_app.accounting.receipts.create.tsx` از اصلاحات فاز ۶ هر سه حالت را
دارد: `rolesLoading` → «در حال بررسی دسترسی…»، `rolesError` → پیام جداگانه، و رد دسترسی.

از چهارده مسیر حسابداری، **فقط همین یکی** لایهٔ کامپوننتی دارد:

```
_app.accounting.receipts.create        useAuth  loading  DENIAL   ← بسته
سیزده مسیر دیگر                          —        —        —      ← باز
```

پس دامنهٔ واقعی این مأموریت **سیزده مسیر است، نه چهارده**، و ویزارد — که پرمخاطره‌ترین
هدف بود — از قبل امن است.

### ۰.۲ — رفتار، به تفکیک مسیر × نقش × حالت ناوبری

با نشست‌های واقعی ذخیره‌شدهٔ پروژه (`e2e/auth/*.storage.json`). هیچ JWTی ساخته نشد و هیچ
رمزی وارد نشد.

```
test.admin@afrakala.local        active    admin
test.accountant@afrakala.local   active    accountant
test.sales@afrakala.local        active    sales
test.manager@afrakala.local      rejected  manager   ← NOT TESTABLE، فعال نشد
test.viewer@afrakala.local       rejected  viewer    ← NOT TESTABLE، فعال نشد
```

**خط پایه — نتیجهٔ سنجش، ۱۳ مسیر × ۳ نقش × ۳ حالت:**

| نقش | بارگذاری کامل | ناوبری سمت‌کلاینت | نقش‌ها در حال بارگذاری |
|---|---|---|---|
| `admin` | ۱۳/۱۳ صفحه رندر شد، هیچ پرش به `/login` | ۱۳/۱۳ رندر شد | رندر شد (به‌جز create که «در حال بررسی دسترسی…») |
| `accountant` | ۱۳/۱۳ صفحه رندر شد، هیچ پرش به `/login` | ۱۳/۱۳ رندر شد | رندر شد (به‌جز create) |
| `sales` | **۱۲/۱۳ صفحه رندر شد** ← نقص. فقط `receipts/create` رد کرد | **۱۳/۱۳ به `/unauthorized`** ← درست | **۳/۴ رندر شد** ← مسیر fail-open دوم |

متن دیده‌شده در سلول‌های کلیدی:

```
sales  FULL  /accounting/receipts/create   → «دسترسی ندارید. ثبت سند حسابداری فقط برای
                                             مدیر کل، حسابدار و مدیر است.»
sales  CSN   هر ۱۳ مسیر                    → /unauthorized ، «دسترسی غیرمجاز — شما اجازه
                                             دسترسی به این بخش را ندارید.»
sales  FULL  /accounting/bank-accounts     → صفحهٔ کامل: «حساب‌های بانکی — مدیریت
                                             حساب‌های بانکی … حسابی ثبت نشده است.»
sales  LOAD  /accounting/treasury          → صفحه رندر شد در حالی که نقش‌ها هنوز نیامده‌اند
```

**هر سه حالت اجرا شد، از جمله حالت سومی که تحقیق اول جا انداخته بود.** با `page.route`
روی `**/rest/v1/user_roles*` و تأخیر ۹ ثانیه‌ای، و مشاهده **در حین** توقف نه بعدش.

### ۰.۳ — یک بارگذاری `sales` واقعاً چه چیزی را در پایگاه‌داده اجرا می‌کند

`pg_stat_statements` صفر شد، یک بارگذاری سرد `/accounting/receivables` انجام شد، بلافاصله
خوانده شد. یک بار برای `sales` و یک بار برای `accountant`.

```
accountant:  WITH pgrst_source AS (SELECT … FROM "public"."get_receivables_summary"() …)   ← اجرا شد
sales:       (این پرس‌وجو اصلاً وجود ندارد)
```

**کاربر `sales` حتی پرس‌وجوی دادهٔ خود مسیر را اجرا نمی‌کند.** علتش سنجیده شد و لایهٔ
سومی است که سند مأموریت نامش را نبرده — خود تابع نقش را در بدنه‌اش گیت می‌کند:

```sql
IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
```

شبیه‌سازی‌شده داخل `BEGIN … ROLLBACK` با `request.jwt.claims` واقعی هر دو کاربر:

```
sales:       BLOCKED 42501  forbidden
accountant:  SUCCEEDED
```

**و در محتوای صفحه هم دیده می‌شود** — همان مسیر، دو نقش:

```
sales       /accounting/bank-accounts   → «حسابی ثبت نشده است.»
accountant  /accounting/bank-accounts   → «۱۲ ملت ۱۲۳۴۵۶۷۸۹ …»  (ردیف واقعی)
sales       /accounting/receivables     → «کل مطالبات …»          (سه‌نقطه، بدون عدد)
accountant  /accounting/receivables     → «کل مطالبات ۶۲۵٬۷۰۰٬۰۰۰ تومان»
```

**نتیجه: افشا هنوز فقط UI است و شدت قبلی سرجایش می‌ماند.** `sales` داربست خالی و متن
راهنمای فارسی صفحه را می‌بیند، و صفر رقم. این را سنجیدم، نه اینکه نتیجهٔ قبلی را تکرار کنم.

> **اثر جانبی که خودم ساختم و ثبتش می‌کنم:** برای این سنجش
> `pg_stat_statements_reset()` را صدا زدم، پس شمارنده‌های تجمعی که مأموریت‌های قبلی به آنها
> ارجاع داده بودند (`shop_settings` ۲۲٬۹۸۵ فراخوان و مانند آن) صفر شدند. این جدول آمار
> است نه داده، هیچ ردیف کسب‌وکاری از بین نرفت، و اعداد قبلی در سند M9 ثبت شده‌اند. ولی
> عدد تجمعی دیگر قابل بازتولید نیست و کسی که دنبالش بگردد باید این پاراگراف را ببیند.

### ۰.۴ — آنچه اصلاح نباید بشکند

**هر فراخوان `ensureAuthReady` / `resolveAuthWithRetry`:** `AuthProvider.tsx` (۲ بار)،
`route-guards.ts` (۴ بار)، و پنج مسیر بیرون از `_app` که خودشان صدا می‌زنند —
`index.tsx`، `login.tsx`، `pending-approval.tsx`، `register.tsx`، و خود `_app.tsx`.

**زنجیرهٔ redirect لایهٔ `_app`، به ترتیب اجرا:**

```
1  typeof window === "undefined"          → return  (بدون تصمیم؛ صفحهٔ hydration تصمیم می‌گیرد)
2  !user && (loading || !initialized) && !authError → resolve مجدد
3  !user && authError                     → گذر، با ثبت تشخیصی
4  !user                                  → redirect /login
5  user && !profile && authError          → گذر، با ثبت
6  profile && status !== "active"         → redirect /pending-approval   ← این چیزی است که
                                             manager و viewer را می‌گیرد، پیش از هر نگهبانی
7  authError                              → ثبت
   pendingMs: 300، pendingComponent: AuthLoadingScreen
```

**الگوی کامپوننتی که در این مخزن کار می‌کند** (سیزده فایل دارندش؛ کامل خوانده شد در
`_app.accounting.receipts.create.tsx`): `useAuth()` → `rolesLoading` → نگه‌دار؛
`rolesError` → پیام متفاوت؛ `!allowed` → «دسترسی ندارید…»؛ وگرنه صفحه. شرط **مثبت**
نوشته شده (`roles.some(r => CREATE_ROLES.includes(r))`)، نه به‌صورت نفی.

### ۰.۵ — خط پایهٔ رگرسیون

```
R2   /api/public/products      200، ۱۹۹ محصول، صفر قیمت غیرصفر
R3   public sale-list          404      (صفر لیست منتشرشده از ۲۰)
R4   هشت view نگهبان           ۸ از ۸ رد
R5   view/sequence تازه        anon هیچ امتیازی نمی‌گیرد
R6   get_recent_purchase_label 401
R7   rolbypassrls              anon=false  authenticated=false
R8   /api/healthz              200
R11  digest a51ee08e55ff48453d7a2925f1c5d098   pg_class 1105   pg_proc 841
APP_GIT_SHA مستقر           dbe46fe1     HEAD  f0257d2e
```

R1، R9 و R10 در فاز ۳ گرفته می‌شوند (R10 یک بار، در انتها).

---

## فاز ۱ — نمونهٔ اولیه. مکانیزم پیشنهادی سند **شکست خورد**، دومی کار کرد.

### تلاش ۱ — context مسیر. ساخته شد، مستقر شد، سنجیده شد، **کار نمی‌کند**.

ایده: هر نگهبان نیازش را از `beforeLoad` برگرداند، TanStack آن را در context مسیر ادغام
کند، و `_app` پسش بگیرد. ساختمش، build کردم، روی سرور تست مستقر کردم و رفتار را سنجیدم:

```
[sales] FULL /accounting/treasury -> RENDERED     ← هیچ تغییری
```

بعد یک build تشخیصی که وضعیت واقعی router را در DOM ریخت:

```
[{"id":"__root__","ctxKeys":[]},
 {"id":"/_app","ctxKeys":[]},
 {"id":"/_app/accounting/treasury","ctxKeys":[]}]
```

**هر سه match، context خالی.** مقدار بازگشتی `beforeLoad` از SSR به کلاینت hydrate‌شده
منتقل نمی‌شود. دروازه‌ای که آن را بخواند هرگز شلیک نمی‌کند — یک بررسیِ مرده که شبیه
بررسی زنده است، و این بدتر از نبودنِ بررسی است. **کد حذف شد، نه اینکه بماند.**
`route-guards.ts` در نهایت **دست‌نخورده** است.

### تلاش ۲ — `staticData`. کار می‌کند.

`staticData` پیکربندی ایستای مسیر است، پس به کلاینت می‌رسد. روی **یک** مسیر با یک شاهد
سنجیده شد، پیش از اینکه به بقیه اعمال شود:

```
sales  /accounting/treasury         (دارای staticData)  → «دسترسی ندارید. این بخش فقط
                                                            برای مدیر کل، مدیر، حسابدار است.»
sales  /accounting/payment-vouchers (شاهد، بدون آن)      → صفحه رندر شد
accountant  هر دو                                        → صفحه رندر شد، بدون رد
```

**هزینه: یک خط برای هر مسیر.** به همین دلیل این مأموریت سیزده مسیر حسابداری را می‌بندد و
۱۳۶ مسیر نگهبان‌دار دیگر را دست نمی‌زند. اجرای سراسری حالا تصمیمی با هزینهٔ معلوم است و
مال مالک است، نه این diff.

## فاز ۲ — تغییر

سه فایل ساختاری و چهارده فایل مسیر:

```
src/components/layout/RouteRoleGate.tsx     تازه — اجراکنندهٔ سمت کلاینت
src/routes/_app.tsx                         دو خط: import و پیچیدن <Outlet/>
۱۴ فایل _app.accounting.*                   هرکدام یک سطر staticData
e2e/phase6/m6-route-guard.spec.ts           دروازهٔ ادعا
```

هر `staticData` **به‌صورت مکانیکی** با `requireAnyRole` خودِ همان فایل مقایسه شد، نه با
رونویسی من: هر چهارده `MATCH`.

سه خروجی عمداً از هم جدا: `rolesLoading` → «در حال بررسی دسترسی…»؛ `rolesError` → پیام
مستقل؛ رد → «دسترسی ندارید. این بخش فقط برای …». شرط **مثبت** نوشته شده — `passes()`
مجازها را می‌شمارد، نه ممنوع‌ها.

**روی سرور deny نشد، عمداً.** `ensureAuthReady` نشست را از حافظهٔ مرورگر می‌خواند، پس
deny در SSR هر کاربر مجاز را در اولین بارگذاری به `/login` می‌فرستد — همان رگرسیونی که
فاز ۶.۷ مجبور شد در سه مسیر برش گرداند.

## فاز ۳ — پذیرش

### A5/A6 — دروازه پیش از اعتماد، کوبیده شد

با برداشتن اتصال از `_app` و build دوباره:

```
۱۳ افتاد از ۱۷ — هر دوازده بارگذاری کامل sales، به‌علاوهٔ ادعای حالت بارگذاری نقش‌ها
۴ سبز ماند  — یکی‌شان sales روی receipts/create، که لایهٔ خودش را از فاز ۶ دارد
```

سیزدهمی سبز ماندنش خودش شاهد است بر رد فرض سند مأموریت. با اتصال برگردانده‌شده:
**۱۷ از ۱۷ سبز.**

### A1–A4، A7

| # | نتیجه |
|---|---|
| A1 | `sales`، بارگذاری کامل، هر ۱۳ مسیر → «دسترسی ندارید. این بخش فقط برای مدیر کل، مدیر، حسابدار است.» |
| A2 | `sales`، ناوبری سمت‌کلاینت → `/unauthorized`، بدون تغییر نسبت به خط پایه |
| A3 | `admin` و `accountant`، بارگذاری کامل → صفحه رندر شد؛ صفر پرش به `/login`، صفر رد، صفر گیرکردن روی حالت بررسی |
| A4 | نقش‌ها در حال بارگذاری → «در حال بررسی دسترسی…»، **نه** رد |
| A7 | `manager` → `NOT TESTABLE — status=rejected`. فعال نشد |

### R1 — سه شاخهٔ ویزارد، **واقعاً اجرا شد**

```
دریافت: نوع: دریافت  نحوه: بانکی  طرف: علی  نوع پرونده: مشتری  کد آسان: ۱۰۵۰۵۲
        مبلغ: ۱٬۲۵۰٬۰۰۰ تومان  تاریخ: ۲ شهریور ۱۴۰۵  شمارهٔ پیگیری: R1RECV4410
پرداخت: نوع: پرداخت  نحوه: بانکی  مبلغ: ۱٬۲۵۰٬۰۰۰ تومان  پیگیری: R1TRACK9911
دوبل:   نوع: سند دوبل  طرف: علی (مشتری)  ذینفع: شخص آزمایشی ۷۸ (تأمین‌کننده)
        مبلغ: ۱٬۲۵۰٬۰۰۰ تومان  پیگیری: R1DUAL7722  شرح: آزمون R1 …
```

**هیچ سندی ثبت نشد.** `wizard-submit` هرگز کلیک نشد و شمارش‌ها دست‌نخورده‌اند:
`payment_receipts=10  payment_vouchers=1  journal_entries=7  document_numbers=159`،
و صفر ردیف با شمارهٔ پیگیری `R1%`.

**شاخهٔ نقدی رانده نشد و علتش سنجیده است، نه حدس:** برای کانال نقدی
`accountChoices` خالی است و ویزارد به‌جای انتخابگر حساب می‌نویسد «صندوقی با نوع نقدی ثبت
نشده است.». `bank_accounts` دقیقاً یک ردیف دارد و `account_type` آن `bank` است. هیچ صندوق
نقدی روی این سرور نیست — **این OG-37 است، پیش از این مأموریت وجود داشته، و ساختنش یعنی
نوشتن دادهٔ کسب‌وکار.** هر سه شاخه با کانال بانکی رانده شدند.

**چهار پیش‌نویس R1 افتاد و هر چهار تقصیر خودم بود، نه محصول** — ثبت می‌شود چون هرکدام
فرضی است که خوانندهٔ بعدی ممکن است تکرار کند: انتخاب شاخه خودش `setStep(2)` می‌زند؛
انتخاب کانال نمی‌زند؛ `wizard-account` یک `<select>` بومی است؛ و lookup فقط
`asan_person_code` یا `mobile_e164` می‌پذیرد و شخص بدون کد آسان را رد می‌کند.

### رگرسیون

```
R2   200، ۱۹۹ محصول، صفر قیمت غیرصفر        = خط پایه
R3   404، صفر لیست منتشرشده از ۲۰            = خط پایه
R4   ۸ از ۸ رد                                = خط پایه   (G-1 برنگشته)
R5   view=false seq=false                     = خط پایه   (OG-25 برنگشته)
R6   401                                      = خط پایه   (M3 برنگشته)
R7   anon=false authenticated=false           = خط پایه   (M9 برنگشته)
R8   healthz 200                              = خط پایه
R10  npx tsc --noEmit = ۷۰                    = خط پایه، و صفر خطا در هر فایل لمس‌شده
R11  a51ee08e55ff48453d7a2925f1c5d098 / 1105 / 841  = خط پایه
```

### R9 — کل مجموعهٔ e2e مخزن

```
490 passed   19 skipped   7 did not run   0 failed   exit code 0   (41.2m)
```

صفر شکست. خط پایهٔ R9 در فاز ۰ گرفته نشده بود و این را صریح می‌نویسم — ولی با صفر شکست،
مقایسه با «همان شکست‌های شناخته‌شدهٔ خط پایه» موضوعیت ندارد. «۷ اجرانشده» شکست نیست؛
پلی‌رایت وقتی worker تکی است و فایل‌ها به ترتیب می‌آیند این را گزارش می‌کند.

## گام بعدی

استقرار پس از merge، سپس اجرای دوبارهٔ A1–A4 و R1 روی build مستقرشده.
