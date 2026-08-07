# سیستم‌وار — قابلیت‌های دوبار ساخته‌شده یا نصفه‌کاره

**تاریخ:** ۲۰۲۶-۰۸-۰۷ · **مبنا:** `HEAD = da7f4c5d` · برنچ `feature/navigation-modernization`
**نوع:** فقط‌خواندنی. هیچ کد، مهاجرت یا داده‌ای تغییر نکرد.
**وضعیت:** گام ۱ کامل · گام‌های ۲ تا ۴ باقی — `system-wide-wiring-audit-progress.md`

> هر ادعا `file:line` یا کوئری با نتیجهٔ زنده دارد.

---

## خلاصهٔ مدیریتی — مقدماتی

> پس از گام‌های ۲ تا ۴ بازنویسی می‌شود. این‌ها از گام ۱ قطعی‌اند.

۱. 🔴 **۲۸ مسیر ثبت‌شده در ناوبری هرگز در سایدبار رندر نمی‌شوند** — از جمله خروجی و
   ورودی آسان، صف تداخل تلفن، پنل مدیریت خرید، ادغام و ورود اشخاص، و جست‌وجوی فروش.
   همان باگ `/updates` ولی ۲۸ برابر.
۲. 🔴 **پنج منبع ناوبری مستقل وجود دارد، نه دو تا.** هیچ‌کدام منبع حقیقت واحد ندارند.
۳. 🟠 **`MobileBottomNav` فهرست مسیرهای خودش را hard-code کرده** و اصلاً از registry
   نمی‌خواند — پس منوی موبایل و دسکتاپ می‌توانند بی‌صدا از هم جدا بمانند.
۴. 🟡 **یک لینک شکسته:** `/pending` در registry هست ولی فایلی ندارد.

---

## الف) موارد دوبار ساخته‌شده (Duplicated)

### الف-۱ 🔴 سه فهرست مسیر که باید هم‌خوان باشند و نیستند

| منبع | فایل | تعداد مسیر |
|---|---|--:|
| `NAVIGATION_SEEDS` | `src/lib/navigation/registry.ts` | **۱۲۳** |
| `PRIMARY_MODULE_PATHS` | `src/lib/navigation/registry.ts:1109` | **۱۱۴** |
| `PRIMARY_MODULES[].paths` | `src/components/layout/primary-modules.ts:36` | **۸۶** |

`itemsForModule()` در `primary-modules.ts:195-208` **فقط سومی را می‌خواند**:

```ts
for (const p of m.paths) { const it = byPath.get(p); if (it) out.push(it); }
```

پس هر مسیری که در سومی نباشد، هرچقدر هم seed و مجوز و گروه درست داشته باشد،
**هرگز در سایدبار دیده نمی‌شود**.

**۲۸ مسیر در registry هست و در primary-modules نیست:**

```
/accounting/payment-vouchers      /admin/sales-reminders
/accounting/treasury              /admin/visitors
/admin/asan-export                /admin/workflow-settings
/admin/asan-import                /gamification/admin/achievements
/admin/audit                      /gamification/admin/kpi-rules
/admin/automation                 /gamification/admin/leagues
/admin/delivery-receipts          /gamification/admin/manual-metrics
/admin/documents                  /gamification/admin/manual-metrics/guide
/admin/penalties                  /gamification/admin/missions
/admin/platform-releases          /gamification/admin/purchase-settings
/admin/purchase                   /gamification/admin/rewards
/my-rejected-quotes               /persons/import
/pending                          /persons/merge
/sales/product-videos             /sales/search
```

جهت مخالف **صفر** است — یعنی `primary-modules` زیرمجموعهٔ محضِ registry است و صرفاً
عقب مانده.

**اگر seeds را هم بسنجیم، ۳۸ ورودیِ کاملاً تعریف‌شدهٔ ناوبری هرگز نمایش داده نمی‌شوند**
(۲۸ بالا به‌علاوهٔ مواردی مثل `/admin/phone-collisions`، `/collaboration`،
`/accounting/salesperson-scoring`).

