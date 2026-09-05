# امکان‌سنجی Issabel — inventory و سؤال‌های مالک

| | |
|---|---|
| مأموریت | Wave 4 · ردیف **P-1** · نوع **INVESTIGATE** |
| عامل | Agent P |
| worktree | `C:\Users\AFRA\AppData\Local\Temp\claude\D--AfraKalaTest-app\wave4\agentP` · شاخه `feature/wave4-agentP` |
| baseline | `31bc486e` (`origin/staging`) |
| ماشین اجرا | test host `192.168.170.8` |
| دیتابیس | `afrakala` روی کانتینر `afrakala-lan-db` (خوانده‌شدهٔ زنده) |
| تاریخ | ۲۰۲۶-۰۹-۰۶ |
| وضعیت | **PARTIAL — به‌اندازه‌ای که بدون credential ممکن است، کامل** |

> **قواعدی که رعایت شد:**
> - هیچ port scan ای انجام نشد. هیچ subnet sweep ای انجام نشد.
> - **بودجهٔ «یک reachability check» مصرف نشد — صفر از یک.** دلیلش در بخش ۱ آمده.
> - `192.168.170.10` (تولید) نه تماس گرفته شد، نه resolve شد، نه ping شد.
> - به هیچ سرویسی authenticate نشد و هیچ credential ای حدس زده نشد.
> - نام هیچ ستونی حدس زده نشد؛ همه با query کشف شدند.
> - هیچ کدی نوشته نشد، هیچ migration ای برداشته یا اعمال نشد، به `call_logs` و کد امتیازدهی و `src/` دست زده نشد.

---

## Verdict در سه جمله

۱) **آدرس سرور Issabel نامعلوم است.** در repo، در مستندات، در فایل‌های محیطی، در `hosts` ویندوز، در فهرست کانتینرهای Docker و در خودِ دیتابیس `afrakala` هیچ آدرس، hostname، پورت یا کلیدی که به یک سامانهٔ تلفنی اشاره کند وجود ندارد. **این خودش یافته است، نه شکست.**

۲) چون آدرس نامعلوم است، **نسخه و exposure سه رابط (CDR / AMI / ARI) قابل اندازه‌گیری نیست**؛ و حتی اگر آدرس داده شود، بررسی هر سه رابط یعنی زدن به سه پورت، که طبق قواعد این ردیف port scan است. **این سه فقط با پاسخ ادمین PBX یا با credential روشن می‌شوند — نه با measurement از این ماشین.**

۳) **mapping «داخلی → کارشناس» امروز در دیتابیس وجود ندارد**، اما یک ظرف آمادهٔ بی‌استفاده هست: `profile_field_definitions` / `profile_field_values`. یعنی برای نگه‌داشتن شماره داخلی **هیچ جدول جدیدی لازم نیست و هیچ ستون جدیدی هم الزاماً لازم نیست** — این یک تصمیم مالک است، نه یک کمبود schema.

---

## ۱ — آیا یک سرور Issabel روی این LAN در دسترس است؟

### پاسخ: **آدرس نامعلوم است. هیچ بسته‌ای به هیچ میزبانی فرستاده نشد.**

قاعدهٔ ردیف: «اگر آدرس میزبان را نمی‌دانی، بگو نمی‌دانی و همان را یافته بدان، به‌جای شکار کردنش.»
مسیر مجاز کشف (config، مستندات، فایل محیطی، دیتابیس) تا ته پیموده شد و به آدرس نرسید.
یک reachability check روی یک آدرسِ **حدس‌زده‌شده** عملاً probe کردن است، پس اجرا نشد.

**پس این ردیف با ۰ بسته به شبکه بسته می‌شود — و بودجهٔ یک checkِ مجاز دست‌نخورده به مالک برمی‌گردد** (بخش ۶، سؤال ۱).

### شواهد — کجاها را نگاه کردم و چه ندیدم

