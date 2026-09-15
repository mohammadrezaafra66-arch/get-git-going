# HANDOFF

## چه چیزی تغییر کرد

شاخهٔ `feature/work-calm-mind` در بازهٔ `6c717ecc..HEAD` (HEAD این worktree هنگام نوشتن: `98e6f9b53a7ac307e405d1a3e6993a428dbdc6ba`؛ `git rev-parse HEAD` / `git log --oneline 6c717ecc..HEAD`) فازهای **B–F** دستیار کار را روی پایهٔ قبلی Calm Mind تکمیل کرد.

**فاز B — classify + intake + CreateWorkWizard:** طبقه‌بندی قاعده‌محور و پرسش‌نامهٔ ثبت کار با APIهای `POST /api/work/classify` و `POST /api/work/intake-summary` در commit `75b63962` (`checkpoints/phase-b-be.md:8-30`; فایل‌ها `src/lib/work/classify.ts`, `intake.ts`, `intake.server.ts`, `src/routes/api/work/classify.ts`, `intake-summary.ts`) اضافه شد؛ ویزارد سه‌مرحله‌ای ثبت کار در commit `368b7e33` (`checkpoints/phase-b-fe.md:8-31`; `src/components/work/CreateWorkWizard.tsx`) تابلو را از دیالوگ قبلی به ویزارد وصل کرد.

**فاز C — TestReportPanel + RPC ۵۵۰:** مهاجرت `supabase/migrations/20260916140000_550_work_test_reports.sql` جدول `public.work_test_reports` و RPC `work_submit_test_report` را تعریف می‌کند (`…550….sql:18`, `:119`; `checkpoints/phase-c-data.md:9-25`; commit `c698d2cd`)؛ پنل UI و کلاینت در commit `def9eb39` (`checkpoints/phase-c-fe.md:8-33`; `TestReportPanel.tsx`, `testReports.ts`, wiring در `WorkItemDetailPage.tsx`) وقتی وضعیت `testing` است نمایش داده می‌شود.

**فاز D — taxonomies ۵۵۱ + settings:** مهاجرت `supabase/migrations/20260916150000_551_work_taxonomies.sql` جدول `public.work_taxonomies` را می‌سازد (`…551….sql:18`; `checkpoints/phase-d-data.md:11-27`; commit `b701fd09`)؛ صفحهٔ تنظیمات در مسیر `/operations/work/settings` با گارد admin|manager در commit `a48b88a5` (`checkpoints/phase-d-fe.md:8-38`; `src/routes/_app.operations.work_.settings.tsx:8-14`; `WorkTaxonomiesSettingsPage.tsx`, `TaxonomySelect.tsx`) اضافه و به ویزارد وصل شد.

**فاز E — board UX + RTL:** بهبود UX تابلو (فیلتر صبح، merge جمع‌شده، chips، empty CTA، FAB) در commit `efa9c841` (`checkpoints/phase-e-fe.md:8-20`; `WorkBoardPage.tsx`, `MorningSummary.tsx`, `MergePanel.tsx`)؛ گذر RTL عنصر‌به‌عنصر در commit `1029d23e` (`checkpoints/phase-e-rtl.md:1-40`; حکم RTL در همان فایل: PARTIAL بدون شاهد رندرشدهٔ مرورگر).

**فاز F — e2e + build:** گسترش suite به ۱۲ تست و اجرای سبز روی Vite محلی + LAN Supabase در commit `8021bfb5` (`checkpoints/phase-f-e2e.md:30-58`, `:87-88`; `_e2e-phase-f.exit.txt` = `0`; `_e2e-phase-f-build.exit.txt` = `0`; `registry/e2e/run.json:13-17`); دستور اجرا و URL پایه `http://127.0.0.1:5199` با LAN Supabase در `checkpoints/e2e.md:12-24` و `phase-f-e2e.md:11-27` ثبت شده است.

**Critic:** حکم مستقل **APPROVE** برای معیارهای B–F در `checkpoints/phase-critic.md:113-116` (HEAD بازبینی‌شدهٔ critic: `8021bfb5`؛ پایه `6c717ecc..HEAD` — `:5-7`) ثبت شد و در commit docs `98e6f9b5` به شاخه اضافه گردید (`git log -1 --oneline 98e6f9b5`).

پایهٔ قبلی (مهاجرت‌های ۵۴۳/۵۴۴ و UI فاز ۱–۳) همچنان در تاریخچهٔ شاخه قبل از `6c717ecc` است و موضوع این HANDOFF نیست مگر به‌عنوان زمینه (`git log --oneline 6c717ecc..HEAD` فقط B–F را فهرست می‌کند).

## چرا

