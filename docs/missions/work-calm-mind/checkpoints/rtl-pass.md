# RTL pass — Calm Mind / دستیار کار

**Agent:** dev-rtl-specialist  
**Branch:** `feature/work-calm-mind`  
**HEAD قبل:** `b539fccfcf59d5f11fa3a46da0fd24eb748661db`  
**Scope:** `src/components/work/**`, routes `*_app.operations.work*`, messenger touchpoints فقط برای `CreateWorkFromMessageButton`  
**شاهد رندرشدهٔ زنده:** بدون — اپ در این نشست برای اسکرین‌شات بالا نرفت. اصلاحات با نقل‌قول قبل/بعد کد (E2) و typecheck (E3) ثبت شده‌اند. تأیید بصری مرورگر = تأییدنشده.

## Typecheck (E3)

| | errors (`error TS`) | exit |
|---|---|---|
| baseline `_orch-typecheck-fe-baseline.txt` | **70** | (سابقه) |
| after RTL `_rtl-typecheck.out.txt` | **70** | `EXIT=2` (همان سطح خطا؛ بدتر نشد) |

دستور: `npm run typecheck` → خروجی به `_rtl-typecheck.out.txt` (untracked محلی).

---

## عناصر بررسی‌شده

| عنصر | مسیر |
|---|---|
| تابلو کار | `WorkBoardPage.tsx` |
| خلاصه صبح | `MorningSummary.tsx` |
| صف تصمیم | `DecisionQueue.tsx` |
| پیشنهاد ادغام | `MergePanel.tsx` |
| دیالوگ کار جدید | `CreateWorkDialog.tsx` |
| جزئیات کار + آرامش ذهن | `WorkItemDetailPage.tsx`, `CalmMindPanel.tsx` |
| موضوع‌ها / جزئیات موضوع | `WorkTopicsPage.tsx`, `WorkTopicDetailPage.tsx` |
| ثبت کار از پیام | `CreateWorkFromMessageButton.tsx` (+ MessageList / Composer / AiAssistantDrawer فقط مصرف) |
| routes | `_app.operations.work*.tsx` (فقط re-export؛ بدون markup RTL) |

---

## جدول بررسی ده‌گانه (خلاصه)

| عنصر | dir/lang | چیدمان | اعداد | تاریخ | ترکیب FA/EN | آیکون | فرم | سرریز | فونت |
|---|---|---|---|---|---|---|---|---|---|
| WorkBoardPage | `dir=rtl` ✓ | فیلترها منطقی ✓ | برچسب فارسی ✓ | — | کد وضعیت در labels فارسی ✓ | gap دکمه ✓ (پس از رفع) | Select ✓ | **truncate اضافه شد** | — |
| MorningSummary | `dir=rtl` ✓ | ✓ | `toFaDigits` ✓ | `toFaDigits(as_of_date)` ✓ | — | ✓ | — | truncate عناوین ✓ | ✓ |
| DecisionQueue | `dir=rtl` ✓ | ✓ | — | — | labels فارسی ✓ | — | — | truncate ✓ | ✓ |
| MergePanel | `dir=rtl` ✓ | ✓ | `toFaDigits(score)` ✓ | — | **UUID → LTR island** | gap ✓ | select `dir=rtl` | — | mono برای id |
| CalmMindPanel | `dir=rtl` ✓ | grid ✓ | — | **datetime-local `dir=ltr`** | — | — | Label+Select ✓ | — | ✓ |
| Create* dialogs | `dir=rtl` ✓ | **Header راست‌چین** | — | — | — | gap ✓ | Label ✓ | preview text-right | ✓ |
| Topics / Detail | `dir=rtl` ✓ | ArrowRight = برگشت RTL ✓ | — | — | — | gap ✓ | ✓ | truncate عنوان موضوع | ✓ |
| CreateWorkFromMessage | dialog `dir=rtl` | menu در drawer فارسی ✓ | — | — | — | gap ✓ | ✓ | line-clamp | ✓ |
| MessageList time | `dir=ltr` روی ساعت ✓ (دست نخورده) | — | — | LTR عمدی | — | icon-only دکمه | — | — | — |

---

## مشکلات و اصلاحات (E2 قبل → بعد)

### 1) `datetime-local` داخل RTL — جهت کنترل بومی

**قبل** (`CalmMindPanel.tsx`):
```tsx
<Input
  id="claimed_due_at"
  type="datetime-local"
  value={draft.claimed_due_at}
  ...
/>
```

