# سند اجرای P0 — پنج رفع فوری کم‌ریسک

| | |
|---|---|
| **مبنا** | `docs/research/audit-220-226.md` — بخش D9 ردیف P0 |
| **برنچ** | `feature/navigation-modernization` |
| **Commit مبنا** | `a43077b7` (درخت کاری تمیز نیست — ۲۹ فایل `M` از قبل) |
| **تاریخ نگارش** | ۲۰۲۶-۰۸-۰۳ |
| **وضعیت** | **نوشته شده، اجرا نشده.** هیچ فایل کد، مهاجرت یا کانتینری تغییر نکرده است. |
| **وابستگی به D8** | **هیچ.** هر پنج مورد مستقل از هشت تصمیم مالک‌اند. |
| **خارج از دامنه** | P1، و هر کار وابسته به D8. این سند فقط P0 است. |

**Baseline تأییدشده پیش از شروع:** `npx tsc --noEmit` ⇒ **۷۰ خطا** (مطابق `CLAUDE.md`).
هر تغییری نباید این عدد را بالا ببرد.

---

## خلاصهٔ پنج مورد

| # | مورد | فایل‌های لمس‌شده | مهاجرت؟ | ریسک |
|---|---|---|---|---|
| ۱ | برداشتن سقف ۱۵۰ واتساپ (سه لایه) | ۲ | خیر | کم |
| ۲ | عبور `search` از proxy به مبدأ | ۲ (همان‌ها) | خیر | کم |
| ۳ | رفع تناقض ویدیوی رسید تحویل | ۱ + مهاجرت ۲۶۳ | **بله** | کم-متوسط |
| ۴ | افزودن دوربین موبایل (`capture`) | ۱ جدید + ۴ | خیر | کم |
| ۵ | `purchase_specialist` در ناوبری موبایل | ۳ | خیر | کم |

---

## مورد ۱ — برداشتن سقف ۱۵۰ در پل واتساپ

### وضعیت فعلی (تأییدشده با اندازه‌گیری)

مبدأ در آزمون واقعی (`GET` فقط‌خواندنی) این را داد:

| `limit` ارسالی | ردیف بازگشتی |
|---|---|
| ۱۵۰ | ۱۵۰ |
| ۳۰۰ | ۳۰۰ |
| ۱۰۰۰ | **۱۰۰۰** |
| ۵۰۰۰ | ۱۰۰۰ (سقف خود مبدأ) |

سقف مبدأ در کد: `claudegreenapi/backend/app/services/product_reports.py:103` →
`clamp_limit(limit, hi=1000)`.

**سه سقف در سمت دستیار** — هر سه باید با هم برداشته شوند. برداشتن فقط یکی، نتیجه را
روی ۳۰۰ می‌بندد و شبیه «درست شد» به نظر می‌رسد.

### ۱-الف · `src/lib/management/whatsapp-top-products.functions.ts`

**پیش از خط ۱۷ اضافه شود:**

```ts
/**
 * Upstream clamps at 1000 (product_reports.clamp_limit(limit, hi=1000)), so that
 * is the hard ceiling here too — asking for more just wastes a round trip.
 *
 * The default is SERVER-SIDE and env-configurable on purpose: the owner must be
 * able to change how many rows the card loads without a rebuild (audit A1.5).
 */
const UPSTREAM_MAX_LIMIT = 1000;

function defaultTopProductsLimit(): number {
  const raw = Number(process.env.WHATSAPP_TOP_PRODUCTS_LIMIT);
  if (!Number.isFinite(raw) || raw <= 0) return UPSTREAM_MAX_LIMIT;
  return Math.min(Math.trunc(raw), UPSTREAM_MAX_LIMIT);
}
```

**خط ۱۳۵ — قبل:**
```ts
  const limit = input?.limit ?? 150;
```
**بعد:**
```ts
  const limit = Math.min(input?.limit ?? defaultTopProductsLimit(), UPSTREAM_MAX_LIMIT);
```

**خط ۱۹۴ — قبل:**
```ts
        limit: z.number().int().positive().max(300).optional(),
```
**بعد:**
```ts
        limit: z.number().int().positive().max(UPSTREAM_MAX_LIMIT).optional(),
```

### ۱-ب · `src/components/management/market-intelligence/WhatsappTopProductsCard.tsx`

خط ۴۲ امروز `topFn({ data: {} })` است — یعنی هیچ‌وقت `limit` نمی‌فرستد.
تغییر آن در بخش «مورد ۲» می‌آید، چون همان `useQuery` هم `search` را می‌گیرد.

### ⚠ چیزی که نباید عوض شود

