# Branch Policy

Version: 3.9  
Phase: 3.9.4  
Owner: Mehdi Heydari  
Status: Draft  
Scope: Branch naming and branch flow only. No feature development.

---

## 1. هدف این سند

هدف این سند این است که از روی اسم branch مشخص شود کار متعلق به کدام محدوده است:

- Lovable / UI
- Cursor / Core
- Cursor / Contract
- Cursor / Worker
- Cursor / Database
- Documentation / Governance
- Hotfix
- Release

این سند جلوی سه خطر را می‌گیرد:

1. کار مستقیم روی `main`
2. قاطی‌شدن UI و Core در یک branch
3. branchهای بی‌هدف که به Task یا Deliverable وصل نیستند

---

## 2. قانون طلایی

هیچ‌کس مستقیم روی `main` کار نمی‌کند.

هیچ ابزاری، نه Lovable و نه Cursor، حق ندارد `main` را branch کاری خودش بداند.

هر branch باید:

- هدف مشخص داشته باشد.
- به Task یا Deliverable وصل باشد.
- فقط مسیرهای مجاز همان نوع کار را تغییر دهد.
- با PR وارد `staging` شود.
- قبل از ورود به `main` روی `staging` تست شود.

---

## 3. نقش branchهای اصلی

| Branch | نقش | مالک | قانون |
|---|---|---|---|
| `main` | نسخه production-approved | Afra | فقط نسخه سالم و نهایی؛ بدون کار مستقیم |
| `staging` | نسخه تست انسانی و فنی | Afra / Ali | محل merge موقت برای تست قبل از main |
| `lovable/ui-staging` | branch امن کار Lovable | Mehdi / Lovable | فقط UI و مسیرهای مجاز Lovable |
| `cursor/api-contract` | کارهای API و Contract | Ali / Cursor | فقط contract و OpenAPI |
| `cursor/worker-runtime` | کارهای Worker Runtime | Ali / Cursor | فقط worker و automation runtime |
| `cursor/db-migrations` | کارهای database و migration | Afra / Ali / Cursor | فقط migration بعد از approval |
| `cursor/governance` | کارهای enforcement و GitHub | Ali / Cursor | فقط GitHub Actions، CODEOWNERS، PR Template |
| `docs/WPC-3.9-xxx` | سندهای فاز 3.9 | Mehdi | فقط docs/governance |
| `hotfix/xxx` | اصلاح فوری و محدود | Afra / Ali | فقط خطای فوری؛ بدون refactor یا feature |

---

## 4. Branchهای مجاز برای فاز 3.9

در فاز 3.9 این مدل مجاز است:

| نوع کار | الگوی branch | مثال |
|---|---|---|
| سندهای governance | `docs/WPC-3.9-xxx-short-title` | `docs/WPC-3.9-004-branch-policy` |
| اصلاح Lovable/UI | `lovable/ui-xxx` | `lovable/ui-staging` |
| API contract | `cursor/api-xxx` | `cursor/api-contract` |
| Worker runtime | `cursor/worker-xxx` | `cursor/worker-runtime` |
| Database migration | `cursor/db-xxx` | `cursor/db-migrations` |
| GitHub enforcement | `cursor/governance-xxx` | `cursor/governance-boundary-guard` |
| Hotfix | `hotfix/xxx` | `hotfix/login-build-fix` |

Branch بدون این الگوها باید قبل از شروع کار rename یا دوباره ساخته شود.

---

## 5. قانون branchهای سندی

برای کارهای مهدی در فاز 3.9، branch باید این شکل را داشته باشد:

`docs/WPC-3.9-xxx-short-title`

مثال‌ها:

- `docs/WPC-3.9-001-boundary-inventory`
- `docs/WPC-3.9-002-path-ownership-matrix`
- `docs/WPC-3.9-003-lovable-cursor-boundary`
- `docs/WPC-3.9-004-branch-policy`
- `docs/WPC-3.9-005-two-pr-policy`

قانون‌ها:

- این branchها باید از `staging` ساخته شوند.
- این branchها نباید feature code تغییر دهند.
- این branchها نباید migration بسازند.
- این branchها نباید worker runtime تغییر دهند.
- این branchها نباید UI implementation تغییر دهند.
- خروجی آن‌ها باید به `docs/process/**` یا مسیرهای سندی مرتبط محدود باشد.

