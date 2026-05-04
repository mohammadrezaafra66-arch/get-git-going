

این سند قانون ثابت پروژه افراکالا برای تمام توسعه‌های آینده است.



هر feature، route، migration، integration، UI، server function، database change، dependency یا تغییر زیرساختی باید قبل از تحویل با این معیارها بررسی شود.



هدف این سند این است که پروژه افراکالا در تمام مراحل توسعه، آماده اجرای واقعی روی Linux + Docker + Supabase Self-host باقی بماند و در پایان توسعه نیاز به بازکاری سنگین برای self-host نداشته باشد.



\---



\## 1. اصل مادر



هر تغییری باید با این فرض ساخته شود:



اپلیکیشن افراکالا باید روی سرور اختصاصی Linux، با Docker، بدون وابستگی حیاتی به سرویس خارجی، قابل اجرا، قابل backup، قابل restore، قابل audit، قابل migration و قابل نگهداری باشد.



اگر یک تغییر باعث یکی از موارد زیر شود، نباید وارد هسته پروژه شود:



\* وابستگی حیاتی به CDN خارجی

\* وابستگی حیاتی به API خارجی

\* وابستگی به سرویس ابری غیرقابل self-host

\* قرار گرفتن secret در frontend یا GitHub

\* دور زدن RBAC یا RLS

\* سخت شدن backup / restore / migration

\* کند شدن سیستم در اینترنت ضعیف ایران

\* پیچیده شدن بیش از حد architecture

\* شکستن مسیر Docker/Linux deployment

\* نیاز به rewrite برای self-host در آینده



\---



\## 2. تعریف Self-Host در افراکالا



Self-host در افراکالا یعنی فقط PostgreSQL کافی نیست.



چون پروژه بر پایه Supabase architecture ساخته شده، برای self-host واقعی باید سرویس‌های موردنیاز پروژه روی زیرساخت خودمان قابل اجرا باشند.



\### Required Supabase Services



این سرویس‌ها برای پروژه لازم هستند:



\* PostgreSQL

\* Auth / GoTrue

\* PostgREST / REST API

\* Storage API

\* Kong / API Gateway

\* Meta / Studio فقط محدود به ادمین

\* Database RLS

\* Database RPC / functions

\* Migrations

\* Backup / restore path



\### Disabled Unless Proven Needed



این سرویس‌ها نباید بی‌دلیل فعال شوند:



\* Realtime

\* Edge Functions

\* Imgproxy

\* Analytics / Logflare

\* Vector

\* Inbucket



اصل مهم:



Supabase کامل در افراکالا یعنی Supabase کاملِ موردنیاز پروژه، نه روشن کردن همه سرویس‌های Supabase بدون دلیل.



\---



\## 3. External Dependency Criteria



هیچ وابستگی حیاتی به سرویس خارجی نباید اضافه شود.



هر integration خارجی باید این شرایط را داشته باشد:



\* optional باشد

\* feature flag داشته باشد

\* در حالت خاموش بودن، مسیر اصلی سیستم همچنان کار کند

\* manual fallback داشته باشد

\* secret آن فقط server-side باشد

\* timeout و error handling داشته باشد

\* در نبود اینترنت بین‌الملل، عملیات اصلی شرکت را متوقف نکند



\### Required Pattern



نمونه صحیح:



```env

OCR\_ENABLED=false

EXTERNAL\_AI\_ENABLED=false

SMS\_ENABLED=false

CURRENCY\_API\_ENABLED=false

```



\### Forbidden



این‌ها ممنوع هستند:



\* وابسته کردن ثبت فیش به OCR خارجی

\* وابسته کردن قیمت‌گذاری به API خارجی بدون fallback دستی

\* وابسته کردن ورود کاربران به سرویس خارجی غیرقابل self-host

\* استفاده از CDN خارجی برای font, JS, CSS

\* استفاده از Google Fonts

\* استفاده از external script در production

\* hardcode کردن URL خارجی در feature حیاتی



\---



\## 4. Secret Management Criteria



هیچ secret واقعی نباید وارد repo، frontend bundle، commit history یا Lovable chat شود.



\### Forbidden Secrets



این موارد هرگز نباید commit شوند:



\* SUPABASE\_SERVICE\_ROLE\_KEY

\* JWT\_SECRET

\* POSTGRES\_PASSWORD

\* SMTP\_PASS

\* DASHBOARD\_PASSWORD

\* LOVABLE\_API\_KEY

\* private key

\* certificate key

\* `.env` واقعی

\* database dump

\* backup archive

\* storage export



\### Required Rules



\* هر secret فقط در `.env` واقعی روی سرور باشد.