| # | جای بررسی‌شده | دستور | نتیجه |
|---|---|---|---|
| E1 | کل فایل‌های repo (متنی، بدون binary و بدون `node_modules`) برای واژگان vendor | `grep -rnIiE "issabel\|asterisk\|freepbx\|elastix\|asteriskcdrdb\|\bPBX\b\|\bVoIP\b\|\bSIP\b" .` | **۰ نتیجه** |
| E2 | کل repo برای واژگان فارسی تلفنی | `grep -rlI -e "ایزابل" -e "آستریسک" -e "مرکز تلفن" -e "ویپ" -e "تلفنخانه" -e "سانترال" -e "مرکز تماس" -e "شماره داخلی"` | **۰ نتیجه در `src/`** — تنها دو hit، هر دو در `docs/research/` و هر دو خودشان گزارش همین شکاف‌اند |
| E3 | همهٔ IPهای LAN که در repo نام برده شده‌اند | `grep -rnIoE "192\.168\.[0-9]+\.[0-9]+(:[0-9]+)?"` + `sort \| uniq -c` | فقط `192.168.170.8` (و پورت‌هایش)، `192.168.170.10` (تولید — دست نخورد)، و `192.168.1.50` / `192.168.1.25` که در مستندات کهنهٔ قبل از جابه‌جایی IP هستند. **هیچ میزبان چهارمی وجود ندارد** |
| E4 | فایل محیطی واقعی (نه `.example`) | فهرست کلیدهای `deploy/lan/.env.lan` | ۴۱ کلید. هیچ‌کدام تلفنی نیست. نزدیک‌ترین چیزها `SMTP_*` و `WHATSAPP_PLATFORM_BASE_URL` اند. (هیچ مقداری در این گزارش نیامده — فقط نام کلیدها.) |
| E5 | `hosts` ویندوز | `grep -vE "^#" /c/Windows/System32/drivers/etc/hosts` | ۵ سطر، همه به `192.168.170.8` یا `127.0.0.1`. هیچ نام PBX ای نیست |
| E6 | کانتینرهای Docker این ماشین | `docker ps -a --format ...` | ۳۰ کانتینر (`afrakala-lan-*`، `hanieh-*`، `claudegreenapi-*`). **هیچ کانتینر تلفنی‌ای نیست** |
| E7 | جدول‌های تنظیمات دیتابیس | `information_schema.tables` با `~* 'setting\|config\|integration\|param\|credential\|secret\|endpoint\|provider'` | ۱۲ جدول. هیچ‌کدام تلفنی نیست |
| E8 | ستون‌های میزبان/آدرس در کل schema `public` | `information_schema.columns` با `column_name ~* 'url\|host\|endpoint\|_ip$\|server\|domain'` | ۱۵ ستون. مقادیر بررسی‌شده: `automation_workers.host` و `automation_worker_heartbeats.host` هر دو **۰ ردیف**؛ `currency_sources.url` هر دو ردیفش خالی. هیچ آدرس PBX ای نیست |
| E9 | پیکربندی proxy | `deploy/proxy/Caddyfile.example`، `deploy/supabase/volumes/api/kong.yml` | upstreamها فقط `web:3000`، `kong:8000`، `studio:3000`. هیچ upstream تلفنی‌ای نیست |
| E10 | پیکربندی شبکهٔ محلی این ماشین (passive، بدون ارسال بسته) | `Get-NetIPAddress -AddressFamily IPv4` | این میزبان `192.168.170.8/24` روی `Ethernet` است. یعنی PBX — اگر روی همین LAN باشد — در `192.168.170.0/24` است. **این subnet را sweep نکردم و نخواهم کرد** |

### دو false positive که باید صادقانه ثبت شوند

هر دو **بیرون از repo** اند و **هیچ‌کدام تلفنی نیستند** — اگر کسی همان grep را تکرار کند به آن‌ها می‌خورد:

- `D:\AfraKalaTest\app\deploy\lan\backups\*.dump` — این‌ها dumpهای فشردهٔ باینری Postgres اند. رشته‌های منطبق با حالت حروف تصادفی درمی‌آیند (`CdR`, `PBx`, `SiP`, `cDR`)، یعنی نویز باینری، نه متن.
- `D:\AfraKalaTest\app-docs-build\.output\server\_libs\html2canvas.mjs` — چهار بار `ASTERISK`، که ثابتِ tokenizer در CSS parser آن کتابخانه است، نه Asterisk تلفنی.