محصول «دستیار کار / Calm Mind» باید روی جداول/مسیرهای work_* گسترش یابد بدون `ALTER` روی `public.tasks` (`…543_work_calm_mind.sql:6-7`; `phase-c-data.md:20`; `phase-d-data.md:22`; `phase-critic.md:18`, `:41`). فازهای B–F همان محدودیت را نگه داشتند و مسیرهای classify، intake/wizard، تحویل تست، taxonomy قابل‌مدیریت، UX تابلو، RTL، و e2e را طبق معیارهای critic تکمیل کردند (`phase-critic.md:12-18`, `:22-31`).

## فایل‌ها و خطوط تغییریافته

| Area | Paths | Evidence |
| --- | --- | --- |
| Phase B BE | `src/lib/work/classify.ts`, `intake.ts`, `intake.server.ts`, `src/routes/api/work/classify.ts`, `intake-summary.ts` | commit `75b63962`; `phase-b-be.md:20-30` |
| Phase B FE | `src/components/work/CreateWorkWizard.tsx`, `CreateWorkDialog.tsx`, `WorkBoardPage.tsx` | commit `368b7e33`; `phase-b-fe.md:26-31` |
| Migration 550 | `supabase/migrations/20260916140000_550_work_test_reports.sql`, `docs/verification/550-down.sql` | commit `c698d2cd`; `phase-c-data.md:22-25` |
| Phase C FE | `TestReportPanel.tsx`, `testReports.ts`, `WorkItemDetailPage.tsx` | commit `def9eb39`; `phase-c-fe.md:27-33` |
| Migration 551 | `supabase/migrations/20260916150000_551_work_taxonomies.sql`, `docs/verification/551-down.sql` | commit `b701fd09`; `phase-d-data.md:24-27` |
| Phase D FE | `WorkTaxonomiesSettingsPage.tsx`, `TaxonomySelect.tsx`, `taxonomies.ts`, `_app.operations.work_.settings.tsx` | commit `a48b88a5`; `phase-d-fe.md:30-38` |
| Phase E UX | `WorkBoardPage.tsx`, `MorningSummary.tsx`, `MergePanel.tsx` | commit `efa9c841`; `phase-e-fe.md:16-20` |
| Phase E RTL | work components + `ui/dialog.tsx`, `ui/select.tsx` | commit `1029d23e`; `phase-e-rtl.md:14-26` |
| Phase F e2e | `e2e/business-flows/calm-mind-work.spec.ts`, `phase-f-e2e.md`, `registry/e2e/run.json` | commit `8021bfb5`; `phase-f-e2e.md:6-7` |
| Critic | `checkpoints/phase-critic.md` | commit `98e6f9b5`; `phase-critic.md:113` |

## شواهد در دست با سطحشان   (هر مورد: ادعا | سطح E | دستور یا مسیر:خط)

| ادعا | سطح E | دستور یا مسیر:خط |
| --- | --- | --- |
| بازهٔ commitهای B–F روی `feature/work-calm-mind` از `6c717ecc` تا HEAD شامل ۱۸ commit است | E3 | `git log --oneline 6c717ecc..HEAD` (خروجی: `75b63962`…`98e6f9b5`); `git branch --show-current` → `feature/work-calm-mind`; `git rev-parse HEAD` → `98e6f9b5…` |
| classify + API POST موجود است | E1/E2 | `phase-b-be.md:22-28`; `phase-critic.md:26`; commit `75b63962` |
| CreateWorkWizard سه‌مرحله‌ای و intake | E1/E2 | `phase-b-fe.md:18-22`, `:28`; `phase-critic.md:27`; commit `368b7e33` |
| مهاجرت ۵۵۰ روی دیسک و اشیاء جدول/RPC | E1/E2 | `…550….sql:18`, `:119`; `phase-c-data.md:13-18` |
| اعمال ۵۵۰ روی کپی LAN (نه production) با apply_exit=0 | E3 (checkpoint) | `phase-c-data.md:27-29`, `:56-60` → `_550-apply.out.txt`; `phase-c-data.md:89` |
| TestReportPanel + RPC کلاینت وقتی testing | E1/E2 | `phase-c-fe.md:20-23`, `:29-33`; `phase-critic.md:28`; commit `def9eb39` |
| مهاجرت ۵۵۱ روی دیسک | E1/E2 | `…551….sql:18`; `phase-d-data.md:15-20` |
| اعمال ۵۵۱ روی کپی LAN (نه production) با apply_exit=0 | E3 (checkpoint) | `phase-d-data.md:29-31`, `:47-51` → `_551-apply.out.txt`; `phase-d-data.md:83` |
| settings در `/operations/work/settings` | E1/E2 | `phase-d-fe.md:22-25`, `:37`; `_app.operations.work_.settings.tsx:8-14`; commit `a48b88a5` |
| board UX فاز E | E1/E2 | `phase-e-fe.md:14-20`; `phase-critic.md:30`; commit `efa9c841` |
| RTL pass با حکم PARTIAL (بدون رندر مرورگر) | E1 | `phase-e-rtl.md:10`; commit `1029d23e` |
| e2e 12/12 EXIT=0 روی Vite محلی + LAN Supabase | E3 | `phase-f-e2e.md:34`, `:56-58`; `_e2e-phase-f.out.txt` (`12 passed (57.6s)`); `_e2e-phase-f.exit.txt` (`0`) |
| `npm run build` EXIT=0 در فاز F | E3 | `phase-f-e2e.md:35`; `_e2e-phase-f-build.exit.txt` (`0`); `registry/e2e/run.json:15` |
| دستور UI محلی: Vite `:5199` + LAN Supabase | E1 | `e2e.md:12-24`; `phase-f-e2e.md:11-27` |
| critic حکم APPROVE برای AC 1–6 | E1/E5 (checkpoint) | `phase-critic.md:113-116`; e2e مجدد critic: `_critic-e2e.exit.txt` (`0`), `_critic-e2e.out.txt` (`12 passed`) |
| `public.tasks` در diff مهاجرت‌های ۵۵۰/۵۵۱ ALTER نشد | E1/E2 | `phase-critic.md:41`; `phase-c-data.md:20`, `:71`; `phase-d-data.md:22`, `:63` |

