# Local Test Checklist

Version: 3.9
Phase: 3.9.10
Owner: Mehdi Heydari
Status: Draft
Scope: Local test checklist only. No feature development.

---

## 1. هدف این سند

هدف این سند این است که کامپیوتر شخصی محل تست باشد، نه لپ‌تاپ سرور.

هیچ تغییری نباید بدون تست local و evidence مناسب آماده merge نهایی یا انتقال به سرور شود.

سرور جای آزمون و خطا نیست.

---

## 2. قانون طلایی

هر PR قبل از آماده‌شدن برای merge نهایی باید روی محیط local یا staging test بررسی شود.

اگر تست انجام نشده، باید دلیل آن در PR نوشته شود.

اگر تست لازم بوده ولی انجام نشده، PR آماده merge نیست.

---

## 3. چه زمانی این چک‌لیست لازم است؟

این چک‌لیست برای این موارد لازم است:

| نوع کار | آیا Local Test لازم است؟ | توضیح |
|---|---|---|
| Docs / Governance | سبک | بررسی فایل‌ها، مسیرها و PR scope |
| UI / Lovable | بله | UI باید باز و تست انسانی شود |
| Core / Backend | بله | typecheck/lint/build/local test |
| API / Contract | بله | contract و مصرف‌کننده باید بررسی شود |
| Worker / Automation | بله | بدون اجرای real bot در Phase 3.9 |
| Migration | بله | فقط با staging/test database |
| Server / Deploy | قبل از سرور بله | سرور محل تست اولیه نیست |
| Enforcement / GitHub Actions | بله | با PR آزمایشی یا workflow result |

---

## 4. چک‌لیست سریع قبل از شروع تست

قبل از تست local این موارد باید بررسی شوند:

| سؤال | وضعیت مورد انتظار |
|---|---|
| branch درست است؟ | بله |
| آخرین `staging` گرفته شده؟ | بله |
| branch از `staging` ساخته شده؟ | بله |
| `.env` تستی استفاده شده؟ | بله، اگر env لازم است |
| `.env` واقعی داخل Git نیست؟ | بله |
| مسیرهای ممنوع تغییر نکرده‌اند؟ | بله |
| Task ID و Phase مشخص است؟ | بله |
| Handoff لازم بوده؟ | اگر لازم بوده، باید موجود باشد |
| Evidence لازم مشخص است؟ | بله |

---

## 5. دستورهای استاندارد local test

این ترتیب استاندارد برای تست local است.

1. `git checkout staging`

2. `git pull origin staging`

3. `git checkout <branch-name>`

4. `git status --short`

5. `git diff --name-only origin/staging...HEAD`

6. `npm install`

7. `npm run typecheck`

8. `npm run lint`

9. `npm run build`

10. `npm run dev`

11. UI را در مرورگر باز کن.

12. login را تست کن، اگر تغییر به login یا auth مربوط است.

13. اتصال Supabase تستی را بررسی کن، اگر دیتابیس درگیر است.

14. مسیرهای ممنوع را دوباره چک کن.

15. evidence را ثبت کن.

---

## 6. حداقل تست برای PRهای سندی

برای PR سندی لازم است:

1. فایل سند خوانده شود.
2. مسیر فایل درست باشد.
3. branch با `docs/WPC-3.9-xxx` شروع شود.
4. فقط فایل‌های docs تغییر کرده باشند.
5. migration impact برابر None باشد.
6. RLS/RBAC impact برابر None باشد.
7. secret impact برابر None باشد.
8. PR body کامل باشد.
9. evidence سبک در PR body نوشته شود.

دستورهای لازم برای سند:

1. `git status --short`

2. `git diff --name-only origin/staging...HEAD`

3. `git diff --stat origin/staging...HEAD`

4. `sed -n '1,260p' <changed-doc-file>`

---

## 7. حداقل تست برای UI / Lovable

برای UI یا Lovable لازم است:

1. پروژه روی local اجرا شود.
2. صفحه یا route مربوط باز شود.
3. responsive بررسی شود.
4. RTL بررسی شود.
5. loading state بررسی شود.
6. empty state بررسی شود.
7. خطای ساده UI بررسی شود.
8. screenshot قبل/بعد گرفته شود یا دلیل نبودن screenshot نوشته شود.
9. مسیرهای ممنوع Lovable تغییر نکرده باشند.

Lovable نباید این مسیرها را تغییر داده باشد:

- `supabase/**`
- `openapi/**`
- `automation/**`
- `server/**`
- `src/lib/**`
- `src/integrations/**`
- `src/server/**`
- `.github/**`
- `deploy/**`
- `.env*`

---

## 8. حداقل تست برای Core / Cursor

برای Core، Backend، Contract یا Worker لازم است:

1. typecheck اجرا شود یا دلیل نبودن script نوشته شود.
2. lint اجرا شود یا دلیل نبودن script نوشته شود.
3. build اجرا شود یا دلیل اجرا نشدن نوشته شود.
4. local test انجام شود.
5. contract check انجام شود، اگر API یا schema تغییر کرده.
6. migration impact مشخص شود.
7. RLS/RBAC impact مشخص شود.
8. secret impact مشخص شود.
9. اگر UI هم درگیر است، Handoff و Two PR plan وجود داشته باشد.