`src/lib/ai-tools/purchase-advisor.functions.ts:96`:
```ts
const topProducts = await getWhatsappTopProductsSnapshot({ range: 30, limit: 150 });
```
**این عمداً روی ۱۵۰ می‌ماند.** خروجی این فراخوان وارد prompt یک مدل زبانی می‌شود؛
۱۰۰۰ محصول یعنی prompt چند برابر، هزینه و تأخیر بیشتر، و کیفیت پایین‌تر.
هر کسی که بعداً «سقف ۱۵۰» را جست‌وجو کند به این خط هم می‌رسد — همین‌جا ثبت شد که
عمدی است.

### ENV

به `deploy/lan/.env.lan` و `deploy/lan/.env.lan.example` اضافه شود (اختیاری):
```
# تعداد پیش‌فرض ردیف‌های «محصولات پرتکرار واتساپ». خالی = ۱۰۰۰ (سقف مبدأ).
WHATSAPP_TOP_PRODUCTS_LIMIT=
```
و در `deploy/lan/docker-compose.yml` زیر `web.environment`:
```yaml
      WHATSAPP_TOP_PRODUCTS_LIMIT: ${WHATSAPP_TOP_PRODUCTS_LIMIT:-}
```

---

## مورد ۲ — عبور `search` از proxy به مبدأ

### چرا این «دو خط» است، نه یک قابلیت نو

`getWhatsappTopProductsSnapshot` **از قبل** `search` را می‌پذیرد و به query string
اضافه می‌کند (`:132` و `:140`). تنها مانع، zod در `fetchWhatsappTopProducts` است که
آن را در فهرست فیلدهای مجاز ندارد، پس از کلاینت قابل ارسال نیست.

جست‌وجو در مبدأ **سمت سرور و روی کل مجموعه، قبل از اعمال `limit`** اجرا می‌شود
(`product_reports.py:185-196`) و با همان نرمال‌سازی گروه‌بندی کار می‌کند — یعنی
«ال جی» و «ال‌جی» یک نتیجه می‌دهند. هیچ منطقی کپی نمی‌شود.

### ۲-الف · `whatsapp-top-products.functions.ts` — بلوک zod (خطوط ۱۹۰–۱۹۷)

**قبل:**
```ts
  .inputValidator((input: unknown) =>
    z
      .object({
        range: z.number().int().positive().max(365).optional(),
        limit: z.number().int().positive().max(300).optional(),
      })
      .parse(input ?? {}),
  )
```
**بعد:**
```ts
  .inputValidator((input: unknown) =>
    z
      .object({
        range: z.number().int().positive().max(365).optional(),
        limit: z.number().int().positive().max(UPSTREAM_MAX_LIMIT).optional(),
        // Searched UPSTREAM over the full merged set, before the limit is applied
        // (product_reports.top_products_rows). Never filtered client-side here.
        search: z.string().trim().min(1).max(200).optional(),
      })
      .parse(input ?? {}),
  )
```

**و handler (خطوط ۱۹۸–۲۰۱) — قبل:**
```ts
  .handler(async ({ data, context }): Promise<WhatsappTopProductsResult> => {
    await assertAllowed(context.userId);
    return getWhatsappTopProductsSnapshot({ range: data.range, limit: data.limit });
  });
```
**بعد:**
```ts
  .handler(async ({ data, context }): Promise<WhatsappTopProductsResult> => {
    await assertAllowed(context.userId);
    return getWhatsappTopProductsSnapshot({
      range: data.range,
      limit: data.limit,
      search: data.search,
    });
  });
```

### ۲-ب · `WhatsappTopProductsCard.tsx`

**importها — اضافه شود:**
```ts
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
```
(`useDebounce(value, delay = 350)` — `src/hooks/use-debounce.ts`)

**بالای فایل، کنار `SCOPES` (خط ۳۲):**
```ts
/** null = let the server decide (env-configurable default). */
const LIMITS: Array<{ v: number | null; l: string }> = [
  { v: null, l: "پیش‌فرض" },
  { v: 150, l: "۱۵۰" },
  { v: 500, l: "۵۰۰" },
  { v: 1000, l: "۱۰۰۰" },
];
```

