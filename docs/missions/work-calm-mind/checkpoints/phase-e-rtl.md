# Phase E — RTL audit (Calm Mind work UI)

- **agent**: dev-rtl-specialist
- **worktree**: `d:\AfraKalaTest\wt-work-calm`
- **branch**: `feature/work-calm-mind`
- **base HEAD**: `5089d3f24255e14265d8d84599c024de0aecb086`
- **deadline_at**: 2026-09-16T07:45:00+05:00
- **budget**: 25m
- **observed_at**: 2026-09-16T04:00:00+05:00 (approx)
- **حکم**: PARTIAL — code fixes landed + static before/after (E2/E3); **بدون شاهد رندرشدهٔ مرورگر** (E4 visual نه)

## عناصر بررسی‌شده (مسیر)

| عنصر | مسیر |
|------|------|
| WorkBoardPage | `src/components/work/WorkBoardPage.tsx` |
| MorningSummary | `src/components/work/MorningSummary.tsx` |
| MergePanel | `src/components/work/MergePanel.tsx` |
| CreateWorkWizard | `src/components/work/CreateWorkWizard.tsx` |
| TestReportPanel | `src/components/work/TestReportPanel.tsx` |
| WorkTaxonomiesSettingsPage | `src/components/work/WorkTaxonomiesSettingsPage.tsx` |
| TaxonomySelect | `src/components/work/TaxonomySelect.tsx` |
| DecisionQueue | `src/components/work/DecisionQueue.tsx` |
| CalmMindPanel | `src/components/work/CalmMindPanel.tsx` |
| Select (shared, portal) | `src/components/ui/select.tsx` |
| Dialog close (shared) | `src/components/ui/dialog.tsx` |

## جدول بررسی ده‌گانه (خلاصه)

| عنصر | dir/lang | چیدمان | اعداد | تاریخ | ترکیب | آیکون | فرم | سرریز | فونت |
|------|----------|--------|-------|-------|-------|-------|-----|-------|------|
| WorkBoardPage | rtl ✓ | logical `end-5` FAB ✓ | n/a | n/a | FA labels ✓ | `me-1.5` ✓ | Select filters ✓ | truncate titles ✓ | OK |
| MorningSummary | rtl ✓ | OK | `toFaDigits` ✓ | `toFaDigits(as_of_date)` ✓ | OK | OK | n/a | truncate ✓ | OK |
| MergePanel | rtl ✓ | `ms-auto` chevron ✓ | `toFaDigits` count/score ✓ | n/a | IDs `dir=ltr` mono ✓ | `me-1.5` ✓ | native select rtl ✓ | OK | OK |
| CreateWorkWizard | rtl ✓ | DialogHeader `text-right` ✓ | **fixed** FA digits | n/a | OK | **fixed** `me-1` | Select via shared ✓ | OK | OK |
| TestReportPanel | rtl ✓ | OK | formatFaDate ✓ | **fixed** datetime LTR | UUID LTR ✓ | `me-1.5` ✓ | OK | OK | OK |
| TaxonomiesSettings | rtl ✓ | ArrowRight back ✓ | number inputs (edit) Latin OK | n/a | OK | Button gap ✓ | OK | OK | OK |
| TaxonomySelect | **fixed** rtl wrapper | OK | n/a | n/a | OK | n/a | **fixed** SelectContent rtl | OK | OK |
| DecisionQueue | rtl ✓ | OK | n/a | n/a | OK | OK | buttons OK | truncate ✓ | OK |
| CalmMindPanel | rtl ✓ | OK | n/a | datetime `dir=ltr` ✓ | OK | OK | Select OK | OK | OK |
| SelectItem shared | portal **fixed** dir=rtl | **fixed** ps/pe/end | n/a | n/a | n/a | check end ✓ | n/a | n/a | n/a |
| Dialog close | inherits content dir | **fixed** `end-4` | n/a | n/a | n/a | X | n/a | n/a | n/a |

## مشکلات (E2)

1. **اعداد لاتین در ویزارد** — `CreateWorkWizard.tsx:468` قبل:
   `{Math.round(preview.confidence * 100)}٪`
   و مراحل `{i + 1}.` بدون `toFaDigits` (الگوی موجود در Morning/Merge).
