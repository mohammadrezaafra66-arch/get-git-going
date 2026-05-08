## وضعیت فعلی پروژه (مهم)

پروژه هنوز روی **Lovable Cloud Supabase** سوار است:
- `vite.config.ts` خط ۱۲: `https://kwwkppkcihrbeurwudjh.supabase.co` به‌صورت پیش‌فرض inject می‌شود.
- یعنی همهٔ درخواست‌های auth از مرورگر **مستقیماً** به `kwwkppkcihrbeurwudjh.supabase.co` می‌روند، نه از طریق Caddy یا اپ شما.
- در نتیجه تنظیمات «Auth Redirect URLs» در Supabase **برای signInWithPassword نقشی ندارند** — آن لیست فقط برای OAuth و magic link و password reset استفاده می‌شود. بنابراین این مورد علت بازگشت به Login نیست.

## فایل‌های بررسی‌شده

- `vite.config.ts` — کلاینت Supabase به Lovable Cloud وصل است، envهای frontend درست‌اند.
- `src/integrations/supabase/client.ts` — از `localStorage` برای session استفاده می‌کند (`persistSession: true`). cookie ندارد، پس Caddy/proxy روی session تأثیری ندارد.
- `src/routes/login.tsx` — login با `signIn` → `supabase.auth.signInWithPassword`. سپس `refreshRoles()` و `navigate({ to: "/dashboard" })`. هیچ origin/redirect hardcoded نیست. فرم `action="/login"` صرفاً fallback است و `e.preventDefault()` در ابتدای handler صدا زده می‌شود.
- `src/routes/_app.tsx` — `beforeLoad` با `ensureAuthReady()` چک می‌کند. اگر `auth.user` نباشد → redirect به `/login`. اگر `profile.status !== "active"` → redirect به `/pending-approval`.
- `src/lib/auth/session.ts` — listener درست است. `ensureAuthReady` فقط کلاینت را اجرا می‌کند.

## علت‌های محتمل به‌ترتیب احتمال

### 1) (بسیار محتمل) HMR WebSocket از طریق Caddy کار نمی‌کند → reload loop
شما با `npm run dev` (Vite dev) سرو می‌کنید. Vite HMR با WebSocket کار می‌کند و به `127.0.0.1:8080` فرستاده می‌شود؛ اما origin مرورگر `http://PUBLIC_IP:8900` است. Caddy فعلی شما WS را reverse-proxy می‌کند ولی client تلاش می‌کند به host اشتباه وصل شود → خطا → reload کامل. بعد از login، اولین reload localStorage را از دست **نمی‌دهد**، اما اگر بین `signInWithPassword` و `navigate` یک full-page reload رخ دهد، فرم action `/login` در حالت native ممکن است GET بشود و کاربر دوباره روی login بنشیند بدون پیام خطا — دقیقاً علامت بالینی شما.

**تست سریع:** DevTools → Console را روی PUBLIC_IP:8900 باز کنید و دکمهٔ login را بزنید. اگر پیام‌های `[vite] connecting...` / `WebSocket connection to 'ws://...:8080/...' failed` یا چند بار reload می‌بینید، علت همین است.

### 2) (محتمل) Vite `allowedHosts` برای Host خارجی
از Vite 5.4 به بعد، اگر Host header چیزی غیر از localhost باشد، Vite برخی پاسخ‌ها را با «Blocked request» رد می‌کند. اگر صفحه login باز می‌شود ولی برخی asset/HMR ها بلاک شده‌اند، می‌تواند رفتار ناپایدار بسازد.

### 3) (محتمل) برخورد Basic Auth با درخواست‌های داخلی
Caddy روی همهٔ paths (شامل `/api/...` server functions اپ شما) Basic Auth می‌گذارد. مرورگر بعد از login، header `Authorization: Basic ...` را خودکار به همهٔ درخواست‌های same-origin اضافه می‌کند. server-functionهای محافظت‌شده با `requireSupabaseAuth` انتظار `Authorization: Bearer <jwt>` دارند ولی مرورگر برای fetch داخلی، Basic را می‌فرستد و Bearer override نمی‌شود مگر اینکه کد `useServerFn` یا client کوکی Bearer را اضافه کند. پس برخی درخواست‌های داخلی 401 می‌شوند. این مستقیماً signIn را خراب نمی‌کند ولی می‌تواند بعد از redirect به /dashboard چرخهٔ خطا بسازد.

### 4) (کم‌احتمال) تفاوت localStorage بین originها
`http://127.0.0.1:8080` و `http://PUBLIC_IP:8900` دو origin جدا هستند. این باعث «از دست رفتن session بین دو origin» می‌شود اما در یک origin خودش (PUBLIC_IP:8900) باید درست کار کند. بنابراین این علت اصلی شما نیست، فقط توضیح می‌دهد چرا login داخلی روی لپ‌تاپ به login خارجی منتقل نمی‌شود.