**خطوط ۳۹–۴۸ — قبل:**
```ts
  const topFn = useServerFn(fetchWhatsappTopProducts);
  const q = useQuery({
    queryKey: ["wa-top-products"],
    queryFn: () => topFn({ data: {} }),
    // Near-live mirror of the separate WhatsApp reporting page.
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const [selected, setSelected] = useState<WhatsappTopProduct | null>(null);
  const [scope, setScope] = useState<ScopeFilter>("all");
```
**بعد:**
```ts
  const topFn = useServerFn(fetchWhatsappTopProducts);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [limit, setLimit] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["wa-top-products", debouncedSearch, limit],
    queryFn: () =>
      topFn({
        data: {
          ...(limit != null ? { limit } : {}),
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        },
      }),
    // Near-live mirror of the separate WhatsApp reporting page.
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const [selected, setSelected] = useState<WhatsappTopProduct | null>(null);
  const [scope, setScope] = useState<ScopeFilter>("all");
```

**در بدنه، بالای بلوک `SCOPES` (خط ۷۹) اضافه شود:**
```tsx
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جست‌وجو در نام محصول (روی کل داده، نه فقط این صفحه)"
              className="h-8 w-full sm:w-80"
              data-testid="whatsapp-top-products-search"
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">تعداد:</span>
              {LIMITS.map((o) => (
                <Button
                  key={o.l}
                  type="button"
                  size="sm"
                  variant={limit === o.v ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setLimit(o.v)}
                >
                  {o.l}
                </Button>
              ))}
            </div>
          </div>
```

### محدودیت شناخته‌شده — باید به مالک گفته شود

جست‌وجوی مبدأ **فقط روی نام محصول** کار می‌کند (`product_reports.py:190-195`).
تصمیم ۴ مالک متن پیام، نام فرستنده و نام گروه را هم خواسته — آن‌ها **در خود
افراپیام** وجود ندارند و ساختنشان کار سمت مبدأ است، نه دستیار. این مورد در P0 نیست
و باید صریح به‌عنوان شکاف باقی‌مانده گزارش شود.

هم‌چنین مبدأ `total` واقعی برنمی‌گرداند (`reporting.py:190` → `len(rows)`)، پس
نمایش «X از Y» ممکن نیست و **نباید جعل شود**.

---

## مورد ۳ — رفع تناقض ویدیوی رسید تحویل

### تناقض دقیق

| | UI وعده می‌دهد | bucket اجازه می‌دهد |
|---|---|---|
| فرمت | `mp4, mov, webm, mkv` (`DeliveryReceiptUploadForm.tsx:45,294`) | فقط `image/jpeg, image/png, image/webp, application/pdf` |
| حجم | ۱۰۰MB برای ویدیو (`:48,320`) | ۲۵MB (`26214400`) |

نتیجه: هر آپلود ویدیوی رسید تحویل در سمت Storage رد می‌شود.
و `invoices.product_video_required` (ستون زنده) که همین فرم می‌خواندش (`:118-128,162`)
عملاً بی‌اثر است.

### ۳-الف · مهاجرت جدید

نام فایل (ادامهٔ سری موجود — آخرین: `..._262_withdraw_actor_activity_guard.sql`):

`supabase/migrations/20260803090000_263_delivery_receipts_video_support.sql`

UTF-8 **بدون BOM**. الگو دقیقاً از `20260712120000_create_missing_storage_buckets.sql`
گرفته شده تا idempotent بماند:

```sql
SET client_encoding='UTF8';

-- =====================================================================
-- 263 — bucket «delivery-receipts» با چیزی که فرم آپلود از قبل وعده می‌دهد
--        هم‌راستا می‌شود.
--
-- DeliveryReceiptUploadForm از ابتدا mp4/mov/webm تا ۱۰۰MB را می‌پذیرد و
-- invoices.product_video_required هم برای همین ساخته شده، ولی bucket فقط
-- تصویر و pdf تا ۲۵MB را قبول می‌کرد — پس آپلود ویدیو همیشه در Storage رد
-- می‌شد. این مهاجرت فقط سقف و فهرست فرمت را اصلاح می‌کند.
--
-- mkv عمداً اضافه نشده: پیام خطای خود فرم هم mkv را نام نمی‌برد و در همین
-- تغییر از UI حذف می‌شود تا هر دو طرف یک فهرست داشته باشند.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('delivery-receipts', 'delivery-receipts', false, 104857600, ARRAY[
     'image/jpeg','image/png','image/webp','application/pdf',
     'video/mp4','video/quicktime','video/webm'
   ])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
```

> `public` عمداً در `DO UPDATE` نیست تا خصوصی‌بودن bucket به‌هیچ‌وجه دست نخورد.

**روش اجرا (طبق `CLAUDE.md` — بدون pipe در PowerShell):**
```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker cp "D:\AfraKalaTest\app\supabase\migrations\20260803090000_263_delivery_receipts_video_support.sql" afrakala-lan-db:/tmp/mig263.sql
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala `
  -v ON_ERROR_STOP=1 --single-transaction -f /tmp/mig263.sql
