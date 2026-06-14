# Ali Implementation Handoff

Version: 3.9
Phase: 3.9.12
Deliverable: 15
Owner: Mehdi Heydari
Implementation Owner: Ali
Final Approver: Afra
Status: Draft
Scope: Enforcement handoff only. No technical enforcement is implemented in this document.

---

## 1. هدف این سند

هدف این سند این است که علی بعداً مجبور نشود حدس بزند خروجی‌های governance مهدی باید به چه enforcement فنی تبدیل شوند.

این سند، خروجی‌های فاز 3.9 را به کارهای قابل اجرای علی وصل می‌کند.

این سند خودش کد، workflow، CODEOWNERS، branch protection یا PR Template را تغییر نمی‌دهد.

این سند فقط Handoff رسمی برای اجرای فنی بعدی است.

---

## 2. قانون طلایی

علی نباید policyها را از نو تفسیر کند.

علی باید از روی این سند بداند:

- کدام خروجی مهدی باید enforce شود.
- enforcement احتمالی در کدام فایل یا ابزار انجام می‌شود.
- کدام مسیرها حساس هستند.
- کدام guardها اولویت بالاتری دارند.
- کدام کارها نیاز به approval افرا دارند.
- چه evidence برای اجرای enforcement لازم است.

---

## 3. محدوده این Handoff

این Handoff شامل این موارد است:

- تبدیل Path Ownership Matrix به CODEOWNERS و Boundary Guard
- تبدیل Branch Policy به Branch Protection یا branch naming check
- تبدیل Two PR Policy به PR Template و mixed-path warning
- تبدیل Evidence Policy به PR Template و evidence checklist
- تبدیل Stop-The-Line Policy به label و workflow warning
- تبدیل Local Test Checklist به CI اولیه یا staging check
- تبدیل مسیرهای ممنوع Lovable به Boundary Guard
- ثبت وابستگی‌های later enforcement

این Handoff شامل این موارد نیست:

- اجرای واقعی GitHub Actions
- تغییر واقعی CODEOWNERS
- تغییر واقعی PR Template
- فعال‌سازی واقعی Branch Protection
- ساخت labelها در GitHub
- اجرای bot واقعی
- تغییر production
- تغییر Supabase یا migration
- تغییر UI یا backend

---

## 4. خروجی‌های مهدی و کارهای علی

| خروجی مهدی | کاری که علی باید انجام دهد | فایل یا ابزار فنی احتمالی | اولویت |
|---|---|---|---|
| `docs/process/path-ownership-matrix.md` | تبدیل مالکیت مسیرها به قوانین review | `.github/CODEOWNERS` و Boundary Guard | خیلی بالا |
| `docs/process/lovable-cursor-boundary.md` | جلوگیری از ورود Lovable به مسیرهای ممنوع | `.github/workflows/boundary-guard.yml` | خیلی بالا |
| `docs/process/branch-policy.md` | کنترل branchها و مسیر درست کار | GitHub Branch Protection و branch naming check | بالا |
| `docs/process/two-pr-policy.md` | جلوگیری از قاطی شدن UI و Core در یک PR | `.github/pull_request_template.md` و workflow warning | بالا |
| `docs/process/handoff-policy.md` | الزام Handoff برای کارهای مشترک | PR Template و checklist | متوسط |
| `docs/handoffs/_template.md` | قالب ثابت برای Handoffها | docs/handoffs و PR Template reference | متوسط |
| `docs/process/evidence-policy.md` | اجبار evidence در PR | PR Template و Action warning | خیلی بالا |
| `docs/evidence/_template.md` | قالب evidence برای PRها | docs/evidence و PR Template reference | متوسط |
| `docs/process/definition-of-ready.md` | جلوگیری از شروع taskهای مبهم | Task Template یا PR Template | متوسط |
| `docs/process/definition-of-done.md` | جلوگیری از merge task ناقص | PR Template و required checklist | بالا |
| `docs/process/stop-the-line.md` | ساخت stop process و label | GitHub labels و workflow warning | خیلی بالا |
| `docs/process/local-test-checklist.md` | اضافه کردن تست اولیه برای PRها | `.github/workflows/staging-check.yml` | بالا |
| `docs/process/server-deployment-checklist.md` | جلوگیری از تست روی سرور | runbook، release checklist، server evidence | بالا |