### تأیید prior art

ادعای prior art مبنی بر **«هیچ ردی از هیچ سامانهٔ تلفنی در repo نیست»** ارزان بازبررسی شد و **تأیید می‌شود** (E1, E2, E3). هیچ تناقضی با آن پیدا نشد.

---

## ۲ — کدام نسخه؟

**غیرقابل تعیین. NOT VERIFIED.**

نسخهٔ یک نصب Issabel از این راه‌ها به دست می‌آید و هیچ‌کدام امروز در دسترس نیست:

| راه | چرا امروز بسته است |
|---|---|
| صفحهٔ ورود وب UI (نسخه را در footer نشان می‌دهد) | آدرس نامعلوم است؛ و باز کردن آن یعنی زدن به یک پورت روی یک آدرس حدسی |
| `/etc/issabel.conf` یا `rpm -q issabel*` روی خود سرور | نیازمند دسترسی SSH که به من داده نشده |
| `asterisk -rx "core show version"` | همان |
| پرسیدن از ادمین PBX | **تنها راه بازِ امروز** → سؤال مالک ۲ |

هیچ حدسی درباره‌ی نسخه در این گزارش زده نمی‌شود.

---

## ۳ — آیا CDR / AMI / ARI در معرض است؟

**هر سه NOT VERIFIED — و در چارچوب قواعد این ردیف، غیرقابل اندازه‌گیری، نه فقط اندازه‌گیری‌نشده.**

این نکته مهم است و باید صریح گفته شود: **حتی اگر مالک همین حالا آدرس را بدهد، پاسخ این سؤال از این ماشین درنمی‌آید.** بررسی exposure یعنی زدن به سه پورت متمایز روی یک میزبان؛ آن دقیقاً port scan است و در قواعد این ردیف ممنوع. و «متصل شدن برای دیدن اینکه آیا باز است» هم عملاً تلاش برای اتصال است. پس:

| رابط | چه چیزی در یک Issabel استاندارد است (دانش عمومی vendor، **نه اندازه‌گیریِ این نصب**) | وضعیت اینجا |
|---|---|---|
| **CDR** — پایگاه‌دادهٔ `asteriskcdrdb` روی MySQL/MariaDB | معمولاً روی پورت پیش‌فرض MySQL و در نصب‌های امن **فقط روی `localhost` bind می‌شود**؛ جدول اصلی `cdr` | **NOT VERIFIED** — نه آدرس داریم، نه اجازهٔ اتصال، نه credential |
| **AMI** — Asterisk Manager Interface | یک سوکت TCP متنی که با `manager.conf` روشن/خاموش و به IP خاص محدود می‌شود؛ به‌طور پیش‌فرض در بسیاری از نصب‌ها **غیرفعال یا محدود به localhost** است | **NOT VERIFIED** |
| **ARI** — Asterisk REST Interface | با `ari.conf` + `http.conf` روشن می‌شود و در بسیاری از نصب‌ها **اصلاً enable نیست** | **NOT VERIFIED** |

**نتیجهٔ عملی:** این سه خانه از جدول را باید **ادمین PBX پر کند**، نه یک agent. سؤال‌های ۳ تا ۵ در بخش ۶ دقیقاً همین را می‌پرسند.

**یک نکتهٔ جهت‌دهنده برای مالک:** برای «import شبانهٔ CDR» فقط ردیف اول لازم است. AMI و ARI برای رویدادهای **زنده** (پاپ‌آپ تماس ورودی، کنترل تماس) به کار می‌آیند، نه برای یک job شبانه. اگر خواستهٔ مالک فقط شمارش شبانه است، **AMI و ARI اصلاً لازم نیستند** و نباید برایشان دسترسی باز شود.

---

## ۴ — یک import شبانهٔ CDR واقعاً به چه چیزی نیاز دارد؟

سه پیش‌نیاز خواسته شده بود. وضعیت هر سه:

### ۴.۱ — کاربر MySQL فقط-خواندنی روی `asteriskcdrdb`

**وجود ندارد و ساختنش کار ما نیست. NOT VERIFIED.**