```

**تأیید پس از اجرا:**
```sql
SELECT file_size_limit, allowed_mime_types
  FROM storage.buckets WHERE id = 'delivery-receipts';
-- انتظار: 104857600 و ۷ نوع MIME
```

### ۳-ب · `src/components/delivery-receipts/DeliveryReceiptUploadForm.tsx`

**خط ۴۵–۴۶ — قبل:**
```ts
const ALLOWED_EXT = ["jpg", "jpeg", "png", "pdf", "mp4", "mov", "webm", "mkv"];
const VIDEO_EXT = ["mp4", "mov", "webm", "mkv"];
```
**بعد:**
```ts
// Kept in step with the delivery-receipts bucket (migration 263). mkv was
// listed here but never in the error message and never in the bucket, so it
// is dropped rather than added — one list, three places agreeing.
const ALLOWED_EXT = ["jpg", "jpeg", "png", "pdf", "mp4", "mov", "webm"];
const VIDEO_EXT = ["mp4", "mov", "webm"];
```

**خط ۲۹۴ — قبل:**
```tsx
            accept=".jpg,.jpeg,.png,.pdf,.mp4,.mov,.webm,.mkv,image/jpeg,image/png,application/pdf,video/*"
```
**بعد:**
```tsx
            accept=".jpg,.jpeg,.png,.pdf,.mp4,.mov,.webm,image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/quicktime,video/webm"
```

خط ۱۷۳ (`فرمت مجاز: jpg, png, pdf, mp4, mov, webm`) و خط ۳۲۰
(`jpg، png، pdf تا ۲۰MB — mp4/mov/webm تا ۱۰۰MB`) **از قبل درست‌اند** و تغییر نمی‌کنند.

### rollback

`docs/verification/263-down.sql`:
```sql
SET client_encoding='UTF8';
UPDATE storage.buckets
   SET file_size_limit    = 26214400,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf']
 WHERE id = 'delivery-receipts';
```

---

## مورد ۴ — دوربین موبایل (تصمیم ۲۷ مالک)

### چرا `capture` را نباید به input موجود اضافه کرد

صفت `capture` روی یک `<input type="file">` **دوربین را جایگزین انتخاب از گالری
می‌کند** (در iOS Safari و اندروید Chrome گزینهٔ گالری حذف می‌شود). افزودن آن به
inputهای فعلی یک قابلیت اضافه نمی‌کند، بلکه یکی را با دیگری عوض می‌کند — یک
پس‌رفت واقعی برای کاربری که می‌خواهد عکس قبلی را بفرستد.

تصمیم ۲۷ می‌گوید «قابل **گرفتن** و **آپلود**» — یعنی هر دو مسیر.
پس: یک دکمهٔ دوربین **کنار** مسیر موجود.

### ۴-الف · کامپوننت مشترک جدید

`src/shared/components/CameraCaptureButton.tsx`:

```tsx
import { useRef } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  /** Same accept string as the sibling gallery input. */
  accept: string;
  onFiles: (files: FileList | null) => void;
  disabled?: boolean;
  multiple?: boolean;
  label?: string;
  /** "environment" = rear camera (documents, receipts, products). */
  facing?: "environment" | "user";
  className?: string;
  testId?: string;
}

/**
 * A camera button that sits NEXT TO an existing file input, never replacing it.
 *
 * `capture` makes the browser open the camera directly, which on iOS Safari and
 * Android Chrome removes the gallery option — so putting it on the main input
 * would trade one capability for another. Desktop browsers ignore `capture`
 * and fall back to a normal file picker, so this degrades harmlessly.
 */