---

## 5. مسیرهای خیلی حساس برای enforcement

علی باید این مسیرها را در enforcement فنی حساس بداند:

| مسیر | دلیل حساسیت | پیشنهاد enforcement |
|---|---|---|
| `supabase/**` | database/source of truth | CODEOWNERS و approval افرا/علی |
| `supabase/migrations/**` | schema/RLS/RBAC | CODEOWNERS، migration checklist، rollback required |
| `openapi/**` | API contract | CODEOWNERS و contract check |
| `automation/**` | worker/runtime/future bots | CODEOWNERS و no-real-bot guard در Phase 3.9 |
| `.github/**` | enforcement/CI/permissions | CODEOWNERS و approval علی/افرا |
| `deploy/**` | server/deployment | CODEOWNERS و deployment checklist |
| `server/**` | backend/runtime | technical review |
| `src/lib/**` | core logic | technical review |
| `src/integrations/**` | Supabase/Auth/integration | technical review |
| `src/server/**` | server-side app logic | technical review |
| `.env*` | secrets | block یا warning فوری |
| `docs/adr/**` | architecture decisions | Afra approval |
| `docs/security/**` | security policy | Afra/Ali approval |

---

## 6. مسیرهای مجاز Lovable برای enforcement

Lovable فقط باید در محدوده UI کار کند.

مسیرهای مجاز Lovable:

- `src/routes/**`
- `src/components/**`
- `src/components/ui/**`
- `src/shared/**` فقط برای UI/forms و بدون logic حساس
- `src/assets/**`
- `public/**`
- `.lovable/**`
- `docs/lovable-change-reports/**`
- `docs/evidence/**` فقط برای evidence UI

اگر branch با `lovable/` شروع شد و مسیرهای زیر را تغییر داد، باید Boundary Guard هشدار یا fail بدهد:

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
- `package.json`
- `package-lock.json`
- `bun.lock`
- `Dockerfile`

---

## 7. branchهای مورد انتظار

علی باید Branch Policy را به enforcement قابل فهم تبدیل کند.

| نوع branch | الگو | کنترل پیشنهادی |
|---|---|---|
| Docs | `docs/WPC-3.9-xxx-short-title` | فقط docs را تغییر دهد |
| Lovable/UI | `lovable/ui-xxx` | مسیرهای ممنوع را تغییر ندهد |
| Cursor/API | `cursor/api-xxx` | contract paths و review |
| Cursor/Worker | `cursor/worker-xxx` | automation paths و review |
| Cursor/DB | `cursor/db-xxx` | supabase paths و approval |
| Cursor/Governance | `cursor/governance-xxx` | `.github/**` و docs/process |
| Hotfix | `hotfix/xxx` | کوچک، محدود، rollback required |

---

## 8. PR Template باید چه چیزهایی بخواهد؟

علی باید PR Template را طوری تنظیم کند که حداقل این موارد پرسیده شود:

| بخش | لازم است؟ |
|---|---|
| Summary | بله |
| Task ID / Phase | بله |
| Branch type | بله |
| Change type | بله |
| Files intentionally changed | بله |
| Forbidden paths check | بله |
| Migration impact | بله |
| RLS/RBAC impact | بله |
| Secret impact | بله |
| Handoff required? | بله |
| Handoff location | اگر لازم است |
| Evidence location | بله |
| Local test result | بله |
| Server deploy impact | بله |
| Remaining risks | بله |
| Stop-The-Line reviewed? | بله |

---

## 9. Boundary Guardهای پیشنهادی

علی می‌تواند این guardها را به ترتیب اولویت بسازد:

| Guard | هدف | اولویت |
|---|---|---|
| Lovable forbidden path guard | اگر `lovable/*` به مسیر حساس دست زد، fail/warn | خیلی بالا |
| Docs branch guard | اگر `docs/*` کد feature را تغییر داد، warn/fail | بالا |
| Mixed UI/Core PR warning | اگر `supabase/**` و `src/routes/**` در یک PR تغییر کردند، warn | بالا |
| Evidence required warning | اگر PR evidence ندارد، warn | بالا |
| Secret path guard | اگر `.env*` وارد PR شد، fail | خیلی بالا |
| OpenAPI coordination warning | اگر `openapi/**` تغییر کرد، contract/evidence لازم شود | متوسط |
| Migration rollback warning | اگر `supabase/migrations/**` تغییر کرد، rollback note لازم شود | بالا |

---

## 10. Labelهای پیشنهادی

علی باید این labelها را برای workflow انسانی یا automation در نظر بگیرد:

| Label | کاربرد |
|---|---|
| `lovable-ui` | PR مربوط به UI/Lovable |
| `cursor-core` | PR مربوط به Core/Cursor |
| `contract` | PR مربوط به OpenAPI/schema |
| `migration` | PR دارای migration |
| `evidence-required` | PR نیازمند evidence |
| `stop-the-line` | PR مسدود شده تا اصلاح |
| `needs-afra-approval` | مسیر حساس یا تصمیم حساس |
| `needs-ali-review` | مسیر فنی حساس |
| `server-impact` | PR روی deploy/server اثر دارد |
| `docs-governance` | PR سندی governance |

---

## 11. اولویت اجرای فنی توسط علی

در این مرحله فقط اولویت کلی ثبت می‌شود. ترتیب اجرایی دقیق در مرحله 3.9.13 کامل‌تر می‌شود.

اولویت پیشنهادی:

1. PR Template
2. CODEOWNERS
3. labels
4. Boundary Guard
5. Staging Check
6. Branch Protection برای `main`
7. Branch Protection برای `staging`
8. PR آزمایشی
9. Evidence اجرای enforcement
10. بستن فاز 3.9

---

## 12. خروجی‌های قابل قبول از علی

وقتی علی enforcement را اجرا می‌کند، باید evidence ارائه کند.

حداقل evidence برای اجرای علی:

| خروجی علی | Evidence لازم |
|---|---|
| PR Template | screenshot یا diff فایل `.github/pull_request_template.md` |
| CODEOWNERS | diff فایل `.github/CODEOWNERS` |
| Boundary Guard | workflow file و result یک PR تستی |
| Staging Check | workflow file و result یک PR تستی |
| Labels | لیست labelها یا screenshot |
| Branch Protection | screenshot یا توضیح تنظیمات |
| Test PR | لینک PR آزمایشی |
| Final evidence | `docs/evidence/WPC-3.9-xxx-enforcement.md` |

---

## 13. موارد Stop-The-Line برای اجرای علی

در اجرای enforcement هم Stop-The-Line لازم است اگر:

1. `.github/**` بدون review تغییر کند.
2. CODEOWNERS مسیرهای حساس را پوشش ندهد.
3. PR Template evidence نخواهد.
4. Boundary Guard مسیرهای ممنوع Lovable را نبیند.
5. Branch Protection روی `main` یا `staging` اشتباه تنظیم شود.
6. Guard باعث block شدن مسیرهای مجاز شود.
7. secret یا token وارد workflow شود.
8. workflow بدون test PR merge شود.

---

## 14. مسئولیت‌ها

| نقش | مسئولیت |
|---|---|
| Mehdi | تعریف policy، handoff، review governance |
| Ali | اجرای enforcement فنی |
| Afra | approval مسیرهای حساس و production-impact |
| Lovable | رعایت UI boundary |
| Cursor | رعایت Core/Contract/Worker/Governance boundary |

---

## 15. معیار پذیرش این Handoff

این Handoff وقتی قبول است که:

1. خروجی‌های مهدی را به کارهای فنی علی وصل کند.
2. فایل‌ها یا ابزارهای احتمالی اجرای فنی را مشخص کند.
3. مسیرهای حساس را مشخص کند.
4. مسیرهای ممنوع Lovable را مشخص کند.
5. خروجی مورد انتظار از علی را مشخص کند.
6. labelها و guardهای پیشنهادی را مشخص کند.
7. evidence لازم برای اجرای علی را مشخص کند.
8. برای مرحله 3.9.13 قابل توسعه باشد.
9. بدون جلسه طولانی، قابل فهم و قابل اجرا باشد.

