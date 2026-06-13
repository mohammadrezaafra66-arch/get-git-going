# Lovable / Cursor Boundary Policy

Version: 3.9  
Phase: 3.9.3  
Owner: Mehdi Heydari  
Status: Draft  
Source of Truth: GitHub  
Scope: Boundary policy only. No feature development.

---

## 1. هدف این سند

هدف این سند این است که مرز کاری Lovable و Cursor را ساده، روشن و قابل اجرا مشخص کند.

این سند باید کاری کند که تیم بداند:

- Lovable دقیقاً اجازه دارد کجا کار کند.
- Cursor دقیقاً اجازه دارد کجا کار کند.
- Lovable حق ندارد به کدام مسیرها دست بزند.
- Cursor بدون Handoff حق ندارد وارد کدام محدوده‌ها شود.
- اگر یک تغییر بین UI و Core مشترک بود، چطور باید کنترل شود.
- چه اتفاقی باعث Stop-The-Line می‌شود.

این سند بر اساس دو خروجی قبلی نوشته شده است:

- `docs/process/boundary-inventory-report.md`
- `docs/process/path-ownership-matrix.md`

---

## 2. قانون طلایی

GitHub منبع حقیقت پروژه است.

Lovable منبع حقیقت نیست.  
Cursor منبع حقیقت نیست.  
Google Drive منبع حقیقت کد نیست.  
Supabase/PostgreSQL منبع حقیقت داده عملیاتی و runtime است.

Lovable فقط ابزار ساخت و اصلاح UI است.

Cursor ابزار توسعه فنی، backend، contract، worker، test، CI و governance است.

هیچ تغییری رسمی نیست مگر اینکه در GitHub، روی branch درست، با commit، PR، review و merge ثبت شود.

---

## 3. نقش Lovable

Lovable فقط برای UI و تجربه کاربری استفاده می‌شود.

Lovable مجاز است روی این نوع کارها کار کند:

- صفحه‌ها و routeهای UI
- کامپوننت‌های نمایشی
- layout
- فرم‌ها
- جدول‌ها
- داشبوردها
- RTL
- mobile responsiveness
- متن‌های نمایشی
- empty state
- loading state
- اتصال UI به APIهایی که از قبل تعریف شده‌اند
- گزارش تغییرات UI در `docs/lovable-change-reports/**`

در این پروژه مسیر واقعی صفحه‌ها `src/routes/**` است، نه `src/pages/**`.

پس هرجا در سندهای قدیمی `src/pages/**` آمده، برای این ریپو باید با `src/routes/**` جایگزین شود.

---

## 4. مسیرهای مجاز Lovable

Lovable فقط در این مسیرها مجاز است:

| مسیر | شرط |
|---|---|
| `src/routes/**` | فقط UI، layout، نمایش، و اتصال به API موجود |
| `src/components/**` | کامپوننت‌های UI و نمایشی |
| `src/components/ui/**` | کامپوننت‌های پایه UI؛ با احتیاط چون روی کل اپ اثر دارد |
| `src/shared/**` | فقط بخش‌های UI و فرم‌ها؛ منطق حساس با Handoff |
| `src/assets/**` | assetهای محلی و مجاز |
| `public/**` | assetهای عمومی و غیرحساس |
| `.lovable/**` | تنظیمات و planهای Lovable |
| `docs/lovable-change-reports/**` | گزارش تغییرات Lovable |

Lovable اگر به داده جدید، action جدید یا endpoint جدید نیاز داشت، نباید خودش API حدسی بسازد.

باید در Handoff اعلام کند چه contract یا API لازم دارد.

---

## 5. کارهای ممنوع Lovable

Lovable حق ندارد این کارها را انجام دهد:

- تغییر database schema
- ساخت یا تغییر migration
- تغییر RLS/RBAC
- تغییر worker runtime
- تغییر Python automation code
- تغییر API contract
- ساخت endpoint حدسی
- تغییر backend/server logic
- تغییر auth/session/security logic
- تغییر CI/CD و GitHub Actions
- تغییر deploy/self-host config
- اضافه‌کردن secret یا env واقعی
- تغییر package dependency بدون approval
- تغییر business-critical pricing logic
- تغییر credit decision logic
- تغییر automation driver logic

اگر Lovable به یکی از این محدوده‌ها نیاز داشت، باید کار متوقف شود و Handoff یا Task Packet جدید ساخته شود.

---

## 6. مسیرهای ممنوع Lovable

Lovable حق تغییر این مسیرها را ندارد:

| مسیر ممنوع | دلیل |
|---|---|
| `supabase/**` | دیتابیس و منبع حقیقت |
| `supabase/migrations/**` | migration، RLS، RBAC |
| `openapi/**` | قرارداد رسمی API |
| `automation/**` | Worker Runtime و آینده ربات‌ها |
| `server/**` | backend/server |
| `src/lib/**` | core logic |
| `src/integrations/**` | Supabase/Auth/integrations |
| `src/server/**` | server-side logic |
| `.github/**` | GitHub enforcement |
| `deploy/**` | self-host/deployment |
| `docs/adr/**` | تصمیم‌های معماری |
| `docs/security/**` | امنیت |
| `.env*` | secret و تنظیمات حساس |
| `package.json` | dependency/scripts |
| `package-lock.json` | dependency lock |
| `bun.lock` | dependency lock |
| `Dockerfile` | build/deploy image |

اگر Lovable یکی از این مسیرها را تغییر داد، باید Stop-The-Line شود.

---

## 7. نقش Cursor

Cursor برای کارهای فنی و مهندسی استفاده می‌شود.

Cursor مجاز است روی این نوع کارها کار کند:

- backend
- server-side logic
- OpenAPI
- JSON Schema
- Supabase migrations بعد از approval
- Worker Runtime
- automation contracts
- tests
- evidence
- CI/CD
- GitHub Actions
- CODEOWNERS
- PR Template
- self-host scripts
- deployment runbooks
- refactorهای کوچک و قابل review
- governance docs

Cursor باید فقط داخل scope کار کند.

Cursor نباید چون توانایی دارد، همه‌چیز را همزمان تغییر دهد.

---

## 8. مسیرهای مجاز Cursor

Cursor در این مسیرها مجاز است:

| مسیر | شرط |
|---|---|
| `openapi/**` | فقط با contract و evidence |
| `automation/**` | فقط Worker/contract/test؛ بدون ربات واقعی در فاز 3.9 |
| `server/**` | backend/server |
| `src/lib/**` | core logic |
| `src/integrations/**` | integrations/auth/supabase |
| `src/server/**` | server-side logic |
| `supabase/**` | فقط با review افرا/علی |
| `.github/**` | guardrails/CI/CODEOWNERS/PR template |
| `deploy/**` | self-host/runbook/deployment |
| `docs/process/**` | governance |
| `docs/adr/**` | فقط با تصمیم معماری واقعی |

Cursor اگر نیاز به تغییر گسترده UI داشت، باید Handoff داشته باشد.

---

## 9. کارهای ممنوع Cursor بدون Handoff

Cursor بدون Handoff یا task صریح حق ندارد این کارها را انجام دهد:

- بازطراحی گسترده UI
- تغییر navigation اصلی
- تغییر user-facing flow
- تغییر branding یا visual hierarchy
- تغییر متن‌های مهم مشتری‌محور
- تغییر کامپوننت‌های پایه UI بدون دلیل
- تغییر routeهای UI به‌صورت گسترده
- تغییر خروجی Lovable در مسیرهای UI بدون توضیح
- ترکیب UI و Core در یک PR بدون دلیل مکتوب

Cursor باید تغییرات را کوچک، قابل review و قابل تست نگه دارد.

---

