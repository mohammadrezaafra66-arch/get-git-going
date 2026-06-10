# سهمیه برچسب‌گذاری مالک محصول — فاز config + read-model

پیام شما در میانهٔ توضیح `fetchOwnerAssignableLabels` بریده شد و کوئری‌های ۲ و ۳ نیامد. در پایان پلن، استنتاج خودم از آن دو را آورده‌ام؛ قبل از اجرا تایید کنید یا اصلاح کنید.

## دامنه
- فقط ۳ فایل جدید زیر `src/lib/products/`.
- بدون migration، بدون RPC، بدون endpoint، بدون write.
- canonical storage = `product_labels` + `product_label_links`.
- مالک از `product_owner_assignments(product_id, user_id, assigned_by)` مشتق می‌شود (در schema موجود است).
- محصولات shared (بیش از یک owner) طبق `OWNER_LABEL_ALLOW_SHARED_PRODUCTS=false` از محاسبه کنار گذاشته می‌شوند.

## فایل ۱ — `src/lib/products/owner-label-config.ts`
خروجی‌ها دقیقاً مطابق درخواست شما:
- `OWNER_LABEL_QUOTA_RATIO = 0.3`
- `OWNER_LABEL_QUOTA_ROUNDING = "floor"` — انتخاب: `floor`. دلیل در کامنت: محافظه‌کار است؛ سهمیه را هرگز فراتر از سقف واقعی نمی‌برد و خطر «انتظار غیرواقعی» را حذف می‌کند.
- `OWNER_LABEL_MIN_QUOTA = 1` — انتخاب: `1`. دلیل در کامنت: حتی مالکی با محصول کم باید حداقل یک هدف داشته باشد تا feature برایش معنا داشته باشد؛ صفر یعنی feature خاموش.
- `OWNER_LABEL_ALLOW_SHARED_PRODUCTS = false`
- `OWNER_ASSIGNABLE_LABEL_VISIBILITY = "internal"`
- `OWNER_LABEL_PAGE_SIZE = 25`
- `OWNER_LABEL_STALE_TIME_MS = 60_000`

همگی `export const` با JSDoc فارسی کوتاه. هیچ side-effect.

## فایل ۲ — `src/lib/products/owner-label-quota.ts`
توابع pure، بدون وابستگی به Supabase:

```ts
type Rounding = "floor" | "round" | "ceil";

export function computeOwnerLabelQuota(
  eligibleCount: number,
  ratio: number,
  rounding: Rounding,
  minQuota: number,
): number
```
- ورودی منفی/NaN → `0` نهایی نمی‌شود؛ به `max(minQuota, 0)` clamp.
- `eligibleCount === 0` → `0` (min بی‌اثر، چون چیزی برای هدف‌گیری نیست).
- در غیر این صورت: `Math.max(minQuota, round(eligibleCount * ratio))` که `round` طبق `rounding` انتخاب می‌شود.

```ts
export interface OwnerLabelSummary {
  eligibleCount: number;     // distinct products منسوب به این owner و واجد شرایط
  taggedCount: number;       // distinct products این owner که حداقل یک owner-assignable label دارند
  quota: number;             // خروجی computeOwnerLabelQuota
  remaining: number;         // max(0, quota - taggedCount)
  progressPct: number;       // taggedCount / max(quota, 1) * 100، clamp [0,100]
  isMet: boolean;            // taggedCount >= quota
}

export function buildOwnerLabelSummary(input: {
  eligibleCount: number;
  taggedCount: number;
  ratio: number;
  rounding: Rounding;
  minQuota: number;
}): OwnerLabelSummary
```

```ts
export function didProductBecomeTagged(
  prevLabelIds: readonly string[],
  nextLabelIds: readonly string[],
  ownerAssignableLabelIds: ReadonlySet<string>,
): boolean
```
- `true` فقط اگر `prev ∩ owner-assignable === ∅` و `next ∩ owner-assignable !== ∅` (transition `untagged → tagged`).
- وارونه‌اش (`tagged → untagged`) خارج از scope این تابع است؛ در صورت نیاز در فاز بعد جدا اضافه می‌شود.

