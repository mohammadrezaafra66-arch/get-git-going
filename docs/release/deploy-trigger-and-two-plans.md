# ماشهٔ انتشار روی ماشین تست، و دو طرح روی کاغذ

۲۰۲۶-۰۹-۰۳ · همه‌چیز خواندنی. هیچ بازسازی، هیچ merge، هیچ تغییر فایل.

---

## ۱. آیا رسیدن کد به `staging` خودبه‌خود مستقر می‌شود؟ — **خیر** 🟢

هیچ سطح خودکاری وجود ندارد:

| بررسی | نتیجه |
|---|---|
| `Get-ScheduledTask` با اکشن `docker|powershell` یا آرگومان `afrakala|deploy|update-lan` | فقط ۸ وظیفهٔ استاندارد مایکروسافت — هیچ ارجاعی به مخزن |
| `Get-CimInstance Win32_Service` با `PathName` شامل `afrakala|AfraKalaTest|update-lan|runner` | **۰** |
| git hookهای غیرنمونه در `.git/hooks/` | **۰** |
| `self-hosted` در `.github/workflows/` | **۰** |
| کلیدهای Run و پوشهٔ Startup | هیچ ارجاعی |
| اسکریپت polling (`while true … git pull`) در مخزن | **۰** |
| `build-image.yml` | فقط روی `main`, به GHCR push می‌کند؛ ولی `deploy/lan/docker-compose.yml:28-48` ایمیج را **build** می‌کند نه pull |

**پس merge به `staging` سامانه را مسلح نمی‌کند.** کد روی GitHub می‌ماند تا انسانی پشت این ماشین
دستور را تایپ کند. merge پیش از پنجرهٔ انتشار **خطرناک نیست** — البته این نتیجه فقط دربارهٔ
**همین ماشین** است؛ نیمهٔ لپ‌تاپ سامانهٔ اصلی جداگانه باید سنجیده شود.

## ۲. چه چیزی امروز کانتینر وب را بازسازی کرد؟ — یک انسان، دستی

`git reflog --date=iso`:

```
d01da1b8 HEAD@{2026-09-03 14:59:00 +0500}: checkout: moving from feature/quote-customer-picker-readonly to staging
afdade65 HEAD@{2026-09-03 14:59:01 +0500}: pull: Fast-forward
c093fab2 HEAD@{2026-09-03 15:05:20 +0500}: checkout: moving from staging to feature/quote-customer-picker-readonly
```

و برچسب کانتینر:

```
APP_GIT_SHA=afdade65
APP_BUILD_TIME=2026-09-03T14:59:01
Created=2026-09-03T10:00:53Z   StartedAt=2026-09-03T10:01:00Z
```

`14:59:01 +0500` = `09:59:01Z`. توالی: checkout ۰۹:۵۹:۰۰Z ← pull ۰۹:۵۹:۰۱Z ← `BUILD_TIME` مهر
۰۹:۵۹:۰۱Z ← ایمیج ۱۰:۰۰:۲۲Z ← کانتینر ۱۰:۰۰:۵۳Z ← اجرا ۱۰:۰۱:۰۰Z. **یک کنش پیوسته، حدود ۱۲۰ ثانیه.**

قالب `BUILD_TIME` بدون offset و بدون کسر ثانیه است — یعنی دستور **دستی** تایپ شده، نه از
`update-lan.ps1`. برگشت به شاخهٔ من در ۱۵:۰۵:۲۰ ثبت شده که همان کاری است که من کردم.

### 🔴 یافتهٔ جانبی و جدی: `update-lan.ps1` برچسب را دروغ می‌کند

```
grep -cE "GIT_SHA|BUILD_TIME|no-deps" deploy/lan/scripts/update-lan.ps1   →  0
.env.lan:33  GIT_SHA=1ca72316
.env.lan:34  BUILD_TIME=2026-07-29T14:06:56Z
```

اسکریپتی که `CLAUDE.md` «مسیر امن» می‌نامدش، **نه `GIT_SHA` را export می‌کند نه `--no-deps` دارد**.
با `--env-file`، مقادیر پین‌شدهٔ **جولای** به‌عنوان build arg می‌روند. یعنی کسی که اسکریپت را اجرا
کند، کانتینری می‌گیرد که **از کد درست ساخته شده ولی برچسبش `1ca72316` و تاریخ ۲۹ جولای است** — و
تنها بررسی «کد درست در حال اجراست» بی‌اثر می‌شود.

انتشار امروز فقط به این دلیل سالم برچسب خورد که اپراتور اسکریپت را **دور زد** و دستی تایپ کرد.

> **این باید پیش از انتشار روی سامانهٔ اصلی حل شود** یا اسکریپت اصلاح شود یا runbook صریح بگوید
> اسکریپت را اجرا نکنید. تصمیم مالک.

### دو نکتهٔ حل‌نشده

- **`afrakala-lan-rest` در `10:48:18Z` جداگانه restart شده** — ۴۷ دقیقه پس از وب، و در تاریخچهٔ
  PowerShell (آخرین نوشتن `10:36:03Z`) ردی ندارد. یعنی نشست دیگری روی این ماشین دست به stack زده.