## 10. مسیرهای مشترک با Handoff

این مسیرها ممکن است هم UI باشند هم logic. پس باید قبل از تغییر جدی، نوع تغییر مشخص شود.

| مسیر | چرا مشترک است؟ | قانون |
|---|---|---|
| `src/routes/**` | هم route/UI است هم ممکن است loader/action/API داشته باشد | UI با Lovable؛ logic با Cursor؛ تغییر ترکیبی نیازمند Handoff |
| `src/shared/**` | form UI و business logic ممکن است قاطی باشد | UI آزادتر؛ logic با Handoff |
| `src/hooks/**` | بعضی hooks UI هستند، بعضی data/core | قبل از تغییر باید طبقه‌بندی شود |
| `src/components/pricing/**` | UI دارد ولی به قیمت‌گذاری وصل است | تغییر مهم با Handoff |
| `src/components/products/**` | UI دارد ولی به product data وصل است | تغییر مهم با Handoff |
| `src/components/sales/**` | UI دارد ولی به فروش و quote وصل است | تغییر مهم با Handoff |
| `src/components/accounting/**` | UI دارد ولی مالی/حسابداری حساس است | review دقیق لازم دارد |
| `src/components/rbac/**` | UI دارد ولی permission-sensitive است | review علی/افرا لازم دارد |

اگر یک PR هم UI را تغییر داد هم Core را، باید split شود مگر اینکه Handoff و دلیل روشن داشته باشد.

---

## 11. Branch Boundary

شاخه‌های اصلی پروژه:

| Branch | نقش |
|---|---|
| `main` | نسخه production-approved |
| `staging` | نسخه تست انسانی و فنی |
| `lovable/ui-staging` | مسیر امن کار Lovable |
| `cursor/api-contract` | کارهای contract/API |
| `cursor/worker-runtime` | کارهای Worker Runtime |
| `cursor/db-migrations` | کارهای migration |
| `cursor/governance` | کارهای enforcement و governance |
| `docs/WPC-3.9-xxx` | کارهای سندی فاز 3.9 |
| `hotfix/xxx` | اصلاح فوری و محدود |

قانون:

- هیچ‌کس مستقیم روی `main` کار نمی‌کند.
- Lovable روی `main` کار نمی‌کند.
- Cursor روی `main` کار نمی‌کند.
- کارهای سندی فاز 3.9 باید روی `docs/WPC-3.9-xxx` باشند.
- هر branch باید به task یا deliverable وصل باشد.

---

## 12. PR Boundary

هر PR باید scope کوچک و مشخص داشته باشد.

PRهای مجاز:

- فقط Docs / Governance
- فقط UI
- فقط Contract
- فقط Backend/Core
- فقط Worker/Test
- فقط Migration
- فقط CI/GitHub Enforcement

اگر یک قابلیت هم UI دارد هم Core، باید دو PR جدا داشته باشد:

1. PR مربوط به Core / Contract / Backend
2. PR مربوط به UI / Lovable

PR ترکیبی فقط وقتی قابل قبول است که Handoff و دلیل روشن داشته باشد.

---

## 13. API / Contract Boundary

UI و backend باید فقط از طریق contract مشخص با هم کار کنند.

قانون‌ها:

- Lovable حق ندارد API جدید حدس بزند.
- Cursor حق ندارد endpoint جدید بسازد بدون اینکه contract مشخص باشد.
- اگر API تغییر کرد، PR باید به contract مربوط اشاره کند.
- اگر contract تغییر کرد، UI و backend باید هماهنگ شوند.
- browser/client نباید secret داشته باشد.

مسیرهای contract:

- `openapi/**`
- `automation/openapi/**`
- `automation/schemas/**`
- `docs/automation/task-packets/**`
- `docs/adr/**`

ابهام فعلی:

هم `openapi/automation-v1.yaml` وجود دارد و هم `automation/openapi/automation-v1.yaml`.