---

## 16. ترتیب اجرای Enforcement توسط علی

این بخش ترتیب اجرای فنی علی را دقیق و بدون ابهام مشخص می‌کند.

هدف این مرحله این است که علی بداند enforcement را از کجا شروع کند، چه چیزی را بعد از چه چیزی اجرا کند، و برای هر قدم چه evidence لازم است.

---

### 16.1 اصل اجرای مرحله‌ای

علی نباید همه guardها را یک‌باره و بدون تست فعال کند.

اجرای درست باید مرحله‌ای باشد:

1. اول کنترل‌های سبک و انسانی.
2. بعد کنترل‌های review.
3. بعد guardهای warning.
4. بعد guardهای fail/block.
5. بعد branch protection.
6. بعد PR آزمایشی.
7. بعد evidence.
8. بعد بستن فاز.

---

### 16.2 ترتیب قطعی اجرا

ترتیب اجرای علی باید این باشد:

| ترتیب | کار علی | خروجی مورد انتظار | فایل یا ابزار احتمالی |
|---|---|---|---|
| 1 | اصلاح یا ساخت PR Template | PRها اطلاعات لازم را بخواهند | `.github/pull_request_template.md` |
| 2 | اصلاح یا ساخت CODEOWNERS | مسیرهای حساس reviewer داشته باشند | `.github/CODEOWNERS` |
| 3 | ساخت labelهای لازم | PRها قابل دسته‌بندی شوند | GitHub Labels |
| 4 | ساخت Boundary Guard | مسیرهای ممنوع Lovable کنترل شوند | `.github/workflows/boundary-guard.yml` |
| 5 | ساخت Staging Check | تست‌های اولیه و scope check اجرا شود | `.github/workflows/staging-check.yml` |
| 6 | فعال‌سازی Branch Protection برای `main` | کار مستقیم روی main محدود شود | GitHub Branch Protection |
| 7 | فعال‌سازی Branch Protection برای `staging` | merge به staging کنترل شود | GitHub Branch Protection |
| 8 | تست یک PR آزمایشی | guardها واقعاً تست شوند | Test PR |
| 9 | ثبت evidence برای PR آزمایشی | اجرای enforcement قابل اثبات شود | `docs/evidence/WPC-3.9-xxx-enforcement.md` |
| 10 | بستن فاز 3.9 | تکمیل فاز با حداقل یک guard واقعی | Final phase evidence |

---

### 16.3 قدم اول: PR Template

اولین کار علی باید PR Template باشد.

PR Template باید حداقل این موارد را بخواهد:

- Task ID / Phase
- Branch type
- Change type
- Files intentionally changed
- Forbidden paths check
- Migration impact
- RLS/RBAC impact
- Secret impact
- Handoff required?
- Handoff location
- Evidence location
- Local test result
- Server deploy impact
- Remaining risks
- Stop-The-Line reviewed?

دلیل اولویت:

PR Template سریع‌ترین guard انسانی است و قبل از workflowهای پیچیده، رفتار تیم را اصلاح می‌کند.

---

### 16.4 قدم دوم: CODEOWNERS

بعد از PR Template، علی باید CODEOWNERS را تنظیم کند.

CODEOWNERS باید حداقل این مسیرها را پوشش دهد:

- `supabase/**`
- `supabase/migrations/**`
- `openapi/**`
- `automation/**`
- `.github/**`
- `deploy/**`
- `server/**`
- `src/lib/**`
- `src/integrations/**`
- `src/server/**`
- `docs/adr/**`
- `docs/security/**`

دلیل اولویت:

مسیرهای حساس نباید بدون review مناسب merge شوند.

---

### 16.5 قدم سوم: labelها

علی باید این labelها را بسازد:

