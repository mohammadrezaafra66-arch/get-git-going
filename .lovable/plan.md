## Summary

سرور Node خود-میزبان (`server/node-entry.mjs`) فقط `handler.fetch` خروجی build SSR را صدا می‌زند. این handler از TanStack Start برای محیط Cloudflare ساخته شده و فرض می‌کند فایل‌های `dist/client/**` را binding خود Cloudflare (`assets` در `wrangler.jsonc`) سرو می‌کند. در Docker LAN هیچ‌چیزی این نقش را بازی نمی‌کند → هر `/assets/*`, `/fonts/*`, `/favicon.ico`, `/manifest.webmanifest` و … به SSR می‌رود و چون route ندارد ۴۰۴ می‌گیرد. این دقیقاً با علائم گزارش‌شده می‌خواند.

پیشنهاد: یک لایه‌ی static-file ساده‌ی Node-native (بدون افزودن وابستگی) را در همان `server/node-entry.mjs` **قبل از** فراخوانی SSR قرار دهیم. هیچ تغییری در SSR bundle، Supabase، LAN، .env، یا UI نیست. تنها فایل اصلی تغییری: `server/node-entry.mjs`.

## Technical details

### 1. ریشه‌یابی

- `Dockerfile` خروجی build را در `/app/dist` کپی می‌کند (`dist/client` + `dist/server/server.js`).
- `CMD ["node", "server/node-entry.mjs"]` → سرور تک‌فایلی Node بدون هیچ static middleware.
- `handler.fetch` فقط approuteها و serverFnها را می‌شناسد. در نتیجه:
  - `GET /` → SSR HTML برمی‌گرداند (شامل لینک به `/assets/*.js`).
  - `GET /assets/index-Bi1459jE.js` → SSR notFound → 404.
- این رفتار با لاگ‌ها (`/api/healthz=200` اما asset=404) و وجود فایل‌ها در فایل‌سیستم سازگار است.

### 2. تغییر دقیق در `server/node-entry.mjs`

#### الف) ثابت‌های مسیر، با absolute path

```
const __dirname     = dirname(fileURLToPath(import.meta.url));     // /app/server
const clientDirAbs  = pathResolve(__dirname, "../dist/client");    // /app/dist/client
const assetsDirAbs  = pathResolve(clientDirAbs, "assets");
const fontsDirAbs   = pathResolve(clientDirAbs, "fonts");
```

#### ب) startup logs و smoke check (طبق درخواست ۵ و ۶)

در زمان bootstrap چاپ شود:
- `process.cwd()`
- `__dirname`
- `clientDirAbs`
- `existsSync(clientDirAbs)`
- `existsSync(assetsDirAbs)`
- `existsSync(fontsDirAbs)`
- تعداد فایل‌های `.js` و `.css` داخل `assetsDirAbs` (با `readdirSync` فیلتر پسوند).

اگر `assetsDirAbs` وجود ندارد، با `console.error` پیام صریح چاپ شود و `process.exit(1)` فقط در صورت نبود کامل `dist/client` (تا کانتینر در حالت broken بالا نماند). برای حالت «assets موجود اما هیچ JS ندارد» فقط `console.error` بدون exit (تا اپ بتواند صفحه‌ی خطا بدهد).

#### ج) static handler قبل از SSR

داخل `createServer` callback، **پیش از** `handler.fetch`:

1. اگر `method` در `{GET, HEAD}` نیست → مستقیم برو SSR.
2. `pathname` را از `req.url` با `new URL(req.url, base)` بکن.
3. اگر `pathname === "/"` → برو SSR (تا index از SSR بیاید، نه `index.html` استاتیک).
4. وگرنه:
   - `candidate = pathResolve(clientDirAbs, "." + pathname)`
   - **path-traversal guard**: اگر `!candidate.startsWith(clientDirAbs + sep)` → برو SSR.
   - `statSync(candidate)` در try/catch:
     - اگر فایل بود → سرو از دیسک با `createReadStream` + content-type صحیح.
     - اگر دایرکتوری بود یا ENOENT → برو SSR.
5. content-type map (حداقل): `.js`, `.mjs` → `application/javascript; charset=utf-8`؛ `.css` → `text/css; charset=utf-8`؛ `.html` → `text/html; charset=utf-8`؛ `.json`, `.map`, `.webmanifest` → `application/json; charset=utf-8`؛ `.svg` → `image/svg+xml`؛ `.png|.jpg|.jpeg|.webp|.gif|.ico` → mime متناظر؛ `.woff2` → `font/woff2`؛ `.woff` → `font/woff`؛ `.ttf` → `font/ttf`؛ `.txt` → `text/plain; charset=utf-8`. هر چیز ناشناخته → `application/octet-stream`.
6. cache headers:
   - فایل‌های زیر `/assets/` (که نام‌شان hash دارد): `Cache-Control: public, max-age=31536000, immutable`.
   - فایل‌های زیر `/fonts/`: همان immutable یک‌ساله.
   - بقیه (مثلاً `/favicon.ico`, `/manifest.webmanifest`): `Cache-Control: public, max-age=3600`.