تست‌پذیری: همه ورودی‌ها صریح، بدون `Date.now`، بدون فراخوانی شبکه.

## فایل ۳ — `src/lib/products/owner-label-queries.ts`
فقط readها با `supabase` client موجود. هیچ write. هیچ helper جدید با اسم تکراری.

1) `fetchOwnerAssignableLabels()` — دقیقاً همان pseudo شما:
   ```ts
   from("product_labels")
     .select("id, title, color, is_active, visibility, weight")
     .eq("is_active", true)
     .eq("visibility", OWNER_ASSIGNABLE_LABEL_VISIBILITY)
     .order("weight", { ascending: false })
     .order("title", { ascending: true })
   ```
   خروجی typed: `OwnerAssignableLabel[]`.

2) **استنتاج‌شده — لطفاً تایید کنید**: `fetchOwnerProductCounts(ownerUserId: string)`
   - distinct product_idهای منسوب به این owner از `product_owner_assignments`.
   - اگر `OWNER_LABEL_ALLOW_SHARED_PRODUCTS=false`: شناسه‌های دارای بیش از یک ردیف در `product_owner_assignments` حذف می‌شوند (group/count کلاینت‌ساید روی همان صفحه، چون RPC ممنوع است).
   - cross-check با `products.is_active = true` و `status = 'active'` تا محصولات غیرفعال در شمارش نیایند.
   - خروجی: `{ eligibleProductIds: string[] }`.

3) **استنتاج‌شده — لطفاً تایید کنید**: `fetchOwnerTaggedProductIds(eligibleProductIds, ownerAssignableLabelIds)`
   - یک `select("product_id, label_id").from("product_label_links").in("product_id", ...).in("label_id", ...)` با chunk کردن `in(...)` به batchهای ≤۵۰۰ id برای رعایت سقف URL.
   - خروجی: `Set<string>` از product_idهایی که حداقل یک owner-assignable label دارند.

برای ترکیب نهایی، یک `getOwnerLabelOverview(ownerUserId)` نازک که سه call بالا را orchestrate و `OwnerLabelSummary` را با `buildOwnerLabelSummary` می‌سازد — بدون caching داخلی (React Query در فاز UI تصمیم می‌گیرد، با `staleTime = OWNER_LABEL_STALE_TIME_MS`).

## نکات سخت‌گیرانه که رعایت می‌شوند
- بدون فایل تحت `supabase/migrations/`.
- بدون RPC/endpoint.
- بدون write، بدون mutation.
- بدون تغییر در `ProductLabelsQuickDialog` یا `_app.products.labels.tsx` در این فاز.
- بدون duplicate برای abstractionهای موجود (`product_labels` کوئری در dialog همچنان معتبر است؛ این لایه مستقل و read-only است).
- RTL خنثی است (فقط lib، بدون UI).

## ریسک‌ها
- اگر `product_owner_assignments` در دیتای واقعی تقریباً خالی باشد، `eligibleCount=0` می‌شود و quota همیشه ۰ — رفتار درست، اما در فاز UI باید پیام «هنوز محصولی به شما منسوب نشده» نشان داده شود (خارج از این فاز).
- chunking روی `in(...)` با ≤۵۰۰ شناسه برای جلوگیری از 414؛ اگر تعداد محصولات یک owner از این فراتر رفت، در فاز UI باید pagination واقعی اضافه شود.

## تاییدیه قبل از build
1. کوئری‌های ۲ و ۳ همان‌هایی هستند که در بالا استنتاج کردم؟ یا signature/منبع داده متفاوتی مدنظر داشتید؟
2. آیا فیلتر «محصول فعال» (`products.is_active=true` و `status='active'`) را در «eligible» نگه دارم یا فقط به `product_owner_assignments` اکتفا کنم؟