\* فایل‌های واقعی `.env` باید در `.gitignore` باشند.

\* فقط فایل‌های `.env.example` مجاز به commit هستند.

\* هیچ server secret نباید prefix `VITE\_` داشته باشد.

\* Service role key هرگز نباید وارد client bundle شود.

\* قبل از تحویل باید secret scan انجام شود.



\### Required Scan



قبل از تحویل هر فاز حساس:



```bash

grep -R "SERVICE\_ROLE" dist/client deploy src || true

grep -R "JWT\_SECRET" dist/client deploy src || true

grep -R "POSTGRES\_PASSWORD" dist/client deploy src || true

grep -R "BEGIN PRIVATE KEY" deploy src || true

grep -R "LOVABLE\_API\_KEY" dist/client src || true

```



خروجی نباید secret واقعی نشان دهد.



\---



\## 5. Git Ignore / Docker Ignore Criteria



هر فاز جدید که فایل runtime تولید می‌کند، باید بررسی کند که خروجی‌های واقعی وارد Git نشوند.



\### Must Be Ignored



```gitignore

.env

.env.production

deploy/\*\*/.env

deploy/\*\*/.env.production

deploy/\*\*/volumes/

deploy/\*\*/certs/

deploy/\*\*/dumps/

deploy/\*\*/storage-export/

deploy/\*\*/\*.dump

deploy/\*\*/\*.tar

deploy/\*\*/\*.tar.gz

deploy/\*\*/\*.age

\*.pem

\*.key

\*.crt

\*.csr

\*.p12

\*.pfx

```



\### Must Be Allowed



```gitignore

!\*.example

!deploy/\*\*/.env.example

!deploy/\*\*/Caddyfile.example

!deploy/\*\*/kong.yml.example

```



اصل مهم:



فایل نمونه commit می‌شود؛ فایل واقعی هرگز commit نمی‌شود.



\---



\## 6. Docker / Linux Readiness Criteria



هر تغییر باید با اجرای Linux Docker سازگار بماند.



\### Required



\* build باید روی Linux پاس شود

\* runtime باید بدون Lovable Cloud کار کند

\* Dockerfile نباید secret را داخل image کپی کند

\* healthcheck باید سبک و مستقل از دیتابیس باشد

\* logs باید روی stdout/stderr باشند

\* app باید روی `0.0.0.0` اجرا شود

\* فقط Caddy باید public port داشته باشد

\* Postgres نباید host port داشته باشد

\* Studio نباید عمومی باشد



\### Required Commands



هر فاز زیرساختی باید در گزارش خود این‌ها را مشخص کند:



```bash

docker compose config

docker compose build

docker compose up -d

docker compose ps

```



اگر Docker در sandbox موجود نبود، باید manual validation گزارش شود و اجرای واقعی به staging موکول شود.



\---



\## 7. Database / Migration Criteria



هر migration باید self-host-safe باشد.



\### Required



\* migration باید قابل اجرا روی Supabase self-host باشد

\* migration نباید به سرویس cloud-only وابسته باشد

\* migration باید idempotent یا حداقل safe باشد

\* destructive migration باید confirmation و backup plan داشته باشد

\* RLS باید برای جدول‌های حساس تعریف یا حفظ شود

\* indexهای لازم برای queryهای بزرگ باید اضافه شوند

\* audit log برای عملیات حساس باید وجود داشته باشد

\* rollback یا recovery note باید نوشته شود



\### Forbidden



\* تغییر دیتابیس بدون migration

\* اجرای migration واقعی در فاز scaffold

\* حذف داده بدون backup

\* ساخت جدول حساس بدون RLS

\* ساخت endpoint حساس با frontend-only guard



\---



\## 8. RBAC / RLS Criteria



کنترل دسترسی فقط در frontend قابل قبول نیست.



هر feature حساس باید سه لایه را رعایت کند:



1\. UI guard

2\. route/server guard

3\. database RLS / backend permission



\### Required Access Levels



هر ماژول باید سطح دسترسی مشخص داشته باشد:



\* view

\* create

\* update

\* delete

\* approve

\* publish

\* export

\* manage

\* view\_sensitive



\### Sensitive Data



این موارد حساس‌اند و نیاز به permission جدا دارند:



\* قیمت خرید

\* سود محصول

\* یادداشت خصوصی

\* اطلاعات حسابداری

\* اعتبار مشتری

\* بدهی مشتری

\* فیش واریزی

\* اطلاعات بانکی

\* service/admin panels

\* audit logs



\### Record-Level Access



در صورت نیاز، دسترسی باید record-level باشد:



\* فروشنده فقط داده‌های مجاز خود را ببیند

