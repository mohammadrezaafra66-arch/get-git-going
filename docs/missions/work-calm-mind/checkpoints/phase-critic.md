# phase-critic — work-calm-mind features B–F

- agent: dev-code-critic (independent; did not author this code)
- worktree: `d:\AfraKalaTest\wt-work-calm`
- branch: `feature/work-calm-mind`
- HEAD at review: `8021bfb5c57e014afe5a304a9400545433e9efa9`
- base: `6c717ecc..HEAD`
- deadline_at: 2026-09-16T09:00:00+05:00
- reviewed_at: 2026-09-16T04:40:00+05:00 (approx)

## معیارهایی که از خواسته استخراج کردم (قبل از خواندن توضیح نویسنده)

1. **Classify:** طبقه‌بندی قاعده‌محور + `POST /api/work/classify`
2. **Intake/wizard:** پرسش‌نامه + fallback خلاصه؛ ویزارد ۳مرحله‌ای که `createWorkItem` را صدا می‌زند؛ UI مسئول فقط admin|manager
3. **Test delivery:** روی جزئیات وقتی `testing`؛ approve→`done`؛ reject→`in_progress` با گیت ETA؛ migration ~550 + RLS شبیه 544
4. **Taxonomies:** `work_taxonomies` ~551 + صفحه تنظیمات ادمین + select با fallback متن آزاد
5. **Board UX:** فیلتر کارت‌های صبح؛ merge جمع‌شده وقتی 0؛ chips + more filters؛ empty CTA؛ FAB موبایل؛ `ms`/`me`
6. **Constraints/e2e:** e2e گسترش‌یافته؛ بدون `ALTER public.tasks`؛ merge هرگز خودکار؛ نقش‌های Afra admin|manager|sales|accountant (+ آینه‌ی 544)

---

## بررسی هر معیار

| معیار | برآورده شد؟ | شاهد (مسیر:خط) |
|------|-------------|----------------|
| 1 Classify + POST | **بله** | `src/lib/work/classify.ts:193-224` قاعده‌محور؛ `src/routes/api/work/classify.ts:13-51` POST + auth؛ routeTree دارای `/api/work/classify` |
| 2 Intake + wizard + assignee | **بله** | `intake.ts:37-128` سؤالات؛ `intake.server.ts:62-66` fallback local؛ `CreateWorkWizard.tsx:58-74` سه‌گام؛ `:347-359` → `createWorkItem`؛ `:137-138,:651-673` assignee فقط admin/manager |
| 3 Test delivery + 550 | **بله** | `WorkItemDetailPage.tsx:397-399` پنل فقط وقتی testing؛ `550…sql:199-221` approve→done / reject→in_progress+ETA؛ RLS `:49-110` مثل 544 (admin\|manager\|sales\|accountant\|viewer) |
| 4 Taxonomies 551 + settings | **بله** (با یادداشت) | `551…sql:18-99` جدول+RLS؛ `WorkTaxonomiesSettingsPage.tsx` + route settings admin/manager؛ `TaxonomySelect.tsx:15-105` + wiring در ویزارد `:628-649`. **یادداشت:** صفحه جزئیات هنوز `Input` آزاد برای گروه/بخش دارد (`WorkItemDetailPage.tsx:335-348`) — ویزارد wired است |
| 5 Board UX | **بله** | morning click-filter `WorkBoardPage.tsx:245-261`؛ merge collapsed `MergePanel.tsx:36-41`؛ chips+more `:414-518`؛ empty CTA `:532-544`؛ FAB `:590-599`؛ `me-`/`ms-` در کامپوننت‌های work، بدون `ml-`/`mr-` |
| 6 e2e + constraints | **بله** | e2e ۱۲ تست (خودم)؛ `git diff 6c717ecc..HEAD -- '*.sql'` بدون ALTER tasks (فقط 550/551 روی جداول جدید)؛ merge فقط با `acceptMerge` از UI (`WorkBoardPage.tsx:307-310`)؛ create فقط `scanMergeSuggestions` نه accept (`items.ts:90-91`) |

---

## تلاش‌های ابطال

