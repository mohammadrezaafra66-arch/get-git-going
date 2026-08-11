# HTTPS readiness — what the owner must provide (Phase 8.3 / D8-7)

این سند فقط یک چیز را جواب می‌دهد: **برای اینکه افراکالا روی HTTPS بالا بیاید و
قابلیت «نصب برنامه» (PWA) فعال شود، مالک دقیقاً چه چیزهایی باید تهیه کند و آن‌ها
کجا وصل می‌شوند.** هیچ کاری در این فاز روی سرور انجام نشده — این فهرست اقدام است.

> وضعیت امروز: اپ روی `http://192.168.170.8:3100` و Supabase روی
> `http://192.168.170.8:9000` سرو می‌شوند. هر دو **plain http** هستند.

---

## ۱. چرا این لازم است (و چرا یک باگ نیست)

Service worker و دکمهٔ نصب فقط در **secure context** کار می‌کنند. مرورگر روی
`http://` + آدرس IP این‌ها را عمداً غیرفعال می‌کند؛ این سیاست خود مرورگر است، نه
نقص اپ. بنابراین:

| قابلیت | روی http امروز | روی https بعد از این سند |
|---|---|---|
| manifest و آیکون‌ها | ✅ سرو می‌شوند | ✅ |
| تشخیص استقرار جدید («نسخهٔ جدید در دسترس است») | ✅ **کار می‌کند** | ✅ |
| Service worker (کش دارایی‌های ثابت) | ❌ ثبت نمی‌شود (بدون خطا) | ✅ |
| دکمهٔ «نصب برنامه» | ❌ نمایش داده نمی‌شود | ✅ |
| دوربین (`getUserMedia`) | ❌ در بیشتر مرورگرها مسدود | ✅ |

**نکتهٔ مهم:** تشخیص نسخهٔ جدید عمداً به service worker وابسته نشد و از
`GET /api/version` کار می‌کند، تا همین امروز روی http هم فایده بدهد.
(دلیل کامل در سربرگ `src/lib/pwa/build-version.ts`.)

⚠️ **گزینهٔ `capture` دوربین** در `CameraCaptureButton` روی http هم کار می‌کند،
چون از `<input type="file" capture>` استفاده می‌کند نه `getUserMedia` — یعنی
عکس‌گرفتن با موبایل امروز هم کار می‌کند.

---

## ۲. آنچه مالک باید تهیه کند

| # | مورد | جزئیات | چرا |
|---|---|---|---|
| ۱ | **یک نام دامنهٔ داخلی** | مثلاً `app.afrakala.local` یا زیردامنه‌ای از دامنهٔ شرکت | مورد ۲۲۰.۲ ممیزی: با دامنه، تعویض سرور یا تغییر IP دیگر «تغییر کد» نیست |
| ۲ | **یک نام دامنهٔ دوم برای API** | مثلاً `api.afrakala.local` → Kong | اپ و Supabase باید **هر دو** https باشند؛ صفحهٔ https اجازهٔ فراخوان http ندارد (mixed content) |
| ۳ | **رکورد DNS داخلی** | هر دو نام → `192.168.170.8` | بدون DNS، دامنه روی شبکه حل نمی‌شود |
| ۴ | **گواهی TLS برای هر دو نام** | `fullchain.pem` + `privkey.pem`، یا یک گواهی wildcard | بدون آن مرورگر هشدار می‌دهد و secure context محسوب نمی‌شود |
| ۵ | **نصب CA روی دستگاه‌ها** | اگر گواهی از CA داخلی است، گواهی ریشه باید روی هر لپ‌تاپ/موبایل کاربران نصب شود | یک گواهی self-signed که مرورگر قبولش ندارد، secure context **نمی‌سازد** — نیمه‌کاره یعنی هیچ |

### دربارهٔ Let's Encrypt

`deploy/proxy/Caddyfile.example` هر دو مسیر را از قبل دارد:
- **گزینه A — ACME خودکار:** فقط اگر سرور به Let's Encrypt دسترسی داشته باشد و
  دامنه از اینترنت قابل حل باشد. برای یک دامنهٔ صرفاً داخلی معمولاً **کار نمی‌کند**.
- **گزینه B — گواهی دستی:** فایل‌ها در `deploy/proxy/certs/` و در هر site بلاک
  `tls /etc/caddy/certs/...`. **برای شبکهٔ داخلی این مسیر پیشنهاد می‌شود.**

⚠️ گواهی و کلید خصوصی **هرگز نباید commit شوند** (قاعدهٔ ۴). `deploy/proxy/certs/`
باید روی خود سرور پر شود.

---

## ۳. کجا وصل می‌شود — گام به گام

زیرساخت از قبل وجود دارد؛ چیزی تازه ساخته نمی‌شود.

### گام ۱ — Caddy را بالا بیاور

`deploy/proxy/docker-compose.yml` (Caddy روی ۸۰/۴۴۳، تنها سرویس publish‌شده).