به من هیچ credential ای برای PBX داده نشده و تلاشی هم برای authenticate نکردم. ساخت یک کاربر فقط-خواندنی یک عملیات روی **خود سرور PBX** است که فقط ادمین آن می‌تواند انجام دهد. آنچه از سمت ما باید مشخص شود، دامنهٔ دسترسی است: **خواندن، محدود به همان یک دیتابیس، ترجیحاً محدود به `SELECT` روی جدول‌های CDR و محدود به IP مبدأ `192.168.170.8`.** این جمله را می‌شود به ادمین PBX داد؛ بیشتر از این طراحی است و در دامنهٔ این ردیف نیست.

### ۴.۲ — مسیر شبکه از این میزبان تا PBX

**غیرقابل تأیید بدون آدرس. NOT VERIFIED.**

آنچه **قطعی** است (E10): این میزبان `192.168.170.8/24` است. یعنی اگر PBX هم روی `192.168.170.0/24` باشد، مسیر L3 بدیهی است و مسئله فقط firewall و ACL خود PBX خواهد بود. اگر روی VLAN یا subnet دیگری باشد، مسئلهٔ routing هم اضافه می‌شود. **کدام‌یک، معلوم نیست** — سؤال ۶.

نکتهٔ محدودیت مسیر: `192.168.170.10` تولید است و در هیچ سناریویی نباید در این مسیر دخالت داده شود.

### ۴.۳ — mapping «داخلی → کارشناس» — **این بخش کاملاً اندازه‌گیری شد**

#### پاسخ کوتاه: **امروز وجود ندارد.** هیچ ستونی در هیچ جدولی شماره داخلی را نگه نمی‌دارد.

**شاهد [E1] — هیچ ستون «داخلی» ای در کل schema نیست.** جست‌وجوی کل `public` برای ستون‌های شبیه تلفن/داخلی:

```
select table_name, column_name, data_type from information_schema.columns
where table_schema='public' and (column_name ~* 'ext|phone|tel|mobile|msisdn|caller|did|line')
order by table_name, column_name;
-- ۵۲ ردیف
```

هر ۵۲ ردیف خوانده شد. اکثریتشان false positive اند (`question_text`, `help_text`, `line_total`, `deadline`, `extraction_status`, `baseline_price` …). ستون‌های واقعاً تلفنی این‌ها هستند و **هیچ‌کدام داخلی نیست** — همه شماره تلفن بیرونی مشتری/کارمندند:

`customers.phone` · `suppliers.phone` · `visitors.phone` · `external_parties.phone` · `profiles.phone` · `sales_quotes.customer_phone` · `stock_alert_requests.customer_phone` · `payment_receipts.payer_phone` · `payment_receipts.receiver_phone` · `phone_collisions.normalized_phone` · `asan_import_person_rows.mobile_raw` · `asan_import_person_rows.landline_raw`

**هیچ ستونی به نام `extension`, `ext`, `internal_number` یا معادلش وجود ندارد.**

#### جدول‌های هویتِ کارمند — چه دارند و چقدر پرند

| جدول | ستون‌ها (زنده، query شده) | ردیف | آیا داخلی دارد؟ |
|---|---|---|---|
| `profiles` | `id, full_name, phone, avatar_url, is_active, created_at, updated_at, status, position, registered_at, birth_date, last_seen_at, person_id` | **۴۱** (۱۴ تا `phone` دارند، **۴۱ تا `person_id` دارند**) | خیر |
| `employee_profiles` | `id, user_id, employment_start_date, department, direct_manager_id, bio, created_at, updated_at` | **۰ — کاملاً خالی** | خیر |
| `person_identifiers` | `id, person_id, kind, value_raw, value_normalized, status, is_primary, verified_at, verified_by, created_by, created_at, updated_at, source_batch_id` | `mobile_e164` **۳۶** · `asan_person_code` **۱۹** | خیر |
| `profile_field_definitions` | `id, name, label, field_type, options, is_required, is_active, show_on_register, sort_order, help_text, created_at, updated_at` | **۵** ردیف فعال: `employment_type`, `work_days`, `work_start_time`, `work_end_time`, `address` | خیر |
| `profile_field_values` | `id, user_id, field_name, value(jsonb), created_at, updated_at` | **۰ — کاملاً خالی** | خیر |