- `lovable-ui`
- `cursor-core`
- `contract`
- `migration`
- `evidence-required`
- `stop-the-line`
- `needs-afra-approval`
- `needs-ali-review`
- `server-impact`
- `docs-governance`

دلیل اولویت:

labelها هم برای انسان‌ها مفیدند هم بعداً برای workflowها و گزارش‌گیری.

---

### 16.6 قدم چهارم: Boundary Guard

بعد از PR Template، CODEOWNERS و labelها، علی باید Boundary Guard بسازد.

حداقل قانون قابل قبول:

اگر branch با `lovable/` شروع شد و یکی از مسیرهای زیر تغییر کرد، workflow باید حداقل warning بدهد و ترجیحاً fail کند:

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

دلیل اولویت:

این guard مستقیماً مرز Lovable و Cursor را enforce می‌کند.

---

### 16.7 قدم پنجم: Staging Check

علی باید `staging-check.yml` را با چک‌های سبک شروع کند.

حداقل چک‌های پیشنهادی:

- branch و base branch بررسی شود.
- فایل‌های تغییرکرده لیست شوند.
- PRهای docs فقط docs را تغییر دهند.
- PRهای Lovable مسیر ممنوع تغییر نداده باشند.
- نبودن `.env*` در diff بررسی شود.
- اگر scriptها موجود هستند، typecheck/lint/build اجرا شوند یا دلیل نبودنشان ثبت شود.

دلیل اولویت:

staging باید محل تست کنترل‌شده باشد، نه مسیر آزاد برای تغییرات مبهم.

---

### 16.8 قدم ششم: Branch Protection برای main

بعد از اینکه PR Template و حداقل یک check آماده شد، علی باید Branch Protection برای `main` را فعال کند.

حداقل انتظار:

- direct push به `main` محدود شود.
- merge فقط از PR انجام شود.
- review لازم باشد.
- status checkهای لازم مشخص شوند.
- مسیرهای حساس بدون approval merge نشوند.

---

### 16.9 قدم هفتم: Branch Protection برای staging

بعد از `main`، علی باید `staging` را هم محافظت کند.

حداقل انتظار:

- direct push به `staging` محدود شود.
- PR به `staging` لازم باشد.
- حداقل checkهای سبک اجرا شوند.
- PRهای سندی و UI/Core از مسیر درست بیایند.

---

### 16.10 قدم هشتم: PR آزمایشی

علی باید یک PR آزمایشی بسازد تا guardها واقعاً تست شوند.

سناریوهای پیشنهادی:

1. PR مجاز docs که فقط `docs/**` را تغییر می‌دهد.
2. PR غیرمجاز Lovable که فرضاً `supabase/**` را تغییر می‌دهد.
3. PR دارای `.env` تستی که باید block شود.
4. PR دارای تغییر mixed بین `supabase/**` و `src/routes/**` که باید warning بگیرد.

هدف:

ثابت شود guard فقط روی کاغذ نیست و واقعاً کار می‌کند.

---

### 16.11 قدم نهم: Evidence اجرای Enforcement

علی باید برای اجرای enforcement evidence ثبت کند.

مسیر پیشنهادی:

`docs/evidence/WPC-3.9-enforcement.md`

حداقل evidence:

- لینک PR Template یا diff آن
- diff CODEOWNERS
- لیست labelها یا screenshot
- workflow fileها
- نتیجه PR آزمایشی
- وضعیت Branch Protection
- خطاها یا محدودیت‌های باقی‌مانده

---

### 16.12 قدم دهم: بستن فاز 3.9

فاز 3.9 فقط وقتی قابل بستن است که حداقل یک guard واقعی فعال شده باشد.

حداقل guard قابل قبول:

- PR Template فعال شده باشد و اطلاعات لازم را بخواهد.

بهتر:

- CODEOWNERS مسیرهای حساس را پوشش دهد.

بهترتر:

- Boundary Guard ساده فعال باشد و مسیرهای ممنوع Lovable را تشخیص دهد.

بدون حداقل یک guard واقعی، فاز 3.9 نباید بسته شود.

---

### 16.13 مواردی که علی نباید در این مرحله انجام دهد