2. **فاصلهٔ اسپینر فیزیکی اشتباه** — `CreateWorkWizard.tsx:710,721`:
   `animate-spin ms-1` در کنار متن فارسی (باید `me-1` مثل WorkBoard).
3. **datetime بدون LTR** — `TestReportPanel.tsx` input `datetime-local` بدون `dir="ltr"` (CalmMindPanel دارد).
4. **Select portal روی body** — `select.tsx` بدون `dir`؛ Item با `pl-2 pr-8` + `right-2` فیزیکی → چک‌مارک در RTL روی متن می‌افتد.
5. **دکمه بستن Dialog** — `dialog.tsx:47` `absolute right-4` فیزیکی؛ با `dir=rtl` روی Content باید `end-4` باشد.

## شاهد قبل (E2/E3 — static)

فایل: `docs/missions/work-calm-mind/checkpoints/_phase-e-rtl-baseline.out.txt`

```
CreateWorkWizard.tsx:468:{Math.round(preview.confidence * 100)}٪
CreateWorkWizard.tsx:710:<Loader2 className="h-4 w-4 animate-spin ms-1" />
CreateWorkWizard.tsx:721:<Loader2 className="h-4 w-4 animate-spin ms-1" />
TestReportPanel.tsx:230:type="datetime-local"
select.tsx:114:... pl-2 pr-8 ...
select.tsx:119:<span className="absolute right-2 ...
```

## اصلاحات

| فایل | تغییر | دلیل |
|------|--------|------|
| `CreateWorkWizard.tsx` | `toFaDigits` برای گام و اطمینان؛ `ms-1`→`me-1` | اعداد FA + فاصلهٔ منطقی آیکون |
| `TestReportPanel.tsx` | `dir="ltr" className="text-start"` روی datetime | ویجت تاریخ LTR مثل CalmMind |
| `TaxonomySelect.tsx` | `dir="rtl"` روی root و SelectContent | پنل تعاملی + portal |
| `select.tsx` | default `dir="rtl"` روی Content؛ `ps/pe` + `end-2` | تراز Select در RTL |
| `dialog.tsx` | close `right-4`→`end-4` | تراز Dialog در RTL |

## شاهد بعد (E3 static / نیمه‌E4)

فایل: `docs/missions/work-calm-mind/checkpoints/_phase-e-rtl-after.out.txt`

- `toFaDigits(i + 1)` / `toFaDigits(Math.round(...))`
- `animate-spin me-1`
- `dir="ltr"` روی datetime TestReport
- `ps-2 pe-8` + `absolute end-2`
- Dialog `absolute end-4`
- TaxonomySelect `dir="rtl"`

اسکن الگوی قدیمی (`ms-1` / `pl-2 pr-8` / `right-2` / `right-4` روی این فایل‌ها): **خالی**.

`npx tsc --noEmit` → exit 2 به‌خاطر خطاهای از پیش‌موجود خارج از دامنه (`sales-reminders`, `products.index`)؛ **هیچ خطایی روی فایل‌های تغییر این مأموریت نبود** (E3 partial).

## عناصری که سالم بودند و دست نزدم

- MorningSummary، MergePanel، DecisionQueue، CalmMindPanel، WorkBoardPage (به‌جز وابستگی به Select shared)
- WorkTaxonomiesSettingsPage، ArrowRight به‌عنوان «بازگشت» در RTL
- بلوک‌های mono/UUID با `dir="ltr"` در Merge/TestReport

## مواردی که LTR نگه داشتم و چرا

- `datetime-local` inputs (CalmMind + TestReport)
- UUID / item id / `font-mono` شناسه‌ها
- فیلد `type="number"` ترتیب در Taxonomies (ورودی ویرایشی، نه نمایش)

## توصیه‌های خارج از دامنه

- `DialogHeader` پیش‌فرض هنوز `sm:text-left` در `dialog.tsx` — ویزارد override دارد؛ اصلاح سراسری خارج از Phase E.
- شاهد رندر مرورگر برای E4 کامل نیاز به session لاگین روی `/operations/work` دارد.

## Blockers

- بدون رندر مرورگر authenticated → E4 بصری کامل نیست.
- typecheck repo سبز نیست (پیش‌موجود، خارج از work RTL).
