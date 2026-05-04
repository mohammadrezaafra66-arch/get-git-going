# رفع مشکل Session و Persistence

## تحلیل ریشه

### مشکل ۱: درخواست لاگین بعد از رفرش
Supabase client با `persistSession: true` و `localStorage` تنظیم شده، پس session واقعاً ذخیره می‌شود. اما در `src/routes/_app.tsx` در `beforeLoad`:

```ts
const auth = await ensureAuthReady();
if (!auth.user) throw redirect({ to: "/login" });
```

اگر `getSession()` در همان رندر اول کندتر از انتظار جواب بدهد، یا قبل از hydration کامل اجرا شود، `auth.user` ممکن است `null` باشد و کاربر به `/login` پرت شود. علاوه بر این، در `src/routes/index.tsx` نیز همین race condition وجود دارد (`getSession` بدون انتظار برای hydration).

**علامت کاربر:** «بعد از رفرش، صفحه لاگین نشان داده می‌شود.»

### مشکل ۲: درخواست لاگین بعد از سویچ تب
هنگام برگشتن از تب دیگر، Supabase auth یک رویداد `TOKEN_REFRESHED` یا `SIGNED_IN` صادر می‌کند. در `applySession()` فایل `src/lib/auth/session.ts`:

```ts
setSnapshot({ initialized: true, loading: true, session, user: session.user });
await loadIdentity(session.user, force); // force=true در onAuthStateChange
```

با `force=true`، profile و roles دوباره fetch می‌شوند و `loading` کل اپ true می‌شود → AppLayout صفحه «در حال بررسی جلسه کاربری» را نشان می‌دهد. این باعث **unmount کامل درخت کامپوننت** می‌شود و تمام useState ها (شامل سرچ، فرم نیمه‌پر و …) از بین می‌روند.

**علامت کاربر:** «وقتی برمی‌گردم، نتیجه سرچ ۲۴ پاک شده و صفحه اول جستجو نمایش داده می‌شود.»

### مشکل ۳: state داخل کامپوننت volatile است
حتی اگر unmount نشود، رفرش صفحه هم state را پاک می‌کند. برای راه‌حل کامل نیاز به **persist کردن state مهم در sessionStorage** داریم.

---

## راه‌حل

### ۱. حذف unmount/loading screen هنگام token refresh و تب‌سویچ

در `src/lib/auth/session.ts`:
- در `applySession`، اگر session جدید همان user قبلی باشد (token refresh)، **فقط session را به‌روز کن**؛ profile/roles را re-fetch نکن و `loading=true` نگذار.
- در `onAuthStateChange`، event را بررسی کن: برای `TOKEN_REFRESHED` فقط session را آپدیت کن، نه force reload.
- فقط برای `SIGNED_IN` (با userId متفاوت) و `SIGNED_OUT` reload کامل انجام شود.

نتیجه: AppLayout دیگر unmount نمی‌شود → state کامپوننت‌ها حفظ می‌شود.

### ۲. مقاوم‌سازی auth check در رفرش

در `src/routes/_app.tsx` و `src/routes/index.tsx`:
- بجای `getSession()` خام، از `supabase.auth.getUser()` استفاده شود که منتظر hydration می‌ماند.
- در `beforeLoad`، اگر session در حال restore است، صبر کن (max 2s timeout) قبل از redirect.

### ۳. Persist کردن state در sessionStorage برای صفحات مهم

برای جلوگیری از پاک شدن state حتی در رفرش:
- ساخت hook عمومی `useSessionStorageState<T>(key, initialValue)` در `src/hooks/use-session-storage-state.ts` (مثل useState ولی با sync به sessionStorage).
- اعمال آن روی state های کلیدی صفحه `src/routes/_app.sales.search.tsx`:
  - `search`, `brandIds`, `categoryIds`, `labelIds`, `stockStatus`, `productType`, `salePriceTypeId`, `onlyWithPrice`, `labelMode`, `labelModeIds`, `labelModePage`
- React Query با `staleTime: 30_000` خودش cache نتایج را نگه می‌دارد، پس با persist شدن سرچ‌ترم، نتیجه فوری برمی‌گردد.

**برای فرم‌های نیمه‌پر:** فعلاً فقط روی صفحه «جستجوی سریع فروش» تمرکز می‌کنیم (مثال صریح کاربر). بعد از تأیید این الگو، می‌توان آن را روی فرم‌های ساخت محصول/فاکتور/فیش نیز اعمال کرد (در فاز جداگانه، چون هر فرم باید جداگانه refactor شود).

---

## فایل‌های تغییر

| فایل | تغییر |
|---|---|
| `src/lib/auth/session.ts` | تشخیص TOKEN_REFRESHED، عدم reload roles روی refresh، عدم نمایش loading screen |
| `src/routes/_app.tsx` | gate قوی‌تر با getUser + timeout |
| `src/routes/index.tsx` | استفاده از getUser به‌جای getSession |
| `src/hooks/use-session-storage-state.ts` | hook جدید |
| `src/routes/_app.sales.search.tsx` | جایگزینی useState با useSessionStorageState برای فیلترها/سرچ |

## فایل‌های بدون تغییر
- `src/integrations/supabase/client.ts` (auto-generated)
- migrationها (نیاز به migration نیست — فقط client-side)
- RLS/RBAC دست‌نخورده

---

## Self-Host Acceptance Check

| معیار | وضعیت |
|---|---|
| بدون secret جدید / بدون VITE_ secret | ✅ |
| بدون CDN خارجی، بدون dependency جدید | ✅ |
| RLS/RBAC حفظ — auth flow فقط بهبود UX | ✅ |
| migration لازم نیست | ✅ |
| سازگار با Linux + Docker + Supabase self-host | ✅ |
| audit log دست‌نخورده | ✅ |
| Mobile-first / RTL حفظ | ✅ |
| signup با تایید ادمین حفظ | ✅ |

## محدودیت‌ها
- فاز اول فقط صفحه «جستجوی سریع فروش» persist می‌شود. اگر کاربر می‌خواهد همین رفتار روی فرم‌های دیگر (محصول جدید، فاکتور، فیش) هم اعمال شود، در فاز بعد جداگانه انجام می‌دهیم — چون refactor فرم‌های پیچیده با react-hook-form الگوی متفاوتی دارد و باید با احتیاط انجام شود.
- داده‌های persist شده در sessionStorage فقط در همان tab زنده‌اند (با بستن tab پاک می‌شوند) — این رفتار درست برای UX است.
