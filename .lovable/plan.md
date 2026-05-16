## مشکل

ورود موفق است (HTTP 200 از `/auth/v1/token`)، پروفایل و نقش `admin` با `status=active` لود می‌شود، اما بلافاصله بعد از `navigate({ to: "/dashboard" })` کاربر به `/login` برمی‌گردد. در network log حتی دو session پشت سر هم دیده می‌شود (دو `iat` با ~۲۴ ثانیه فاصله) که نشان می‌دهد یک حلقهٔ redirect/relogin در جریان است.

تمام مسیرهایی که می‌توانند به `/login` redirect کنند مشخص هستند:
- `src/routes/_app.tsx` (`beforeLoad` وقتی `!auth.user`)
- `src/lib/rbac/route-guards.ts` (`requirePermission` / `requireAdmin` / `requireAnyRole` وقتی `!user`)
- `src/routes/index.tsx`
- `src/routes/pending-approval.tsx`
- `AuthErrorBoundary` در `__root.tsx` که در خطای chunk، `forceHardReload` می‌زند

با توجه به تایمینگ replay (۹۰۰ms بعد از navigate → /login) و اینکه snapshot.user واقعاً ست شده، محتمل‌ترین علت یک **race condition** بین این رویدادهاست:

1. `handleLogin` → `await signIn` (Supabase fetch + emit `SIGNED_IN`) → `await refreshRoles` → `navigate({to:"/dashboard"})`.
2. همزمان `onAuthStateChange` در `session.ts` با `event === "SIGNED_IN"` و `isFullReload=true` یک `applySession(force=true)` می‌زند که `loading=true` می‌کند، سپس دوباره `loadIdentity` می‌کند.
3. وقتی `_app.dashboard.beforeLoad → requirePermission` صدا زده می‌شود، `ensureAuthReady` cached snapshot را برمی‌گرداند که در آن لحظه ممکن است `user` ست باشد ولی `rolesLoading` یا `loading` همان True باشد. در شاخهٔ early-return، تابع `{ user, roles }` بازمی‌گرداند **بدون** چک permission — درست است. ولی اگر `snapshot.user` در همان لحظه به دلیل re-emit شدن SIGNED_IN قبل از resolve شدن `applySession` null باشد، redirect به `/login` می‌خورد.

تشخیص قطعی فقط با instrumentation ممکن است.

## برنامه

### گام ۱ — افزودن لاگ تشخیصی متمرکز روی هر redirect-to-login

در هر یک از این نقاط، قبل از `throw redirect({to:"/login"})` یک `logAuthDiagnostic("redirect.login", "<call-site>", { hasUser, snapshot })` بزن:
- `src/routes/_app.tsx` beforeLoad
- `src/lib/rbac/route-guards.ts` (هر سه تابع)
- `src/routes/index.tsx`
- `src/routes/pending-approval.tsx`

همچنین در `src/lib/auth/session.ts` داخل `applySession` و `onAuthStateChange` لاگ کن: event name، `hasSession`, `previousUserId`, `force`, و در `setSnapshot` خلاصهٔ تغییر `user/loading`.

این کار تنها چند خط `console.info` + ثبت در `auth-diagnostics` است و رفتار فعلی را تغییر نمی‌دهد.

### گام ۲ — اجرا و خواندن لاگ‌ها

از کاربر می‌خواهیم یک بار لاگین کند، سپس روی صفحهٔ login که برگشته دکمهٔ «نمایش گزارش خطا» را بزند (یا از sessionStorage `afrakala:auth-diagnostics` بخوانیم). با این لاگ‌ها دقیقاً مشخص می‌شود کدام guard و در چه state ای redirect را زده.

### گام ۳ — رفع علت بر اساس یافته‌ها

دو احتمال غالب و راه‌حل آماده:

**الف) Race بین `signIn` و `onAuthStateChange`:**
در `handleLogin` به جای `await refreshRoles()` بعد از `signIn`، صریحاً `await ensureAuthReady(true)` صدا بزن **و قبل از navigate شرط `if (snapshot.user)` را چک کن**. اگر هنوز user ست نشده، یک retry کوتاه (polling هر 100ms تا 1s).

علاوه بر این، در `route-guards.ts` و `_app.tsx`، در شاخهٔ early-return وقتی `loading/profileLoading/rolesLoading` true است **و user ست است**، اجازهٔ عبور بده (همین کار را می‌کند). ولی اگر `user` null است **و** `loading` true، به جای redirect یک `await ensureAuthReady(true)` بزن و دوباره چک کن — این از redirect زودرس جلوگیری می‌کند.

**ب) Stale chunk error → forceHardReload:**
اگر لاگ نشان داد `AuthErrorBoundary` فعال شده، باید regex `isStaleChunkError` بازبینی شود تا روی خطاهای بی‌ربط false-positive نزند، و `forceHardReload` بعد از login تازه ۲–۳ ثانیه‌ای cooldown داشته باشد.

### گام ۴ — تایید

بعد از fix، لاگین کن و چک کن:
- کاربر در `/dashboard` بماند
- فقط یک POST `/auth/v1/token` بزند (نه دو تا)
- لاگ `auth-diagnostics` خالی از `redirect.login` بعد از لاگین موفق باشد

## فایل‌های تحت تاثیر (تخمینی)

- `src/lib/auth/session.ts` (لاگ + احتمالاً تغییر منطق applySession)
- `src/lib/rbac/route-guards.ts` (لاگ + early-return بازنویسی)
- `src/routes/_app.tsx`, `src/routes/index.tsx`, `src/routes/pending-approval.tsx` (لاگ)
- `src/routes/login.tsx` (در صورت نیاز، polling کوتاه بعد از signIn)

هیچ migration، RLS، schema یا backend change‌ای لازم نیست — مشکل صرفاً frontend auth state machine است.