export function CameraCaptureButton({
  accept,
  onFiles,
  disabled,
  multiple = false,
  label = "دوربین",
  facing = "environment",
  className,
  testId,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={facing}
        multiple={multiple}
        className="hidden"
        data-testid={testId ? `${testId}-input` : undefined}
        onChange={(e) => {
          onFiles(e.target.files);
          // Let the same shot be retaken after a failed upload.
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        data-testid={testId}
        className={cn("gap-1", className)}
        onClick={(e) => {
          // The parent drop zones open the gallery input on click; without this
          // a tap on the camera button would open both pickers.
          e.stopPropagation();
          ref.current?.click();
        }}
      >
        <Camera className="h-4 w-4" /> {label}
      </Button>
    </>
  );
}
```

### ۴-ب · محل‌های اتصال (چهار فرم)

| فایل | نقطهٔ درج | `accept` | handler موجود |
|---|---|---|---|
| `src/components/delivery-receipts/DeliveryReceiptUploadForm.tsx` | **بعد از** `</div>` بستن drop zone (خط ۳۲۴)، پیش از `{fileError && ...}` | همان رشتهٔ خط ۲۹۴ (نسخهٔ اصلاح‌شده) | `onPickFile(f)` — `(f: File \| null)` |
| `src/components/purchase/PurchaseReceiptUploader.tsx` | بعد از `</div>` بستن drop zone (خط ۹۱) | `.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf` | `handleFile(f)` — `(file: File)` |
| `src/components/documents/DocumentUploadForm.tsx` | بعد از drop zone (حدود خط ۲۵۵) | `.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf` | `onPickFile(f)` — `(f: File \| null)` |
| `src/components/products/ProductImagesSection.tsx` | کنار دکمهٔ «افزودن تصویر» (خط ۱۶۳–۱۷۷) | `image/jpeg,image/png,image/webp` | `void handleFile(f)` — `(file: File)` |

نمونهٔ اتصال (رسید تحویل):
```tsx
        <div className="flex justify-center">
          <CameraCaptureButton
            accept=".jpg,.jpeg,.png,.pdf,.mp4,.mov,.webm,image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/quicktime,video/webm"
            onFiles={(files) => onPickFile(files?.[0] ?? null)}
            testId="delivery-receipt-camera"
          />
        </div>
```

نمونهٔ اتصال (تصاویر محصول — با `disabled` موجود):
```tsx
        <CameraCaptureButton
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading || atLimit}
          onFiles={(files) => {
            const f = files?.[0];
            if (f) void handleFile(f);
          }}
          testId="product-image-camera"
        />
```

### آنچه در P0 نیست

فشرده‌سازی تصویر، اصلاح جهت EXIF، نوار پیشرفت آپلود، و تلاش مجدد پس از خطا —
هر چهار مورد در ممیزی (C3.4، B2.5) ثبت شده‌اند و **در این فاز انجام نمی‌شوند**.

---

## مورد ۵ — `purchase_specialist` در ناوبری موبایل

### دو یافته که این مورد را از «افزودن یک ردیف» بزرگ‌تر می‌کند

**یکم — `/purchases/create` برای این نقش باز نمی‌شود.**
`src/lib/rbac/roles.ts:120` ⇒ `purchases.create: ["admin", "manager"]`،
و `role_permissions` در دیتابیس زنده هم موافق است (`can_create=false`).
پس «ثبت خرید» **نمی‌تواند** میان‌بر این نقش باشد. فضای کاری واقعی‌اش `/purchase`
است (فضای درخواست‌ها) که رویش `view` دارد.

**دوم — fallback ایستا با دیتابیس نمی‌خواند.**
`role_permissions` به این نقش `view` می‌دهد روی:
`dashboard, products, messages, purchases, warehouse, suppliers, pricing, price-lists,
reports, knowledge, academy, feedback, data-tables`
ولی `PERMISSIONS.dashboard/products/messages` در `roles.ts` از `ALL_ROLES` استفاده می‌کنند
و `ALL_ROLES` (خط ۳۳) `purchase_specialist` را **ندارد**.

`hasPermissionEx` وقتی ردیف دیتابیس موجود باشد آن را ترجیح می‌دهد، ولی تا بارگذاری
cache به fallback ایستا می‌افتد — یعنی میان‌برها در اولین رندر پنهان می‌مانند.
همان کامنت خودِ فاز C5 در `roles.ts:110-113` این را هشدار داده است.

### ۵-الف · `src/lib/rbac/roles.ts`

**خط ۹۵ — قبل:**
```ts
  dashboard: { view: ALL_ROLES, create: [], update: [], delete: [] },
```
**بعد:**
```ts
  // Static fallback must agree with role_permissions, which grants
  // purchase_specialist view on dashboard/products/messages. A fallback that
  // is STRICTER than the table hides a menu the backend would have allowed.
  dashboard: {
    view: [...ALL_ROLES, "purchase_specialist"],
    create: [],
    update: [],
    delete: [],
  },
```

**خط ۹۶–۱۰۱ — `products.view` مشابه:**
```ts
  products: {
    view: [...ALL_ROLES, "purchase_specialist"],
    create: ["admin", "manager"],
    update: ["admin", "manager"],
    delete: ["admin"],
  },
```

**خط ۱۵۳ — `messages` (دیتابیس `can_view` و `can_create` هر دو true):**
```ts
  messages: {
    view: [...ALL_ROLES, "purchase_specialist"],
    create: [...ALL_ROLES, "purchase_specialist"],
    update: ALL_ROLES,
    delete: ["admin"],
  },
```

> `ALL_ROLES` خودش **دست نمی‌خورد** — آن فهرست، انتخابگر نقش در UI را می‌سازد و
> باید همان پنج نقش سیستمی بماند (کامنت `roles.ts:8-13`).

### ۵-ب · رجیستری ناوبری — **تأیید شد، و یک مانع واقعی پیدا شد**

رجیستری در `src/lib/navigation/registry.ts` است
(`NAVIGATION_REGISTRY = NAVIGATION_SEEDS.map(toNavigationEntry)`، خط ۱۲۴۵).
`getNavigationEntryByRoute` تطبیق **دقیق** روی `entry.route` می‌کند (`selectors.ts:22-24`)،
و `MobileBottomNav` هر میان‌بری را که ورودی‌اش پیدا نشود **بی‌صدا می‌اندازد**.

نتیجهٔ بررسی هر چهار مسیر:

| مسیر | در رجیستری؟ | `allowedRoles` | مجوز | حکم |
|---|---|---|---|---|
| `/dashboard` | ✔ خط ۶۳ (`module: "dashboard"`) | ندارد | `dashboard:view` | ✅ کار می‌کند (پس از ۵-الف) |
| `/products` | ✔ خط ۷۵–۸۲ (`module: "products"`) | ندارد | `products:view` | ✅ کار می‌کند (پس از ۵-الف) |
| `/messages` | ✔ خط ۶۰۱–۶۰۷ (`module: "messages"`) | ندارد | `messages:view` | ✅ کار می‌کند (پس از ۵-الف) |
| `/purchase` | ❌ **اصلاً وجود ندارد** | — | — | ❌ **میان‌بر بی‌صدا حذف می‌شود** |

هیچ‌کدام از این چهار مسیر در `ROLE_ALLOWLIST_BY_ROUTE` (خط ۱۱۵۳–۱۱۸۵) نیستند، پس
allowlist مانعی نمی‌سازد. `PRIMARY_ROLE_ROUTES["/dashboard"] = ["admin","manager","viewer"]`
(خط ۱۱۲۰) فقط `primaryForRoles` را ست می‌کند و در `isNavigationEntryVisible` نقشی ندارد.

#### چرا `/purchases` جایگزین درستی نیست

در رجیستری فقط `/purchases` (جمع) هست — خط ۲۵۸–۲۶۴، برچسب «پنل خرید».
ولی این دو صفحه یکی نیستند:

| مسیر | عنوان صفحه | کارکرد | در رجیستری |
|---|---|---|---|
| `/purchase` | «فضای خرید» | «ثبت درخواست خرید و پیگیری وضعیت درخواست‌های خود» — **فضای کاری واقعی کارشناس خرید** | ❌ |
| `/purchases` | «خرید» / «پنل خرید» | «ثبت و مدیریت سفارش‌های خرید از تأمین‌کنندگان» | ✔ |

بدنهٔ `/purchases` می‌گوید «برای ثبت یک خرید جدید روی دکمهٔ ثبت خرید جدید کلیک کنید» —
و آن دکمه به `/purchases/create` می‌رود که `purchase_specialist` **اجازه‌اش را ندارد**.
یعنی فرستادن کارشناس خرید به `/purchases` او را به صفحه‌ای می‌برد که تنها اقدام
اصلی‌اش برایش بسته است.

هم‌چنین کامنت خودِ `roles.ts:114-116` تصریح می‌کند `/purchase` همان جایی است که
`purchases:view` برای این نقش به‌خاطرش باز شده.

**یافتهٔ جانبی:** `/purchase` امروز از هیچ منویی قابل رسیدن نیست — تنها لینک ورودی‌اش
یک کارت در `src/routes/_app.collaboration.tsx:58` است. این برای **فروشنده** هم صدق
می‌کند، که قرار است درخواست خرید را همان‌جا ثبت کند.

#### ۵-ب-۱ · افزودن seed برای `/purchase`

در `src/lib/navigation/registry.ts`، **بلافاصله پیش از** seed مربوط به `/purchases`
(خط ۲۵۸):

```ts
  // «فضای خرید» — where a salesperson raises a purchase request and a purchase
  // specialist works the ones assigned to them. It was reachable only from a card
  // on /collaboration, so it never appeared in any menu. purchases:view is granted
  // to sales and purchase_specialist precisely for this page (see roles.ts).
  {
    to: "/purchase",
    label: "فضای خرید",
    icon: ClipboardList,
    module: "purchases",
    group: "purchasing",
  },
```

`ClipboardList` از قبل در خط ۴۹ import شده — import تازه لازم نیست.

**بررسی برخورد:** رجیستری در خط ۱۲۴۷–۱۲۵۳ یک گارد یکتایی دارد که در زمان بارگذاری
ماژول `throw` می‌کند:
```ts
if (ids.has(entry.id)) throw new Error("Duplicate navigation id: " + entry.id);
if (routes.has(entry.route)) throw new Error("Duplicate navigation route: " + entry.route);
```
`idFromRoute("/purchase")` → `purchase` و `idFromRoute("/purchases")` → `purchases` —
متمایزند، و مسیرها هم متمایزند. برخوردی رخ نمی‌دهد.

**اثر جانبی موردانتظار:** `/purchase` در سایدبار برای هر نقشی که `purchases:view`
دارد ظاهر می‌شود (admin، manager، accountant، viewer، sales، purchase_specialist).
این **مطلوب** است — صفحه‌ای که فروشنده باید در آن درخواست ثبت کند، تا امروز در منو نبود.
اگر مالک این را نخواهد، بدیل کم‌اثرتر افزودن `hiddenFromMenu: true` است؛ ولی آن‌وقت
`toNavigationEntry` مقدار `pinnable: false` می‌دهد و ورودی همچنان برای
`getNavigationEntryByRoute` قابل تفکیک می‌ماند و میان‌بر موبایل کار می‌کند —
با این هزینه که در سایدبار دیده نمی‌شود.

#### ۵-ب-۲ · `src/components/layout/MobileBottomNav.tsx`

**بعد از بلوک `viewer` (خط ۳۶–۴۰) اضافه شود:**
```ts
  // The owner's primary mobile role (audit decision 47). NOT /purchases/create —
  // purchases.create is admin/manager only, so that shortcut would land the user
  // on a page the route guard refuses. /purchase is their actual workspace and
  // only resolves after the registry seed in 5-ب-1.
  purchase_specialist: [
    { to: "/dashboard", label: "خانه" },
    { to: "/purchase", label: "فضای خرید" },
    { to: "/products", label: "محصولات" },
    { to: "/messages", label: "پیام‌ها" },
  ],
```

دقیقاً چهار مورد = `MAX_SHORTCUTS` (خط ۴۳).

> **ترتیب اجرا مهم است:** ۵-ب-۱ باید **پیش از** ۵-ب-۲ اعمال شود، وگرنه میان‌بر
> «فضای خرید» بی‌صدا حذف می‌شود و نتیجه سه میان‌بر خواهد بود، نه چهار — دقیقاً همان
> نوع خرابی خاموشی که این مورد قرار بود رفعش کند.

---

## اعتبارسنجی پس از اجرا

### دستورها

| گام | فرمان | انتظار |
|---|---|---|
| ۱ | `npx tsc --noEmit` | **دقیقاً ۷۰ خطا** — نه بیشتر |
| ۲ | `npm run build` | باید پاس شود |
| ۳ | `npx eslint <فایل‌های لمس‌شده>` | فقط فایل‌های تغییریافته (baseline قدیمی ~۱۳ خطای prettier تحمل می‌شود) |
| ۴ | `npx playwright test` | مقایسه با baseline ثبت‌شده در PROGRESS.md (۱۲۱ سبز / ۳ قرمز) |

> `package.json` **اسکریپت `test` ندارد** — تست‌ها فقط با `npx playwright test` اجرا می‌شوند.

### استقرار

```powershell
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --build web
```

**تأیید (طبق `PROGRESS.md` — `--force-recreate` گاهی از image قدیمی می‌سازد):**
```powershell
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" |
  Select-String "APP_GIT_SHA|APP_BUILD_TIME"
```
`APP_BUILD_TIME` باید همان مقدار تازه باشد، و برای اطمینان یک نماد جدید هم در بیلد
گرفته شود:
```powershell
docker exec afrakala-lan-web sh -c "grep -rl 'WHATSAPP_TOP_PRODUCTS_LIMIT' /app/.output | head -3"
```
هم‌چنین `afrakala-lan-db-role-fix` باید `Exited (0)` و بقیهٔ `afrakala-lan-*` باید `Up` باشند.

### مسیر تست دستی (فقط انسان می‌تواند)

| # | مورد | گام | معیار قبول |
|---|---|---|---|
| ۱ | سقف | `/pricing/market-intelligence` ← دکمهٔ «۱۰۰۰» | تعداد ردیف‌ها از ۱۵۰ به ~۱۰۰۰ برسد |
| ۱ | ENV | `WHATSAPP_TOP_PRODUCTS_LIMIT=200` + restart (**بدون rebuild**) | پیش‌فرض ۲۰۰ شود |
| ۲ | جست‌وجو | تایپ «ال جی» سپس «ال‌جی» | نتیجهٔ یکسان؛ محصولی با رتبهٔ >۱۵۰ هم با تعداد ۱۵۰ پیدا شود |
| ۲ | debounce | تایپ سریع ۱۰ حرف | حداکثر ۱–۲ درخواست در Network |
| ۳ | ویدیو | آپلود یک `mp4` واقعی ~۳۰MB در رسید تحویل | **موفق** (پیش از این در Storage رد می‌شد) |
| ۳ | مرز | آپلود `mkv` | رد با پیام فارسی مشخص |
| ۴ | دوربین | روی **گوشی واقعی** (اندروید Chrome و iOS Safari) دکمهٔ «دوربین» | دوربین باز شود؛ **دکمهٔ انتخاب فایل هم هنوز گالری را باز کند** |
| ۵ | ناوبری | ورود با کاربری که فقط `purchase_specialist` دارد، عرض <768px | چهار میان‌بر دیده شود و هر چهار باز شوند |

**آنچه فقط انسان می‌تواند:** موارد ۴ و ۵ روی دستگاه واقعی، و آپلود ویدیوی واقعی در مورد ۳.
هیچ‌کدام با Playwright headless قابل اثبات نیستند.

---

## ریسک‌های باقی‌مانده

| # | ریسک | تخفیف |
|---|---|---|
| ۱ | بار مبدأ: هر کاربرِ صفحه‌باز هر ۳۰ ثانیه ۱۰۰۰ ردیف می‌گیرد (پیش از این ۱۵۰) | در P0 حل نمی‌شود. snapshot و زمان‌بند سمت سرور در فاز P2 ممیزی است. اگر بار مشکل شد، `WHATSAPP_TOP_PRODUCTS_LIMIT` را پایین بیاورید — **بدون rebuild**. |
| ۲ | حجم پاسخ و رندر ۱۰۰۰ ردیف روی موبایل | جدول مجازی‌سازی ندارد (C3.5). picker به کاربر اجازهٔ کاهش می‌دهد. |
| ۳ | ویدیوی ۱۰۰MB بدون chunk/resume | قطعی شبکه = آپلود از صفر (B2.5). خارج از P0. |
| ۴ | ۱۰۰MB × تعداد رسید روی volume `lan-storage-data` | پایش دیسک. سقف قابل تنظیم است. |
| ۵ | تغییر fallback ایستا روی سه ماژول | فقط `view` (و `messages.create`) و فقط افزودن یک نقش؛ با `role_permissions` زنده مطابقت داده شد. |
| ۶ | افزودن `/purchase` به رجیستری، آن را در سایدبار **همهٔ** نقش‌های دارای `purchases:view` ظاهر می‌کند | اثر موردانتظار و مطلوب است (صفحه تا امروز در هیچ منویی نبود). اگر مالک نخواهد، `hiddenFromMenu: true` — توضیح در ۵-ب-۱. |
| ۷ | ترتیب ۵-ب-۱ پیش از ۵-ب-۲ | اگر برعکس شود، میان‌بر «فضای خرید» بی‌صدا حذف می‌شود و کسی متوجه نمی‌شود. در تست دستی مورد ۵، **شمارش چهار میان‌بر** معیار قبول است. |
| ۸ | درخت کاری تمیز نیست (۲۹ فایل `M` از قبل) | این پنج تغییر با آن‌ها قاطی می‌شوند. پیشنهاد: commit جداگانه فقط برای P0. |

---

## پس از اجرا — ثبت در PROGRESS.md

یک ردیف به بالای جدول تاریخچه:

```
| 2026-08-03 | Claude Code | P0 ممیزی ۲۲۰-۲۲۶: سقف ۱۵۰ واتساپ در هر سه لایه برداشته شد
(پیش‌فرض env-محور، سقف zod، ارسال limit از کارت)، جست‌وجوی سمت‌سرور از proxy عبور
داده شد، bucket رسید تحویل با وعدهٔ UI هم‌راستا شد (مهاجرت ۲۶۳ + حذف mkv)، دکمهٔ
دوربین موبایل کنار مسیر گالری اضافه شد، و purchase_specialist به ناوبری موبایل و
fallback ایستای مجوز اضافه شد (بدون /purchases/create چون create فقط admin/manager
است). typecheck ۷۰ | <commit> |
```

---

**این سند اجرا نشده است.** هیچ فایل کد، مهاجرت، رکورد دیتابیس یا کانتینری در جریان
نگارش آن تغییر نکرد. `git status` پیش و پس از نگارش یکسان است، به‌جز خودِ همین فایل.