### 5) (رد شد) Supabase Auth Redirect URLs
چون `signInWithPassword` redirect-based نیست و کلاینت مستقیم با `kwwkppkcihrbeurwudjh.supabase.co` صحبت می‌کند، اضافه کردن `http://PUBLIC_IP:8900` به Allowed URLs **مشکل را حل نمی‌کند**. فقط برای password-reset / OAuth لازم می‌شود (که فعلاً مسئلهٔ شما نیست).

## تشخیص قطعی (قبل از هر تغییر کد)

روی PUBLIC_IP:8900، DevTools → Network و Console را باز کنید و یک login تست کنید. این چهار سؤال را پاسخ دهید:
1. آیا درخواست `POST https://kwwkppkcihrbeurwudjh.supabase.co/auth/v1/token?grant_type=password` با status 200 برمی‌گردد و response شامل `access_token` است؟
2. بلافاصله بعد از آن، در Application → Local Storage برای origin `http://PUBLIC_IP:8900`، کلیدی شبیه `sb-kwwkppkcihrbeurwudjh-auth-token` با مقدار JWT دیده می‌شود؟
3. آیا قبل یا بعد از کلیک login، صفحه به‌صورت خودکار full reload می‌شود (در Network فیلتر Doc)؟
4. آیا در Console خطای `[vite] failed to connect to websocket` یا «Blocked request» می‌بینید؟

نتیجهٔ این چهار سؤال علت را قطعی می‌کند:
- اگر (1)=200 و (2)=هست و (3)=بله → مشکل قطعاً HMR reload loop است.
- اگر (1)=200 و (2)=نیست → مرورگر localStorage را روی آن origin بلاک می‌کند.
- اگر (1)=fail یا 4xx → خطای واقعی auth (که local کار می‌کند پس بعید است).

## تنظیمات Supabase / Lovable Cloud

برای این سناریو **هیچ تغییری در Supabase لازم نیست**. آدرس‌های `http://PUBLIC_IP:8900` فقط زمانی به Auth Allowed URLs اضافه می‌شوند که از password-reset یا OAuth استفاده کنید. signInWithPassword به آن‌ها وابسته نیست.

## minimal fix پیشنهادی (در صورت تأیید علت)

### اگر علت = HMR / dev-server (محتمل‌ترین):
**راه درست برای دسترسی خارجی موقت، اجرا با build production است نه `npm run dev`.**
```
npm run build
node server/node-entry.mjs   # یا هر start script پروژه
```
سپس Caddy → پورت production. این مسیر HMR ندارد و رفتار قابل‌پیش‌بینی است (و دقیقاً همان چیزی است که در self-host تولیدی استفاده خواهید کرد).

اگر اصرار به `npm run dev` دارید، نیاز به یک تغییر کوچک در `vite.config.ts` (افزودن `vite.server.allowedHosts: true` و `vite.server.hmr.clientPort: 8900` و `host: '0.0.0.0'`) دارد — این فقط برای dev است و باید feature-flag شود تا روی build production و Workers اثری نگذارد.

### اگر علت = Basic Auth در Caddy:
Basic Auth را فقط روی مسیرهای صفحه بگذارید نه `/api/*` و `/_serverFn/*`، یا بهتر: Basic Auth را بردارید و به‌جایش fail2ban + auth خود اپ را معتبر بدانید (چون اپ خودش login دارد).

### اگر علت = localStorage بلاک شده:
احتمالاً extension یا private window است؛ تست با مرورگر دیگر کافی است.

## Caddy headers

Caddy به‌صورت پیش‌فرض `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host` را اضافه می‌کند و header `Host` را preserve می‌کند. **نیازی به header_up دستی برای حل این مشکل نیست.** اگر بعداً self-host کامل کردید و Supabase پشت همان Caddy بود، آن وقت `header_up Host {host}` و `X-Forwarded-Proto https` لازم می‌شود.

## چک‌لیست پایان (Self-Host Acceptance)

این بررسی هیچ تغییر کد، migration، secret، RLS یا dependency نداشت. صرفاً تشخیص. فاز کنونی هنوز روی Lovable Cloud است؛ برای دسترسی خارجی پایدار، گذار به build production توصیه می‌شود (با docs/SELF_HOSTING.md همسو است).

## خلاصه برای شما

1. تنظیمات Supabase را تغییر ندهید — علت اینجا نیست.
2. اول چهار سؤال تشخیصی بالا را روی PUBLIC_IP:8900 جواب دهید.
3. اگر (3) یا (4) مثبت بود، از `npm run dev` برای دسترسی خارجی استفاده نکنید؛ build production بگیرید و Caddy را به آن وصل کنید.
4. هیچ secret یا service-role key وارد frontend نشود (وضعیت فعلی امن است).