**بعد** (`CalmMindPanel.tsx:158-165`):
```tsx
<Input
  id="claimed_due_at"
  type="datetime-local"
  dir="ltr"
  className="text-start"
  value={draft.claimed_due_at}
  ...
/>
```

**چرا:** الگوی موجود پروژه (`_app.bot-api-keys.usage.tsx`) — کنترل تاریخ/ساعت مرورگر LTR می‌ماند تا ارقام و جداکننده‌ها برعکس نشوند.

### 2) شناسهٔ UUID به‌عنوان fallback عنوان — جزیره LTR

**قبل** (`MergePanel.tsx`):
```tsx
{s.sourceTitle ?? s.source_item_id.slice(0, 8)}
```

**بعد** (`MergePanel.tsx:78-81`, مشابه مقصد):
```tsx
{s.sourceTitle ?? (
  <span dir="ltr" className="font-mono text-xs">
    {s.source_item_id.slice(0, 8)}
  </span>
)}
```

**چرا:** توکن انگلیسی/hex داخل جملهٔ فارسی نباید bidi را به‌هم بزند.

### 3) سرریز عنوان در لیست تابلو / موضوع‌ها

**قبل** (`WorkBoardPage.tsx`):
```tsx
className="font-medium text-slate-800 hover:text-teal-800"
```

**بعد** (`WorkBoardPage.tsx:384`):
```tsx
className="block truncate font-medium text-slate-800 hover:text-teal-800"
```

مشابه: `WorkTopicsPage.tsx` عنوان موضوع → `block truncate`.

**چرا:** صف تصمیم و خلاصه صبح از قبل truncate داشتند؛ لیست تابلو/موضوع هم‌تراز شد.

### 4) `DialogHeader` پیش‌فرض `sm:text-left` فیزیکی در دیالوگ RTL

**قبل:**
```tsx
<DialogHeader>
  <DialogTitle>…</DialogTitle>
</DialogHeader>
```

**بعد** (`CreateWorkDialog`, `CreateWorkFromMessageButton`, `WorkTopicsPage`):
```tsx
<DialogHeader className="text-right sm:text-right">
```

و `DialogFooter` با `sm:space-x-0` تا `space-x` فیزیکی با `gap` تداخل نکند.

### 5) فاصلهٔ آیکون+متن — `ml-*` فیزیکی روی SVG داخل `Button` با `gap-2`

**قبل:** مثلاً `<Plus className="ml-1.5 h-4 w-4" />`  
**بعد:** `<Plus className="h-4 w-4" />` در دکمه‌های work (Board, Topics, Detail, Merge, Create*).

**چرا:** `buttonVariants` از قبل `gap-2` دارد؛ `ml-*` فاصله را دو برابر و وابسته به جهت فیزیکی می‌کرد.

### 6) select بومی ادغام

**بعد:** `dir="rtl"` + `min-w-0 flex-1` روی `<select>` در `MergePanel` برای برچسب فارسی و جلوگیری از فشردن در ردیف flex.

---

## عناصری که سالم بودند و دست نزدم

- `MorningSummary` — `toFaDigits` برای شمارنده‌ها و تاریخ؛ truncate عناوین اثر
- `DecisionQueue` — `dir=rtl` + truncate عناوین
- `labels.ts` — همهٔ کدهای وضعیت/نوع به برچسب فارسی
- Routes work — فقط wrapper، بدون UI
- MessageList: `dir=ltr` فقط روی timestamp (عمدی)؛ دکمهٔ icon-only CreateWork بدون متن
- MessageComposer / AiAssistantDrawer — فقط مصرف دکمه؛ بدون redesign چت
- `ArrowRight` برای «بازگشت» در RTL (جهت درست برگشت)

## مواردی که LTR نگه داشتم و چرا

- `datetime-local` — کنترل بومی مرورگر
- UUID کوتاه در MergePanel — شناسهٔ لاتین
- زمان پیام در MessageList — از قبل LTR؛ خارج از redesign چت

## توصیه‌های خارج از دامنه

- `SelectItem` در `components/ui/select.tsx` هنوز `pl-2 pr-8` و چک‌مارک `absolute right-2` دارد — باگ RTL سراسری shadcn؛ خارج از scope work.
- دکمهٔ بستن Dialog روی `absolute right-4` فیزیکی — در RTL ممکن است با عنوان راست‌چین نزدیک شود؛ نیاز به اصلاح مشترک `dialog.tsx`.

## حکم

**PARTIAL** — اصلاحات کد با E2/E3 انجام شد؛ شاهد رندرشدهٔ مرورگر (E4 بصری) در این نشست گرفته نشد. Typecheck بدتر نشد (۷۰→۷۰).
