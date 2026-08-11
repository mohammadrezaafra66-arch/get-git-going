# Definition of Done

Version: 3.9
Phase: 3.9.8
Owner: Mehdi Heydari
Status: Draft
Scope: Task completion policy only. No feature development.

---

## 1. هدف این سند

Definition of Done یعنی یک Task فقط وقتی تمام است که قابل review، قابل تست، قابل اثبات و قابل merge باشد.

هدف این سند این است که «انجام شد» بدون PR، evidence، تست و review قبول نشود.

یک Task وقتی Done است که:

- روی branch درست انجام شده باشد.
- PR داشته باشد.
- مسیرهای ممنوع تغییر نکرده باشند.
- evidence داشته باشد.
- تست local انجام شده باشد یا دلیل انجام‌نشدن نوشته شده باشد.
- review انجام شده باشد.
- secret وارد Git نشده باشد.
- اگر OpenAPI تغییر کرده، سند و مصرف‌کننده‌ها هماهنگ باشند.
- اگر migration دارد، rollback یا recovery plan داشته باشد.

---

## 2. قانون طلایی

هیچ Task بدون PR و evidence کامل Done نیست.

حتی اگر تغییر فقط سندی باشد، باید PR، review و evidence سبک داشته باشد.

---

## 3. حداقل شرایط Done بودن

هر Task برای Done شدن باید این موارد را پاس کند:

| مورد | لازم است؟ |
|---|---|
| Branch درست | بله |
| Commit روشن | بله |
| PR باز شده | بله |
| PR به base درست | بله |
| Scope کوچک | بله |
| مسیرهای ممنوع تغییر نکرده‌اند | بله |
| Evidence دارد | بله |
| Test plan دارد | بله |
| Review انجام شده | بله |
| Migration impact مشخص است | بله |
| RLS/RBAC impact مشخص است | بله |
| Secret impact مشخص است | بله |
| Remaining risks نوشته شده | بله |
| Merge بعد از review | بله |

---

## 4. Branch و PR

Task فقط وقتی Done است که روی branch درست انجام شده باشد.

| نوع کار | Branch مورد انتظار |
|---|---|
| Docs | `docs/WPC-3.9-xxx-short-title` |
| UI | `lovable/ui-xxx` |
| API | `cursor/api-xxx` |
| Worker | `cursor/worker-xxx` |
| DB | `cursor/db-xxx` |
| Governance | `cursor/governance-xxx` |
| Hotfix | `hotfix/xxx` |

PR باید به base درست برود.

برای فاز 3.9، base معمولاً `staging` است.

---

## 5. مسیرهای ممنوع نباید تغییر کرده باشند

Task فقط وقتی Done است که مسیرهای ممنوع همان Task تغییر نکرده باشند.

برای Docs branch نباید این‌ها تغییر کنند:

- feature code
- UI implementation
- backend logic
- worker runtime
- migration
- dependency files
- deploy config
- secrets

برای Lovable نباید این‌ها تغییر کنند:

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

اگر مسیر ممنوع تغییر کرده، Task Done نیست.

---

## 6. Evidence الزامی است

Task فقط وقتی Done است که evidence داشته باشد.

Evidence باید با نوع کار هماهنگ باشد.

| نوع کار | Evidence مورد انتظار |
|---|---|
| Docs | PR body کامل، changed files، test plan، impacts |
| UI | screenshot یا دلیل نبودن screenshot، local test، forbidden paths check |
| Core | typecheck، lint، build، local test |
| Contract | contract check، نمونه input/output، مصرف‌کننده |
| Migration | rollback، RLS/RBAC impact، staging test |
| Server | backup، smoke test، rollback plan |
| Enforcement | test PR یا workflow result |

اگر evidence ندارد، Done نیست.

---

## 7. Test Plan باید اجرا یا توضیح داده شود

Task باید test plan داشته باشد.

برای Docs:

- فایل‌ها خوانده شده‌اند.
- مسیرهای تغییرکرده درست‌اند.
- PR فقط سندی است.
- migration impact برابر None است.
- secret impact برابر None است.

برای UI:

- UI باز شده است.
- سناریوی انسانی تست شده است.
- screenshot یا دلیل نبودن screenshot ثبت شده است.

برای Core:

- typecheck اجرا شده یا دلیل نبودن script نوشته شده است.
- lint اجرا شده یا دلیل نبودن script نوشته شده است.
- build اجرا شده یا دلیل اجرا نشدن نوشته شده است.
- local test انجام شده است.

برای Server:

- قبل از deploy backup گرفته شده است.
- smoke test انجام شده است.
- rollback plan آماده است.

اگر تست انجام نشده و دلیل ندارد، Done نیست.

---

## 8. Review و Approval

Task فقط وقتی Done است که review مناسب داشته باشد.

| نوع کار | Reviewer |
|---|---|
| Docs / Governance | Mehdi / Afra |
| Lovable UI | Mehdi |
| Core / Backend | Ali / Afra |
| API / Contract | Ali / Afra |
| Migration | Afra / Ali |
| Security | Afra / Ali |
| Deployment | Ali / Afra |
| Enforcement | Ali / Afra |

اگر مسیر حساس تغییر کرده ولی approval لازم ندارد، Done نیست.

---

## 9. Secret و Sensitive Data

Task فقط وقتی Done است که secret وارد Git نشده باشد.

باید بررسی شود:

- `.env` وارد Git نشده باشد.
- service role key وارد Git نشده باشد.
- token یا API key داخل کد یا سند نیامده باشد.
- اطلاعات حساس مشتری یا شرکت در log یا evidence نیامده باشد.

اگر secret impact مشخص نیست، Done نیست.

---

## 10. OpenAPI و Contract

اگر OpenAPI یا schema تغییر کرده، Task فقط وقتی Done است که:

- مسیر contract تغییرکرده مشخص باشد.
- endpoint یا schema تغییرکرده توضیح داده شده باشد.
- نمونه input/output وجود داشته باشد.
- مصرف‌کننده مشخص باشد.
- اگر UI لازم است، PR دوم یا Handoff مشخص شده باشد.
- سند مرتبط update شده باشد.

OpenAPI change بدون هماهنگی Done نیست.

---

## 11. Migration و Database

اگر migration دارد، Task فقط وقتی Done است که:

- فایل migration مشخص باشد.
- دلیل migration نوشته شده باشد.
- جدول‌ها یا policyهای تحت تأثیر مشخص باشند.
- RLS/RBAC impact مشخص باشد.
- rollback یا recovery plan داشته باشد.
- روی staging تست شده باشد یا دلیل تست‌نشدن نوشته شده باشد.
- approval افرا/علی داشته باشد.

Migration بدون rollback Done نیست.

---

## 12. Handoff برای کار مشترک

اگر کار UI/Core مشترک است، Task فقط وقتی Done است که:

- Handoff وجود داشته باشد.
- مسیر Handoff در PR آمده باشد.
- PR با Handoff همخوانی داشته باشد.
- acceptance criteria Handoff پاس شده باشد.
- evidence required در Handoff تأمین شده باشد.

کار مشترک بدون Handoff Done نیست.

---

## 13. PR Body باید کامل باشد

PR باید حداقل این بخش‌ها را داشته باشد:

| بخش | لازم است؟ |
|---|---|
| Summary | بله |
| Task ID / Phase | بله |
| Change type | بله |
| Files intentionally changed | بله |
| Migration impact | بله |
| RLS/RBAC impact | بله |
| Secret impact | بله |
| Test plan | بله |
| Evidence location | بله |
| Remaining risks | بله |
| Review request | بله |

اگر PR body ناقص است، Task Done نیست.

---

## 14. Done برای PRهای سندی فاز 3.9

برای PRهای سندی فاز 3.9، Done یعنی:

1. branch از `staging` ساخته شده باشد.
2. branch با `docs/WPC-3.9-xxx` شروع شود.
3. فقط فایل‌های docs تغییر کرده باشند.
4. commit واضح باشد.
5. PR به `staging` باز شده باشد.
6. PR body کامل باشد.
7. migration impact برابر None باشد.
8. RLS/RBAC impact برابر None باشد.
9. secret impact برابر None باشد.
10. review انجام شده باشد.
11. merge فقط بعد از review انجام شود.

---

## 15. Done برای UI / Lovable

برای UI / Lovable، Done یعنی:

1. branch درست Lovable داشته باشد.
2. فقط مسیرهای مجاز UI تغییر کرده باشند.
3. مسیرهای ممنوع Lovable تغییر نکرده باشند.
4. UI روی local یا staging بررسی شده باشد.
5. screenshot یا دلیل نبودن screenshot وجود داشته باشد.
6. API حدسی ساخته نشده باشد.
7. اگر API جدید لازم بوده، Handoff وجود داشته باشد.
8. review مهدی انجام شده باشد.

---

## 16. Done برای Cursor / Core

برای Cursor / Core، Done یعنی:

1. branch درست Cursor داشته باشد.
2. مسیرهای مجاز Core تغییر کرده باشند.
3. UI گسترده بدون Handoff تغییر نکرده باشد.
4. typecheck/lint/build اجرا شده یا دلیل عدم اجرا نوشته شده باشد.
5. local test انجام شده باشد.
6. evidence فنی وجود داشته باشد.
7. review علی/افرا انجام شده باشد.
8. اگر contract تغییر کرده، سند مرتبط update شده باشد.
9. اگر migration دارد، rollback مشخص باشد.

---

## 17. Done برای Server / Deployment

برای Server / Deployment، Done یعنی:

1. نسخه روی کامپیوتر شخصی تست شده باشد.
2. PR مربوط merge شده باشد.
3. backup گرفته شده باشد.
4. `.env` سرور داخل Git نباشد.
5. smoke test انجام شده باشد.
6. logها بررسی شده باشند.
7. rollback plan آماده باشد.
8. اگر خطای جدی رخ داد، rollback انجام شده باشد.

---

## 18. Stop-The-Line برای Done نبودن

در این موارد PR نباید merge شود:

1. branch اشتباه است.
2. PR به base اشتباه باز شده است.
3. PR چند موضوع جدا را قاطی کرده است.
4. مسیر ممنوع تغییر کرده است.
5. evidence ندارد.
6. test plan ندارد.
7. migration دارد ولی rollback ندارد.
8. OpenAPI تغییر کرده ولی UI/docs هماهنگ نشده.
9. secret impact مشخص نیست.
10. review لازم انجام نشده.
11. Handoff لازم است ولی وجود ندارد.
12. build/typecheck/lint fail است و دلیل ثبت نشده.

---

## 19. ارتباط با اسناد دیگر

این سند باید با این فایل‌ها هماهنگ باشد:

- `docs/process/path-ownership-matrix.md`
- `docs/process/lovable-cursor-boundary.md`
- `docs/process/branch-policy.md`
- `docs/process/two-pr-policy.md`
- `docs/process/handoff-policy.md`
- `docs/process/evidence-policy.md`
- `docs/process/definition-of-ready.md`

---

## 20. معیار پذیرش این سند

این سند وقتی قبول است که:

1. Done بودن Task را قابل بررسی کند.
2. PR، branch، evidence و review را الزامی کند.
3. مسیرهای ممنوع را کنترل کند.
4. test plan را الزامی کند.
5. secret impact را الزامی کند.
6. OpenAPI و migration را با شرط‌های دقیق کنترل کند.
7. Handoff را برای کار مشترک کنترل کند.
8. قابل تبدیل به PR Template و GitHub Actions باشد.

---

## 21. وضعیت فعلی

Status: Ready for review.