---

## 6. قانون branchهای Lovable

Lovable فقط باید روی branch مخصوص UI کار کند.

الگوی مجاز:

- `lovable/ui-staging`
- `lovable/ui-xxx`

مسیرهای مجاز Lovable:

- `src/routes/**`
- `src/components/**`
- `src/components/ui/**`
- `src/shared/**`
- `src/assets/**`
- `public/**`
- `.lovable/**`
- `docs/lovable-change-reports/**`

Lovable حق ندارد branch خودش را برای این مسیرها استفاده کند:

- `supabase/**`
- `openapi/**`
- `automation/**`
- `server/**`
- `src/lib/**`
- `src/integrations/**`
- `src/server/**`
- `.github/**`
- `deploy/**`
- `docs/adr/**`
- `docs/security/**`
- `.env*`
- `package.json`
- `package-lock.json`
- `bun.lock`
- `Dockerfile`

اگر branch با `lovable/` شروع شد و مسیرهای ممنوع را تغییر داد، باید Stop-The-Line شود.

---

## 7. قانون branchهای Cursor

Cursor باید branch را بر اساس نوع کار انتخاب کند.

| نوع کار Cursor | Branch مناسب | مسیرهای معمول |
|---|---|---|
| API / Contract | `cursor/api-xxx` | `openapi/**`, `automation/openapi/**`, `automation/schemas/**` |
| Worker Runtime | `cursor/worker-xxx` | `automation/worker-runtime/**`, `automation/worker-dummy/**` |
| Database | `cursor/db-xxx` | `supabase/**`, `supabase/migrations/**` |
| Governance / CI | `cursor/governance-xxx` | `.github/**`, `docs/process/**` |
| Backend / Core | `cursor/core-xxx` | `server/**`, `src/lib/**`, `src/integrations/**`, `src/server/**` |

قانون‌ها:

- Cursor نباید روی `main` کار کند.
- Cursor نباید بدون Handoff وارد تغییر گسترده UI شود.
- Cursor نباید branch چندموضوعی بسازد.
- Cursor نباید API جدید بسازد مگر contract یا task مشخص داشته باشد.
- Cursor نباید migration بسازد مگر approval و rollback مشخص باشد.

---

## 8. مسیر درست ورود تغییرات

### مسیر سندهای فاز 3.9

`staging`
→ `docs/WPC-3.9-xxx`
→ PR to `staging`
→ review
→ merge to `staging`

### مسیر Lovable / UI

`staging`
→ `lovable/ui-staging` یا `lovable/ui-xxx`
→ PR to `staging`
→ human UI test
→ merge to `staging`

### مسیر Cursor / Core

`staging`
→ `cursor/core-xxx` یا `cursor/api-xxx` یا `cursor/worker-xxx`
→ PR to `staging`
→ technical review
→ test/evidence
→ merge to `staging`

### مسیر release نهایی

`staging`
→ PR to `main`
→ final review
→ production acceptance
→ merge to `main`

---

## 9. قانون PR برای هر branch

هر branch باید با PR وارد branch بعدی شود.

هیچ branchی نباید مستقیم push به `main` داشته باشد.

هر PR باید مشخص کند:

- branch از کجا ساخته شده
- base branch چیست
- task یا deliverable چیست
- نوع کار چیست
- مسیرهای تغییر کرده چیست
- آیا مسیرهای حساس تغییر کرده‌اند یا نه
- evidence کجاست
- آیا تست local انجام شده یا نه

---

## 10. قانون branchهای ترکیبی

Branch ترکیبی ممنوع است مگر دلیل روشن داشته باشد.

نمونه‌های ممنوع:

- `lovable/ui-staging` که `supabase/**` را تغییر دهد
- `cursor/api-contract` که `src/components/**` را تغییر دهد
- `docs/WPC-3.9-xxx` که `package.json` را تغییر دهد
- `cursor/worker-runtime` که `src/routes/**` را تغییر دهد

اگر یک کار هم UI دارد هم Core، باید دو branch جدا ساخته شود:

1. Branch مربوط به Core / Contract / Backend
2. Branch مربوط به UI / Lovable

اگر جداکردن ممکن نیست، باید Handoff و دلیل روشن در PR نوشته شود.

