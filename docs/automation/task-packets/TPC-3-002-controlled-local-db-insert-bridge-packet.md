# TPC-3-002 — بسته طراحی Controlled Local DB Insert Bridge

## 1. هدف

هدف این بسته، تعریف محدوده، قوانین، گاردها، تست‌ها و شرایط پذیرش برای یک PR آینده است که ممکن است مسیر کنترل‌شده‌ی ثبت خروجی شواهد worker در یک جدول evidence/output را طراحی و پیاده‌سازی کند.

این سند implementation را تأیید نمی‌کند. این سند فقط چارچوب تصمیم‌گیری و کنترل برای مرحله بعدی را مشخص می‌کند.

## 2. وضعیت فعلی پروژه

تا این نقطه، Phase 3 فقط در وضعیت dry-run و read-only جلو رفته است.

زنجیره فعلی شامل این مسیر است:

- readonly pipeline
- persisted output boundary
- bridge guard boundary
- dry-run evidence summary

وضعیت فعلی:

- real database insert قفل است
- هیچ write واقعی به دیتابیس مجاز نیست
- هیچ scheduler، cron یا daemon مجاز نیست
- هیچ browser automation مجاز نیست
- هیچ business writeback مجاز نیست
- هیچ migration جدید بدون packet جداگانه مجاز نیست

PR #211 closeout زنجیره dry-run را ثبت کرده و صریحاً اعلام کرده که real DB insert تا زمان packet جداگانه، review، approval و merge شدن آن قفل می‌ماند.

## 3. محدوده مجاز

محدوده مجاز برای PR آینده، فقط طراحی و در صورت تأیید بعدی، پیاده‌سازی بسیار محدود یک bridge کنترل‌شده برای ثبت evidence/output است.

محدوده مجاز آینده فقط می‌تواند شامل موارد زیر باشد:

- ثبت خروجی validated evidence row
- فقط برای جدول evidence/output
- بدون نوشتن به جدول‌های تجاری
- بدون تغییر رفتار UI
- بدون API route اجرایی عمومی
- بدون external source call
- بدون browser automation
- بدون scheduler یا daemon
- بدون secrets در repo
- بدون تغییر جدول‌های product، price، customer، supplier، sales-list، CRM یا هر جدول عملیاتی تجاری

## 4. خارج از محدوده

موارد زیر صراحتاً خارج از محدوده هستند:

- پیاده‌سازی real DB insert در همین سند
- هرگونه migration
- تغییر RLS
- تغییر RBAC
- تغییر UI
- تغییر API route
- نوشتن به جدول‌های تجاری
- اجرای bulk crawl
- اتصال به Torob، Divar، WhatsApp، Instagram یا هر منبع بیرونی
- استفاده از browser automation
- ذخیره cookie، token، credential یا service role key
- ساخت scheduler، cron، daemon یا worker دائمی
- تغییر package.json، bun.lock، pnpm-lock.yaml، Dockerfile، deploy scripts یا CI

## 5. جدول هدف پیشنهادی

جدول پیشنهادی برای بررسی در PR آینده:

`automation_driver_outputs`

این جدول فقط به عنوان گزینه پیشنهادی مطرح می‌شود و قبل از هر implementation باید با migrations موجود و schema واقعی Supabase بررسی شود.

اگر جدول وجود نداشته باشد، مناسب نباشد، constraintهای آن با Phase 3 ناسازگار باشد، یا نیاز به تغییر schema داشته باشد، باید یک migration packet جداگانه تهیه، review، approve و merge شود.

این سند اجازه migration نمی‌دهد.

## 6. حالت insert پیشنهادی

حالت insert پیشنهادی برای PR آینده باید محدود، صریح و قابل برگشت باشد.

ویژگی‌های insert آینده:

- فقط local/controlled
- فقط برای یک validated evidence row
- فقط پس از عبور از validation
- فقط پس از عبور از guard
- بدون writeback تجاری
- بدون side effect بیرونی
- بدون اجرای خودکار دوره‌ای
- بدون اتصال به UI عمومی
- با dry-run equivalent برای مقایسه قبل از insert واقعی
- با output summary برای evidence

## 7. قوانین validation

قبل از هر insert آینده، داده باید validation شود.

حداقل validation لازم:

- وجود job_id یا شناسه trace قابل ردیابی
- وجود source_kind مجاز
- وجود phase_label مجاز
- وجود payload محدود و غیرحساس
- عدم وجود secret-like field
- عدم وجود business-writeback-like field
- عدم وجود credential، token، cookie، password یا service role key
- عدم وجود فیلدهای مربوط به قیمت‌گذاری عملیاتی، مشتری، فروش، CRM یا supplier writeback
- قابل serializable بودن payload
- محدود بودن اندازه payload
- مشخص بودن dry_run یا insert mode
- قابل audit بودن خروجی

اگر هر validation fail شود، insert باید abort شود و دلیل abort در evidence summary ثبت شود.

## 8. قوانین guard

PR آینده باید guard صریح داشته باشد.

حداقل guardها:

- رد هرگونه business table write
- رد هرگونه secret-like field
- رد هرگونه credential-like field
- رد هرگونه external call
- رد هرگونه scheduler mode
- رد هرگونه browser automation mode
- رد هرگونه UI/API execution trigger بدون ADR جداگانه
- رد phase_label نامعتبر
- رد target table نامعتبر
- رد insert اگر schema verification انجام نشده باشد
- رد insert اگر RLS/permission فرضی و نامعتبر باشد

Guard باید fail-closed باشد؛ یعنی در حالت ابهام، عملیات باید متوقف شود.

## 9. فرضیات RLS و permission

این سند هیچ تغییری در RLS یا permission مجاز نمی‌کند.

فرضیات PR آینده:

- نباید service role key در client، repo، log یا فایل config ذخیره شود
- دسترسی باید server-side و محدود باشد
- permission باید فقط برای جدول evidence/output باشد
- اگر RLS یا permission نیاز به تغییر داشته باشد، migration/permission packet جداگانه لازم است
- هیچ مجوزی برای نوشتن به جدول‌های تجاری صادر نمی‌شود

## 10. فایل‌های مجاز در PR بعدی

اگر بعداً implementation packet تأیید شد، فایل‌های مجاز باید صریحاً در آن packet تعیین شوند.

برای PR implementation آینده، فایل‌های احتمالی مجاز فقط می‌توانند شامل مواردی شبیه این باشند:

- automation/worker-runtime/src/evidence_db_insert_bridge.py
- automation/worker-runtime/tests/test_evidence_db_insert_bridge.py
- docs/baseline/PHASE3_CONTROLLED_DB_INSERT_EVIDENCE_*.md

این فهرست قطعی نیست و implementation بدون packet جداگانه مجاز نیست.

## 11. فایل‌های ممنوع

در PR مربوط به این packet، فقط همین فایل مستنداتی مجاز است.

فایل‌ها و مسیرهای ممنوع:

- automation/worker-runtime/src/
- automation/worker-runtime/tests/
- src/
- supabase/migrations/
- automation/openapi/
- openapi/
- package.json
- bun.lock
- pnpm-lock.yaml
- .github/
- deploy/
- Dockerfile
- هر فایل UI
- هر فایل API route
- هر runtime code
- هر فایل secret/config/env

## 12. Test Plan

برای این PR مستنداتی:

- فقط بررسی changed files
- فقط بررسی متن سند
- عدم اجرای dependency install
- عدم اجرای migration
- عدم اجرای runtime
- عدم اجرای external call

برای PR آینده implementation، test plan باید حداقل شامل موارد زیر باشد:

- unit test برای validation
- unit test برای guard
- test برای رد secret-like fields
- test برای رد business-writeback-like fields
- test برای abort در schema mismatch
- test برای dry-run summary
- test برای insert کنترل‌شده فقط در target table
- test برای rollback/abort behavior

## 13. Evidence Requirements

هر PR آینده باید evidence کافی داشته باشد:

- changed files list
- test output
- dry-run output
- guard pass/fail evidence
- validation pass/fail evidence
- confirmation that no commercial table was written
- confirmation that no secret was added
- confirmation that no scheduler/daemon was added
- confirmation that no external call happened

بدون evidence کافی، PR نباید merge شود.

## 14. Rollback / Abort Plan

Rollback برای این PR:

- revert همین فایل مستنداتی

Abort plan برای PR آینده:

- اگر validation fail شود، insert انجام نشود
- اگر guard fail شود، insert انجام نشود
- اگر schema verification fail شود، insert انجام نشود
- اگر target table نامعتبر باشد، insert انجام نشود
- اگر secret-like field دیده شود، insert انجام نشود
- اگر business-writeback-like field دیده شود، insert انجام نشود
- اگر عملیات به جدول تجاری نزدیک شود، PR متوقف شود

## 15. Stop Conditions

در صورت مشاهده هرکدام از موارد زیر، کار باید فوراً متوقف شود:

- تلاش برای real DB insert بدون implementation packet جداگانه
- اضافه شدن migration در همین PR
- تغییر UI
- تغییر API route
- تغییر runtime code
- تغییر deploy یا Docker
- تغییر package.json یا lockfile
- اضافه شدن secret یا runtime value
- تلاش برای write به جدول تجاری
- اتصال به منبع بیرونی
- اضافه شدن scheduler، cron یا daemon
- اضافه شدن browser automation
- ambiguity درباره target table یا permission

## 16. Owner / Reviewer / Tester

Owner:

- AfraKala technical owner

Reviewer:

- reviewer آشنا با Phase 0 تا Phase 3 و boundary rules

Tester:

- فردی که بتواند changed files، test output، evidence و عدم خروج از محدوده را بررسی کند

هیچ PR آینده نباید بدون reviewer و evidence کافی merge شود.

## 17. تصمیم درباره ADR

این سند به تنهایی ADR جدید ایجاد نمی‌کند.

اگر در PR آینده نیاز به یکی از موارد زیر باشد، ADR جداگانه لازم است:

- تغییر معماری persistence
- تغییر source of truth
- تغییر RLS/RBAC
- تغییر target table یا migration
- اتصال UI/API به worker execution
- اضافه شدن scheduler یا daemon
- اتصال external source

## 18. Acceptance Criteria

این PR فقط زمانی قابل قبول است که:

- فقط همین فایل مستنداتی تغییر کرده باشد
- هیچ runtime code تغییر نکرده باشد
- هیچ migration اضافه نشده باشد
- هیچ UI یا API تغییر نکرده باشد
- هیچ secret یا runtime value اضافه نشده باشد
- سند صریحاً اعلام کند implementation هنوز مجاز نیست
- سند صریحاً اعلام کند real DB insert هنوز قفل است
- سند target table را فقط پیشنهادی بداند
- سند نیاز به schema verification را ثبت کند
- سند migration را غیرمجاز بداند
- سند stop conditions را کامل ثبت کند

## 19. Final Decision

تصمیم نهایی این packet:

TPC-3-002 فقط یک بسته طراحی و کنترل برای مرحله بعدی است.

این سند اجازه implementation نمی‌دهد.

Real DB insert همچنان قفل است.

هرگونه پیاده‌سازی insert واقعی، نیازمند PR جداگانه، test-first، evidence کافی، review، approval و merge مستقل است.

تا قبل از آن، وضعیت پروژه باید در حالت controlled, local, read-only evidence posture باقی بماند.