Canonical location باید در مرحله‌های بعد تصمیم‌گیری شود.

---

## 14. Environment Boundary

Production و staging باید جدا بمانند.

Production:

- branch: `main`
- محل اجرا: لپ‌تاپ سرور / production host
- دیتابیس: production database
- استفاده: کار واقعی شرکت

Staging:

- branch: `staging`
- محل اجرا: کامپیوتر شخصی / test host
- دیتابیس: staging/test database
- استفاده: تست انسانی و فنی

نسخه تستی نباید به دیتابیس production وصل شود.

سرور نباید محل آزمون و خطا باشد.

---

## 15. Evidence Boundary

هیچ PR بدون evidence نباید کامل حساب شود.

حداقل evidence برای PRهای سندی:

- فایل‌های تغییرکرده مشخص باشد.
- دلیل تغییر نوشته شود.
- migration impact مشخص باشد.
- RLS/RBAC impact مشخص باشد.
- secret impact مشخص باشد.
- test plan نوشته شود.

حداقل evidence برای PRهای فنی:

- build
- lint
- typecheck اگر script دارد
- test مرتبط
- manual test اگر UI دارد
- rollback note اگر migration/deploy دارد

---

## 16. Stop Conditions

در این موارد باید فوراً Stop-The-Line شود:

- Lovable به `supabase/**` دست زده باشد.
- Lovable به `openapi/**` دست زده باشد.
- Lovable به `automation/**` دست زده باشد.
- Lovable به `.github/**` دست زده باشد.
- Lovable به `server/**` یا `src/lib/**` یا `src/integrations/**` دست زده باشد.
- Cursor بدون Handoff تغییر UI گسترده داده باشد.
- API جدید بدون contract ساخته شده باشد.
- migration بدون review آمده باشد.
- secret یا service key وارد Git شده باشد.
- staging به production database وصل شده باشد.
- PR چند موضوع جدا را قاطی کرده باشد.
- production behavior بدون evidence تغییر کرده باشد.

---

## 17. Prompt Rules for Lovable

هر پرامپت Lovable باید این را روشن کند:

- You are working on UI only.
- GitHub is the source of truth.
- Do not change Supabase, migrations, RLS, worker runtime, backend logic, secrets, deployment files, GitHub Actions, or OpenAPI contracts.
- Do not invent API endpoints.
- Use only approved API contracts or existing UI data flow.
- Work only in Lovable-approved UI paths.
- Keep Persian RTL UX consistent.
- Return changed files and risks.

---

## 18. Prompt Rules for Cursor

هر پرامپت Cursor باید این را روشن کند:

- Read `docs/process/lovable-cursor-boundary.md` first.
- Read `docs/process/path-ownership-matrix.md` first.
- Work only inside the approved task scope.
- Do not change UI unless the task explicitly says UI.
- Do not change database/migrations unless the task explicitly says migration.
- Do not add real source integration unless the task packet allows it.
- Do not implement real bots in Phase 3.9.
- Create tests/evidence for the change.
- Use branch + PR.
- Do not push directly to `main`.

---

## 19. Acceptance Criteria

این سند وقتی قبول است که:

1. نقش Lovable و Cursor را ساده و روشن توضیح دهد.
2. مسیرهای مجاز Lovable را مشخص کند.
3. مسیرهای ممنوع Lovable را مشخص کند.
4. مسیرهای مجاز Cursor را مشخص کند.
5. کارهای ممنوع Cursor بدون Handoff را مشخص کند.
6. از `src/routes/**` به جای `src/pages/**` استفاده کند.
7. مسیرهای مشترک را نیازمند Handoff کند.
8. Stop Conditions را روشن کند.
9. با `path-ownership-matrix.md` هماهنگ باشد.
10. قابل تبدیل به PR Template، CODEOWNERS و Boundary Guard باشد.

---

## 20. وضعیت فعلی

Status: Ready for review.