### How to verify

1. `git log --oneline 6c717ecc..HEAD` روی worktree `d:\AfraKalaTest\wt-work-calm` (`git branch --show-current` = `feature/work-calm-mind`).
2. Vite محلی طبق `checkpoints/e2e.md:12-19` یا `phase-f-e2e.md:11-22` روی `http://127.0.0.1:5199/operations/work`.
3. Playwright: دستور در `phase-f-e2e.md:24-27`؛ انتظار ۱۲ پاس مطابق `_e2e-phase-f.out.txt`.

## چه چیزی تأیید نشد

- اعمال production مهاجرت‌های ۵۵۰/۵۵۱ (فقط کپی LAN ادعا شده — `phase-c-data.md:29`, `:89`; `phase-d-data.md:31`, `:83`).
- merge شاخهٔ `feature/work-calm-mind` به `main` (این docs-writer فقط docs را به‌روز می‌کند؛ `git log -1 --format="%H" main` در این worktree روی `a935be0b…` است و با HEAD فیچر یکی نیست — ادغام ادعا نمی‌شود).
- e2e سبز روی LAN web پیش‌فرض `:3100` بدون Vite محلی (تصویر stale — `e2e.md:10`, `:74-75`, `:82`).
- شاهد رندرشدهٔ مرورگر برای RTL (حکم PARTIAL — `phase-e-rtl.md:10`).
- سیم‌کشی TaxonomySelect روی صفحهٔ جزئیات (فقط ویزارد+فیلتر؛ یادداشت critic — `phase-critic.md:29`, `:90`).
- اجرای مجدد typecheck/build/e2e توسط این جلسهٔ docs-writer (به artifactهای checkpoint و critic اتکا شده؛ اینجا دوباره اجرا نشد).
- فایل `docs/missions/work-calm-mind/PROGRESS.md` در این worktree وجود ندارد (`Test-Path` → `False`)؛ بنابراین به‌روزرسانی PROGRESS انجام نشد.

## ریسک‌های باقی‌مانده

- LAN web هنوز redeploy نشده ⇒ مسیر `/operations/work` روی `:3100` ممکن است 404 بماند (`e2e.md:10`, `:74`).
- Vite cache روی Windows می‌تواند classify را 404 جعلی نشان دهد تا `.vite` پاک شود (`phase-critic.md:45-46`, `:91`).
- جزئیات کار هنوز Input آزاد برای گروه/بخش دارد نه TaxonomySelect (`phase-critic.md:90`).
- RTL بدون تأیید بصری مرورگر (`phase-e-rtl.md:10`).
- `viewer` در الگوی RLS ۵۴۴/۵۵۰ ممکن است با گیت UI فرق داشته باشد (یادداشت critic روی RLS ۵۵۰ — `phase-critic.md:28`).

## دقیقاً چه چیزی باید بازبینی شود

1. **Ops:** redeploy `afrakala-lan-web` از این شاخه و e2e با `E2E_BASE_URL=http://192.168.170.8:3100` (`e2e.md:74-75`).
2. **Product (اختیاری):** TaxonomySelect روی `WorkItemDetailPage` (`phase-critic.md:99`).
3. **RTL:** یک پاس بصری مرورگر پس از Vite محلی (`phase-e-rtl.md:10`).
4. **Production:** اعمال ۵۵۰/۵۵۱ فقط با تأیید صریح مالک DB — الان ادعا نشده (`phase-c-data.md:89`; `phase-d-data.md:83`).
5. **Merge به main:** فقط پس از تأیید انسان؛ در این HANDOFF ادعا نشده است.
6. **Critic artifact:** `checkpoints/phase-critic.md` حکم APPROVE — بازبینی مستقل بعدی می‌تواند همان ACها را تکرار کند (`phase-critic.md:113-116`).