جمعیتی که باید map شود، از `user_roles`: `sales` **۱۴** · `admin` **۱۴** · `manager` **۳** · `accountant` **۳** · `viewer` **۲**. یعنی اندازهٔ کار احتمالاً حدود **۱۴ داخلی** است، نه ۴۱ — ولی این را باید مالک تأیید کند (سؤال ۸).

#### آیا ستون یا جدول جدید لازم است؟ — سه ظرفِ موجود، سه هزینهٔ متفاوت

**جدول جدید در هیچ حالتی لازم نیست.** ستون جدید هم الزامی نیست. اما سه مسیر با هزینه‌های متفاوت وجود دارد و **انتخاب بینشان تصمیم مالک است، نه تصمیم من** (این ردیف اجازهٔ طراحی ندارد):

**مسیر الف — `profile_field_values` (هیچ DDL ای لازم نیست).**
مکانیزم زنده و بی‌استفاده است. `field_type` یک enum است با مقادیر زندهٔ `text, number, select, multiselect, time, days, textarea, date` — یعنی `text` موجود است. قیدهای زنده:
```
profile_field_values_field_name_fkey  FOREIGN KEY (field_name) REFERENCES profile_field_definitions(name) ON UPDATE CASCADE ON DELETE CASCADE
profile_field_values_user_id_fkey     FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
profile_field_values_user_id_field_name_key  UNIQUE (user_id, field_name)
```
افزودن «شماره داخلی» اینجا فقط **درج داده** است: یک ردیف در `profile_field_definitions` و یک ردیف به‌ازای هر کارشناس. **بدون migration.**
هزینهٔ صادقانه‌اش: (۱) مقدار `jsonb` است و **ایندکسی برای جست‌وجوی معکوس (داخلی → کارمند) ندارد** — و import شبانه دقیقاً همین جهت را لازم دارد؛ (۲) یکتایی فقط `(user_id, field_name)` است، پس **دو کارمند می‌توانند یک داخلی داشته باشند** و دیتابیس جلویش را نمی‌گیرد.

**مسیر ب — `person_identifiers` با `kind='extension'` (یک تغییر CHECK لازم است).**
قید زندهٔ امروز:
```
person_identifiers_kind_check  CHECK (kind = ANY (ARRAY['mobile_e164','landline','national_id_ir','tax_id_ir','company_reg_id_ir','email','iban','custom','asan_person_code']))
```
`'extension'` **در این فهرست نیست**. `'custom'` هست، ولی هیچ ستون زیرنوعی وجود ندارد که «این custom یعنی داخلی» را از بقیهٔ customها جدا کند — پس استفاده از `custom` معنا را مبهم می‌کند.
در عوض این جدول همان چیزهایی را می‌دهد که یک mapping واقعی لازم دارد: `value_normalized`، `status` (`provisional/confirmed/revoked`)، `is_primary`، `verified_at`. و ستون پل هم برقرار است: **هر ۴۱ ردیف `profiles` مقدار `person_id` دارند** (۴۱ از ۴۱)، پس `profiles → persons → person_identifiers` امروز کامل است.
هزینه‌اش: تغییر یک CHECK یعنی یک migration. **من هیچ شمارهٔ migration نگرفته‌ام و هیچ migration ای ننوشته‌ام.**

**مسیر ج — ستون تازه روی `profiles` یا `employee_profiles`.**
هم migration لازم دارد، هم اینکه `employee_profiles` امروز **۰ ردیف** دارد، یعنی زنده کردنش خودش یک کار جداست.

**خلاصه برای مالک:** «آیا ستون یا جدول جدید لازم است؟» → **جدول: نه. ستون: نه، اگر مسیر الف پذیرفته شود؛ بله (به‌شکل تغییر CHECK)، اگر مسیر ب انتخاب شود.** انتخاب، تصمیم مالک است.

### ۴.۴ — دو نکتهٔ جانبی که به کار مسیر شبانه می‌آیند