\* مسئول محصول فقط محصولات خودش را ویرایش کند

\* حسابدار فقط عملیات حسابداری مجاز را انجام دهد

\* viewer فقط مشاهده محدود داشته باشد



\---



\## 9. Audit Log Criteria



تمام عملیات حساس باید audit log داشته باشند.



\### Must Audit



\* ایجاد/ویرایش/حذف کاربر

\* تغییر نقش یا دسترسی

\* تغییر قیمت خرید

\* تغییر قانون قیمت‌گذاری

\* ثبت/ویرایش/تأیید فیش

\* صدور یا انتشار لیست فروش

\* تغییر اعتبار مشتری

\* import/export داده

\* migration واقعی

\* restore واقعی

\* تغییر تنظیمات امنیتی



\### Audit Fields



حداقل اطلاعات audit:



\* actor\_id

\* action

\* entity\_type

\* entity\_id

\* before

\* after

\* created\_at

\* IP/user agent اگر در دسترس بود



\---



\## 10. Backup / Restore Criteria



هر feature که داده جدید تولید می‌کند باید در backup/restore قابل پوشش باشد.



\### Required



\* داده باید در Postgres یا Storage قابل backup باشد

\* فایل‌ها باید در bucket مشخص و قابل export/import باشند

\* مسیر storage باید قابل verify باشد

\* اگر جدول جدید اضافه شد، verify-db-counts باید به‌روزرسانی شود

\* اگر bucket جدید اضافه شد، backup/restore document باید به‌روزرسانی شود



\### Forbidden



\* ذخیره فایل مهم فقط در حافظه موقت

\* ذخیره فایل خارج از مسیر backup

\* ساخت داده‌ای که restore path ندارد



\---



\## 11. Performance Criteria



سیستم باید برای اینترنت محدود ایران و دیتای زیاد آماده باشد.



\### Required



\* queryها limit و pagination داشته باشند

\* search و filter باید debounce داشته باشند

\* از `select \*` غیرضروری استفاده نشود

\* صفحات بزرگ lazy-load شوند

\* bundle size کنترل شود

\* تصاویر و فایل‌ها optimize شوند

\* realtime فقط در صورت نیاز قطعی استفاده شود

\* indexهای لازم روی ستون‌های فیلتر/جستجو اضافه شوند

\* timeout درخواست‌های API کمتر از ۱۵ ثانیه نباشد



\### Forbidden



\* load کردن همه محصولات در یک query

\* realtime برای لیست‌های سنگین بدون کنترل

\* polling سنگین

\* render کردن جدول بزرگ بدون pagination/virtualization

\* queryهای unbounded



\---



\## 12. UI / UX Criteria



پروژه باید فارسی، RTL، mobile-first و مناسب کار واقعی باشد.



\### Required



\* تمام صفحات فارسی و RTL باشند

\* موبایل، تبلت، لپ‌تاپ و دسکتاپ قابل استفاده باشند

\* فرم‌های پرتکرار سریع و ساده باشند

\* پیام خطا فارسی و قابل فهم باشد

\* تاریخ‌ها شمسی/جلالی نمایش داده شوند

\* اعداد با جداکننده هزارگان نمایش داده شوند

\* loading, empty state, error state داشته باشد

\* دکمه‌های حساس confirmation داشته باشند



\### Forbidden



\* UI فقط ظاهراً responsive باشد ولی در موبایل قابل استفاده نباشد

\* فرم‌های طولانی بدون UX مناسب

\* پیام خطای انگلیسی خام از دیتابیس/API

\* تاریخ میلادی در UI نهایی فارسی



\---



\## 13. File / Asset Criteria



هیچ asset حیاتی نباید از CDN خارجی بیاید.



\### Required



\* فونت‌ها local باشند

\* JS/CSS production local باشند

\* imageها و iconها local یا داخل bundle باشند

\* PDF/font generation باید بدون اینترنت خارجی کار کند



\### Forbidden



\* Google Fonts

\* CDN برای JS/CSS

\* external script در production

\* asset حیاتی روی دامنه خارجی



\---



\## 14. AI / OCR / Automation Criteria



AI و OCR نباید مسیر اصلی سیستم را قفل کنند.



\### Required



\* AI/OCR optional باشد

\* feature flag داشته باشد

\* fallback دستی داشته باشد

\* timeout و error handling داشته باشد

\* خاموش بودن AI/OCR نباید ثبت عملیات اصلی را متوقف کند

\* کلید API فقط server-side باشد



\### Example



```env

OCR\_ENABLED=false

EXTERNAL\_AI\_ENABLED=false

```



\### Required Fallback



اگر OCR خاموش است، کاربر باید بتواند دستی ثبت کند:



