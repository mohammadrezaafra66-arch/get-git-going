# Path Ownership Matrix

Version: 3.9  
Phase: 3.9.2  
Owner: Mehdi Heydari  
Status: Draft  
Scope: Repository path ownership only. No feature development.

---

## 1. هدف این سند

هدف این سند این است که برای هر مسیر مهم ریپو مشخص شود:

- مالک مفهومی مسیر کیست.
- کدام ابزار اجازه تغییر دارد.
- کدام مسیرها برای Lovable ممنوع است.
- کدام مسیرها برای Cursor مجاز است.
- کدام مسیرها حساس هستند و review سخت‌گیرانه لازم دارند.
- کدام مسیرها بعداً باید توسط علی طالبی‌زاده با CODEOWNERS، GitHub Actions، PR Template یا Branch Protection قفل شوند.

این سند بر اساس خروجی مرحله 3.9.1 یعنی `boundary-inventory-report.md` نوشته شده است.

---

## 2. قانون طلایی

Lovable فقط برای UI و پنل اپراتوری است.

Cursor برای Core، Backend، API Contract، Supabase، Worker Runtime، Tests، CI/CD، Governance و Self-host/Ops است.

هیچ ابزاری حق ندارد بدون Handoff وارد قلمرو ابزار دیگر شود.

---

## 3. وضعیت واقعی مسیرهای پروژه

در بررسی مرحله 3.9.1 مشخص شد که این پروژه از مسیر `src/pages/**` استفاده نمی‌کند.  
مسیر واقعی صفحه‌ها و routeها در این ریپو `src/routes/**` است.

بنابراین در این پروژه:

- به جای `src/pages/**` باید از `src/routes/**` استفاده شود.
- مسیر `src/services/**` فعلاً وجود ندارد.
- مسیرهای عملی core در حال حاضر بیشتر زیر `src/lib/**` و `src/integrations/**` هستند.

---

## 4. Matrix اصلی مالکیت مسیرها

