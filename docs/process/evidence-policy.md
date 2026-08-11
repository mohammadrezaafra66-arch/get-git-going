# Evidence Policy

Version: 3.9
Phase: 3.9.7
Owner: Mehdi Heydari
Status: Draft
Scope: Evidence policy only. No feature development.

---

## 1. هدف این سند

هدف این سند این است که جمله «انجام شد» بدون مدرک قبول نشود.

از این مرحله به بعد، هر PR باید evidence داشته باشد.

Evidence یعنی مدرکی که نشان دهد:

- چه چیزی تغییر کرده است.
- چرا تغییر کرده است.
- چه تستی انجام شده است.
- چه ریسکی بررسی شده است.
- آیا مسیرهای ممنوع تغییر نکرده‌اند یا نه.
- اگر تستی انجام نشده، دلیلش چیست.

---

## 2. قانون طلایی

هیچ PR بدون evidence کامل نیست.

حتی اگر تغییر فقط سندی باشد، باید حداقل evidence سبک داشته باشد.

Evidence باید داخل PR توضیح داده شود و اگر فایل لازم دارد، در مسیر درست ذخیره شود.

---

## 3. مسیرهای رسمی Evidence

| نوع evidence | مسیر رسمی |
|---|---|
| Template اصلی | `docs/evidence/_template.md` |
| Evidence سندی | `docs/evidence/WPC-3.9-xxx-docs.md` |
| Evidence UI | `docs/evidence/WPC-3.9-xxx-ui.md` |
| Evidence Core / Cursor | `docs/evidence/WPC-3.9-xxx-core.md` |
| Evidence Server | `docs/evidence/WPC-3.9-xxx-server.md` |
| Evidence Ali / Enforcement | `docs/evidence/WPC-3.9-xxx-enforcement.md` |

---

## 4. Evidence برای PRهای سندی

PR سندی باید حداقل این موارد را داشته باشد:

| مورد | لازم است؟ |
|---|---|
| فایل‌های تغییرکرده | بله |
| دلیل تغییر | بله |
| migration impact | بله، حتی اگر None باشد |
| RLS/RBAC impact | بله، حتی اگر None باشد |
| secret impact | بله، حتی اگر None باشد |
| test plan | بله |
| مسیرهای ممنوع تغییر کرده‌اند؟ | باید مشخص شود |
| ارتباط با مرحله رودمپ | بله |

برای PRهای سندی معمولاً فایل evidence جدا لازم نیست، اما PR body باید این موارد را روشن کند.

---

## 5. Evidence برای UI / Lovable

اگر کار UI یا Lovable باشد، evidence باید نشان دهد UI واقعاً بررسی شده است.

حداقل evidence برای UI:

| Evidence | توضیح |
|---|---|
| `ui-before.png` | تصویر قبل، اگر تغییر بصری دارد |
| `ui-after.png` | تصویر بعد |
| `ui-checklist.md` | چک‌لیست UI |
| `local-test.md` | توضیح تست local |
| changed files summary | لیست فایل‌های تغییرکرده |
| forbidden paths check | تأیید اینکه مسیرهای ممنوع Lovable تغییر نکرده‌اند |

اگر screenshot ممکن نیست، باید دلیل نوشته شود.

Lovable نباید برای evidence وارد مسیرهای ممنوع شود.

---

## 6. Evidence برای Cursor / Core

اگر کار Cursor، Core، Contract، Worker یا Backend باشد، evidence باید فنی‌تر باشد.

حداقل evidence برای Cursor:

| Evidence | توضیح |
|---|---|
| `typecheck.txt` | خروجی typecheck یا دلیل نبودن script |
| `lint.txt` | خروجی lint یا دلیل نبودن script |
| `build.txt` | خروجی build یا دلیل اجرا نشدن |
| `contract-check.md` | اگر OpenAPI یا schema تغییر کرده |
| `local-test.md` | تست local |
| migration impact | اگر database تغییر کرده |
| rollback note | اگر migration یا deploy دارد |
| forbidden paths check | بررسی اینکه UI بی‌دلیل تغییر نکرده |

---

## 7. Evidence برای Server

اگر تغییر قرار است وارد سرور شود، evidence سرور لازم است.

حداقل evidence برای سرور:

| Evidence | توضیح |
|---|---|
| `server-precheck.md` | قبل از انتقال به سرور |
| `backup-confirmation.md` | تأیید backup |
| `server-smoke-test.md` | تست سریع بعد از deploy |
| `rollback-plan.md` | برنامه برگشت |
| env check | تأیید اینکه `.env` داخل Git نیست |
| production risk note | توضیح ریسک production |