7. خطای IO حین stream: `res.destroy(err)` + log؛ مانع از مسدودشدن SSR در درخواست‌های بعدی نمی‌شود.

#### د) ترتیب اجرا

ترتیب رعایت می‌شود: static check → SSR fallback. SSR catch-all فقط وقتی اجرا می‌شود که فایلی برای آن مسیر روی دیسک نباشد.

### 3. آنچه تغییر **نمی‌کند**

- `dist/server/server.js`, TanStack handler, Vite config، wrangler.jsonc → دست‌نخورده (Cloudflare همچنان از `assets` binding خودش استفاده می‌کند).
- `Dockerfile`, `deploy/lan/docker-compose.yml`, `.env.lan*`, اسکریپت‌های LAN → بدون تغییر.
- `package.json` scripts → بدون تغییر (`preview` همچنان همان entry را اجرا می‌کند).
- Supabase / Kong / Auth / DB → بدون تغییر.
- زبان UI فارسی و RTL → دست‌نخورده.

### 4. وابستگی جدید

هیچ. فقط Node built-ins: `node:http`, `node:fs`, `node:path`, `node:url`, `node:stream`. سازگار با Alpine runtime موجود.

### 5. ریسک‌ها و mitigation

- **path traversal**: با guard مرحله‌ی ۲.ج.۴ کنترل می‌شود.
- **سرو شدن فایل‌های غیرعمومی**: فقط `dist/client` در روت قرار می‌گیرد؛ هیچ‌چیز دیگری از `/app` قابل دسترسی نیست.
- **رقابت با SSR برای `/`**: مرحله‌ی ۲.ج.۳ صریحاً `/` را به SSR می‌سپارد.
- **headers موجود**: SSR header‌های خود را روی asset‌ها ست نمی‌کند چون static قبلاً جواب داده و SSR صدا نمی‌خورد.
- **build:dev / hot reload**: این مسیر فقط در حالت production Node اجرا می‌شود؛ `vite dev` همچنان dev server خودش را دارد.

### 6. تست پذیرش

روی Docker LAN پس از rebuild:

- `curl -I http://localhost:3000/assets/index-Bi1459jE.js` → `200`, content-type `application/javascript`.
- `curl -I http://localhost:3000/assets/styles-jPsbSn-h.css` → `200`, content-type `text/css`.
- `curl -I http://localhost:3000/fonts/vazirmatn/Vazirmatn-400.woff2` → `200`, content-type `font/woff2`.
- `curl http://localhost:3000/api/healthz` → `{"ok":true}` (بدون رگرسیون).
- `http://localhost:3000/` و `http://192.168.170.10:3000/` در مرورگر → اپ از «در حال بارگذاری…» عبور و رندر می‌کند.
- لاگ‌های startup شامل مسیرهای absolute و شمارش js/css.

### 7. Self-host acceptance

- بدون CDN/خدمات خارجی ✅
- بدون secret جدید ✅
- بدون migration/RLS/RBAC ✅
- سازگار با Linux + Docker + Supabase self-host ✅
- تک فایل تغییر (`server/node-entry.mjs`)، reversible با revert ✅
- backup/restore تحت تأثیر قرار نمی‌گیرد ✅

### 8. فایل‌های تغییریافته در فاز اجرا

- `server/node-entry.mjs` — افزودن static-file layer + startup logs + smoke check.
- (اختیاری) یک پاراگراف کوتاه در `deploy/lan/README.md` که توضیح دهد سرور Node حالا خودش `dist/client/**` را سرو می‌کند. اگر ترجیح می‌دهید فقط همان فایل دست بخورد، این مورد حذف می‌شود.

### 9. مراحل اجرا (پس از تأیید پلن)

1. اعمال patch روی `server/node-entry.mjs`.
2. Rebuild image LAN: `docker compose -f deploy/lan/docker-compose.yml --env-file deploy/lan/.env.lan build app && docker compose -f deploy/lan/docker-compose.yml --env-file deploy/lan/.env.lan up -d app`.
3. مشاهده‌ی startup log برای تأیید paths و شمارش‌ها.
4. اجرای سه‌گانه‌ی `Invoke-WebRequest` و ورود مرورگری.
