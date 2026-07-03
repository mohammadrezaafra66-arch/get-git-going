## وضعیت فعلی

- `DynamicScoringSection` برای همه پارامترها یک `Slider` ۰ تا ۱ نمایش می‌دهد و فقط `raw_score` را ذخیره می‌کند.
- `dynamic_scoring_parameters` این ستون‌ها را دارد: `input_type` (`boolean`|`score_100`|`toman`|`months`)، `min_value`، `max_value`، `unit_label`، `input_hint`.
- `dynamic_entity_scores` علاوه بر `raw_score` ستون‌های `actual_value` (numeric) و `is_clipped` (boolean) را دارد.
- اما در `useScoringParameters` فقط 7 فیلد پایه select می‌شود و در `useEntityScores` با `select("*")` همه فیلدها می‌آیند ولی type‌ها این‌ها را شامل نمی‌شوند. `UpsertEntityScoreInput` نیز `actual_value`/`is_clipped` ندارد.

بنابراین تغییرات فقط frontend است — نیاز به migration نیست.

## دامنه تغییر

فقط دو فایل:
- `src/hooks/credit/useDynamicScoring.ts` — گسترش type‌ها و query/mutation
- `src/components/credit/DynamicScoringSection.tsx` — رندر input بر اساس `input_type`

بقیه کامپوننت (Summary، آخرین تخصیص، realtime، دکمه ذخیره per-parameter، breakdown) دست‌نخورده می‌ماند.

## طراحی input بر اساس `input_type`

| نوع | کنترل | نمایش |
|---|---|---|
| `boolean` | `Switch` (بله/خیر) | مقدار ۰ یا ۱ → normalized = مقدار |
| `score_100` | `Slider` با `min=0 max=100 step=1` + عدد کنار آن | normalized = value/100 |
| `toman` | `Input` عددی با جداکننده هزار (formatter موجود در `@/lib/i18n/formatters`) + پسوند «تومان» | راهنما: «حداقل … — حداکثر …» |
| `months` | `Input` عددی + پسوند «ماه» | راهنما: «`min_value` تا `max_value` ماه» |

### قواعد مشترک برای همه انواع

- کاربر `actual_value` وارد می‌کند.
- محاسبه سمت client:
  ```
  normalized = clamp01((actual - min) / (max - min))    // برای toman/months/score_100
  normalized = actual === 1 ? 1 : 0                     // برای boolean
  isClipped = actual > max
  ```
- زیر input یک خط ریز: «امتیاز نرمال‌شده: X.XX» با اعداد فارسی.
- اگر `isClipped` → Badge/alert زرد «⚠️ از سقف تعریف‌شده بیشتر است — مقدار در ۱ محدود می‌شود».
- دکمه ذخیره جداگانه per-parameter، `disabled` اگر dirty نباشد یا مقدار نامعتبر (خالی/منفی برای عددی) باشد.
- `dirty` بر اساس مقایسه `actual_value` draft با مقدار ذخیره‌شده تعیین می‌شود (نه raw_score).

## تغییرات کد

### `useDynamicScoring.ts`

- `ScoringParameter`: افزودن `input_type: 'boolean'|'score_100'|'toman'|'months'`, `min_value: number`, `max_value: number`, `unit_label: string | null`, `input_hint: string | null`.
- `useScoringParameters`: افزودن این ستون‌ها به select.
- `EntityScore`: افزودن `actual_value: number | null`, `is_clipped: boolean`.
- `UpsertEntityScoreInput`: افزودن `actual_value: number` و `is_clipped?: boolean`. `raw_score` را همچنان می‌فرستیم (محاسبه‌شده client-side) تا سازگاری با `calculate_dynamic_score` حفظ شود.
- `useUpsertEntityScore`: نوشتن `actual_value` و `is_clipped` در upsert.

### `DynamicScoringSection.tsx`

- state جدید:
  ```ts
  const [draftActual, setDraftActual] = useState<Record<string, number>>({});
  ```
  به جای/در کنار `draft` فعلی، بر اساس `actual_value` هر رکورد ذخیره‌شده initialize می‌شود (fallback: اگر `actual_value` نبود ولی `raw_score` بود، معکوس محاسبه شود: `raw*(max-min)+min`).
- helper محلی:
  ```ts
  function computeNormalized(param, actual): number
  function isClipped(param, actual): boolean
  ```
- در map پارامترها، بر اساس `p.input_type` یکی از چهار کنترل رندر می‌شود. لایه بیرونی (label، `code`، breakdown badge، دکمه Save، وضعیت «ثبت نشده») ثابت می‌ماند.
- Save: `upsert.mutate({ ..., actual_value, raw_score: normalized, is_clipped })`.

## ریسک‌ها

- رکوردهای قدیمی که `actual_value` ندارند: با fallback معکوس از `raw_score` نمایش می‌دهیم؛ اگر `min=max` باشد fallback = min. تا زمانی که کاربر ذخیره نکند، rewrite نمی‌شود.
- `calculate_dynamic_score` هنوز از `raw_score` استفاده می‌کند — تغییری در آن نمی‌دهیم؛ چون normalized را خودمان درست ذخیره می‌کنیم، breakdown/allocations بدون تغییر کار می‌کند.
- تغییر فقط UI است؛ بدون migration، بدون RLS/RBAC، بدون audit جدید.

## تأیید و مراحل بعد

پس از تأیید:
1. patch دو فایل بالا.
2. `tsgo --noEmit` روی این دو فایل.
3. گزارش تغییرات + مسیر تست دستی (`/customers/:id` → بخش امتیازدهی پویا: هر ۴ نوع پارامتر).

منتظر تأیید هستم — کد نمی‌نویسم تا OK بدهید.