سرور نباید محل آزمون و خطا باشد.

---

## 8. Evidence برای Migration

هر PR که migration دارد، باید evidence جدا داشته باشد.

حداقل موارد:

- اسم فایل migration
- دلیل migration
- جدول‌ها یا policyهای تحت تأثیر
- RLS/RBAC impact
- rollback یا recovery plan
- تست روی staging
- تأیید اینکه production مستقیم تغییر نکرده است

Migration بدون evidence باید Stop-The-Line شود.

---

## 9. Evidence برای API / Contract

اگر OpenAPI، schema یا contract تغییر کند، evidence لازم است.

حداقل موارد:

- مسیر contract تغییرکرده
- endpoint یا schema تغییرکرده
- مصرف‌کننده این contract
- آیا UI هماهنگ شده یا نه
- آیا PR دوم UI لازم است یا نه
- نمونه input/output
- error states

Lovable نباید endpoint را حدس بزند.

---

## 10. Evidence برای Handoff

اگر کار با Handoff شروع شده، PR باید به Handoff اشاره کند.

حداقل موارد:

- مسیر Handoff
- نوع Handoff
- ownerها
- مسیرهای مجاز
- مسیرهای ممنوع
- acceptance criteria
- evidence required

اگر Handoff وجود دارد ولی PR با آن نمی‌خواند، PR باید متوقف شود.

---

## 11. Evidence در PR Body

هر PR باید در body خودش این بخش‌ها را داشته باشد:

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

اگر evidence location ندارد، باید توضیح دهد چرا فایل جدا لازم نبوده است.

---

## 12. چه چیزی Evidence حساب نمی‌شود؟

موارد زیر evidence کافی نیستند:

- «انجام شد»
- «چک شد»
- «اوکیه»
- screenshot بدون توضیح
- build بدون branch name
- تست روی سرور به جای local test
- PR بدون توضیح مسیرهای تغییرکرده
- PR بدون migration impact
- PR بدون secret impact
- PR بدون توضیح ریسک

---

## 13. Stop-The-Line مرتبط با Evidence

در این موارد باید Stop-The-Line شود:

1. PR هیچ evidence ندارد.
2. PR می‌گوید تست شده ولی نمی‌گوید چطور.
3. PR migration دارد ولی rollback ندارد.
4. PR UI دارد ولی screenshot یا دلیل نبودن screenshot ندارد.
5. PR contract تغییر داده ولی نمونه input/output ندارد.
6. PR مسیر حساس تغییر داده ولی review لازم را مشخص نکرده.
7. PR به Handoff نیاز دارد ولی Handoff ندارد.
8. PR secret impact را مشخص نکرده.
9. PR production risk را مشخص نکرده.
10. evidence با فایل‌های تغییرکرده نمی‌خواند.

---

## 14. ارتباط با اسناد دیگر

این سند باید با این فایل‌ها هماهنگ باشد:

- `docs/process/boundary-inventory-report.md`
- `docs/process/path-ownership-matrix.md`
- `docs/process/lovable-cursor-boundary.md`
- `docs/process/branch-policy.md`
- `docs/process/two-pr-policy.md`
- `docs/process/handoff-policy.md`
- `docs/handoffs/_template.md`

اگر یکی از این سندها تغییر کند، باید بررسی شود که Evidence Policy هم نیاز به update دارد یا نه.

---

## 15. خروجی مورد انتظار برای علی

علی باید بعداً بتواند از این سند این موارد را enforce کند:

1. PR Template از کاربر evidence بخواهد.
2. PR Template migration impact را اجباری کند.
3. PR Template RLS/RBAC impact را اجباری کند.
4. PR Template secret impact را اجباری کند.
5. PR Template test plan را اجباری کند.
6. GitHub Action یا checklist، نبود evidence را هشدار دهد.
7. مسیرهای sensitive بدون evidence مناسب merge نشوند.

---

## 16. معیار پذیرش این سند

این سند وقتی قبول است که:

1. بگوید evidence چیست.
2. بگوید evidence برای PR سندی چیست.
3. بگوید evidence برای UI چیست.
4. بگوید evidence برای Cursor/Core چیست.
5. بگوید evidence برای Server چیست.
6. بگوید evidence برای migration چیست.
7. PR body requirements را مشخص کند.
8. Stop-The-Line مرتبط با evidence داشته باشد.
9. قابل تبدیل به PR Template و GitHub Actions باشد.

---

## 17. وضعیت فعلی

Status: Ready for review.
