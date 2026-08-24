# M6 — OG-24 · نگهبان مشترک مسیرها که fail-open است — PROGRESS

## HANDOFF STATE

```
Mission:              M6 — OG-24, نگهبان مسیر. مأموریت FRONTEND، نه پایگاه‌داده.
Status:               فاز ۰ کامل
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

## گام بعدی

فاز ۱ — نمونهٔ اولیه روی **یک** مسیر. پیش از آن هیچ اصلاحی نوشته نمی‌شود.
