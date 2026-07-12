# Boundary Inventory Report

Version: 3.9  
Phase: 3.9.1  
Owner: Mehdi Heydari  
Status: Draft  
Scope: Repository inventory only. No feature development.

---

## 1. هدف این گزارش

هدف این گزارش این است که وضعیت واقعی ریپو بررسی شود تا بفهمیم کدام مسیرها موجود هستند، کدام مسیرها قانون دارند، کدام مسیرها بی‌صاحب هستند، و کدام مسیرها بعداً باید توسط علی طالبی‌زاده با CODEOWNERS، GitHub Actions، PR Template یا Branch Protection قفل شوند.

این گزارش فقط برای بررسی وضعیت فعلی است و نباید شامل ساخت feature، تغییر backend، تغییر UI، migration، worker یا bot واقعی باشد.

---

## 2. خلاصه وضعیت فعلی

ریپو از قبل کاملاً خام نیست. چند گارد مهم از قبل وجود دارد:

- `.github/CODEOWNERS`
- `.github/pull_request_template.md`
- `.github/workflows/boundary-guard.yml`
- `.github/workflows/staging-check.yml`
- `docs/process/BRANCH_STRATEGY.md`
- `docs/process/GITHUB_GUARDRAILS.md`
- `docs/process/DOR.md`
- `docs/process/DOD.md`
- `docs/process/lovable-cursor-boundary.md`
- `docs/adr/*`
- `openapi/automation-v1.yaml`
- `automation/worker-runtime/*`

بنابراین وضعیت فعلی این است:

گاردهای اولیه وجود دارند، اما برای نسخه 3.9 باید دقیق‌تر شوند تا مرز Lovable و Cursor کاملاً enforceable شود.

---

## 3. تصمیم‌های قفل‌شده پروژه

1. get-git-going هسته اصلی / Control Plane پروژه است.
2. Supabase/PostgreSQL منبع حقیقت است.
3. Lovable فقط برای UI و پنل اپراتوری است.
4. Cursor برای Core، Backend، Contracts، Worker Runtime، Tests، CI/CD و Governance است.
5. هیچ Core موازی ساخته نمی‌شود.
6. هیچ Database موازی ساخته نمی‌شود.
7. هیچ API موازی ساخته نمی‌شود.
8. در این فاز هیچ ربات واقعی ساخته نمی‌شود.
9. در این فاز هیچ تغییر production انجام نمی‌شود.
10. این مرحله فقط Inventory و گزارش وضعیت است.

---

## 4. جدول بررسی مسیرها