**زمان‌بند شبانه از قبل وجود دارد.** `pg_cron` روی دیتابیس `afrakala` نصب **نیست**، ولی روی دیتابیس `postgres` همان کانتینر نصب است و jobهایش `database='afrakala'` را هدف می‌گیرند:
```
jobid|schedule   |jobname                                  |active|database
9    |0 6 * * *  |daily-birthday-notifications             |t     |postgres
20   |30 22 * * *|afrakala-capture-score-snapshots-nightly |t     |afrakala
21   |45 22 * * *|afrakala-refresh-sale-list-prices-nightly |t    |afrakala
22   |0 23 * * *|afrakala-sync-price-observatory-daily     |t     |afrakala
```
یعنی «شبانه» یک مکانیزم زنده و در حال کار دارد؛ لازم نیست از صفر ساخته شود. (این با یکی از ادعاهای prior art در تضاد است — بخش ۵.)

**idempotency ورودی.** طبق prior art (بازبررسی نشد چون به `call_logs` دست نزدم)، ایندکس `idx_call_logs_external` **UNIQUE نیست**. یک import شبانه بدون یک قید یکتا روی شناسهٔ تماسِ سامانهٔ بیرونی، در اولین اجرای دوباره داده را تکراری می‌کند. **[prior art · NOT RE-VERIFIED]**

**مقصد داده در دامنهٔ من نیست.** اینکه CDR وارد‌شده باید در `call_logs` بنشیند یا در `staff_daily_performance_metrics` یا جای دیگر — و اصلاً «یک تماس» چه تعریفی دارد — ردیف یک agent دیگر است. اینجا فقط به‌عنوان **وابستگی** ثبت می‌شود، نه به‌عنوان پاسخ.

---

## ۵ — تناقض‌ها

### ۵.۱ — `pg_cron`: prior art اشتباه است، CONTRACTS درست است

`docs/research/phone-gap-20260905.md` (سطر ۳۱۸ و ردیف N20) می‌گوید **«`pg_cron` روی این دیتابیس نصب نیست، پس cron هرگز ساخته نشد»**. `CONTRACTS.md` §۵ می‌گوید **«jobهای زندهٔ pg_cron عبارت‌اند از ۹، ۲۰، ۲۱، ۲۲»**.

اندازه‌گیری من هر دو را توضیح می‌دهد:

```
$ psql -d afrakala -c "select extname from pg_extension order by 1;"
   -> btree_gist, pg_graphql, pg_stat_statements, pg_trgm, pgcrypto, pgjwt,
      pgsodium, plpgsql, supabase_vault, uuid-ossp, vector      (pg_cron نیست)
$ psql -d afrakala -c "select ... from cron.job;"
   -> ERROR: relation "cron.job" does not exist

$ psql -d postgres -c "select extname from pg_extension where extname='pg_cron';"
   -> pg_cron
$ psql -d postgres -c "select jobid, schedule, jobname, active, database from cron.job;"
   -> 9, 20, 21, 22   (سه‌تای آخر با database='afrakala')
```

**`pg_cron` در دیتابیس `postgres` نصب است و jobهایش `afrakala` را هدف می‌گیرند** — الگوی متعارف Supabase. **CONTRACTS.md درست است. نتیجه‌گیری prior art از یک query که فقط در دیتابیس اشتباه اجرا شده بود گرفته شده.** این برای این ردیف مستقیماً مهم است، چون نتیجه‌اش را عوض می‌کند: زمان‌بندِ یک import شبانه از قبل موجود است.

### ۵.۲ — هیچ تناقضی با بقیهٔ context پیدا نشد

- «هیچ ردی از سامانهٔ تلفنی در repo نیست» → **تأیید شد** (E1, E2, E3).
- «به `call_logs`، کد امتیازدهی و `src/` دست نزن» → رعایت شد؛ هیچ‌کدام لمس نشدند.

---

## ۶ — سؤال‌های مالک

بدون پاسخ ۱ تا ۵، این ردیف از این ماشین جلوتر نمی‌رود.

**الف — دربارهٔ خود سرور (مسدودکننده)**