---

## 9. حداقل تست برای Migration

اگر migration وجود دارد:

1. migration فقط در branch درست Cursor/DB باشد.
2. فایل migration مشخص باشد.
3. دلیل migration نوشته شود.
4. جدول‌ها و policyهای تحت تأثیر مشخص باشند.
5. RLS/RBAC impact مشخص باشد.
6. روی staging/test database بررسی شود.
7. rollback یا recovery plan نوشته شود.
8. approval افرا/علی مشخص باشد.
9. UI با migration قاطی نشده باشد مگر Handoff روشن وجود داشته باشد.

---

## 10. حداقل تست برای Server قبل از انتقال

قبل از اینکه چیزی به لپ‌تاپ سرور منتقل شود:

1. PR روی کامپیوتر شخصی تست شده باشد.
2. evidence کامل باشد.
3. branch نهایی مشخص باشد.
4. tag یا release مشخص باشد، اگر لازم است.
5. backup plan مشخص باشد.
6. rollback plan وجود داشته باشد.
7. `.env` سرور داخل Git نباشد.
8. smoke test آماده باشد.
9. تغییر production ناگهانی وجود نداشته باشد.

اگر این موارد کامل نیست، نسخه نباید روی لپ‌تاپ سرور اجرا شود.

---

## 11. چک مسیرهای ممنوع

قبل از اعلام آماده بودن PR، این دستور باید اجرا شود:

1. `git diff --name-only origin/staging...HEAD`

بعد خروجی باید با نوع branch مقایسه شود.

نمونه‌های Stop-The-Line:

- docs branch فایل feature code تغییر داده باشد.
- Lovable branch به `supabase/**` دست زده باشد.
- UI PR به `openapi/**` دست زده باشد.
- Core PR بدون Handoff به UI گسترده دست زده باشد.
- PR هم `supabase/**` و هم `src/routes/**` را تغییر داده باشد.

---

## 12. خروجی قابل قبول تست local

در PR باید نوشته شود:

| مورد | وضعیت |
|---|---|
| Branch checked | Yes / No |
| Latest staging pulled | Yes / No |
| Changed files checked | Yes / No |
| Forbidden paths checked | Yes / No |
| Typecheck | Pass / Fail / Not applicable |
| Lint | Pass / Fail / Not applicable |
| Build | Pass / Fail / Not applicable |
| Local UI test | Pass / Fail / Not applicable |
| Supabase test connection | Pass / Fail / Not applicable |
| Evidence added | Yes / No |

---

## 13. اگر تست fail شد چه کنیم؟

اگر typecheck، lint، build یا local test fail شد:

1. PR نباید merge شود.
2. خطا باید در evidence ثبت شود.
3. اگر خطا مربوط به همین PR است، باید اصلاح شود.
4. اگر خطا از قبل وجود داشته، باید توضیح داده شود.
5. reviewer باید تصمیم بگیرد که fail قابل قبول است یا نه.
6. اگر fail روی مسیر حساس اثر دارد، Stop-The-Line شود.

---

## 14. چه چیزی تست local حساب نمی‌شود؟

این موارد کافی نیستند:

- فقط گفتن «تست شد»
- تست روی سرور به جای local
- screenshot بدون توضیح
- build بدون branch name
- اجرای دستور بدون ثبت نتیجه
- PR بدون مسیرهای تغییرکرده
- PR بدون evidence
- تست با production database بدون approval

---

## 15. ارتباط با اسناد دیگر

این سند باید با این فایل‌ها هماهنگ باشد:

- `docs/process/path-ownership-matrix.md`
- `docs/process/lovable-cursor-boundary.md`
- `docs/process/branch-policy.md`
- `docs/process/two-pr-policy.md`
- `docs/process/handoff-policy.md`
- `docs/process/evidence-policy.md`
- `docs/process/definition-of-ready.md`
- `docs/process/definition-of-done.md`
- `docs/process/stop-the-line.md`

اگر یکی از این سندها تغییر کند، باید بررسی شود که Local Test Checklist هم نیاز به update دارد یا نه.

---

## 16. خروجی مورد انتظار برای علی

علی باید بعداً بتواند از این سند این موارد را enforce کند:

1. CI اولیه روی PRها تعریف کند.
2. `staging-check.yml` را با این چک‌ها هماهنگ کند.
3. PR Template را به local test checklist وصل کند.
4. نبود تست local یا evidence را هشدار دهد.
5. برای server deployment، تست local را prerequisite کند.

---

## 17. معیار پذیرش این سند

این سند وقتی قبول است که:

1. روشن کند کامپیوتر شخصی محل تست اولیه است.
2. چک‌لیست branch و staging داشته باشد.
3. دستورهای استاندارد تست local داشته باشد.
4. تست سندی، UI، Core، Migration و Server را جدا کند.
5. مسیرهای ممنوع را قبل از merge کنترل کند.
6. failure handling داشته باشد.
7. قابل تبدیل به CI و PR Template باشد.

---

## 18. وضعیت فعلی

Status: Ready for review.