| مسیر | وضعیت فعلی | آیا قانون دارد؟ | ایراد فعلی | اقدام لازم |
|---|---|---|---|---|
| README.md | موجود | نیمه‌کامل | راهنمای عمومی دارد، اما باید مطمئن شویم مرزبندی 3.9 در آن قابل اشاره است | در مراحل بعد لینک به اسناد 3.9 اضافه شود |
| AGENTS.md | موجود | نیمه‌کامل | قوانین توسعه خوبی دارد، اما مرزبندی دقیق Lovable/Cursor و branchهای 3.9 را کامل enforce نمی‌کند | در مرحله‌های بعد با قوانین 3.9 هماهنگ شود |
| .lovable/ | موجود | ناقص | فقط `plan.md` وجود دارد و بیشتر شبیه برنامه یک تغییر UI است، نه قانون دائمی Lovable | باید Lovable Prompt Rules و محدودیت مسیرها جداگانه تعریف شود |
| .github/ | موجود | نیمه‌کامل | CODEOWNERS، PR Template و Workflowها وجود دارند، اما باید با قوانین 3.9 دقیق‌تر شوند | تحویل به علی برای enforcement دقیق‌تر |
| docs/ | موجود | نیمه‌کامل | اسناد زیاد وجود دارد، اما پراکندگی بالاست و باید 3.9 به‌عنوان ریل جدید مشخص شود | اسناد 3.9 باید مسیر رسمی داشته باشند |
| docs/adr/ | موجود | خوب | ADRهای اصلی وجود دارند و تصمیم‌های کلیدی ثبت شده‌اند | حفظ شود؛ تغییرات معماری جدید باید ADR بخواهد |
| docs/process/ | موجود | نیمه‌کامل | Branch، DOR، DOD و Guardrails وجود دارد، اما نسخه 3.9 باید یکپارچه‌سازی شود | تکمیل اسناد 3.9 در همین مسیر |
| docs/security/ | موجود | حداقلی | فقط Security Baseline دیده شد؛ برای 3.9 کافی است ولی مسیر حساس است | در CODEOWNERS و Review حساس باقی بماند |
| openapi/ | موجود | نیمه‌کامل | `openapi/automation-v1.yaml` وجود دارد، ولی همزمان `automation/openapi/automation-v1.yaml` هم وجود دارد؛ احتمال ابهام canonical وجود دارد | در مراحل بعد canonical OpenAPI مشخص شود |
| supabase/ | موجود | حساس | migrations بسیار زیاد و حساس وجود دارد؛ مالکیت در CODEOWNERS هست ولی Lovable باید کاملاً از آن منع شود | در Path Matrix و Boundary Guard به‌عنوان خیلی حساس ثبت شود |
| automation/ | موجود | حساس | Worker Dummy و Worker Runtime و Torob limited readonly وجود دارد؛ مسیر از حالت اسکلت ساده جلوتر رفته | Lovable نباید هیچ تغییری در این مسیر بدهد؛ نیازمند review علی/افرا |
| server/ | موجود | حساس | مسیر server وجود دارد و بخشی از اجرای backend/server است | باید Cursor/Core-owned تعریف شود |
| src/pages/ | موجود نیست | ندارد | پروژه از `src/pages` استفاده نمی‌کند | در اسناد بعدی به جای آن `src/routes/**` استفاده شود |
| src/routes/ | موجود | ناقص | مسیر واقعی page/route در این پروژه است، اما در لیست اولیه نبود | باید در Path Ownership Matrix اضافه شود |
| src/components/ | موجود | ناقص | مسیر اصلی UI و کامپوننت‌هاست | Lovable-owned با محدودیت تعریف شود |
| src/lib/ | موجود | حساس | شامل core logic، automation enqueue، pricing، auth، security و integration logic است | Cursor/Core-owned تعریف شود؛ Lovable نباید بی‌دلیل تغییر دهد |
| src/services/ | موجود نیست | ندارد | مسیر services در ساختار فعلی وجود ندارد | در Matrix فعلاً به‌عنوان missing ثبت شود؛ جایگزین عملی: `src/lib/**` و `src/integrations/**` |
| src/integrations/ | موجود | حساس | Supabase client و auth middleware داخل این مسیر دیده شد | باید Cursor/Core-owned تعریف شود |

---

## 5. مسیرهای حساس شناسایی‌شده