1. **آدرس شبکه‌ای سرور Issabel چیست؟** IP یا hostname، و روی کدام subnet. اگر آدرس داده شود، **یک** reachability check مجاز هنوز مصرف‌نشده باقی است و می‌شود اجرایش کرد.
2. **نسخهٔ Issabel و نسخهٔ Asterisk زیرین چیست؟** از صفحهٔ ورود وب UI یا از `asterisk -rx "core show version"` روی خود سرور.
3. **`asteriskcdrdb` از بیرونِ خود PBX قابل اتصال است، یا MySQL فقط روی `localhost` گوش می‌دهد؟**
4. **AMI فعال است؟** اگر بله، به کدام IPها محدود شده؟ (برای import شبانه لازم نیست — فقط اگر مالک رویداد زنده بخواهد.)
5. **ARI فعال است؟** (همان توضیح.)

**ب — دربارهٔ دسترسی و مسیر**

6. **مسیر شبکه از `192.168.170.8` تا PBX باز است، یا firewall/VLAN بینشان است؟**
7. **آیا اجازه می‌دهید یک کاربر MySQL فقط-خواندنی، محدود به `asteriskcdrdb` و محدود به IP مبدأ `192.168.170.8`، ساخته شود؟ و چه کسی آن را می‌سازد؟**
8. **چه کسی PBX را اداره می‌کند** — پیمانکار بیرونی یا نیروی داخلی — و چطور باید با او تماس گرفت؟

**ج — دربارهٔ mapping داخلی → کارشناس (تعیین‌کنندهٔ شکل داده)**

9. **فهرست «داخلی → کارشناس» امروز کجاست؟** فقط روی خود PBX است، یا جایی نوشته شده (اکسل، کاغذ، ذهن یک نفر)؟
10. **آیا هر کارشناس دقیقاً یک داخلی دارد؟** داخلی مشترک بین دو نفر داریم؟ و آیا داخلیِ یک کارمندِ رفته دوباره به نفر بعدی داده می‌شود؟ (اگر بله، mapping به بازهٔ زمانی نیاز دارد، نه یک مقدار ساده.)
11. **کدام ظرف؟** `profile_field_values` (بدون هیچ migration، ولی بدون ایندکس معکوس و بدون یکتایی داخلی) یا `person_identifiers` با `kind='extension'` (نیازمند تغییر یک CHECK، ولی با normalization و وضعیت و تأیید).
12. **جمعیت هدف چند نفر است؟** ۱۴ نفر نقش `sales`، یا هر ۴۱ کاربر `profiles`؟

**د — دربارهٔ دامنه**

13. **تماس‌هایی که از موبایل شخصی کارشناس برقرار می‌شود** — که هرگز از PBX رد نمی‌شود و در هیچ CDR ای نیست — هم باید شمرده شود؟ اگر بله، CDR به‌تنهایی هرگز تصویر کامل نمی‌دهد.
14. **نگهداشت CDR روی PBX چند روز است؟** این تعیین می‌کند چقدر می‌شود به عقب backfill کرد و اگر یک شب import نرسد چقدر فرصت جبران هست.
15. **خواستهٔ واقعی «شبانه» است یا «زنده»؟** اگر شبانه کافی است، AMI و ARI نباید اصلاً باز شوند.

---

## ۷ — فهرست NOT VERIFIED

| # | ادعا | چرا اثبات نشد |
|---|---|---|
| N1 | وجود یا عدم وجود یک سرور Issabel روی این LAN | آدرس نامعلوم؛ پیدا کردنش نیازمند sweep است که ممنوع است |
| N2 | نسخهٔ Issabel / Asterisk | نیازمند وب UI یا shell یا پاسخ ادمین |
| N3 | در دسترس بودن `asteriskcdrdb` از بیرون | نیازمند اتصال؛ ممنوع و بدون credential |
| N4 | فعال بودن AMI | همان |
| N5 | فعال بودن ARI | همان |
| N6 | باز بودن مسیر شبکه از `.8` تا PBX | بدون آدرس بی‌معناست |
| N7 | UNIQUE نبودن `idx_call_logs_external` | از prior art نقل شد؛ بازبررسی نشد چون به `call_logs` دست نزدم |
| N8 | اینکه CDR وارد‌شده باید کجا بنشیند و «یک تماس» یعنی چه | ردیف agent دیگری است؛ عمداً تکرار نشد |