---

## 11. قانون Hotfix

Hotfix فقط برای خطای فوری است.

الگوی مجاز:

`hotfix/short-title`

Hotfix نباید شامل این کارها باشد:

- feature جدید
- refactor گسترده
- تغییر معماری
- تغییر مسیرهای زیاد
- تغییر UI غیرضروری
- migration بدون approval

Hotfix باید:

- دلیل فوری داشته باشد
- کوچک باشد
- rollback note داشته باشد
- بعد از merge مستندسازی شود

---

## 12. Stop-The-Line برای branchها

در این موارد باید کار متوقف شود:

1. کسی مستقیم روی `main` کار کند.
2. branch به Task یا Deliverable وصل نباشد.
3. branch با اسم اشتباه ساخته شده باشد.
4. branch چند موضوع جدا را قاطی کند.
5. Lovable مسیرهای ممنوع را تغییر دهد.
6. Cursor بدون Handoff تغییر گسترده UI بدهد.
7. migration بدون approval در branch غیرمجاز ساخته شود.
8. API بدون contract در branch غیرمجاز ساخته شود.
9. فایل secret یا env واقعی وارد branch شود.
10. branch از base اشتباه ساخته شود و PR قاطی ایجاد کند.

---

## 13. مثال‌های درست

| کار | Branch درست | دلیل |
|---|---|---|
| ساخت Inventory فاز 3.9 | `docs/WPC-3.9-001-boundary-inventory` | سند governance |
| ساخت Path Matrix | `docs/WPC-3.9-002-path-ownership-matrix` | سند governance |
| سخت‌کردن مرزبندی Lovable/Cursor | `docs/WPC-3.9-003-lovable-cursor-boundary` | سند governance |
| ساخت Branch Policy | `docs/WPC-3.9-004-branch-policy` | سند governance |
| تغییر UI داشبورد | `lovable/ui-dashboard-polish` | UI only |
| تغییر OpenAPI | `cursor/api-automation-contract` | contract |
| تغییر Worker Runtime | `cursor/worker-runtime-heartbeat` | worker |
| تغییر migration | `cursor/db-automation-jobs` | database |
| تغییر GitHub Action | `cursor/governance-boundary-guard` | enforcement |

---

## 14. مثال‌های غلط

| کار | Branch غلط | چرا غلط است؟ |
|---|---|---|
| تغییر Supabase با Lovable | `lovable/ui-staging` | Lovable حق تغییر database ندارد |
| تغییر UI گسترده با Cursor | `cursor/api-contract` | branch API نباید UI redesign کند |
| ساخت سند با branch main | `main` | مستقیم روی main ممنوع است |
| تغییر package و docs با هم | `docs/WPC-3.9-xxx` | branch سندی نباید dependency تغییر دهد |
| تغییر worker و UI در یک branch | `cursor/worker-runtime` | باید جدا یا Handoff داشته باشد |

---

## 15. خروجی مورد انتظار برای علی

علی باید بعداً بتواند از این سند این موارد را enforce کند:

1. branch protection برای `main`
2. branch protection برای `staging`
3. PR Template با سؤال درباره branch type
4. Boundary Guard برای branchهای `lovable/*`
5. Boundary Guard برای branchهای `docs/*`
6. کنترل اینکه PRهای docs فقط docs را تغییر دهند
7. کنترل اینکه Lovable به مسیرهای ممنوع دست نزند
8. کنترل اینکه branchهای حساس review مناسب بخواهند

---

## 16. معیار پذیرش این سند

این سند وقتی قبول است که:

1. نقش `main` و `staging` را روشن کند.
2. branchهای Lovable را مشخص کند.
3. branchهای Cursor را مشخص کند.
4. branchهای Docs را مشخص کند.
5. branchهای Hotfix را محدود کند.
6. مسیر درست ورود تغییرات را نشان دهد.
7. جلوی branchهای ترکیبی را بگیرد.
8. Stop-The-Line برای branchها داشته باشد.
9. قابل تبدیل به GitHub branch protection و GitHub Actions باشد.
10. با `path-ownership-matrix.md` و `lovable-cursor-boundary.md` هماهنگ باشد.

---

## 17. وضعیت فعلی

Status: Ready for review.
