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

## 16. وضعیت فعلی

Status: Ready for review.