**هیچ‌یک از این‌ها با حدس پر نشد.** برای این ردیف، «بدون credential قابل تأیید نیست» پاسخ درست است، نه پاسخ ناقص.

---

## ۸ — پیوست: دستورهای اجراشده

هیچ دستور شبکه‌ای به هیچ میزبان راه دوری در این فهرست نیست.

```bash
# --- repo ---
grep -rnIiE "issabel|asterisk|freepbx|elastix|asteriskcdrdb|\bPBX\b|\bVoIP\b|\bSIP\b" .
grep -rlI -e "ایزابل" -e "آستریسک" -e "مرکز تلفن" -e "ویپ" -e "تلفنخانه" .
grep -rlI -e "شماره داخلی" -e "مرکز تماس" -e "سانترال" docs/ src/
grep -rnIoE "192\.168\.[0-9]+\.[0-9]+(:[0-9]+)?" . | sort | uniq -c
grep -oE "^[A-Za-z0-9_]+" /d/AfraKalaTest/app/deploy/lan/.env.lan | sort -u   # فقط نام کلیدها
grep -vE "^#" /c/Windows/System32/drivers/etc/hosts

# --- میزبان محلی (passive) ---
docker ps -a --format "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
Get-NetIPAddress -AddressFamily IPv4        # هیچ بسته‌ای فرستاده نمی‌شود

# --- دیتابیس (فقط خواندن) ---
docker exec -u postgres afrakala-lan-db psql -d afrakala -c \
  "select table_name, column_name, data_type from information_schema.columns
   where table_schema='public' and (column_name ~* 'ext|phone|tel|mobile|msisdn|caller|did|line')
   order by table_name, column_name;"
docker exec -u postgres afrakala-lan-db psql -d afrakala -c \
  "select table_name, column_name from information_schema.columns
   where table_schema='public' and column_name ~* 'url|host|endpoint|_ip$|server|domain' order by 1,2;"
docker exec -u postgres afrakala-lan-db psql -d afrakala -c \
  "select table_name, column_name, data_type, is_nullable from information_schema.columns
   where table_schema='public'
     and table_name in ('profiles','employee_profiles','person_identifiers',
                        'profile_field_definitions','profile_field_values')
   order by table_name, ordinal_position;"
docker exec -u postgres afrakala-lan-db psql -d afrakala -c "select kind, count(*) from person_identifiers group by 1;"
docker exec -u postgres afrakala-lan-db psql -d afrakala -c \
  "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.person_identifiers'::regclass;"
docker exec -u postgres afrakala-lan-db psql -d afrakala -c \
  "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.profile_field_values'::regclass;"
docker exec -u postgres afrakala-lan-db psql -d afrakala -c "select count(*) total, count(phone), count(person_id) from profiles;"
docker exec -u postgres afrakala-lan-db psql -d afrakala -c "select count(*) from employee_profiles;"
docker exec -u postgres afrakala-lan-db psql -d afrakala -c "select count(*), count(distinct user_id), count(distinct field_name) from profile_field_values;"
docker exec -u postgres afrakala-lan-db psql -d afrakala -c "select name, label, field_type, is_active from profile_field_definitions order by sort_order;"
docker exec -u postgres afrakala-lan-db psql -d afrakala -c "select role, count(*) from user_roles group by 1 order by 2 desc;"
docker exec -u postgres afrakala-lan-db psql -d afrakala -c "select extname, extversion from pg_extension order by 1;"
docker exec -u postgres afrakala-lan-db psql -d postgres -c "select jobid, schedule, jobname, active, database from cron.job order by jobid;"
```

**آنچه اجرا نشد و عمداً اجرا نشد:** هیچ `ping`، هیچ `Test-NetConnection`، هیچ `nmap`، هیچ اتصال TCP به هیچ میزبانی، هیچ resolve نامی، و هیچ تماسی با `192.168.170.10`.