**شدت 🔴** — این صفحات فقط با تایپ مستقیم آدرس قابل دسترسی‌اند.

> ### تصحیح یک ادعای پیشین من
> در `docs/execution/unify-plan-corrected.md` نوشتم که چهار صفحه‌ای که `P3_SIDEBAR.md`
> «یتیم» خوانده بود «در registry ثبت‌شده‌اند» و بنابراین ادعای فایل مأموریت نادرست است.
> **آن تصحیح خودش نادرست بود.** آن‌ها در `NAVIGATION_SEEDS` ثبت‌اند ولی در
> `PRIMARY_MODULES.paths` نیستند، پس عملاً در سایدبار دیده نمی‌شوند. ادعای اصلی
> `P3_SIDEBAR.md` در عمل درست بود؛ من فقط لایهٔ اشتباهی را بررسی کرده بودم.

**جهت رفع (پیاده نشده):** یک منبع حقیقت. `PRIMARY_MODULES` گروه‌بندی و ترتیب را نگه دارد
ولی فهرست مسیرها را از registry مشتق کند، نه اینکه دوباره بنویسد.

### الف-۲ 🔴 پنج منبع ناوبری مستقل

| # | منبع | محل | تعداد |
|--:|---|---|--:|
| ۱ | `NAVIGATION_SEEDS` | `registry.ts` | ۱۲۳ |
| ۲ | `PRIMARY_MODULE_PATHS` | `registry.ts:1109` | ۱۱۴ |
| ۳ | `PRIMARY_MODULES[].paths` | `primary-modules.ts:36` | ۸۶ |
| ۴ | `QUICK_ACCESS_BY_ROLE` | `AppSidebar.tsx:34` | ۱۳ |
| ۵ | فهرست ثابت منوی موبایل | `MobileBottomNav.tsx:14+` | ۱۳ |

مأموریت انتظار دو منبع را داشت؛ **پنج تا هست**.

### الف-۳ 🟠 منوی موبایل از registry نمی‌خواند

`MobileBottomNav.tsx:14-21` مسیرها را مستقیم و ثابت می‌نویسد:

```tsx
{ to: "/dashboard", label: "خانه" },
{ to: "/products", label: "محصولات" },
{ to: "/pricing/quick-price", label: "قیمت سریع" },
{ to: "/reports", label: "گزارش‌ها" },
```

پس تغییر مجوز، برچسب یا مسیر در registry **هیچ اثری روی منوی موبایل ندارد**.
همان الگوی «دو ساختار، بدون منبع واحد».

**جهت رفع:** منوی موبایل هم از `getMobileNavigationEntries` بخواند (که وجود دارد —
`selectors.ts:52`) به‌جای فهرست ثابت.

---

## ب) فرانت بدون بک‌اند

> گام ۲ و ۴ هنوز اجرا نشده‌اند. یافته‌های این بخش پس از آن نوشته می‌شود.

### ب-۱ 🟡 لینک شکسته: `/pending`

`/pending` در `PRIMARY_MODULE_PATHS` هست ولی **هیچ فایل مسیری روی دیسک ندارد**.
تنها لینک شکستهٔ کل پروژه (۱ از ۱۲۳).

احتمالاً `/users/pending` مقصود بوده که فایلش وجود دارد.

---

## ج) بک‌اند بدون فرانت

> گام ۲ هنوز اجرا نشده است.

---

## پیوست — روش گام ۱

فهرست فایل‌های مسیر از `src/routes/` خوانده و طبق قرارداد TanStack به مسیر تبدیل شد
(`_app.` حذف، `_.` به `.`، `index` به والد). سپس با هر پنج منبع ناوبری مقایسه شد.

**۶۴ فایل مسیر در هیچ منبع ناوبری نیستند** — ولی بیشترشان مسیر پارامتری یا جزئیات‌اند
(`/persons/$personId`، `/academy/$courseId/...`) که طبیعتاً ورودی منو ندارند. تفکیک
«یتیم واقعی» از «مسیر جزئیات» در گام ۴ انجام می‌شود.