| مسیر | مالک مفهومی | ابزار مجاز | Review لازم | سطح حساسیت | قانون |
|---|---|---|---|---|---|
| `README.md` | Project entry docs | Mehdi / Cursor | Mehdi | متوسط | تغییرات باید با فاز فعلی هماهنگ باشد |
| `AGENTS.md` | AI/dev rules | Cursor / Mehdi | Afra / Ali | خیلی حساس | قوانین دائمی توسعه؛ تغییر بدون دلیل ممنوع |
| `.lovable/**` | Lovable config | Lovable | Mehdi | متوسط | فقط تنظیمات و plan مربوط به UI؛ بدون تغییر backend/core |
| `.github/**` | GitHub enforcement | Cursor / Ali | Afra / Ali | خیلی حساس | فقط برای CI، PR Template، CODEOWNERS و guardrails |
| `docs/**` | Documentation | Mehdi / Cursor | Mehdi | متوسط | سندها باید phase-aware و قابل اجرا باشند |
| `docs/adr/**` | Architecture decisions | Mehdi / Cursor | Afra | خیلی حساس | هر تغییر معماری باید با ADR کنترل شود |
| `docs/process/**` | Governance process | Mehdi | Mehdi / Afra | متوسط | محل اصلی اسناد فاز 3.9 |
| `docs/security/**` | Security docs | Cursor / Ali | Afra / Ali | خیلی حساس | تغییر امنیتی باید review سخت‌گیرانه داشته باشد |
| `docs/ops/**` | Operations runbooks | Cursor / Ali | Afra / Ali | حساس | مربوط به اجرا، incident و self-host |
| `docs/lovable-change-reports/**` | Lovable change reports | Lovable / Mehdi | Mehdi | معمولی | فقط گزارش تغییرات UI؛ نه تصمیم معماری |
| `openapi/**` | API Contract | Cursor | Ali / Afra | خیلی حساس | Lovable حق ساخت یا تغییر API حدسی ندارد |
| `automation/openapi/**` | Automation contract mirror/specific | Cursor | Ali / Afra | خیلی حساس | نیازمند تصمیم canonical با `openapi/**` |
| `automation/schemas/**` | Automation JSON Schemas | Cursor | Ali / Afra | خیلی حساس | تغییر باید با contract و tests هماهنگ باشد |
| `automation/worker-dummy/**` | Dummy worker / E2E boundary | Cursor | Ali | حساس | فقط worker dummy و test boundary؛ بدون ربات واقعی |
| `automation/worker-runtime/**` | Python Worker Runtime | Cursor | Ali / Afra | خیلی حساس | Lovable کاملاً ممنوع |
| `server/**` | Backend/server runtime | Cursor | Ali / Afra | حساس | Lovable نباید تغییر دهد |
| `src/routes/**` | App routes / UI pages | Lovable / Cursor محدود | Mehdi | متوسط | Lovable مجاز است؛ Cursor فقط با Handoff برای logic/API |
| `src/components/**` | UI components | Lovable | Mehdi | معمولی | مسیر اصلی Lovable برای UI |
| `src/components/ui/**` | Base UI primitives | Lovable با احتیاط | Mehdi | متوسط | تغییر پایه UI باید کوچک و قابل review باشد |
| `src/lib/**` | Core frontend/server logic | Cursor | Ali / Afra | حساس | Lovable نباید بی‌دلیل تغییر دهد |
| `src/integrations/**` | External/internal integrations | Cursor | Ali / Afra | خیلی حساس | Supabase/Auth حساس؛ Lovable ممنوع |
| `src/hooks/**` | Shared app hooks | Lovable / Cursor محدود | Mehdi / Ali | متوسط | اگر UI hook است Lovable؛ اگر data/auth/core است Cursor |
| `src/shared/**` | Shared forms/components | Lovable / Cursor محدود | Mehdi | متوسط | تغییرات UI مجاز، logic حساس با Handoff |
| `src/server/**` | Server-side app API/helpers | Cursor | Ali / Afra | خیلی حساس | Lovable ممنوع |
| `src/assets/**` | Local assets/fonts | Lovable | Mehdi | معمولی | فقط asset محلی؛ secret یا فایل سنگین ممنوع |
| `public/**` | Public static assets | Lovable | Mehdi | معمولی | فقط asset عمومی؛ secret ممنوع |
| `supabase/**` | Database / Source of Truth | Cursor | Afra / Ali | خیلی حساس | Lovable کاملاً ممنوع |
| `supabase/migrations/**` | DB migrations / RLS / RBAC | Cursor | Afra | خیلی حساس | migration بدون دلیل، ADR یا rollback ممنوع |
| `deploy/**` | Self-host / deployment | Cursor / Ali | Afra / Ali | خیلی حساس | تغییر باید با runbook و rollback هماهنگ باشد |
| `package.json` | Dependencies/scripts | Cursor / Ali | Ali / Afra | حساس | تغییر dependency باید دلیل و تست داشته باشد |
| `package-lock.json` | Dependency lock | Cursor / Ali | Ali | حساس | فقط همراه تغییر dependency مجاز است |
| `bun.lock` | Dependency lock | Cursor / Ali | Ali | حساس | فقط همراه تغییر dependency مجاز است |
| `vite.config.ts` | Build/runtime config | Cursor / Ali | Ali | حساس | تغییر باید build/test داشته باشد |
| `Dockerfile` | Build/deploy image | Cursor / Ali | Afra / Ali | خیلی حساس | تغییر باید self-host compatible باشد |
| `.env.example` | Env documentation | Cursor / Ali | Ali / Afra | حساس | فقط example؛ secret واقعی ممنوع |
| `.env*` | Real env/secrets | هیچ‌کس در Git | Afra | خیلی حساس | فایل واقعی env نباید commit شود |
| `dist/**` | Build output | Cursor / Ali | Ali | متوسط | معمولاً نباید دستی و بی‌دلیل تغییر کند |
| `node_modules/**` | Local dependencies | هیچ‌کس | — | خیلی حساس | نباید وارد Git شود |
| `build.log` / `dev.log` / `lint-before.log` | Local logs | هیچ‌کس | — | متوسط | بهتر است وارد PR نشود مگر evidence مشخص |

---

## 5. مسیرهای مجاز برای Lovable

Lovable فقط در این مسیرها مجاز است:

| مسیر | شرط |
|---|---|
| `src/routes/**` | فقط UI، layout، اتصال به API موجود، بدون ساخت API حدسی |
| `src/components/**` | UI و کامپوننت‌های نمایشی |
| `src/components/ui/**` | با احتیاط؛ چون تغییر base component روی کل اپ اثر دارد |
| `src/shared/**` | فقط UI/forms؛ logic حساس با Handoff |
| `src/assets/**` | assetهای محلی و مجاز |
| `public/**` | assetهای عمومی و مجاز |
| `.lovable/**` | تنظیمات Lovable و planهای UI |
| `docs/lovable-change-reports/**` | گزارش تغییرات Lovable |

Lovable اگر به API جدید نیاز داشت، نباید خودش API بسازد.  
باید در Handoff بنویسد چه API یا contract لازم دارد.

---

## 6. مسیرهای ممنوع برای Lovable

Lovable حق تغییر این مسیرها را ندارد:

| مسیر ممنوع | دلیل |
|---|---|
| `supabase/**` | دیتابیس و منبع حقیقت |
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
| `package.json` | dependencies/scripts |
| lockfiles | dependency lock |
| `Dockerfile` | deploy/build image |

اگر Lovable یکی از این مسیرها را تغییر داد، باید Stop-The-Line شود.

---

## 7. مسیرهای مجاز برای Cursor

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

Cursor اگر نیاز به تغییر UI گسترده داشت، باید Handoff داشته باشد.

---

## 8. مسیرهای مشترک با Handoff

این مسیرها ممکن است هم به UI مربوط باشند هم به logic. پس بدون Handoff نباید دستکاری گسترده شوند.

| مسیر | چرا مشترک است؟ | قانون |
|---|---|---|
| `src/routes/**` | هم route/UI است هم ممکن است loader/action/API داشته باشد | UI با Lovable؛ logic با Cursor؛ تغییر ترکیبی نیازمند Handoff |
| `src/shared/**` | ممکن است form UI و business logic قاطی باشد | تغییر UI آزادتر؛ تغییر logic با Handoff |
| `src/hooks/**` | بعضی hooks UI هستند، بعضی data/core | باید قبل از تغییر طبقه‌بندی شود |
| `src/components/pricing/**` | UI دارد ولی به business logic قیمت وصل است | تغییرات مهم با Handoff |
| `src/components/products/**` | UI دارد ولی به product data وصل است | تغییرات مهم با Handoff |
| `src/components/sales/**` | UI دارد ولی به فروش و quote وصل است | تغییرات مهم با Handoff |
| `src/components/accounting/**` | UI دارد ولی مالی/حسابداری حساس است | نیازمند review دقیق |
| `src/components/rbac/**` | UI دارد ولی permission-sensitive است | تغییر با review علی/افرا |

---

## 9. مسیرهای خیلی حساس

این مسیرها باید در CODEOWNERS و Boundary Guard با سخت‌گیری بالا پوشش داده شوند.

| مسیر | دلیل |
|---|---|
| `supabase/migrations/**` | تغییر دیتابیس، RLS، RBAC |
| `src/integrations/supabase/**` | اتصال Supabase و Auth |
| `src/lib/auth/**` | login/session/security |
| `src/lib/security/**` | sanitize و امنیت |
| `src/lib/automation/**` | اتصال UI/Core به automation |
| `automation/worker-runtime/**` | worker واقعی/آینده ربات‌ها |
| `.github/workflows/**` | کنترل CI و guardrails |
| `.github/CODEOWNERS` | مالکیت review |
| `.github/pull_request_template.md` | قانون PR |
| `deploy/**` | اجرا و self-host |
| `Dockerfile` | build/deploy image |
| `.env*` | secretها |

---

## 10. قانون برخورد با مسیرهای missing

در بررسی مرحله 3.9.1 مشخص شد:

| مسیر اولیه | وضعیت واقعی | تصمیم |
|---|---|---|
| `src/pages/**` | وجود ندارد | در این پروژه استفاده نشود؛ جایگزین `src/routes/**` |
| `src/services/**` | وجود ندارد | فعلاً استفاده نشود؛ جایگزین‌های واقعی: `src/lib/**`, `src/integrations/**`, `src/server/**` |

اگر بعداً این مسیرها ایجاد شدند، باید اول وارد همین Matrix شوند و بعد استفاده شوند.

---

## 11. خروجی مورد انتظار برای علی

در مرحله‌های بعد، علی طالبی‌زاده باید از روی این Matrix بتواند این کارها را انجام دهد:

1. به‌روزرسانی `.github/CODEOWNERS`
2. سخت‌گیرانه‌تر کردن `.github/workflows/boundary-guard.yml`
3. اصلاح `.github/pull_request_template.md`
4. تعریف labelهای مرتبط با مسیرها
5. بررسی اینکه Lovable نتواند مسیرهای ممنوع را تغییر دهد
6. بررسی اینکه Cursor بدون Handoff وارد UI گسترده نشود

---

## 12. معیار پذیرش این سند

این سند وقتی قبول است که:

1. مسیرهای واقعی ریپو را پوشش دهد.
2. از `src/routes/**` به جای `src/pages/**` استفاده کند.
3. مسیرهای حساس را جدا مشخص کند.
4. مسیرهای Lovable را محدود و روشن کند.
5. مسیرهای Cursor را روشن کند.
6. مسیرهای مشترک را نیازمند Handoff کند.
7. مسیرهای missing را ثبت کند.
8. قابل تبدیل به CODEOWNERS و GitHub Actions باشد.

---

## 13. وضعیت فعلی

Status: Ready for review.