| تلاش | نتیجه |
|------|--------|
| (C-1) مسیر سازنده vs فراخواننده: classify فقط unit سازنده؟ | API route + e2e POST + wizard client classify هم اندازه‌گیری شد |
| Merge خودکار بعد از create؟ | فقط scan suggestion؛ accept فقط از دکمه UI — پاس |
| `ALTER public.tasks` در محدوده diff؟ | فقط migrations 550/551؛ assertion ضد trigger روی tasks در 550:269-277 — پاس |
| Assignee برای غیر admin؟ | UI با `canAssign` مخفی؛ `assignee_id: null` وقتی غیرمجاز — پاس در کد |
| Test panel خارج از testing؟ | شرط `status === "testing"` — پاس |
| Reject بدون ETA وقتی `claimed_due_at` خالی؟ | UI گیت (`TestReportPanel.tsx:118-126`) + RPC (`550…sql:207-211`)؛ e2e reject با ETA پاس |
| Vite stale cache → `Cannot POST /api/work/classify` 404 | ابتدا 404 جعلی؛ بعد از پاک کردن `node_modules/.vite` → HOME=200، classify بدون auth=401 (route mount) |
| TaxonomySelect روی detail؟ | سیم‌کشی نشده — خارج از مسیر create؛ مانع پذیرش سخت برای AC4 تلقی نشد چون «selects wired» در ویزارد+fallback برآورده است |

---

## اجرای واقعی (E3)

### Unit (خودم)
```
npx --yes tsx --test src/lib/work/classify.test.ts src/lib/work/intake.test.ts src/lib/work/taxonomies.test.ts
→ tests 8, pass 8, fail 0
UNIT_EXIT=0
```
خروجی: `docs/missions/work-calm-mind/checkpoints/_critic-unit.out.txt`

### Classify probe (خودم)
```
classifyWorkItem({text:'باگ فوری در فاکتور فروش'})
→ {"kind":"bug","priority":"high","group":"فروش","confidence":0.75,...}
PROBE_EXIT=0
```

### HTTP classify بدون auth روی Vite سالم :5202 (خودم)
```
POST /api/work/classify → HTTP 401 (نه 404) — route mount شده
HOME / → 200
```

### E2E (خودم، پس از پاک‌سازی cache Vite)
```
E2E_BASE_URL=http://127.0.0.1:5202
npx playwright test business-flows/calm-mind-work.spec.ts --reporter=list
→ 12 passed (49.1s)
EXIT=0
```
خروجی: `_critic-e2e.out.txt` / `_critic-e2e.exit.txt` (=`0`)

تست‌های کلیدی پاس‌شده: wizard create، POST classify، approve→done، reject+ETA→in_progress، merge dismiss/accept.

---

## یافته‌ها

| شدت | مسیر:خط | چرا | شکست بالقوه |
|-----|---------|-----|-------------|
| کم / سلیقه | `WorkItemDetailPage.tsx:335-348` | گروه/بخش جزئیات هنوز Input آزاد است نه TaxonomySelect | کاربر روی edit از taxonomy مدیریت‌شده جدا می‌ماند؛ create مسیر اصلی AC را دارد |
| عملیاتی (نه نقص محصول) | Vite بدون پاک‌سازی `.vite` | گاهی همه مسیرها 404/`Cannot POST` | e2e classify قرمز کاذب؛ با حذف cache رفع شد |

هیچ یافتهٔ مسدودکنندهٔ پذیرش در محدوده AC پیدا نشد.

---

## توصیه‌های سلیقه‌ای

- TaxonomySelect را روی detail هم وصل کنید برای یکدستی.
- در CI/docs: قبل از e2e روی Windows، `node_modules/.vite` را پاک کنید (یا document کنید).

---

## چه چیزی را نتوانستم بررسی کنم

- اعمال زندهٔ SQL 550/551 روی DB با session جدا (RLS proacl) — به e2e رفتاری که جداول/RPC را می‌زند اکتفا شد؛ migration فایل‌ها و assertionهای داخل SQL خوانده شد.
- Typecheck کامل repo (زمان/نویز از پیش‌موجود) — unit + e2e جایگزین رفتاری بود.

**توجه D-1:** هنگام review، `src/routeTree.gen.ts` و چند فایل docs untracked از سازنده در status دیده شد؛ critic آن‌ها را دست نزد.

---

## حکم: تأیید (APPROVE)

Acceptance criteria 1–6 با شواهد E1/E2 کد و E3 (unit EXIT=0 + e2e 12/12 EXIT=0) برآورده‌اند.
Maker reports به‌عنوان شاهد استفاده نشدند.