- **انتساب به شخص ممکن نیست.** تاریخچهٔ PSReadline دستور را ثبت می‌کند ولی کاربر و PID را نه، و
  فایل per-user است. اثبات می‌کند «انسانی تایپ کرد»؛ نمی‌تواند مالک را از یک عامل هوش مصنوعی که
  زیر همان حساب PowerShell اجرا می‌کند تفکیک کند.

---

## طرح الف — بازگرداندن سرور تست به کد این انتشار

**وضعیت فعلی:** سرور تست `afdade65` را اجرا می‌کند (staging)، نه `4f1fca7f` (کد این انتشار). پس
هیچ آزمون رفتاری تازه‌ای اکنون علیه کد واقعی این انتشار اجرا نمی‌شود.

**دستورها — اجرا نشد:**

```powershell
cd D:\AfraKalaTest\app
git switch feature/quote-customer-picker-readonly     # اگر روی آن نیستید
& "deploy\lan\scripts\check-env-file.ps1"; if ($LASTEXITCODE -ne 0) { throw }
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format o)
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --no-deps --build web
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String APP_GIT_SHA
```

**ریسک تداخل با آن عامل ناشناس:**

| اگر او… | نتیجه |
|---|---|
| دوباره `staging` را checkout و بازسازی کند | کد من از سرور تست می‌رود؛ **داده‌ای از دست نمی‌رود**، ولی هر آزمون رفتاری در حال اجرا نتیجهٔ بی‌معنی می‌دهد |
| هم‌زمان با من بازسازی کند | آخرین build برنده است؛ برچسب `APP_GIT_SHA` نشان می‌دهد کدام |
| با `update-lan.ps1` بازسازی کند | برچسب **دروغ** می‌شود (`1ca72316`) و تشخیص وضعیت سخت می‌شود |

**کاهش ریسک:** پیش از هر آزمون، `APP_GIT_SHA` را بخوانید و با `git rev-parse --short HEAD` مقایسه
کنید؛ اگر نخواند، نتیجه را دور بریزید. **بدون اجازهٔ صریح مالک بازسازی نکنید** — ممکن است او
عمداً staging را روی سرور تست گذاشته باشد.

---

## طرح ب — افزودن دو کلید پرچم به `.env.lan` سامانهٔ اصلی

**مسیر:** `C:\afrakala\deploy\lan\.env.lan` — که طبق پیش‌پرواز **خط خالی پایانی دارد** و هیچ مقدار
آلوده‌ای ندارد. **فایل الان تغییر داده نشد.**

**دستور — با حفظ خط پایانی:**

```powershell
$f = "C:\afrakala\deploy\lan\.env.lan"

# ۱. اول ثابت کن فایل با newline تمام می‌شود. اگر نه، متوقف شوید.
$raw = [System.IO.File]::ReadAllText($f)
if (-not $raw.EndsWith("`n")) { throw "فایل newline پایانی ندارد — افزودن کلید آن را به خط قبل می‌چسباند" }

# ۲. افزودن، هر کدام روی خط خودش، با newline پایانی
Add-Content -Path $f -Value "VITE_FEATURE_QUOTE_CUSTOMER_PICKER=true"
Add-Content -Path $f -Value "VITE_FEATURE_QUOTE_IDENTITY_FROM_RECORD="

# ۳. بررسی بعدی — سه چیز
$lines = Get-Content $f
$raw2  = [System.IO.File]::ReadAllText($f)
"newline پایانی : $(if ($raw2.EndsWith("`n")) {'دارد ✓'} else {'ندارد ✗ متوقف شوید'})"
"مقدار آلوده    : $(if ($lines | Where-Object { $_ -match '^[A-Z_]+=.*VITE_' }) {'✗ متوقف شوید'} else {'ندارد ✓'})"
$lines | Where-Object { $_ -match '^VITE_FEATURE_QUOTE' } | ForEach-Object { "  $_" }

# ۴. و محافظ رسمی، که هر چهار پله را می‌سنجد
& "deploy\lan\scripts\check-env-file.ps1"
```

**قبولی:** دقیقاً دو خط `VITE_FEATURE_QUOTE_*`، مقدار اولی `true` و دومی **خالی**، فایل با newline
تمام شود، و هیچ مقداری رشتهٔ `VITE_` نداشته باشد.

> **چرا `IDENTITY_FROM_RECORD` خالی و نه غایب:** `envFlag` فقط `"true"` را روشن می‌شمارد، پس خالی
> = خاموش. حضورش با مقدار خالی، گیت چهارپله را راضی می‌کند و در عین حال آشکار می‌کند که این پرچم
> عمداً خاموش است.
>
> **و یک تصحیح مهم:** روشن‌کردن این پرچم امروز **هیچ اثری ندارد** — هیچ کدی مصرفش نمی‌کند. جزئیات
> در `flag-map-and-impact.md`. قید «خاموش بماند» درست است ولی دلیلش آن نیست که فکر می‌کردیم.