```
cp deploy/proxy/Caddyfile.example deploy/proxy/Caddyfile
# دامنه‌های واقعی را جایگزین app.afrakala.ir / api.afrakala.ir کن
# گواهی‌ها را در deploy/proxy/certs/ بگذار و خط tls را از کامنت دربیاور
```

### گام ۲ — شبکه را یکی کن

compose پروکسی شبکهٔ external به نام `afrakala-net` می‌خواهد، ولی stack مربوط به
LAN شبکه‌اش `afrakala-lan-net` است. یکی از این دو لازم است:
- `afrakala-lan-net` را در Caddyfile/compose به‌عنوان شبکهٔ external استفاده کن، **یا**
- سرویس caddy را مستقیماً به `deploy/lan/docker-compose.yml` اضافه کن.

مسیر دوم ساده‌تر است چون همه‌چیز در یک stack می‌ماند.

### گام ۳ — پورت‌ها را از دسترس LAN خارج کن

پس از فعال‌شدن پروکسی، `ports:` سرویس‌های `web` و `kong` باید برداشته یا به
`127.0.0.1` محدود شوند؛ وگرنه http روی ۳۱۰۰/۹۰۰۰ همچنان باز می‌ماند و کاربر
می‌تواند از مسیر ناامن وارد شود.

### گام ۴ — ⚠️ متغیرهای محیطی را عوض کن **و دوباره build کن**

این مهم‌ترین بند این سند است.

`VITE_SUPABASE_URL` یک **build arg** است و در زمان build داخل bundle کلاینت
**پخته می‌شود** (`Dockerfile` خطوط ۲۸–۳۳). عوض‌کردن `.env.lan` به‌تنهایی **هیچ
اثری ندارد** — اپ همچنان `http://192.168.170.8:9000` را صدا می‌زند، مرورگر آن را
به‌عنوان mixed content مسدود می‌کند، و کل اپ از کار می‌افتد.

در `deploy/lan/.env.lan`:

```
VITE_SUPABASE_URL=https://api.afrakala.local     # پخته می‌شود → rebuild لازم است
SUPABASE_URL=https://api.afrakala.local
APP_SUPABASE_PUBLIC_URL=https://api.afrakala.local
API_EXTERNAL_URL=https://api.afrakala.local      # GoTrue
SITE_URL=https://app.afrakala.local              # GoTrue
ADDITIONAL_REDIRECT_URLS=https://app.afrakala.local
```

سپس **حتماً**:

```powershell
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
docker compose --env-file deploy/lan/.env.lan `
  -f deploy/lan/docker-compose.yml up -d --build web
```

`SITE_URL` و `ADDITIONAL_REDIRECT_URLS` اگر عوض نشوند، ورود کاربر بعد از
احراز هویت به آدرس http قدیمی برمی‌گردد.

### گام ۵ — تأیید

```powershell
# باید 200 بدهد و گواهی معتبر باشد
curl.exe -I https://app.afrakala.local/api/healthz

# در مرورگر، کنسول:
#   window.isSecureContext                        → true
#   navigator.serviceWorker.getRegistration('/')  → یک registration با /sw.js?v=...
# و دکمهٔ «نصب برنامه» باید در نوار بالا ظاهر شود.
```

---

## ۴. جایگزین: TLS مستقیم روی خود اپ (بدون Caddy)

اگر مالک پروکسی نمی‌خواهد، سرور nitro خودش TLS را می‌فهمد. در
`.output/server/index.mjs` دو متغیر خوانده می‌شوند:

```
NITRO_SSL_CERT   محتوای گواهی
NITRO_SSL_KEY    محتوای کلید خصوصی
```

اگر هر دو ست باشند، سرور مستقیماً https سرو می‌کند.

**ولی مسیر Caddy پیشنهاد می‌شود**، چون Supabase (Kong) هم باید https شود و با
nitro تنها، Kong بدون TLS می‌ماند و mixed content سرِ جایش باقی است.

---

## ۵. آنچه در این فاز تأیید **نشد** (نیازمند مالک)

این‌ها را نمی‌توان بدون دامنه و گواهی واقعی اثبات کرد و به‌عنوان «تأییدشده»
گزارش **نمی‌شوند**:

1. **نصب واقعی روی موبایل** — اندروید/کروم و iOS/سافاری. iOS اصلاً رویداد
   `beforeinstallprompt` را نمی‌فرستد؛ آنجا نصب از «Add to Home Screen» در منوی
   share انجام می‌شود و دکمهٔ داخل اپ ظاهر نخواهد شد. این نقص نیست.
2. **رفتار maskable icon** روی لانچر واقعی اندروید.
3. **رفتار service worker پشت گواهی واقعی** — منطقش با flag مرورگر
   (`--unsafely-treat-insecure-origin-as-secure`) آزموده شد، که رفتار کد را ثابت
   می‌کند ولی زنجیرهٔ TLS را نه.
4. **`display: standalone`** — اینکه اپ نصب‌شده بدون نوار آدرس باز شود.