\* شماره پیگیری

\* مبلغ

\* تاریخ

\* توضیحات

\* فایل/تصویر رسید



\---



\## 15. Integration Criteria



هر integration جدید باید قبل از پیاده‌سازی بررسی شود.



\### Required Integration Checklist



\* آیا self-hostable است؟

\* آیا optional است؟

\* آیا feature flag دارد؟

\* آیا manual fallback دارد؟

\* آیا بدون اینترنت خارجی مسیر اصلی کار می‌کند؟

\* آیا secret آن server-side است؟

\* آیا timeout دارد؟

\* آیا audit log لازم دارد؟

\* آیا backup/restore را سخت می‌کند؟

\* آیا در ایران قابل استفاده است؟



اگر پاسخ هرکدام منفی است، integration نباید وارد هسته اصلی شود.



\---



\## 16. Testing / Validation Criteria



هر فاز باید گزارش تست بدهد.



\### Required For Code Changes



\* TypeScript check

\* build یا توضیح دقیق چرایی عدم build

\* route smoke test اگر route جدید است

\* permission test اگر feature حساس است

\* RLS/backend access test اگر داده حساس است

\* no-secret scan

\* no-external-critical-dependency check



\### Required For Infra Changes



\* docker compose config

\* healthcheck

\* no host port leak

\* no secret in repo

\* rollback note

\* staging test before production



\---



\## 17. Documentation Criteria



هر تغییر زیرساختی یا حساس باید مستند شود.



\### Required Docs Update



اگر feature جدید اضافه می‌کند:



\* README یا docs مربوطه را به‌روزرسانی کن

\* env example را به‌روزرسانی کن

\* اگر bucket/table مهم اضافه شد، backup/restore docs را به‌روزرسانی کن

\* اگر integration خارجی اضافه شد، feature flag و fallback را مستند کن

\* اگر permission جدید اضافه شد، RBAC docs را به‌روزرسانی کن



\---



\## 18. Delivery Report Criteria



هر خروجی Lovable باید در پایان گزارش دهد:



\* چه فایل‌هایی تغییر کردند؟

\* آیا TypeScript/build پاس شد؟

\* آیا migration ساخته شد؟

\* آیا RLS/RBAC رعایت شد؟

\* آیا audit log لازم بود؟

\* آیا external dependency اضافه شد؟

\* آیا feature flag دارد؟

\* آیا manual fallback دارد؟

\* آیا env example تغییر کرد؟

\* آیا secret وارد repo نشده؟

\* آیا backup/restore تحت تأثیر است؟

\* آیا self-host acceptance criteria پاس شد؟



\---



\## 19. Stop Conditions



Lovable باید کار را متوقف کند و فایل نسازد اگر:



\* نیاز به secret واقعی دارد

\* `.gitignore` امن نیست

\* معلوم نیست integration خارجی حیاتی می‌شود یا نه

\* migration destructive است و backup plan ندارد

\* RLS/RBAC برای جدول حساس مشخص نیست

\* مسیر self-host معلوم نیست

\* تغییر ممکن است data loss ایجاد کند

\* scope بیش از حد بزرگ است



در این حالت باید فقط گزارش بدهد و از کاربر تصمیم بخواهد.



\---



\## 20. Required Footer For Every Lovable Delivery



در پایان هر اجرای Lovable باید این بخش گزارش شود:



```text

Self-Host Acceptance Check:



\- External critical dependency added? yes/no

\- Feature flag required? yes/no

\- Manual fallback exists? yes/no

\- Secrets safe? yes/no

\- Client bundle secret-free? yes/no

\- Docker/Linux compatibility affected? yes/no

\- Supabase/RLS/RBAC affected? yes/no

\- Audit log required? yes/no

\- Backup/restore affected? yes/no

\- Performance risk? yes/no

\- TypeScript/build passed? yes/no

\- Ready for GitHub sync? yes/no

```



اگر هر مورد `yes` ریسک‌دار بود، باید توضیح و اصلاح ارائه شود.



\---



\## 21. Final Rule



هیچ featureای فقط به خاطر اینکه در Lovable preview کار می‌کند، قابل قبول نیست.



Feature فقط وقتی قابل قبول است که:



\* در GitHub sync شود

\* روی Linux Docker قابل build باشد

\* secret-safe باشد

\* self-host-safe باشد

\* backup/restore آن مشخص باشد

\* RBAC/RLS آن درست باشد

\* بدون سرویس خارجی حیاتی کار کند

\* در اینترنت محدود ایران قابل استفاده باشد



این سند باید در تمام توسعه‌های آینده افراکالا رعایت شود.