| مسیر | دلیل حساسیت | وضعیت حفاظت فعلی | اقدام پیشنهادی |
|---|---|---|---|
| supabase/** | دیتابیس و منبع حقیقت | در CODEOWNERS پوشش دارد | در Boundary Guard هم Lovable از آن منع شود |
| openapi/** | قرارداد API بین UI و Core | در CODEOWNERS پوشش دارد | canonical بودن OpenAPI مشخص شود |
| automation/** | Worker Runtime و آینده ربات‌ها | در CODEOWNERS پوشش دارد | Lovable باید کامل از این مسیر منع شود |
| .github/** | قوانین GitHub و CI | در CODEOWNERS پوشش دارد | تغییر فقط با review افرا/علی |
| docs/adr/** | تصمیم‌های معماری | در CODEOWNERS پوشش دارد | تغییر فقط با ADR/Approval |
| src/lib/** | منطق core، auth، pricing، automation enqueue | در CODEOWNERS کلی `src/` پوشش دارد | تفکیک دقیق Lovable UI و Cursor Core لازم است |
| src/integrations/** | Supabase و اتصال‌های حساس | در CODEOWNERS کلی `src/` پوشش دارد | باید در Matrix به‌عنوان حساس بیاید |
| .env* | Secrets و تنظیمات حساس | `.env.example` وجود دارد | فایل واقعی env نباید وارد Git شود |
| package.json / lockfiles | وابستگی‌های پروژه | قانون عمومی دارد | تغییر باید review فنی بخواهد |

---

## 6. مسیرهای UI / Lovable

| مسیر | وضعیت | اقدام لازم |
|---|---|---|
| src/routes/** | موجود | مسیر واقعی page/route است؛ باید در Matrix اضافه شود |
| src/components/** | موجود | Lovable-owned با review مهدی تعریف شود |
| src/components/ui/** | موجود | Lovable-owned ولی تغییرات پایه UI باید با احتیاط باشد |
| public/** | موجود | Lovable می‌تواند برای assetهای UI استفاده کند، ولی نباید secret یا فایل سنگین بی‌دلیل اضافه شود |
| .lovable/** | موجود | Lovable config است، ولی باید محدود و قابل review باشد |

---

## 7. مسیرهای Core / Cursor

| مسیر | وضعیت | اقدام لازم |
|---|---|---|
| src/lib/** | موجود | Cursor/Core-owned تعریف شود |
| src/integrations/** | موجود | Cursor/Core-owned و حساس تعریف شود |
| server/** | موجود | Cursor/Backend-owned تعریف شود |
| openapi/** | موجود | Cursor/Contract-owned تعریف شود |
| supabase/** | موجود | Cursor/Data-owned با تأیید افرا تعریف شود |
| automation/** | موجود | Cursor/Worker-owned با review علی/افرا تعریف شود |
| .github/** | موجود | Cursor/Governance-owned با review علی/افرا تعریف شود |
| deploy/** | موجود | Cursor/Ops-owned با review افرا/علی تعریف شود |

---

## 8. Gapهای فعلی

| شماره | Gap | شدت | توضیح | مالک اصلاح در مرحله‌های بعد |
|---|---|---|---|---|
| G-001 | استفاده اولیه از `src/pages/**` در رودمپ با ساختار واقعی پروژه نمی‌خواند | متوسط | پروژه از `src/routes/**` استفاده می‌کند، نه `src/pages/**` | مهدی در Path Matrix |
| G-002 | OpenAPI در دو مسیر دیده می‌شود | بالا | `openapi/automation-v1.yaml` و `automation/openapi/automation-v1.yaml` ممکن است ابهام canonical ایجاد کنند | مهدی برای ثبت، علی/افرا برای تصمیم |
| G-003 | `.lovable/plan.md` قانون دائمی Lovable نیست | متوسط | فایل موجود برنامه یک تغییر خاص UI است، نه policy دائمی | مهدی در Lovable Boundary |
| G-004 | PR Template هنوز Evidence directory را صریحاً اجباری نکرده | بالا | PR Template قوی است، ولی برای 3.9 باید evidence path را صریح بخواهد | علی بعد از Handoff |
| G-005 | Boundary Guard وجود دارد ولی باید با قوانین 3.9 تست و تطبیق شود | بالا | فایل workflow موجود است، اما باید بررسی شود آیا Lovable ممنوعیت‌های جدید را می‌گیرد یا نه | علی |
| G-006 | Automation مسیر حساس و فعال است | خیلی بالا | worker runtime و torob limited readonly داخل main وجود دارد؛ Lovable نباید به آن دست بزند | مهدی در Matrix، علی در Guard |
| G-007 | `src/lib/**` و `src/components/**` هر دو زیر `src/` هستند ولی حساسیت متفاوت دارند | بالا | CODEOWNERS فعلی کل `src/` را یک‌جا گرفته؛ برای Lovable/Cursor باید تفکیک منطقی شود | مهدی در Matrix، علی در CODEOWNERS/Guard |
| G-008 | `src/services/**` وجود ندارد | پایین | این مسیر در رودمپ بود اما در ریپو نیست | در اسناد بعدی حذف یا به `src/lib/**` تبدیل شود |

---

## 9. جمع‌بندی مرحله 3.9.1

نتیجه بررسی واقعی ریپو:

1. ریپو ساختار governance اولیه دارد.
2. CODEOWNERS و PR Template و GitHub Actions از قبل وجود دارند.
3. مسیرهای حساس اصلی وجود دارند: `supabase`, `openapi`, `automation`, `.github`, `server`, `src/lib`, `src/integrations`.
4. مسیر UI واقعی در این پروژه `src/routes/**` و `src/components/**` است، نه `src/pages/**`.
5. مسیر `automation/**` از حالت اسکلت ساده جلوتر رفته و شامل Worker Runtime و Torob limited readonly است؛ بنابراین باید بسیار حساس تلقی شود.
6. برای مرحله بعد باید Path Ownership Matrix بر اساس واقعیت همین ریپو ساخته شود.
7. اجرای فنی enforcement بعداً باید به علی طالبی‌زاده تحویل شود.

---

## 10. معیار خروج این مرحله

این مرحله زمانی کامل است که این گزارش بتواند به ما بگوید:

- کدام مسیرها امن هستند.
- کدام مسیرها بی‌صاحب هستند.
- کدام مسیرها حساس هستند.
- کدام مسیرها باید بعداً توسط علی با CODEOWNERS، PR Template، GitHub Actions یا Branch Protection قفل شوند.

وضعیت فعلی: آماده برای Review.