در اجرای enforcement، علی نباید این کارها را همزمان با این فاز انجام دهد:

- ساخت ربات واقعی
- اتصال واقعی به دیوار، واتساپ، روبیکا، اینستاگرام یا ترب
- تغییر production
- تغییر Supabase بدون approval
- تغییر UI
- تغییر backend feature
- اضافه‌کردن secret در workflow
- اجرای workflow بدون تست PR آزمایشی

---

### 16.14 معیار پذیرش مرحله 3.9.13

مرحله 3.9.13 وقتی قبول است که:

1. ترتیب اجرای علی روشن باشد.
2. PR Template اولین قدم باشد.
3. CODEOWNERS بعد از PR Template آمده باشد.
4. labelها مشخص باشند.
5. Boundary Guard و Staging Check مشخص باشند.
6. Branch Protection برای `main` و `staging` در ترتیب آمده باشد.
7. PR آزمایشی و evidence اجباری شده باشد.
8. شرط حداقل یک guard واقعی برای بستن فاز ذکر شده باشد.
9. علی بدون جلسه طولانی بتواند ترتیب اجرا را دنبال کند.

---

## 17. معیار موفقیت نهایی فاز 3.9

فاز 3.9 فقط وقتی قابل بستن است که حداقل یک Guard واقعی در GitHub فعال شده باشد.

این شرط فقط یک توصیه نیست؛ شرط خروج فاز است.

بدون حداقل یک Guard واقعی، فاز 3.9 کامل محسوب نمی‌شود، حتی اگر همه سندهای governance نوشته شده باشند.

---

### 17.1 حداقل Guard قابل قبول

حداقل حالت قابل قبول برای بستن فاز:

- PR Template فعال شده باشد.
- PR Template از کاربر نوع تغییر، مسیرهای تغییرکرده، evidence، test plan، migration impact، RLS/RBAC impact و secret impact را بخواهد.
- PR Template در یک PR واقعی استفاده شده باشد.
- evidence اجرای آن ثبت شده باشد.

---

### 17.2 حالت بهتر

حالت بهتر برای بستن فاز:

- CODEOWNERS فعال باشد.
- مسیرهای حساس مثل `supabase/**`, `openapi/**`, `automation/**`, `.github/**`, `deploy/**`, `server/**`, `src/lib/**`, `src/integrations/**` و `src/server/**` reviewer مناسب داشته باشند.
- حداقل یک PR آزمایشی نشان دهد review مسیر حساس فعال است.

---

### 17.3 حالت بهترتر

حالت بهترتر برای بستن فاز:

- Boundary Guard ساده فعال باشد.
- اگر branch با `lovable/` شروع شد و مسیرهای ممنوع مثل `supabase/**`, `openapi/**`, `automation/**`, `.github/**`, `server/**`, `src/lib/**` یا `src/integrations/**` را تغییر داد، workflow هشدار یا fail بدهد.
- نتیجه یک PR آزمایشی در evidence ثبت شده باشد.

---

### 17.4 Evidence لازم برای بستن فاز

برای بستن فاز 3.9 باید حداقل یکی از این evidenceها وجود داشته باشد:

| Guard فعال | Evidence لازم |
|---|---|
| PR Template | diff فایل `.github/pull_request_template.md` و لینک PR استفاده‌کننده |
| CODEOWNERS | diff فایل `.github/CODEOWNERS` و نمونه PR با reviewer |
| Boundary Guard | workflow file و نتیجه PR آزمایشی |
| Staging Check | workflow file و نتیجه PR آزمایشی |

---

### 17.5 تصمیم نهایی

تا وقتی حداقل یک Guard واقعی فعال نشده، وضعیت فاز باید این باشد:

Status: Not complete

وقتی حداقل یک Guard واقعی فعال شد و evidence آن ثبت شد، وضعیت فاز می‌تواند این باشد:

Status: Complete with minimum enforcement

اگر PR Template، CODEOWNERS و Boundary Guard هر سه فعال شدند، وضعیت بهتر این است:

Status: Complete with strong enforcement

---

## 18. وضعیت فعلی

Status: Ready for review.
