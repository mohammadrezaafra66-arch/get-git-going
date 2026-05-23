## تشخیص

با بررسی کنسول و کد، سه regression عملکردی از تغییرات auth/session امروز پیدا شد:

### 1. `diagnostics.ts` — هر event عادی به‌عنوان `console.error` لاگ می‌شود

در `logAuthDiagnostic` خط ۳۵، **همه** رویدادها (حتی `SIGNED_IN` و `INITIAL_SESSION` کاملاً نرمال) با `console.error` لاگ می‌شوند. در کنسول می‌بینید:

```
error: [auth-diagnostic][session.onAuthStateChange] SIGNED_IN { hasSession: true, ... }
error: [auth-diagnostic][session.onAuthStateChange] INITIAL_SESSION { hasSession: true, ... }
```

هر `console.error` در Chrome یک **stack trace کامل** ضبط می‌کند که سنگین است. این بر هر تب‌فوکوس، هر vite reconnect، و هر token refresh تکرار می‌شود. در preview با devtools باز، خود مرورگر را کند می‌کند.

### 2. `session.ts` — لاگ دیاگنوستیک روی هر event نرمال

خط ۲۹۲: `logAuthDiagnostic("session.onAuthStateChange", event, {...})` برای **هر** event صدا می‌خورد. ترکیب با مورد ۱ یعنی روی هر navigation/refresh یک `console.error` + یک write به sessionStorage. روی navigation شدید (مثل کلیک پشت سرهم روی منو در replay) صدها لاگ تولید می‌کند.

### 3. `_app.tsx` — حلقه polling تا ۵۰۰ms روی هر navigation

خطوط ۳۷–۴۳: حلقه `for (let i = 0; i < 10; i++) { await sleep(50); ... }` در `beforeLoad`. روی هر تغییر مسیر، اگر `auth.user` به دلیلی غایب باشد، تا ۵۰۰ms ناوبری بلاک می‌شود. این برای حالت race اولیه گذاشته شد ولی روی navigation سالم هم احتمال trigger دارد و تأخیر اضافه می‌کند.

### درباره گزارش "Local هم کند است"

تغییرات auth امروز فقط در Lovable است و هنوز به GHCR/سرور Local push نشده (طبق گفته خودتان در سشن‌های قبلی). پس کندی Local **نمی‌تواند از این تغییرات باشد**. در پایان از شما درباره Local جداگانه می‌پرسم.

---

## تغییرات پیشنهادی (محدود، کم‌ریسک)

### فایل ۱: `src/lib/auth/diagnostics.ts`
- در `logAuthDiagnostic`، انتخاب سطح کنسول را هوشمند کنید: فقط زمانی `console.error` که scope/message یکی از `error|fail|timeout|throw|retry|stuck` را دارد. در غیر این‌صورت `console.debug` (که در سطح production فیلتر می‌شود).
- نوشتن به sessionStorage را حفظ کنید تا دکمه «کپی گزارش خطا» همچنان کار کند.

### فایل ۲: `src/lib/auth/session.ts`
- در `onAuthStateChange` فقط زمانی `logAuthDiagnostic` صدا بزنید که `isFullReload || isSignOut || event === "USER_UPDATED"` یا یک خطا رخ داده باشد. event‌های روتین (`INITIAL_SESSION` با همان user، `TOKEN_REFRESHED`، `SIGNED_IN` همان user) لاگ نشوند.
- بقیه منطق session دست‌نخورده می‌ماند (همان منطق `applySession` / force / loadIdentity).

### فایل ۳: `src/routes/_app.tsx`
- حلقه ۱۰×۵۰ms را با یک تلاش مجدد ساده جایگزین کنید: اگر `!auth.user && !auth.initialized`، **یک‌بار** `await ensureAuthReady()` دوباره صدا بزنید (بدون force). اگر باز user نبود، redirect. این مسیر race اولیه را پوشش می‌دهد بدون اضافه‌کردن ۵۰۰ms به هر navigation.
- بقیه `beforeLoad` و کامپوننت `AppLayout` بدون تغییر.

### فایل ۴ (اختیاری، فقط اگر لازم باشد)
بدون نیاز به تغییر.

---

## محدودیت‌های صریح (طبق قوانین AfraKala)

- **فقط ۳ فایل**: `diagnostics.ts`, `session.ts`, `_app.tsx`.
- **بدون** تغییر در: pricing, sale-list PDF, bot API, dashboard/sidebar, invoices, migrations, deploy/*, RLS/RBAC, Auth config, AuthProvider.tsx, login.tsx.
- **بدون** migration، **بدون** secret جدید، **بدون** dependency جدید.
- رفتار `TOKEN_REFRESHED`/`USER_UPDATED` در `applySession` حفظ می‌شود.
- مقدار اولیه `hydrated` تغییر نمی‌کند.
- پاکسازی sessionStorage لاگ‌ها (manual button) همچنان کار می‌کند.

---

## ریسک و rollback

- **ریسک**: کم. تغییرات صرفاً «صدایی که در کنسول/sessionStorage تولید می‌شود» و یک حلقه دفاعی را کاهش می‌دهند، نه منطق احراز هویت را.
- **اثر جانبی محتمل**: اگر در آینده برای دیباگ یک نشست خاص نیاز به لاگ همه event‌ها داشتید، باید این فیلتر را موقتاً برداشت. به‌جای حذف، می‌توان یک flag دیباگ گذاشت ولی برای اجتناب از scope-creep این کار را نمی‌کنم مگر بخواهید.
- **Rollback**: `git revert <commit>` روی همین سه فایل.

---

## چک‌لیست تست دستی پس از پیاده‌سازی

1. لاگین تازه → AppShell سریع باز شود، بدون فلش "بررسی جلسه".
2. کلیک سریع پشت‌سرهم روی منو (sidebar) → تأخیر محسوس نباید باشد.
3. باز/بسته کردن تب چندبار → بدون reload صفحه، بدون فلاش لودینگ.
4. کنسول devtools باز: روی navigation معمولی نباید `console.error` تازه‌ای از auth-diagnostic دیده شود.
5. خطای واقعی auth (مثلاً قطع موقت اینترنت روی refresh) → همچنان در sessionStorage ذخیره شود و دکمه «کپی گزارش خطا» کار کند.

---

## سؤال مهم درباره Local

شما گفتید "Local هم کند است". اما تغییرات auth امروز هنوز در Local نیست (طبق سشن‌های قبلی، در شاخه داخلی Lovable است و push به GHCR نشده). یعنی:

- اگر Local **به‌تازگی build/pull تازه‌ای داشته**، لطفاً تأیید کنید چه commit‌ای روی آن است.
- اگر Local commit قدیمی‌تری دارد و باز هم کند است، **دلیل کندی Local از این تغییرات نیست** و باید جداگانه بررسی شود (احتمالاً DB query، یا فشار روی worker قیمت‌گذاری، یا اینترنت ضعیف به Lovable Cloud).

بعد از تأیید پلن، اول این سه فایل را برای رفع کندی Lovable اصلاح می‌کنم، سپس اگر تأیید کردید درباره Local بپرسیم، یک تشخیص جداگانه انجام می‌دهم.
