# تشخیص عمیق نیازمندی‌های ۱۹۴ تا ۲۰۹

> **نوع:** تحقیق فقط‌خواندنی. هیچ کد، migration، نوشتن DB، build یا تغییر کانتینری انجام نشد.
> **برنچ:** `feature/navigation-modernization` (تأیید شد)
> **دیتابیس:** `afrakala` روی کانتینر `afrakala-lan-db` — وب روی `afrakala-lan-web` (پورت ۳۱۰۰)
> **تاریخ:** ۱۴۰۵/۰۵/۰۶ (2026-07-28)

---

## بخش ۰ — یک ابهام بنیادی که باید اول روشن شود

در این سیستم **دو چیز** «پیش‌فاکتور» نامیده می‌شوند:

| مسیر | جدول | برچسب منو | ردیف | وضعیت |
|---|---|---|---|---|
| `/sales/quotes` | `sales_quotes` | «پیش‌فاکتورها» | **۲۲ ردیف** | **زنده** |
| `/sales/invoices` | `invoices` | «فاکتورهای فروش» | **۰ ردیف** | **مرده و از منو مخفی** |

شاهد قطعی — `src/lib/navigation/registry.ts:303-306`:

```
// `invoices` / `invoice_items` are a dead parallel design: both tables hold 0
// rows and the live pre-invoice workflow is `sales_quotes` (/sales/quotes).
// Hidden from the menus only — routes, guards and breadcrumbs are unchanged
```

شاهد SQL:
```
invoices|0
invoice_items|0
sales_quotes|22
sales_quote_items|24
```

**چرا مهم است:** ماژول مردهٔ `invoices` تعدادی از قابلیت‌هایی را که کاربر در ۱۹۷/۱۹۸ می‌خواهد **از قبل دارد** (چک اعتبار، فیلد بیعانه، تعهد فروشنده). ولی روی مسیر زنده (`sales_quotes`) هیچ‌کدام وجود ندارد. پس «هست» گفتن دربارهٔ آن‌ها خطای فاحش است — ولی می‌توان از کد آن‌ها به‌عنوان الگو استفاده کرد. در تمام این گزارش، «پیش‌فاکتور» = `sales_quotes`.

---

## F1 — جدول جمع‌بندی

| # | نیازمندی | دسته | وضعیت | ریشه / محل دقیق | حجم رفع |
|---|---|---|---|---|---|
| **۱۹۴+۱۹۶** | تخفیف زیر قیمت لیست با چک‌باکس مسئولیت + پاپ‌آپ | قانون کاری | 🔶 **نیمه** | کف قیمت هست و **سخت بلاک می‌کند**؛ هیچ مسیر override وجود ندارد. `create_sales_quote_with_items` (بخش «Phase J») | متوسط (DB + UI) |
| **۱۹۵** | نوشتن دلیل هنگام رد پیش‌فاکتور | قانون کاری | 🔶 **نیمه** | رد هست، دلیل **عمداً دور ریخته می‌شود**: `quote-status.functions.ts:106` + نبود ستون | کوچک-متوسط |
| **۱۹۷+۱۹۸** | ممنوعیت صدور بدون اعتبار، مگر بیعانه | قانون کاری | ❌ **نیست** (روی مسیر زنده) | نه چک اعتبار، نه ستون بیعانه روی `sales_quotes`. کد آماده در ماژول مرده | بزرگ |
| **۱۹۹** | نمایش انواع تسویه هنگام صدور | UI | ✅ **هست** | `_app.sales.quotes.new.tsx:395-419` — با یک تذکر عملیاتی | — |
| **۲۰۱** | صدور برای جنس ناموجود = مجاز | موجودی | ✅ **هست** | هیچ بلاک سروری نیست؛ فقط هشدار نرم `quotes.new.tsx:263-290` | — |
| **۲۰۲** | قطعی‌کردن بدون موجودی = ممنوع | موجودی | ✅ **هست (دو لایه)** | UI: `$quoteId.tsx:585` + DB: `apply_stock_movement` | — |
| **۲۰۳-الف** | ویزیتور (تعریف/انتخاب) | موجودیت جدید | ❌ **کاملاً نیست** | صفر نتیجه در کل کد و کل schema | بزرگ |
| **۲۰۳-ب** | شرح مبلغ به حروف فارسی | UI | ❌ **کاملاً نیست** | هیچ تابع عدد→حروف در پروژه نیست | کوچک |
| **۲۰۳-ج** | PDF پیش‌فاکتور | باگ | 🐞 **خراب — سه ایراد زنجیره‌ای** | ارتقای `pdfmake 0.2.10 → 0.3.7` در کامیت `b8688653` | متوسط |
| **۲۰۵** | فرم فیش خطا می‌دهد + پیام `????` | باگ | 🐞 **دو مشکل کاملاً جدا** | (الف) قوانین blocking در `validation_rules`؛ (ب) **۴۳ تابع DB با متن فارسی نابودشده** | متوسط-بزرگ |
| **۲۰۷** | کد آسان گیرنده در حالت ۲ نباید اجباری باشد | باگ | 🐞 **اجباری است — و بی‌قید** | ردیف `f81e86fa…` در `validation_rules` (scope=`journal_entry`) | کوچک |
| **۲۰۸** | هوش مصنوعی خالی برمی‌گرداند | باگ | 🐞 **دو ریشهٔ جدا — هر دو پیکربندی/داده، نه سرویس** | (چت) اولویت ارائه‌دهنده؛ (دانش) صفر chunk | کوچک |
| **۲۰۹** | سایدبار عریض‌تر + drag-resize | UI | ❌ **نیست** (عرض ثابت) | `src/components/ui/sidebar.tsx:23` | متوسط |

**خلاصهٔ عددی:** ۳ مورد ✅ کامل — ۲ مورد 🔶 نیمه — ۳ مورد ❌ نیست — ۴ مورد 🐞 باگ.

---

# گروه A — قوانین کاری پیش‌فاکتور

## A1 — نیازمندی ۱۹۴ + ۱۹۶: تخفیف زیر قیمت لیست با تأییدیه

### حکم: 🔶 نیمه — «تشخیص زیر لیست» کامل هست، «مسیر عبور با مسئولیت» اصلاً نیست

### شواهد چهارلایه

**۱) بک‌اند — مفهوم «قیمت لیست» وجود دارد و کف قیمت اجرا می‌شود**

لنگرگاه قیمت لیست: جدول `public.product_computed_prices` با کلید سه‌تایی `(product_id, sale_price_type_id, settlement_type_id)` و ستون `rounded_sale_price`.

داخل `create_sales_quote_with_items` (بخش کامنت‌گذاری‌شده `===== Phase J: settlement price-floor =====`):

```sql
IF _src = 'product_price' THEN
  SELECT c.rounded_sale_price INTO _floor
  FROM public.product_computed_prices c
  WHERE c.product_id = _pid
    AND c.sale_price_type_id = _sptid
    AND c.settlement_type_id IS NOT DISTINCT FROM p_settlement_type_id
  ORDER BY c.computed_at DESC LIMIT 1;
  IF _floor IS NOT NULL AND _price < _floor THEN
    RAISE EXCEPTION 'قیمت وارد شده برای «%» از کف مجاز تسویهٔ % (%) کمتر است.',
      _label, COALESCE(_settlement_label, 'پایه'), _floor
      USING ERRCODE = '22023';
  END IF;
END IF;
```

**این قانون واقعاً و همین امروز اجرا می‌شود** — شاهد زنده از لاگ Postgres:

```
2026-07-28 14:00:41.166 UTC [54223] authenticator@afrakala ERROR:
قیمت وارد شده برای «ایوولی 24000 مدل MD1 معمولی سرد وگرم»
از کف مجاز تسویهٔ پیش واریز(نقدی) (100100000) کمتر است.
```

**۲) UI — چه چیزی هست و چه چیزی نیست**

- فیلد قیمت واحد برای نقش `sales` **قفل** است: `_app.sales.quotes.new.tsx:506`
  `disabled={it.source === "product_price" && !canEditPriceFreely}`
  (`canEditPriceFreely = roles.includes("admin") || roles.includes("manager")` — خط ۷۰)
- هیچ چک‌باکس «با مسئولیت خودم» در کل فایل نیست.
- هیچ پاپ‌آپ هشدار برای زیر لیست نیست.
- **الگوی قابل تقلید هست:** هشدار ناموجودی دو-کلیکی در `quotes.new.tsx:263-290` (`stockConfirmed`) و دیالوگ رد در `quotes.new.tsx:593-666`.

**۳) دسترسی:** ۴ سیاست RLS روی `sales_quotes` (`sales_quotes_insert`, `sales_quotes_select`, `sales_quotes_update_privileged`, `sales_quotes_update_sales_own`). محدودیت قیمت از RLS نمی‌آید، از خود RPC می‌آید.

**۴) ثبت «صادر شد با مسئولیت شخصی»:** هیچ ستونی روی `sales_quotes` وجود ندارد. ۲۳ ستون کامل جدول بررسی شد — نه `below_list_price`، نه `price_override_by`، نه چیزی مشابه.

### 🚨 یک حفرهٔ جدی که ضمن بررسی پیدا شد (خارج از خواستهٔ کاربر ولی مرتبط)

کف قیمت **فقط روی `unit_price`** چک می‌شود. ولی:

- ستون «تخفیف» در فرم برای **همهٔ نقش‌ها باز است** (`quotes.new.tsx:512-521` — هیچ `disabled` ندارد).
- RPC فقط `_disc > _qty * _price` را رد می‌کند (یعنی فقط تخفیف بیشتر از کل مبلغ).
- روی `sales_quote_items` **صفر تریگر** وجود دارد (تأیید SQL شد).

**نتیجه:** یک کارشناس فروش همین حالا می‌تواند `unit_price` را دقیقاً روی کف بگذارد و با فیلد «تخفیف» هر مقدار زیر کف برود — بدون هیچ بلاکی. یعنی قانون ۱۹۴ عملاً از یک در پشتی دور زده می‌شود.

### دقیقاً چه چیزی برای رفع لازم است

| # | تغییر | فایل / شیء |
|---|---|---|
| ۱ | ستون جدید `below_list_price_ack boolean NOT NULL DEFAULT false` (و ترجیحاً `below_list_price_ack_at`, `below_list_price_ack_by`, `list_price_snapshot numeric`) | `public.sales_quotes` — migration جدید |
| ۲ | پارامتر جدید `p_below_list_ack boolean DEFAULT false` به RPC | `create_sales_quote_with_items` |
| ۳ | تبدیل `RAISE EXCEPTION` کف قیمت به شرطی: فقط وقتی `p_below_list_ack = false` بلاک شود؛ در غیر این صورت مقدار در ستون‌های بند ۱ ثبت و اجازه داده شود | همان تابع، بلوک «Phase J» |
| ۴ | **کف را روی قیمت مؤثر خط بررسی کن، نه `unit_price`**: `(_qty*_price - _disc)/_qty < _floor` — برای بستن حفرهٔ تخفیف | همان بلوک |
| ۵ | باز کردن `unit_price` برای نقش sales **فقط وقتی** چک‌باکس زده شده (یا نگه داشتن قفل و اجازهٔ تخفیف کنترل‌شده) | `quotes.new.tsx:506` |
| ۶ | افزودن state `belowListAck` + چک‌باکس + `AlertDialog` با متن دقیق کاربر | `quotes.new.tsx` — الگو: دیالوگ خط ۵۹۳ |
| ۷ | ارسال `p_below_list_ack: belowListAck` در `saveMutation` | `quotes.new.tsx:214-226` |
| ۸ | نمایش نشان «زیر قیمت لیست — با مسئولیت صادرکننده» در صفحهٔ جزئیات | `_app.sales.quotes.$quoteId.tsx` |

**متن دقیق پاپ‌آپ (طبق خواستهٔ کاربر):**
> «از این گزینه فقط در صورتی که ۱۰۰٪ از مدیر مربوط تأییدیه گرفته‌اید استفاده نمایید؛ در غیر این صورت عواقب این تصمیم به عهدهٔ شخص صادرکنندهٔ پیش‌فاکتور است»

### ریسک / وابستگی
- تغییر امضای RPC ⇒ نیاز به rebuild فرانت (کلاینت آرگومان جدید می‌فرستد).
- توجه: کف قیمت **به نوع تسویه وابسته است** (`settlement_type_id IS NOT DISTINCT FROM`). تغییر نوع تسویه کف را عوض می‌کند — فرم همین حالا این را با toast در خط ۴۰۲ هشدار می‌دهد.
- بند ۴ (بستن حفرهٔ تخفیف) رفتار موجود را **سخت‌تر** می‌کند و ممکن است پیش‌فاکتورهایی که امروز ثبت می‌شوند را رد کند. باید آگاهانه تصمیم گرفته شود.

---

## A2 — نیازمندی ۱۹۵: نوشتن دلیل هنگام رد

### حکم: 🔶 نیمه — جریان رد کامل هست، دلیل گرفته نمی‌شود و جایی برای ذخیره‌اش نیست

### شواهد چهارلایه

**۱) UI — دکمهٔ «رد» هست، ولی بدون فیلد دلیل**

`_app.sales.quotes.$quoteId.tsx:482-491`:
```tsx
{canReject && (
  <Button size="sm" variant="outline"
    onClick={() => setConfirm({ next: "rejected", label: "رد پیش‌فاکتور" })}>
    <XCircle className="ml-1 h-3.5 w-3.5" /> رد
  </Button>
)}
```

مقایسه کنید با دکمهٔ «لغو» در خط ۴۹۲-۵۰۴ که **`needsReason: true`** دارد:
```tsx
setConfirm({ next: "canceled", label: "لغو پیش‌فاکتور", needsReason: true });
```

فیلد دلیل فقط وقتی رندر می‌شود که `confirm?.needsReason` باشد (خط ۵۳۷). پس در مسیر «رد» هرگز نمایش داده نمی‌شود.

**۲) منطق فرانت — دلیل صریحاً دور ریخته می‌شود**

`$quoteId.tsx:590` — `reason: confirm.needsReason ? reason.trim() || undefined : undefined`

`src/lib/sales/quote-status.functions.ts:106`:
```ts
p_reason: data.next === "canceled" ? (data.reason ?? undefined) : undefined,
```
یعنی حتی اگر فرانت دلیلی بفرستد، برای `rejected` عمداً `undefined` می‌شود.

**۳) بک‌اند — نه اجبار، نه ستون**

در `update_sales_quote_status`:
```sql
IF p_next = 'canceled'::public.sales_quote_status
   AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
  RAISE EXCEPTION 'برای لغو پیش‌فاکتور، دلیل لغو الزامی است.' USING ERRCODE = '22023';
END IF;
```
هیچ شرط معادلی برای `rejected` نیست. و در UPDATE:
```sql
IF p_next = 'canceled' THEN
  UPDATE ... SET status = p_next, cancel_reason = p_reason;
ELSE
  UPDATE ... SET status = p_next;      -- ← هیچ دلیلی نوشته نمی‌شود
END IF;
```

ستون‌های `sales_quotes` (۲۳ ستون کامل بررسی شد): `cancel_reason` هست، **`reject_reason` نیست**.

**۴) دسترسی:** `canReject = (isManagerial || isOwner) && quote.status === "sent"` (`$quoteId.tsx:417`). در DB هم نقش `sales` صاحب سند می‌تواند به `rejected` ببرد (whitelist داخل RPC).

### ⚠️ نکتهٔ ضدسوءتفاهم

صفحهٔ «درخواست‌های رد شدهٔ من» (`/my-rejected-quotes`) که در تحقیق قبلی دیده شده بود، **ربطی به این نیازمندی ندارد**. طبق کامنت `_app.my-rejected-quotes.tsx:12-14`، آن صفحه از `get_my_rejected_quotes` تغذیه می‌شود که ردیف‌های `audit_logs` با `action='sales_quote_rejected'` را می‌خواند — و آن ردیف‌ها را دیالوگِ **شکست ثبت اولیه** می‌نویسد (`quotes.new.tsx:637-648`)، نه ردِ مدیر. دو چیز کاملاً متفاوت با یک اسم.

### دقیقاً چه چیزی برای رفع لازم است

| # | تغییر | محل |
|---|---|---|
| ۱ | ستون `reject_reason text` روی `sales_quotes` (یا استفادهٔ مجدد از `cancel_reason` — توصیه نمی‌شود چون معنایش را مبهم می‌کند) | migration جدید |
| ۲ | اجبار دلیل برای `rejected` در RPC، دقیقاً به سبک بلوک `canceled` | `update_sales_quote_status` |
| ۳ | نوشتن `reject_reason = p_reason` در شاخهٔ `rejected` | همان تابع |
| ۴ | حذف شرط `data.next === "canceled"` تا دلیل برای `rejected` هم عبور کند | `quote-status.functions.ts:106` |
| ۵ | افزودن `needsReason: true` به دکمهٔ رد | `$quoteId.tsx:486` |
| ۶ | برچسب دیالوگ باید بین «دلیل لغو» و «دلیل رد» تفکیک شود (الان ثابت است: `$quoteId.tsx:539`) | `$quoteId.tsx:537-546` |
| ۷ | نمایش دلیل رد در صفحهٔ جزئیات — الگو: بلوک «دلیل لغو» در خط ۲۰۹-۲۱۴ | `$quoteId.tsx` |

### ریسک
کم. تنها نکته: `sales_quotes_validate_status` وضعیت `rejected` را نهایی می‌داند («cannot change status of a finalized quote») — پس دلیل باید در همان تراکنش تغییر وضعیت نوشته شود، نه بعد از آن.

---

## A3 — نیازمندی ۱۹۷ + ۱۹۸: اعتبار مشتری + بیعانه

### حکم: ❌ نیست (روی مسیر زندهٔ `sales_quotes`) — ولی همهٔ قطعات لازم در جای دیگری آماده‌اند

### شواهد چهارلایه

**۱) بک‌اند — زیرساخت اعتبار کامل هست**

جداول موجود: `customer_credit_profile` (`credit_limit`, `credit_score`)، `customer_credit_balance` (`available_credit`, `held_credit`)، `credit_requests`، `credit_score_snapshots`، `credit_scoring_rules`، `customer_credit_ledger`.

RPCهای موجود و آماده:
```
get_customer_dynamic_credit | p_customer_id uuid
hold_credit                 | p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid
release_credit              | p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid
```

**۲) ولی مسیر صدور پیش‌فاکتور هیچ‌کدام را صدا نمی‌زند**

- `create_sales_quote_with_items`: تابع کامل خوانده شد — **صفر ارجاع** به اعتبار. تنها گاردهایش: احراز هویت، نقش، نام/تلفن مشتری، حداقل یک آیتم، اعتبارسنجی نوع تسویه، اعتبارسنجی آیتم‌ها، کف قیمت، تطابق جمع‌ها.
- `_app.sales.quotes.new.tsx`: هیچ کوئری اعتبار. تنها هیت‌های «اعتبار» در این فایل مربوط به **تاریخ اعتبار** (`expires_at`) است، نه سقف اعتبار.

**۳) ستون بیعانه روی پیش‌فاکتور وجود ندارد**

جستجوی کل schema:
```
table_name              | column_name    | data_type
invoices                | deposit_amount | numeric
vw_customer_receivables | deposit_amount | numeric
```
یعنی `deposit_amount` **فقط** روی جدول مردهٔ `invoices` هست. روی `sales_quotes` نیست.

**۴) کد ماژول مرده — الگوی دقیقاً همان چیزی که کاربر می‌خواهد**

`src/shared/components/AdvancePaymentSection.tsx` یک کامپوننت کامل و آماده است:
- عنوان: «تعهد فروشنده (پیش‌واریزی)»
- فیلد «مبلغ بیعانه (تومان)» با اجبار حداقل ۳۰٪ (`MIN_RATIO = 0.3`)
- چک‌باکس تعهد با متن: «تأیید می‌کنم که حداقل ۳۰٪ مبلغ کل پیش‌فاکتور به عنوان بیعانه از مشتری دریافت شده است و مسئولیت آن را تا زمان ثبت فیش توسط حسابدار می‌پذیرم.»
- پیام خطا: «مبلغ بیعانه باید حداقل ۳۰٪ مبلغ کل (X تومان) باشد»

و `src/shared/components/InvoiceForm.tsx:328-352` دقیقاً قانون ۱۹۷+۱۹۸ را پیاده کرده:
```ts
const { data: cc } = await supabase.rpc("get_customer_dynamic_credit", { ... });
const avail = Number(row?.available_credit ?? 0);
// ...
throw new Error(
  "اعتبار مشتری برای این مبلغ کافی نیست. لطفاً از پیش‌فاکتور پیش‌واریزی استفاده کنید."
);
```

**اما:** `AdvancePaymentSection` فقط در `InvoiceForm.tsx:697` mount شده، و `InvoiceForm` فقط در `_app.sales_.invoices_.create.tsx:13` — یعنی روی مسیر مرده. **طبق قانون ۱ ضدخوش‌بینی: برای `sales_quotes` وجود ندارد.**

**۵) یک ماژول مرده دیگر:** `src/lib/sales/customer-credit-snapshot.ts` (توابع `fetchCustomerCreditSnapshot` / `buildCustomerCreditSnapshot`) **هیچ مصرف‌کننده‌ای در کل کد ندارد** — grep کل `src/` صفر نتیجهٔ خارج از خود فایل داد. کد مرده است.

### دقیقاً چه چیزی برای رفع لازم است

| # | تغییر | محل |
|---|---|---|
| ۱ | ستون‌های `deposit_amount numeric`, `commitment_confirmed boolean NOT NULL DEFAULT false` (و ترجیحاً `credit_check_snapshot jsonb`) | `public.sales_quotes` — migration |
| ۲ | پارامترهای `p_deposit_amount numeric DEFAULT NULL`, `p_commitment_confirmed boolean DEFAULT false` | `create_sales_quote_with_items` |
| ۳ | داخل RPC، پیش از INSERT: اگر `p_customer_id IS NOT NULL` → `get_customer_dynamic_credit` را صدا بزن؛ اگر `available_credit < _sum_final` و بیعانهٔ معتبر داده نشده → `RAISE EXCEPTION` با متن فارسی روشن | همان تابع |
| ۴ | قانون بیعانه (حداقل ۳۰٪ یا هر نسبتی که مدیریت تعیین کند) باید **در DB** هم تکرار شود، نه فقط فرانت | همان تابع |
| ۵ | mount کردن `<AdvancePaymentSection>` در فرم پیش‌فاکتور، مشروط به «اعتبار کافی نیست» | `quotes.new.tsx` |
| ۶ | کوئری real-time اعتبار روی `linkedCustomerId` — الگو: `InvoiceForm.tsx:152-182` | `quotes.new.tsx` |
| ۷ | تصمیم مهم: مشتری مهمان (`linkedCustomerId === null`) چه وضعیتی دارد؟ الان فرم اجازهٔ «مشتری مهمان بدون اتصال به پرونده» می‌دهد (`quotes.new.tsx:379-384`) — که یعنی **راه فرار کامل از هر قانون اعتباری**. باید تعیین تکلیف شود. | تصمیم کسب‌وکاری |

### ریسک / وابستگی
- **بند ۷ حیاتی است.** بدون آن، قانون ۱۹۷ با یک کلیک («مشتری را ثبت نکن») دور زده می‌شود.
- `hold_credit` / `release_credit` امضایشان `p_invoice_id uuid` است. برای `sales_quotes` یا باید امضا عوض شود یا یک wrapper نوشته شود.
- ⚠️ **`hold_credit`, `release_credit`, `get_customer_credit`, `increase_credit` جزو ۴۳ تابع با متن فارسی نابودشده هستند** (بخش C1 را ببینید). قبل از تکیه بر آن‌ها باید متن پیام‌هایشان بازسازی شود، وگرنه قانون جدید پیام `????` می‌دهد.

---

## A4 — نیازمندی ۱۹۹: نمایش انواع تسویه هنگام صدور

### حکم: ✅ کامل هست

### شواهد

**۱) UI:** `_app.sales.quotes.new.tsx:395-419` — یک `<Select>` با برچسب «نوع تسویه *»، placeholder «انتخاب نوع تسویه»، mount‌شده در کارت هدر فرم.

**۲) منطق:** `quotes.new.tsx:97-109`
```ts
supabase.from("settlement_types").select("id, title")
  .eq("is_active", true).order("sort_order")
```
**همهٔ** انواع فعال نمایش داده می‌شوند — بدون محدودیت نقش، بدون سقف تعداد.

**۳) اجباری بودن:** فرانت `quotes.new.tsx:191-193` و بک‌اند `create_sales_quote_with_items`:
```sql
SELECT title INTO _settlement_label FROM public.settlement_types
 WHERE id = p_settlement_type_id AND is_active = true;
IF _settlement_label IS NULL THEN
  RAISE EXCEPTION 'نوع تسویهٔ انتخاب‌شده معتبر یا فعال نیست.'
```

**۴) داده — سلامت encoding تأیید شد:**

| title | فعال | sort_order | octet_length | char_length |
|---|---|---|---|---|
| پیش واریز(نقدی) | ✅ | 10 | 27 | 15 |
| چکی | ❌ | 20 | 6 | 3 |
| همکاری | ❌ | 30 | 12 | 6 |
| اعتباری / مدت‌دار | ❌ | 40 | 32 | 17 |
| کوتاه‌مدت | ❌ | 50 | 19 | 9 |
| تسویه یک روزه | ✅ | 100 | 24 | 13 |
| نصف نقد نصف یک روزه | ✅ | 100 | 34 | 19 |
| تسویه 2روزه | ✅ | 100 | 20 | 11 |
| تسویه3روزه | ✅ | 100 | 19 | 10 |
| سایت | ✅ | 100 | 8 | 4 |

نسبت `octet_length ≈ 2 × char_length` برای همهٔ ردیف‌ها ⇒ UTF-8 سالم. باگ encoding تسویه که قبلاً رفع شده بود، برنگشته است.

### دو تذکر عملیاتی (نه باگ، ولی احتمالاً منشأ حس «ناقص بودن» کاربر)

1. **۴ نوع تسویهٔ مهم غیرفعال‌اند** — «چکی»، «همکاری»، «اعتباری / مدت‌دار»، «کوتاه‌مدت». کاربر فقط ۶ گزینه می‌بیند. اگر انتظار دیدن آن‌ها را دارد، رفع از راه **صفحهٔ مدیریت شرایط پرداخت** است، نه کد.
2. **۵ نوع `sort_order = 100` مشترک دارند** ⇒ ترتیب نمایش بین آن‌ها **قطعی نیست** و بین بارگذاری‌ها می‌تواند جابه‌جا شود. اگر ترتیب ثابت مهم است، باید `sort_order` یکتا شود (تغییر داده، نه کد).

---

## A5 — نیازمندی ۲۰۱ + ۲۰۲: تفکیک صدور از قطعی‌کردن

### حکم: ✅✅ **هر دو نیازمندی از قبل و دقیقاً همان‌طور که خواسته شده کار می‌کنند** — تناقض تحقیق قبلی حل شد

### حل تناقض

تحقیق قبلی (تست ۱۱) دیده بود «دکمهٔ تأیید وقتی موجودی کافی نیست غیرفعال می‌شود» و کاربر گفته بود «اجازه می‌دهد». **هر دو درست بودند، چون دربارهٔ دو مرحلهٔ متفاوت حرف می‌زدند:**

- «غیرفعال شدن» مربوط به **قطعی‌کردن (accepted)** است ⇒ همان چیزی که نیازمندی ۲۰۲ می‌خواهد.
- «اجازه می‌دهد» مربوط به **صدور (draft)** است ⇒ همان چیزی که نیازمندی ۲۰۱ می‌خواهد.

### شواهد — مسیر ۱: صدور (۲۰۱ ✅)

**بک‌اند:** `create_sales_quote_with_items` تابع کامل خوانده شد — **هیچ ارجاعی به موجودی، انبار یا `stock_status` ندارد**. صدور برای هر کالایی مجاز است.

**فرانت:** `quotes.new.tsx:263-290` — تنها یک گارد **نرم**:
```ts
const handleSubmit = async () => {
  if (!stockConfirmed) {
    // ... products با stock_status === "unavailable" را پیدا کن
    if (unavailable.length > 0) {
      toast.warning(`کالای ناموجود: ... . اگر عمداً (مثلاً کالای در راه) ثبت
        می‌کنید، دوباره «ثبت پیش‌فاکتور» را بزنید.`);
      setStockConfirmed(true);
      return;             // ← فقط یک بار متوقف می‌کند
    }
  }
  saveMutation.mutate();  // ← کلیک دوم بدون قید عبور می‌کند
};
```
کامنت کد: `J-4: soft out-of-stock guard — warn once, then allow an explicit re-click`.

### شواهد — مسیر ۲: قطعی‌کردن (۲۰۲ ✅ — دو لایه)

**لایهٔ UI:** `_app.sales.quotes.$quoteId.tsx:585`
```tsx
<AlertDialogAction disabled={isAccepting && shortages.length > 0}>
```
با نمایش دقیق کسری (خطوط ۵۶۶-۵۷۷): «موجودی کافی نیست — قطعی‌کردن انجام نمی‌شود:» به‌همراه `نیاز X / موجود Y` برای هر کالا. منبع: RPC `check_quote_stock_availability`.

**لایهٔ DB (گارد واقعی):** تریگر `trg_sales_quotes_stock_out` روی `sales_quotes` ← تابع `trg_sales_quote_stock_out` ← `apply_stock_movement(..., 'out', ...)`:
```sql
-- ۱۷۵ — کسر بیش از موجودی مجاز نیست، با پیام فارسی روشن.
IF _current + _delta < 0 THEN
  RAISE EXCEPTION
    'موجودی کافی نیست: «%» در انبار «%» فقط % عدد موجود دارد و درخواست % عدد است.',
    ... USING ERRCODE = '23514';
END IF;
```
با `SELECT ... FOR UPDATE` روی `warehouse_stock` ⇒ ضد race condition.

پس حتی اگر کسی UI را دور بزند، DB جلویش را می‌گیرد. **این دقیقاً معماری درستی است که نیازمندی می‌خواهد.**

### 🚨 هشدار عملیاتی جدی (نه باگ کد، ولی باید دیده شود)

```
warehouse_count = 3   (ایران ری [پیش‌فرض], انبارتست2, انبار تست)
warehouse_stock rows = 4
```

تریگر کسر موجودی **فعال است** (چون انبار تعریف شده و `_wh IS NOT NULL`). ولی جدول `warehouse_stock` تقریباً خالی است. در `apply_stock_movement`:
```sql
INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
VALUES (_warehouse_id, _product_id, 0) ON CONFLICT DO NOTHING;
```
هر محصولی که ردیف موجودی ندارد، با `quantity = 0` ساخته می‌شود ⇒ هر کسری `< 0` ⇒ **خطا**.

**نتیجهٔ عملی: قطعی‌کردن تقریباً هر پیش‌فاکتوری امروز شکست می‌خورد**، حتی برای کالایی که `products.stock_status = 'available'` دارد. دقت کنید که `products.stock_status` (که فرم صدور می‌خواند) و `warehouse_stock.quantity` (که تریگر می‌خواند) **دو منبع داده کاملاً جدا** هستند و همگام نیستند.

این رفع کد نمی‌خواهد؛ **پر کردن موجودی انبارها** می‌خواهد. ولی اگر کاربر بگوید «قطعی‌کردن اصلاً کار نمی‌کند»، ریشه همین است نه یک باگ منطقی.

### چه چیزی برای رفع لازم است
**برای ۲۰۱ و ۲۰۲: هیچ تغییر کدی لازم نیست.** فقط:
- پر کردن `warehouse_stock` برای محصولات فعال (کار داده‌ای/عملیاتی).
- (اختیاری) همگام‌سازی `products.stock_status` با مجموع `warehouse_stock` تا هشدار فرم صدور با واقعیت انبار بخواند. تابع `sync_product_stock_status` از قبل در `apply_stock_movement` صدا زده می‌شود، ولی فقط برای محصولاتی که حرکت انبار داشته‌اند.

---

# گروه B — ویزیتور، حروف، PDF

## B1 — ویزیتور

### حکم: ❌ کاملاً وجود ندارد

### روش جستجو و نتیجه

| جستجو | دامنه | نتیجه |
|---|---|---|
| `grep -rni "visitor\|ویزیتور" src/ --include=*.ts --include=*.tsx` | کل کد فرانت | **۰ نتیجه** |
| `table_name ILIKE '%visitor%'` | `information_schema.tables` | **۰ ردیف** |
| `column_name ILIKE '%visitor%'` | `information_schema.columns` | **۰ ردیف** |
| ۲۳ ستون کامل `sales_quotes` | schema | هیچ ستون ویزیتور |

هیچ ابهامی نیست: مفهوم ویزیتور در هیچ لایه‌ای از سیستم وجود ندارد. تنها مفهوم مرتبط، `salesperson_id` روی `sales_quotes` است که تریگر `sales_quotes_assign_number` آن را با `auth.uid()` پر می‌کند — یعنی «فروشندهٔ صادرکننده»، که کاربر صریحاً گفته با ویزیتور فرق دارد.

### دقیقاً چه چیزی برای ساخت لازم است

| # | مورد | جزئیات |
|---|---|---|
| ۱ | جدول `public.visitors` | `id uuid PK`, `full_name text NOT NULL`, `code text UNIQUE`, `phone text`, `is_active boolean NOT NULL DEFAULT true`, `sort_order int`, `notes text`, `created_at/updated_at`, `created_by uuid` |
| ۲ | RLS روی `visitors` | خواندن: `admin, manager, sales` — نوشتن: `admin, manager` (الگو: سیاست‌های `settlement_types`) |
| ۳ | ستون `visitor_id uuid REFERENCES public.visitors(id)` روی `sales_quotes` | nullable (پیش‌فاکتورهای موجود ویزیتور ندارند) |
| ۴ | پارامتر `p_visitor_id uuid DEFAULT NULL` + اعتبارسنجی فعال بودن + نوشتن در INSERT | `create_sales_quote_with_items` |
| ۵ | صفحهٔ CRUD | مسیر جدید `_app.admin.visitors.tsx` — الگوی کامل: `_app.admin.payment-terms.tsx` |
| ۶ | ورودی در registry ناوبری | `src/lib/navigation/registry.ts` — گروه مناسب + `module` |
| ۷ | `<Select>` ویزیتور در فرم صدور | `quotes.new.tsx` — کپی دقیق الگوی «نوع تسویه» (خطوط ۹۷-۱۰۹ برای کوئری، ۳۹۵-۴۱۹ برای UI) |
| ۸ | نمایش ویزیتور در صفحهٔ جزئیات + PDF + لیست | `$quoteId.tsx`, `quote-pdf.ts`, `quotes.index.tsx` |

### ریسک
- تصمیم لازم: ویزیتور اجباری است یا اختیاری؟ اگر اجباری شود، ۲۲ پیش‌فاکتور موجود `visitor_id IS NULL` خواهند داشت ⇒ نباید `NOT NULL` گذاشت.
- rebuild فرانت لازم است (نوع‌های تولیدشدهٔ Supabase در `src/integrations/supabase/types.ts` باید بازتولید شوند).

---

## B2 — شرح مبلغ به حروف فارسی

### حکم: ❌ کاملاً وجود ندارد

### روش جستجو

```
grep -rni "به حروف|numberToWords|toWords|spellout|numToWord|numberToPersianWords|wordify"
  src/ --include=*.ts --include=*.tsx
```
تنها نتایج: `snapToWordStart` در `src/lib/knowledge/chunking.ts:130,193` — کاملاً بی‌ربط (شکستن متن برای chunking).

بررسی `src/lib/i18n/formatters.ts` هم انجام شد: توابع موجود `formatNumber`, `toFaDigits`, `formatDateFa`, `formatDateTimeFa` — هیچ‌کدام عدد را به حروف تبدیل نمی‌کنند.

هیچ الگوی داخلی برای تقلید وجود ندارد.

### دقیقاً چه چیزی برای ساخت لازم است

| # | مورد | جزئیات |
|---|---|---|
| ۱ | ماژول جدید `src/lib/i18n/number-to-words.ts` | تابع `numberToPersianWords(n: number): string` — پوشش یکان/دهگان/صدگان، هزار، میلیون، میلیارد؛ صفر؛ منفی؛ اعشار (برای تومان لازم نیست) |
| ۲ | تست واحد | مقادیر مرزی: ۰، ۱۰، ۱۱-۱۹، ۱۰۰، ۱۰۰۰، ۱۰۰۱، ۱۰۰۰۰۰۰، اعداد ۱۲ رقمی (سقف فرم فیش `1e12` است) |
| ۳ | نمایش در صفحهٔ جزئیات پیش‌فاکتور، زیر «مبلغ نهایی» | `$quoteId.tsx:228-234` |
| ۴ | نمایش در PDF، زیر ردیف «مبلغ نهایی قابل پرداخت» | `quote-pdf.ts:258-262` |
| ۵ | (پیشنهادی) نمایش در فرم صدور، زیر جمع نهایی | `quotes.new.tsx:554-557` |

### ریسک
- **وابستگی به B3:** اگر PDF قرار است متن حروف را نشان دهد، اول باید باگ PDF رفع شود (بخش بعد) — و اگر رفع از راه HTML+print باشد، محل درج متفاوت خواهد بود.
- کتابخانه‌های خارجی مثل `num2persian` وجود دارند، ولی این پروژه self-host است؛ یک تابع ~۶۰ خطی داخلی ساده‌تر و بی‌ریسک‌تر است.
- توجه: قالب PDF فعلی عمداً ارقام پول را **انگلیسی** نگه می‌دارد (`formatMoneyPdf`, کامنت `quote-pdf.ts:37-39`) — متن حروف فارسی باید در یک بلوک جدا باشد تا مشکل BiDi ایجاد نکند.

---

## B3 — 🐞 PDF پیش‌فاکتور

### حکم: 🐞 خراب — **سه ایراد زنجیره‌ای**، که ایراد سوم علت «هیچ اتفاقی نمی‌افتد» است

### زنجیرهٔ کد تا نقطهٔ شکست

`$quoteId.tsx:505` (دکمهٔ «دانلود PDF») → `handleDownloadPdf` (خط ۴۲۱) → `downloadQuotePdf` (`src/lib/sales/quote-pdf.ts:131`) → `loadPdfMake()` (خط ۹۲) → `pdfMake.createPdf(...).download(...)` (خط ۳۳۱).

### 🔴 ایراد ۱ (کشنده) — `pdfMake.vfs = {...}` در pdfmake 0.3 یک no-op است

`quote-pdf.ts:113-117`:
```ts
pdfMake.vfs = {
  ...(pdfMake.vfs ?? {}),
  "Vazirmatn-Regular.ttf": reg,
  "Vazirmatn-Bold.ttf": bold,
};
```

این API مربوط به **pdfmake 0.2.x** است. در 0.3.x کلاس پایه اصلاً خاصیتی به نام `vfs` نمی‌خواند:

`node_modules/pdfmake/src/base.js`:
```js
constructor() {
  this.virtualfs = virtualfs;     // ← نام واقعی: virtualfs
  ...
}
createPdf(docDefinition, options = {}) {
  ...
  let printer = new Printer(this.fonts, this.virtualfs, urlResolver);
```

تنها راه ثبت فایل در 0.3.x:

`node_modules/pdfmake/src/browser-extensions/index.js`:
```js
addVirtualFileSystem(vfs) {
  for (let key in vfs) { ... fs.writeFileSync(key, data, encoding); }
}
```

پس `pdfMake.vfs = {...}` فقط یک خاصیت مرده روی آبجکت می‌سازد و فونت هرگز وارد فایل‌سیستم مجازی نمی‌شود.

خطای دقیقی که رخ می‌دهد، از `node_modules/pdfmake/src/virtual-fs.js`:
```
Error: File 'Vazirmatn-Regular.ttf' not found in virtual file system
```

**نکته:** `pdfMake.fonts = {...}` (خط ۱۱۸) **درست** است — `this.fonts` واقعاً وجود دارد. فقط `vfs` غلط است. یعنی pdfmake نام فونت را می‌شناسد ولی بایت‌هایش را ندارد.

### 🔴 ایراد ۲ (چرا هیچ پیامی دیده نمی‌شود) — Promise رها شده

`quote-pdf.ts:331`:
```ts
pdfMake.createPdf(docDefinition).download(`quote-${payload.quote_number}.pdf`);
```
**بدون `await`.** و در 0.3.x:

`node_modules/pdfmake/src/browser-extensions/OutputDocumentBrowser.js`:
```js
async download(filename = 'file.pdf') {     // ← async
  const blob = await this.getBlob();
  saveAs(blob, filename);
}
```

و `Printer.createPdfKitDocument` هم `async` است. پس خطای ایراد ۱ داخل یک Promise رخ می‌دهد که کسی `await` نمی‌کند ⇒ **unhandled rejection**. بلوک `try/catch` در `handleDownloadPdf` (`$quoteId.tsx:454`) هرگز آن را نمی‌بیند، `toast.error("خطا در ساخت PDF پیش‌فاکتور")` اجرا نمی‌شود، `finally` بلافاصله `setPdfLoading(false)` می‌کند.

**تجربهٔ کاربر: دکمه را می‌زند، اسپینر یک لحظه می‌آید و می‌رود، هیچ فایلی دانلود نمی‌شود، هیچ خطایی نشان داده نمی‌شود.** دقیقاً همان ماسک شدن خطا که در بریف هشدار داده شده بود.

تایپ اشتباه که این را پنهان کرده، `quote-pdf.ts:103`:
```ts
createPdf: (def: unknown) => { download: (filename: string) => void };
//                                                          ^^^^ در واقع Promise<void>
```

### 🟠 ایراد ۳ (حتی بعد از رفع ۱ و ۲ باقی می‌ماند) — pdfmake فارسی را درست رندر نمی‌کند

این را **خود پروژه قبلاً کشف و مستند کرده**. `src/lib/pdf/sale-list-pdf.ts:3-17`:

```
 * History: previous attempts used pdfmake + arabic-persian-reshaper + bidi-js
 * to render Persian text in PDF directly. pdfmake's text engine does NOT
 * implement Arabic/Persian shaping or the Unicode Bidi algorithm correctly,
 * which led to disconnected letters and reversed words.
 *
 * To stop chasing that engine, we now render the document as a self-contained
 * RTL HTML page (with the locally-hosted Vazirmatn font) ...
```

یعنی مسیر PDF **فهرست فروش** از pdfmake کوچ کرده به HTML + `html2canvas-pro` + `jsPDF` (`sale-list-pdf.ts:637-720`)، ولی مسیر PDF **پیش‌فاکتور** جا مانده و هنوز روی pdfmake است.

### چه چیزی *خراب نیست* (تا وقت تلف نشود)

| بررسی | نتیجه |
|---|---|
| فایل فونت روی دیسک | ✅ `public/fonts/vazirmatn/Vazirmatn-{Regular,Bold}.ttf` |
| فونت داخل کانتینر | ✅ `/app/.output/public/fonts/vazirmatn/` |
| سرو شدن با HTTP | ✅ `http=200, size=122752, type=font/ttf` (تست شد روی `localhost:3100`) |
| نصب بودن pdfmake | ✅ `0.3.7` در `node_modules` و در کانتینر |
| handler دکمه | ✅ کامل و درست |
| ساخت docDefinition | ✅ کامل (جدول، جمع‌ها، فوتر، استایل‌ها) |

### منشأ زمانی باگ — اثبات

```
$ git log -S'"pdfmake": "^0.3.7"' -- package.json
b8688653 2026-04-27 Changes

$ git log -p --follow -- package.json | grep '^[+-].*"pdfmake"'
-    "pdfmake": "0.2.10",
+    "pdfmake": "^0.3.7",
```

**کامیت `b8688653` (۲۰۲۶-۰۴-۲۷)** نسخهٔ pdfmake را از `0.2.10` به `^0.3.7` برد. کد `quote-pdf.ts` برای API نسخهٔ ۰.۲ نوشته شده بود و به‌روزرسانی نشد. تا آن کامیت PDF کار می‌کرده است.

### دقیقاً چه چیزی برای رفع لازم است

**گزینهٔ الف — حداقلی (فقط pdfmake را درست کن؛ ایراد ۳ باقی می‌ماند):**

| # | تغییر | خط |
|---|---|---|
| ۱ | `pdfMake.vfs = {...}` → `pdfMake.addVirtualFileSystem({ "Vazirmatn-Regular.ttf": reg, "Vazirmatn-Bold.ttf": bold })` | `quote-pdf.ts:113-117` |
| ۲ | `pdfMake.fonts = {...}` → `pdfMake.addFonts({ Vazirmatn: {...} })` (یا نگه داشتن انتساب مستقیم — هر دو کار می‌کند) | `quote-pdf.ts:118-125` |
| ۳ | `await pdfMake.createPdf(...).download(...)` | `quote-pdf.ts:331` |
| ۴ | اصلاح تایپ: `createPdf: (def: unknown) => { download: (f: string) => Promise<void> }` و افزودن `addVirtualFileSystem` / `addFonts` به `PdfMakeRuntime` | `quote-pdf.ts:97-104` |

⚠️ با گزینهٔ الف فایل PDF **ساخته می‌شود** ولی حروف فارسی احتمالاً جدا و کلمات برعکس خواهند بود — طبق تجربهٔ مستندشدهٔ خود پروژه.

**گزینهٔ ب — توصیه‌شده: هم‌راستا کردن با مسیری که ثابت شده کار می‌کند**

بازنویسی `quote-pdf.ts` بر اساس معماری `sale-list-pdf.ts`:
- ساخت HTML خودکفا با `dir="rtl"` و `@font-face` از `/fonts/vazirmatn/*.woff2`
- رندر در iframe مخفی → `html2canvas-pro` → برش به صفحات A4 → `jsPDF`
- الگوی کامل و آمادهٔ کپی: `sale-list-pdf.ts:637-720`
- هر دو کتابخانه از قبل نصب‌اند (`html2canvas-pro`, `jspdf ^4.2.1`)
- مزیت جانبی: `previewSaleListPdf` نشان می‌دهد که می‌توان پیش‌نمایش هم داد

### ریسک
- گزینهٔ ب حجم بیشتری دارد ولی تنها راهی است که «سالم و قطعی» بودن مورد نظر کاربر را تضمین می‌کند.
- در هر دو گزینه: rebuild لازم است.
- `_app.sales.quotes.index.tsx:613` هم `downloadQuotePdf` را صدا می‌زند — رفع هر دو مسیر را با هم درست می‌کند (نیازی به تغییر جدا نیست).
- در پروژه هیچ مسیر PDF **فاکتور** سالمی برای مقایسه وجود ندارد (ماژول `invoices` مرده است). تنها مسیر PDF زندهٔ سالم، PDF فهرست فروش است.

---

# گروه C — باگ‌های فیش و صراف

## C1 — 🐞 نیازمندی ۲۰۵: خطای ثبت فیش + پیام `????`

### حکم: 🐞 **دو مشکل کاملاً جدا** — دقیقاً همان الگوی «یک خطا خطای دیگر را ماسک می‌کند»

---

### مشکل (ب) — چرا پیام `????` است؟ **[قطعی، با شواهد کامل]**

#### ۴۳ تابع در دیتابیس، متن فارسی‌شان به `?` تبدیل شده

```sql
SELECT count(*) FILTER (WHERE prosrc ~ '\?\?\?') AS corrupted, count(*) AS total_plpgsql
  FROM pg_proc ... WHERE prolang = plpgsql;
```
```
corrupted | total_plpgsql
43        | 363
```

نمونه‌های عینی از `pg_proc.prosrc`:

| تابع | متن داخل DB |
|---|---|
| `post_receipt_accounting` | `RAISE EXCEPTION '?????? ???????? ??????'` |
| `hold_credit` | `RAISE EXCEPTION '???????? ???????? ???????????? ???? ?????? ????????'` |
| `get_customer_credit` | `RAISE EXCEPTION '???????????? ??????????????'` |
| `_validate_allocation_amounts` | `'held_amount(%) + consumed_amount(%) ???? final_amount(%) ??????????'` |

**الگوی تبدیل: به‌ازای هر کاراکتر فارسی، دقیقاً ۲ کاراکتر `?`** — یعنی هر **بایت** UTF-8 مستقل به `?` تبدیل شده. این امضای کلاسیک اجرای فایل UTF-8 با `client_encoding` غیر UTF-8 است.

#### اثبات اینکه متن اصلی در سورس سالم است (یعنی خرابی هنگام اجرا رخ داده)

```
$ grep -n "RAISE EXCEPTION" supabase/migrations/20260626083725_...sql
19:    RAISE EXCEPTION 'دسترسی غیرمجاز';
```
همین تابع در دیتابیس: `RAISE EXCEPTION '???????????? ??????????????'`

⇒ **سورس سالم، دیتابیس خراب.** خرابی در لحظهٔ apply رخ داده است.

#### دو مسیر مستقل خرابی

**مسیر ۱ — خرابی هنگام اجرا (اکثریت ۴۳ تابع):** فایل migration در گیت UTF-8 سالم است، ولی از کانالی اجرا شده که encoding را از دست داده. رفع: اجرای مجدد همان migrationهای سالم با `SET client_encoding='UTF8'`.

**مسیر ۲ — خرابی در خود فایل سورس (کمتر، ولی بدتر):** فقط ۴ فایل migration حاوی `???` هستند:

| فایل | نوع فایل | تشخیص |
|---|---|---|
| `20260722235000_143_remove_corrupted_seeded_knowledge_documents.sql` | — | **عمدی** (کارش پاک کردن اسناد خراب است) |
| `20260726200000_214_fix_payment_terms_encoding.sql` | — | **عمدی** (رفع همان باگ) |
| `20260724090000_149_repair_receipt_posting_model_b.sql` | **ASCII text** | 🔴 **خراب در سورس** |
| `20260724150000_155_bank_accounting_code.sql` | UTF-8 (ولی حاوی متن `?`) | 🔴 **خراب در سورس** (کپی از ۱۴۹) |

فایل ۱۴۹ توسط `file(1)` **ASCII** تشخیص داده می‌شود — یعنی هیچ بایت فارسی در آن نمانده. متن اصلی از این فایل **از بین رفته** و باید بازسازی شود (منبع قابل استفاده: `20260502082111_ff7e5e06-...sql` که همان تابع را با فارسی سالم دارد).

#### تأیید نهایی — خود کد این خرابی را می‌شناسد و تاریخش را می‌داند

کامنت داخل `post_receipt_accounting` (بازیابی‌شده از `pg_get_functiondef`):
```
-- The generic receiver_accounting_code check further down would also stop
-- this, but only while that validation_rule stays enabled, and its stored
-- message is one of the strings corrupted on 2026-07-11, so it cannot tell
-- the accountant what to actually do.
```

و در `src/lib/knowledge/rag.functions.ts:88-90`:
```
// Runs of `?` are the known Persian-corruption pattern in this database.
```

**تاریخ خرابی: ۲۰۲۶-۰۷-۱۱.**

#### مسیر دقیق رسیدن این پیام به چشم کاربر

`_app.accounting.receipts.$receiptId.tsx:332-342`:
```ts
const { data: postResult, error: rpcErr } = await supabase.rpc("post_receipt_accounting", {...});
if (rpcErr) {
  await supabase.from("payment_receipts").update({ status: "pending_review" }).eq("id", receipt.id);
  throw new Error(rpcErr.message || "خطا در ثبت سند حسابداری فیش");
}
```
→ خط ۳۸۱: `toast.error(\`تأیید فیش ناموفق بود: ${msg}\`)`

⇒ کاربر می‌بیند: **«تأیید فیش ناموفق بود: ?????? ???????? ??????»**

---

### مشکل (الف) — چرا ثبت شکست می‌خورد؟

اینجا باید بین دو مرحله تفکیک کرد. **مرحلهٔ INSERT و مرحلهٔ تأیید/ثبت‌حسابداری ریشه‌های متفاوتی دارند.**

#### در مرحلهٔ INSERT (فرم فیش، دکمهٔ ثبت)

`PaymentReceiptForm.tsx:502-511` **هر دو دامنه** را بارگذاری می‌کند:
```ts
fetchValidationRules("receipt")        // ← منطقی
fetchValidationRules("journal_entry")  // ← دامنهٔ سند حسابداری
```
و در خط ۱۰۸۰ آن‌ها را **یکی می‌کند**:
```ts
const allRules = [...receiptRules, ...journalRules];
const violations = evaluateRules(allRules, fieldValues, validCodes);
const { blocking, warnings: ruleWarnings } = splitViolations(violations);
if (blocking.length > 0) { setBlockingViolations(blocking); setBlockingOpen(true); return; }
```

محتوای جدول `validation_rules`:

| scope | field_key | rule_type | severity | enabled |
|---|---|---|---|---|
| `journal_entry` | `payer_accounting_code` | required | **blocking** | ✅ |
| `journal_entry` | `receiver_accounting_code` | required | **blocking** | ✅ |
| `receipt` | `payer_accounting_code` | accounting_code_valid | warning | ✅ |
| `receipt` | `receiver_accounting_code` | accounting_code_valid | warning | ✅ |
| `receipt` | `receiver_name` | required | warning | ✅ |

⇒ **دو قانون blocking، هر دو از دامنهٔ `journal_entry`، بدون هیچ قیدی، جلوی ثبت فیش را می‌گیرند** اگر کد حسابداری پرداخت‌کننده یا گیرنده خالی باشد.

⚠️ **مهم: پیام این دو قانون در دیتابیس سالم است** (`octet_length ≈ 2 × char_length`):
> «کد حسابداری گیرنده وجه الزامی است. لطفاً حساب بانکی خودتان را انتخاب کنید یا یک طرف حساب دارای کد حسابداری تعیین کنید.»

⇒ **این مسیر پیام `????` نمی‌دهد.** پس شکست INSERT و پیام `????` دو رویداد متفاوت‌اند.

#### بررسی سایر گاردهای مسیر INSERT (همه سالم)

| گارد | وضعیت |
|---|---|
| ۱۲ constraint روی `payment_receipts` | همه انگلیسی/ساختاری — بدون فارسی |
| RLS `pr_insert_admin_accountant` | `has_any_role(uid(),['admin','accountant']) AND created_by = uid()` — بدون پیام |
| تریگرهای INSERT (`trg_post_receipt_on_approve`, `recompute_employee_scores_on_receipt`) | متن فارسی‌شان **سالم** است (بررسی شد) |
| `enforce_payment_receipt_link_limits` (روی `payment_receipt_links`) | فارسی **سالم** |
| ۳۹ ستون `payment_receipts` مقابل payload فرم | همه موجود، شامل `security_warnings`, `custom_data`, `beneficiary_accounting_code`, `cheque_*` |

#### محدودیت این تشخیص — صادقانه

لاگ Postgres برای ۱۶۸ ساعت گذشته بررسی شد: **هیچ خطای مرتبط با receipt/payment ثبت نشده است**. یعنی در این بازه تلاش ناموفق ثبت فیشی رخ نداده. پس نمی‌توانم لحظهٔ دقیق خطای کاربر را بازسازی کنم.

**نتیجه‌گیری با درجهٔ اطمینان:**
- پیام `????` ← **قطعی**: از توابع خراب DB می‌آید، و محتمل‌ترین نقطهٔ تماس، دکمهٔ **تأیید فیش** (`post_receipt_accounting`) است، نه دکمهٔ ثبت.
- شکست ثبت ← **بسیار محتمل**: دو قانون blocking دامنهٔ `journal_entry` (که دقیقاً همان چیزی است که نیازمندی ۲۰۷ شکایتش را دارد).
- **برای قطعیت کامل ۱۰۰٪ لازم است:** یک بار تلاش ثبت فیش با نظارت هم‌زمان بر `docker logs afrakala-lan-db` انجام شود. این کار **نوشتن** است و در دامنهٔ این تحقیق فقط‌خواندنی نبود.

### دقیقاً چه چیزی برای رفع لازم است

**بخش (ب) — بازسازی متن‌های خراب:**

| # | کار | جزئیات |
|---|---|---|
| ۱ | فهرست کامل ۴۳ تابع خراب | `SELECT proname FROM pg_proc ... WHERE prosrc ~ '\?\?\?'` |
| ۲ | برای هر تابع، یافتن آخرین migration سالم در گیت | `grep -l "FUNCTION public.<name>(" supabase/migrations/*.sql` |
| ۳ | **بازسازی دستی** متن ۱۴۹ و ۱۵۵ (سورس‌شان از بین رفته) | منبع کمکی: `20260502082111_ff7e5e06-...sql` |
| ۴ | migration واحد ترمیمی که همهٔ ۴۳ تابع را با متن سالم `CREATE OR REPLACE` کند | فایل جدید |
| ۵ | **اجرا حتماً با `SET client_encoding='UTF8'` و `--single-transaction`** | وگرنه دقیقاً همین باگ تکرار می‌شود |
| ۶ | تست پس از اجرا: `SELECT count(*) FROM pg_proc WHERE prosrc ~ '\?\?\?'` باید ۰ شود | — |
| ۷ | (پیشگیری) افزودن یک گارد CI که هر migration را برای الگوی `???` بررسی کند | — |

**بخش (الف) — رفع شکست ثبت:** با نیازمندی ۲۰۷ یکی است ⇒ بخش بعد.

### ریسک
- بند ۳ خطرناک‌ترین قسمت است: متن اصلی از بین رفته و بازسازی، بازنویسی است نه بازیابی. باید متن‌ها با کاربر تأیید شود.
- 🔴 **رفع خرابی متن، شکست ثبت فیش را رفع نمی‌کند** — فقط پیام خطا را خوانا می‌کند. این دو باید جدا رفع شوند.

---

## C2 — نیازمندی ۲۰۷: کد آسان گیرنده در حالت ۲ نباید اجباری باشد

### حکم: 🐞 اجباری است — و بدتر از آنچه کاربر گفته: **بدون هیچ قیدی، در هر دو حالت**

### شواهد چهارلایه

**۱) UI — دو حالت واقعاً وجود دارند**

`PaymentReceiptForm.tsx:1514-1517` — «حالت ۱: حساب بانکی خودِ ما» → `<Select>` روی `destination_bank_account_id`
`PaymentReceiptForm.tsx:1552-1555` — «حالت ۲: شخص/طرف حساب خارجی» → `<Select>` روی `receiver_party_id`

انتخاب هرکدام، دیگری را `disabled` و خالی می‌کند (خطوط ۱۵۲۰، ۱۵۲۷، ۱۵۵۸، ۱۵۶۵).

فیلد «کد حسابداری» گیرنده در خط ۱۶۱۱-۱۶۱۹ — **یک فیلد مشترک، بدون هیچ شرطی روی حالت**.

**۲) اجبار از zod نمی‌آید**

`PaymentReceiptForm.tsx:206`:
```ts
receiver_accounting_code: z.string().trim().max(50).optional().or(z.literal("")),
```
**اختیاری.** تنها `.refine` مرتبط با گیرنده (خط ۲۴۷-۲۵۰) فقط XOR بین دو حالت را اجبار می‌کند:
> «گیرنده باید دقیقاً یکی باشد: «بانک ما» یا «طرف خارجی» (نه هر دو، نه هیچ‌کدام).»

**۳) اجبار از دیتابیس نمی‌آید (constraint)**

`payment_receipts.receiver_accounting_code` ⇒ `text | is_nullable = YES`. هیچ CHECK constraint مرتبطی وجود ندارد (۱۲ constraint کامل بررسی شد).

**۴) 🎯 اجبار از جدول `validation_rules` می‌آید**

```
id       | f81e86fa-d93e-479e-b468-a3f5604ff52c
scope    | journal_entry
field_key| receiver_accounting_code
rule_type| required
severity | blocking      ← 
enabled  | t             ← 
message  | کد حسابداری گیرنده وجه الزامی است. لطفاً حساب بانکی خودتان را انتخاب کنید
           یا یک طرف حساب دارای کد حسابداری تعیین کنید.
```

موتور ارزیابی — `src/lib/validation/rules.ts:41-46`:
```ts
if (r.rule_type === "required") {
  if (v === undefined || v === null || v === "") { out.push({ rule: r }); }
}
```
**هیچ آگاهی از حالت ۱/۲ ندارد.** فقط خالی بودن رشته را می‌بیند.

و در فرم (خط ۱۰۷۹-۱۰۹۳) دامنهٔ `journal_entry` با دامنهٔ `receipt` **ادغام** می‌شود ⇒ قانونی که برای «سند حسابداری» نوشته شده، در «ثبت فیش» بلاک می‌کند.

### چرا برای صراف مشکل‌ساز است

سناریوی کاربر: حالت ۲ + طرف خارجی صراف. اگر آن `external_parties` رکورد `accounting_code = NULL` داشته باشد، خط ۱۵۷۱-۱۵۷۴ فیلد را پر نمی‌کند ⇒ خالی می‌ماند ⇒ قانون blocking ⇒ ثبت متوقف.

مضاعف: قانون خواهر `payer_accounting_code | journal_entry | required | blocking` هم فعال است — اگر مشتری انتخاب‌شده کد حسابداری نداشته باشد، ثبت به همان شکل بلاک می‌شود.

### دقیقاً کجا باید عوض شود

سه گزینه، به ترتیب توصیه:

| گزینه | تغییر | مزیت | عیب |
|---|---|---|---|
| **الف (توصیه‌شده)** | در `PaymentReceiptForm.tsx:1080`، قوانین `journal_entry` را برای فیلدهای مربوط به گیرنده **فقط وقتی حالت ۱ فعال است** اعمال کن: قبل از `evaluateRules`، اگر `v.receiver_party_id` مقدار دارد، قانون `receiver_accounting_code` را از `allRules` فیلتر کن | حالت ۱ دست‌نخورده می‌ماند؛ بدون migration؛ گارد سرور (`post_receipt_accounting`) سر جایش | فقط فرانت |
| **ب** | ستون جدید `applies_when jsonb` روی `validation_rules` + پشتیبانی شرط در `evaluateRules` | راه‌حل عمومی و قابل تنظیم توسط ادمین | migration + تغییر UI مدیریت قوانین |
| **ج** | خاموش کردن ردیف `f81e86fa…` (`enabled = false`) | یک UPDATE | ❌ **حالت ۱ را هم بی‌گارد می‌کند** — توصیه نمی‌شود |

**نکتهٔ مهم دربارهٔ گارد سمت سرور:** `post_receipt_accounting` یک گارد مستقل و **غیرقابل خاموش‌کردن** برای حالت ۱ دارد (کامنت داخل تابع صریحاً می‌گوید چرا) که کد حسابداری حساب بانکی را از `bank_accounts.accounting_code` می‌خواند. پس آسان‌گیری در فرم برای حالت ۲، ثبت سند حسابداری را ناامن نمی‌کند — به شرطی که قانون `journal_entry` در همان تابع هم برای حالت ۲ بازبینی شود.

### ریسک
- تغییر فقط باید روی **حالت ۲** اثر بگذارد. حالت ۱ (حساب بانکی خودمان) باید کد حسابداری اجباری بماند.
- rebuild فرانت لازم است (گزینهٔ الف).
- ⚠️ پیام‌های خطای `post_receipt_accounting` خراب‌اند (بخش C1) — اگر ثبت در حالت ۲ بعداً در مرحلهٔ سند حسابداری بلاک شود، کاربر باز هم `????` می‌بیند. پس **C1 و C2 باید با هم رفع شوند.**

---

# گروه D — هوش مصنوعی

## D1 — 🐞 نیازمندی ۲۰۸: AI در چت و دانش سازمانی خالی برمی‌گرداند

### حکم قطعی: 🐞 **باگ پیکربندی/داده — نه سرویس، نه معماری کد**. **دو ریشهٔ کاملاً جدا برای دو بخش.**

### وضعیت زیرساخت — سرویس سالم است ✅

| بررسی | نتیجه |
|---|---|
| کانتینر Ollama در `docker ps` | ❌ نیست — Ollama روی **خود ویندوز** اجرا می‌شود، نه در داکر |
| دسترسی از هاست | ✅ `http://192.168.170.8:11434/api/tags` → **HTTP 200 در ۴ میلی‌ثانیه** |
| دسترسی **از داخل کانتینر وب** | ✅ تست با `docker exec afrakala-lan-web node -e "fetch(...)"` → موفق |
| مدل‌های بارگذاری‌شده | ✅ `qwen2.5:14b`, `qwen2.5:7b`, **`bge-m3:latest`**, `qwen3.6:latest` |

**⇒ فرضیهٔ «سرویس خاموش است» رد شد. Ollama بالا، در دسترس از کانتینر، و مدل‌های لازم (چت + embedding) بارگذاری شده‌اند.**

### پیکربندی ارائه‌دهندگان

```
id           | name      | kind              | base_url                      | priority | capabilities
dd834459-... | جی پی تی  | openai_compatible | https://platform.openai.com/  | 8        | {chat}
d30816a9-... | ollama    | ollama            | http://192.168.170.8:11434    | 10       | {chat,embeddings}
```

`src/lib/ai/client.server.ts:91` — `.order("priority", { ascending: true })` ⇒ **عدد کمتر = اولویت بالاتر** ⇒ «جی پی تی» **قبل از** Ollama امتحان می‌شود.

🔴 **`base_url` ارائه‌دهندهٔ OpenAI غلط است:** `https://platform.openai.com/` سایت داشبورد است، نه API. آدرس صحیح `https://api.openai.com/v1` است. ضمناً `chat_model` آن **خالی** است.

---

### ریشهٔ ۱ — چت پیام‌رسان: ارائه‌دهندهٔ اشتباه انتخاب و بدون failover رد می‌شود

`src/routes/api/messenger/ai-chat.ts:167-200`:
```ts
// Ollama speaks /api/chat; an OpenAI-compatible gateway speaks
// /chat/completions. Only the former streams in this route's NDJSON
// shape, so a non-Ollama provider is rejected rather than silently
// producing garbage.
const isOllama = target?.provider.kind === "ollama";
try {
  if (!isOllama) throw new Error("streaming_unsupported_provider");
  ...
} catch (e) {
  const reason = ... "streaming_unsupported" ...
  const stream = new ReadableStream({ start(c) {
    c.enqueue(sseEvent({ error: reason }));
    c.enqueue("event: done\ndata: {}\n\n");     // ← جریان بلافاصله بسته می‌شود
    c.close();
  }});
  return new Response(stream, { headers: sseHeaders });
}
```

و این مسیر از `resolveProviderForCapability("chat")` استفاده می‌کند که — `client.server.ts:110-116`:
```ts
const providers = await listProvidersFor(capability);
const provider = providers[0];      // ← فقط اولی. بدون failover.
```

کامنت بالای همان تابع (خطوط ۱۰۲-۱۰۸) این را صریحاً می‌پذیرد:
> *"Such callers still get central configuration, provider order and the vaulted key; what they give up is automatic failover"*

⇒ `providers[0]` = «جی پی تی» (priority 8) ⇒ `kind !== "ollama"` ⇒ خطا ⇒ SSE خالی بسته می‌شود ⇒ **کاربر پاسخ خالی می‌بیند.**

#### 🎯 شاهد قطعی از جدول سلامت

```sql
SELECT p.name, h.capability, h.last_status, h.last_error_code, h.last_error_message, h.last_ok_at
  FROM ai_provider_health h JOIN ai_providers p ON p.id = h.provider_id;
```
```
جی پی تی | chat       | unavailable | unreachable | streaming_unsupported | (هرگز ok نشده)   2026-07-24 17:05:11
ollama   | chat       | ok          |             |                       | 2026-07-24 13:22:45  (5143ms)
ollama   | embeddings | ok          |             |                       | 2026-07-26 20:27:46  (6784ms)
```

**Ollama برای چت و embeddings هر دو `ok` ثبت شده. تنها خرابی، دقیقاً همان `streaming_unsupported` است.**

#### ⚠️ یک تصحیح نسبت به فرضیهٔ اولیه

مسیرهای غیر-استریم (`aiChat` / `aiEmbed`) **failover دارند و سالم‌اند**. `isFailoverReason` (در `src/lib/ai/types.ts:86-88`) برای همهٔ دلایل جز `no_provider` مقدار `true` برمی‌گرداند، پس حلقهٔ `runWithFailover` واقعاً به Ollama می‌رسد. مشکل **فقط** مسیر استریم پیام‌رسان است که عمداً failover ندارد.

---

### ریشهٔ ۲ — دانش سازمانی: پیکره اصلاً نمایه‌سازی نشده

```
knowledge_documents        | 1   (منتشرشده: 1)
knowledge_document_chunks  | 0   ← 
```

سند موجود **کاملاً سالم** است:
```
title: اطلاع رسانی کارشناسان فروش
length: 86,875 کاراکتر
منتشرشده: بله
الگوی خرابی ????: خیر
```

مسیر منطق — `src/lib/knowledge/rag.functions.ts:173-190`:
```ts
const { data: rows } = await context.supabase.rpc("search_knowledge_chunks_semantic", {...});
const hits = rows.filter(h => Number(h.similarity) >= MIN_SIMILARITY);   // MIN_SIMILARITY = 0.35
if (hits.length === 0) {
  return { ok: true, answer: NOT_FOUND_FA, sources: [], noContext: true };
}
```
با صفر chunk ⇒ صفر hit ⇒ همیشه:
> **«در اسناد موجود پاسخی پیدا نکردم.»**

⇒ دقیقاً «خالی برگرداندن» که کاربر گزارش کرده.

هدر خود فایل (خطوط ۴-۷) هم این را پیش‌بینی کرده بود:
> *"HONEST STATUS: knowledge_documents currently holds 0 rows, so this indexes nothing and answers nothing until somebody writes a document."*

از آن زمان یک سند اضافه شده، ولی **`reindexKnowledgeDocuments` هرگز پس از آن اجرا نشده**. embeddings هم `ok` ثبت شده (۲۰۲۶-۰۷-۲۶) ⇒ مانع فنی وجود ندارد.

### حکم نهایی گروه D — تفکیک صریح

| بخش | ریشه | نوع رفع |
|---|---|---|
| چت پیام‌رسان | ارائه‌دهندهٔ اشتباه (اولویت ۸، غیر-Ollama) در مسیر استریمی که failover ندارد | **پیکربندی** (یا کد، بسته به گزینه) |
| دانش سازمانی | `knowledge_document_chunks = 0` — نمایه‌سازی اجرا نشده | **عملیاتی** (اجرای دکمهٔ نمایه‌سازی) |
| سرویس Ollama | ✅ سالم | — |

**⇒ هیچ‌کدام نیازمند migration نیستند. بخش دانش حتی نیازمند تغییر کد هم نیست.**

### دقیقاً چه چیزی برای رفع لازم است

**برای دانش سازمانی (کوچک‌ترین رفع کل این گزارش):**
1. ورود با نقش admin/manager
2. اجرای `reindexKnowledgeDocuments` از صفحهٔ دانش (`/knowledge`)
3. تأیید: `SELECT count(*) FROM knowledge_document_chunks;` باید > 0 شود
4. (اگر شکست خورد، `messageFa` گزارش دلیل دقیق را می‌دهد — منطق ازپیش‌نوشته‌شده)

**برای چت — سه گزینه:**

| گزینه | تغییر | مزیت | عیب |
|---|---|---|---|
| **الف (سریع‌ترین)** | `UPDATE ai_providers SET priority = 20 WHERE name = 'جی پی تی';` (یا `is_active = false`) | یک UPDATE، بدون rebuild، فوری | GPT به‌عنوان پشتیبان کنار می‌رود |
| **ب (اصولی)** | در `ai-chat.ts`، به‌جای `resolveProviderForCapability` روی ارائه‌دهندگان حلقه بزن تا اولین `kind === "ollama"` پیدا شود | GPT برای مسیرهای غیراستریم می‌ماند | تغییر کد + rebuild |
| **ج (کامل)** | پیاده‌سازی استریم OpenAI-compatible (`/chat/completions` با `stream: true`) در همان مسیر | هر دو ارائه‌دهنده استریم می‌کنند | بزرگ‌ترین کار + نیاز به `base_url` و `chat_model` درست |

**جدا از این‌ها (بهداشتی):** `base_url` ارائه‌دهندهٔ «جی پی تی» به `https://api.openai.com/v1` اصلاح و `chat_model` پر شود — وگرنه حتی در مسیرهای غیراستریم هم همیشه ناموفق است و فقط تأخیر اضافه می‌کند.

### ریسک
- گزینهٔ الف صفر ریسک کد دارد و بلافاصله جواب می‌دهد ⇒ برای اولین اقدام توصیه می‌شود.
- نمایه‌سازی روی سند ۸۷ هزار کاراکتری زمان می‌برد (embeddings ~۷ ثانیه در هر فراخوانی ثبت شده) — نباید با «هنگ کردن» اشتباه شود.
- `bge-m3` بردار ۱۰۲۴ بعدی تولید می‌کند که با `CHUNK_EMBEDDING_DIMENSION = 1024` (`rag.functions.ts:28`) می‌خواند ✅

---

# گروه E — بهبود UI

## E1 — نیازمندی ۲۰۹: سایدبار عریض‌تر + قابل‌تنظیم با drag

### حکم: ❌ نیست — عرض ثابت و کدشده؛ هیچ سازوکار drag-resize وجود ندارد

### شواهد چهارلایه

**۱) عرض کجا تعریف شده — یک ثابت کدشده**

`src/components/ui/sidebar.tsx:23-25`:
```ts
const SIDEBAR_WIDTH = "16rem";          // = 256px  ← عرض فعلی
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
```

تزریق به CSS در `sidebar.tsx:130-137`:
```tsx
style={{
  "--sidebar-width": SIDEBAR_WIDTH,
  "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
  ...style,                              // ← نکتهٔ مهم: قابل override
} as React.CSSProperties}
```

`--sidebar-width` سپس در ۷ کلاس مصرف می‌شود (خطوط ۱۷۸، ۱۹۵، ۲۲۵، ۲۳۵، ۲۳۷-۲۳۸).

**۲) هیچ override در سطح اپ داده نمی‌شود**

`src/components/layout/AppShell.tsx:17` — `<SidebarProvider>` بدون هیچ prop ای:
```tsx
<SidebarProvider>
  <div dir="rtl" className="flex min-h-screen w-full bg-background">
    <AppSidebar />
```
⇒ همیشه `16rem`.

**۳) `SidebarRail` — یک تلهٔ خوش‌بینی**

`sidebar.tsx:286-312` یک کامپوننت `SidebarRail` وجود دارد که **شبیه resizer به نظر می‌رسد**:
```tsx
"[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize",
```

**ولی در واقع فقط یک دکمهٔ toggle است:**
```tsx
const { toggleSidebar } = useSidebar();
<button ... onClick={toggleSidebar} title="Toggle Sidebar" ... />
```
هیچ `onMouseDown`, `onDrag`, یا منطق resize ندارد (grep برای `onDrag|resize|onMouseDown` تأیید کرد).

**و مهم‌تر: اصلاً mount نشده.** `AppSidebar.tsx:5`:
```tsx
import { Sidebar, SidebarContent, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
```
`SidebarRail` در فهرست import نیست ⇒ **طبق قانون ۱ ضدخوش‌بینی: وجود ندارد.**

**۴) وضعیت پایدارسازی**

`SidebarContextProps` (خطوط ۲۸-۳۶) شامل: `state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar` — **هیچ `width` یا `setWidth`**.

`SIDEBAR_COOKIE_NAME = "sidebar_state"` فقط باز/بستهٔ بودن را نگه می‌دارد. `grep localStorage` روی `sidebar.tsx` و `AppSidebar.tsx`: **صفر نتیجه**.

**۵) دربارهٔ «فونت درشت» — تصحیح صادقانه**

فونت‌های سایدبار در واقع **بسیار ریز** هستند:
- عنوان آیتم: `text-[13px]` (خط ۳۰۴)
- زیرعنوان: `text-[10.5px]` (خط ۳۰۷)
- آیتم‌های ناوبری: `text-[11px]` (خطوط ۴۸۰، ۵۲۲)
- سرگروه‌ها: `text-[11px]` (خطوط ۴۵۰، ۴۶۷، ۵۱۲)
- بج‌ها: `text-[10px]`

مشکل واقعی احتمالاً **فونت نیست، بلکه قطع شدن متن است**: ۱۲ مورد `truncate` در `AppSidebar.tsx` وجود دارد. در ۱۶rem با متن فارسی، نام‌های بلند منو بریده می‌شوند و پیدا کردن گزینه سخت می‌شود. **بزرگ کردن عرض دقیقاً همین را حل می‌کند؛ بزرگ کردن فونت آن را بدتر می‌کند.**

### دقیقاً چه چیزی برای رفع لازم است

**بخش ۱ — عریض‌تر کردن (خیلی ساده):**

| گزینه | تغییر | ارزیابی |
|---|---|---|
| **الف** | `SIDEBAR_WIDTH = "16rem"` → `"19rem"` یا `"20rem"` | تک‌خطی، فوری. ولی `sidebar.tsx` یک فایل shadcn/ui است و در ارتقاهای بعدی بازنویسی می‌شود |
| **ب (بهتر)** | در `AppShell.tsx:17`: `<SidebarProvider style={{ "--sidebar-width": "20rem" }}>` | از قابلیت `...style` که خط ۱۳۵ عمداً فراهم کرده استفاده می‌کند؛ فایل shadcn دست‌نخورده می‌ماند |

**بخش ۲ — drag-resize (باید ساخته شود):**

| # | کار | جزئیات |
|---|---|---|
| ۱ | افزودن `width: string` و `setWidth: (w: string) => void` به `SidebarContextProps` | `sidebar.tsx:28-36` |
| ۲ | تبدیل `--sidebar-width` از ثابت به state | `sidebar.tsx:132` — `"--sidebar-width": width` |
| ۳ | ساخت کامپوننت جدید `SidebarResizeHandle` (یا تبدیل `SidebarRail`) با `onPointerDown` → `pointermove` → محاسبهٔ delta → `setWidth` | فایل جدید یا `sidebar.tsx` |
| ۴ | 🔴 **توجه RTL:** اپ `dir="rtl"` است (`AppShell.tsx:18`) و سایدبار سمت **راست** است. علامت delta برعکس LTR است. کلاس‌های موجود از `data-side=right` استفاده می‌کنند — همان الگو باید رعایت شود | — |
| ۵ | clamp کردن بین `SIDEBAR_WIDTH_ICON` (3rem) و یک سقف معقول (~24rem) | — |
| ۶ | ذخیره در `localStorage` (مثلاً کلید `sidebar_width`) و بازخوانی در mount — با محافظت SSR (`typeof window !== "undefined"`) | — |
| ۷ | mount کردن handle داخل `AppSidebar` | `AppSidebar.tsx` |
| ۸ | حذف `transition-[width] duration-200` هنگام درگ، وگرنه حرکت کند و چسبناک حس می‌شود | `sidebar.tsx:225,235` |
| ۹ | غیرفعال کردن روی موبایل (سایدبار موبایل یک `Sheet` جداست با عرض مستقل) | `useIsMobile()` |

### ریسک
- **حتماً از گزینهٔ (ب) بخش ۱ استفاده شود** — `src/components/ui/sidebar.tsx` کد تولیدشدهٔ shadcn است؛ تغییرات مستقیم در آن هنگام ارتقا از بین می‌رود. ولی بخش ۲ ناگزیر همان فایل را لمس می‌کند؛ تغییرات باید با کامنت واضح مشخص شوند.
- SSR: پروژه TanStack Start است و `SidebarProvider` سمت سرور هم رندر می‌شود. خواندن `localStorage` در رندر اولیه ⇒ hydration mismatch. باید در `useEffect` خوانده شود.
- rebuild لازم است.
- **پیشنهاد فازبندی:** بخش ۱ (عرض) را جدا و اول انجام دهید — یک خط، ریسک صفر، و احتمالاً ۸۰٪ شکایت کاربر را رفع می‌کند. بخش ۲ را بعد از تأیید کاربر انجام دهید.

---

# F3 — تناقض‌ها و نکات ویژه

### ۱. مورد ۲۰۱/۲۰۲ — تناقض حل شد ✅

**هیچ تناقضی وجود نداشت.** تحقیق قبلی و کاربر دربارهٔ دو مرحلهٔ متفاوت حرف می‌زدند:

| مرحله | چک موجودی؟ | خواستهٔ کاربر | تطابق |
|---|---|---|---|
| صدور (draft) | ❌ فقط هشدار نرم، کلیک دوم عبور می‌کند | ۲۰۱: باید اجازه دهد | ✅ |
| قطعی‌کردن (accepted) | ✅ UI + تریگر DB | ۲۰۲: باید ممنوع کند | ✅ |

**هیچ تغییر کدی لازم نیست.** تنها مانع عملی، خالی بودن `warehouse_stock` (۴ ردیف برای ۳ انبار) است که یک مسئلهٔ داده‌ای است نه منطقی.

### ۲. مورد ۲۰۵ — بله، دو مشکل کاملاً جدا ✅

| | ریشه | اطمینان |
|---|---|---|
| **شکست ثبت** | دو قانون blocking در `validation_rules` با دامنهٔ `journal_entry` | بسیار محتمل — نیاز به تأیید با یک تلاش ثبت زیر نظر لاگ |
| **پیام `????`** | ۴۳ تابع DB با متن فارسی نابودشده در ۲۰۲۶-۰۷-۱۱ | قطعی |

**پیام‌های خطای قوانین blocking سالم‌اند.** پس رفع خرابی متن، شکست ثبت را حل نمی‌کند؛ و رفع شکست ثبت، `????` را در جاهای دیگر (تأیید فیش، اعتبار، ...) حل نمی‌کند. **دو رفع مستقل لازم است.**

### ۳. مورد ۲۰۸ — ریشه **کد/پیکربندی** است، نه سرویس ✅

Ollama بالا، در دسترس از کانتینر، مدل‌های `qwen2.5:7b` و `bge-m3:latest` بارگذاری‌شده، و جدول سلامت برای هر دو قابلیت `ok` ثبت کرده.

- **چت:** ارائه‌دهندهٔ اشتباه (اولویت ۸) در مسیر استریمی که عمداً failover ندارد ⇒ رفع با یک UPDATE اولویت یا تغییر کوچک کد.
- **دانش:** `knowledge_document_chunks = 0` ⇒ رفع **بدون هیچ تغییر کدی** — فقط اجرای نمایه‌سازی.

### ۴. نکات ویژهٔ اضافی که ضمن تحقیق کشف شد

| # | یافته | شدت |
|---|---|---|
| ۱ | **حفرهٔ تخفیف:** کف قیمت فقط `unit_price` را چک می‌کند؛ فیلد «تخفیف» برای همهٔ نقش‌ها باز است و روی `sales_quote_items` صفر تریگر وجود دارد ⇒ قانون ۱۹۴ همین حالا قابل دور زدن است | 🔴 بالا |
| ۲ | **راه فرار «مشتری مهمان»:** فرم اجازه می‌دهد پیش‌فاکتور بدون اتصال به پروندهٔ مشتری ثبت شود ⇒ هر قانون اعتباری (۱۹۷) با یک کلیک دور زده می‌شود | 🔴 بالا (وابسته به A3) |
| ۳ | `warehouse_stock` تقریباً خالی (۴ ردیف) ولی تریگر کسر فعال ⇒ قطعی‌کردن تقریباً همیشه شکست می‌خورد | 🟠 متوسط |
| ۴ | `post_receipt_accounting` فقط `payment_receipt_links` متصل به **`invoices`** (جدول مرده، ۰ ردیف) را تخصیص می‌دهد؛ لینک‌های `quote_id` نادیده گرفته می‌شوند | 🟠 متوسط |
| ۵ | `src/lib/sales/customer-credit-snapshot.ts` کد مرده است (صفر مصرف‌کننده) | 🟡 پایین |
| ۶ | ۵ نوع تسویه `sort_order = 100` مشترک دارند ⇒ ترتیب نمایش قطعی نیست | 🟡 پایین |
| ۷ | `base_url` ارائه‌دهندهٔ OpenAI به دامنهٔ داشبورد اشاره می‌کند نه API؛ `chat_model` هم خالی است | 🟡 پایین |
| ۸ | دو فایل migration (149، 155) در **گیت** حاوی متن نابودشده‌اند — متن اصلی از بین رفته و باید بازنویسی شود | 🟠 متوسط |

---

# F4 — پیشنهاد فازبندی اجرا

## فاز ۰ — رفع‌های بدون کد (امروز، دقایق)
| مورد | کار | اثر |
|---|---|---|
| ۲۰۸-دانش | اجرای نمایه‌سازی دانش از `/knowledge` | «دانش سازمانی خالی» رفع می‌شود |
| ۲۰۸-چت | `UPDATE ai_providers SET priority = 20 WHERE name = 'جی پی تی'` | چت AI کار می‌کند |
| ۱۹۹ | (اختیاری) فعال‌سازی انواع تسویهٔ لازم + یکتا کردن `sort_order` | — |
| ۲۰۲ | پر کردن `warehouse_stock` | قطعی‌کردن عملاً کار می‌کند |

**مستقل، بدون rebuild، بدون migration، بلافاصله قابل‌تست.**

## فاز ۱ — باگ‌های مستقل و کم‌ریسک
| مورد | کار | وابستگی |
|---|---|---|
| ۲۰۹ (بخش عرض) | `<SidebarProvider style={{"--sidebar-width":"20rem"}}>` در `AppShell.tsx` | ندارد |
| ۲۰۳-ج | رفع PDF (گزینهٔ الف حداقلی یا ب کامل) | ندارد |
| ۲۰۳-ب | تابع عدد→حروف فارسی | برای درج در PDF، به ۲۰۳-ج وابسته است |

هر سه مستقل و جداگانه قابل‌تست.

## فاز ۲ — خانوادهٔ فیش (باید با هم انجام شوند)
| مورد | کار |
|---|---|
| ۲۰۵-ب | migration ترمیمی برای ۴۳ تابع خراب + بازنویسی دستی متن ۱۴۹/۱۵۵ |
| ۲۰۵-الف + ۲۰۷ | مشروط کردن قوانین blocking دامنهٔ `journal_entry` به حالت گیرنده |

🔴 **این دو نباید جدا شوند.** رفع ۲۰۷ به‌تنهایی ثبت را باز می‌کند ولی کاربر در مرحلهٔ تأیید فیش دوباره `????` می‌بیند.
⚠️ اجرای migration حتماً با `SET client_encoding='UTF8'` و `--single-transaction`.

## فاز ۳ — قوانین کاری پیش‌فاکتور (وابستگی‌دار)
| ترتیب | مورد | چرا این ترتیب |
|---|---|---|
| ۳.۱ | ۱۹۵ (دلیل رد) | کاملاً مستقل، کوچک‌ترین کار این فاز |
| ۳.۲ | ۱۹۴+۱۹۶ (زیر لیست) | + بستن حفرهٔ تخفیف (یافتهٔ ۱ در F3) |
| ۳.۳ | ۱۹۷+۱۹۸ (اعتبار + بیعانه) | بزرگ‌ترین. **پیش‌نیاز:** تصمیم دربارهٔ «مشتری مهمان» + ترمیم متن `hold_credit`/`get_customer_credit` در فاز ۲ |

⚠️ ۳.۲ و ۳.۳ هر دو امضای `create_sales_quote_with_items` را تغییر می‌دهند ⇒ **در یک migration واحد انجام شوند** تا دو بار rebuild لازم نشود.

## فاز ۴ — ساخت‌های جدید
| مورد | کار |
|---|---|
| ۲۰۳-الف | ویزیتور: جدول + RLS + ستون + RPC + صفحهٔ CRUD + منو + dropdown |
| ۲۰۹ (بخش drag) | resize handle با پشتیبانی RTL + localStorage |

هر دو مستقل، بزرگ، و جداگانه قابل‌تست. اگر ۳.۲/۳.۳ انجام شده باشد، ویزیتور می‌تواند در همان migration ستون اضافه کند.

## نمودار وابستگی
```
فاز ۰ (بدون کد) ──── مستقل ────────────────────────────►

فاز ۱: ۲۰۹-عرض ──── مستقل ─────────────────────────────►
       ۲۰۳-ج (PDF) ──┐
       ۲۰۳-ب (حروف) ─┴──► درج در PDF

فاز ۲: ۲۰۵-ب (ترمیم متن) ──┬──► ۲۰۵-الف + ۲۰۷
                            └──► پیش‌نیاز ۳.۳

فاز ۳: ۳.۱ (۱۹۵) ── مستقل
       ۳.۲ (۱۹۴/۱۹۶) ──┐
       ۳.۳ (۱۹۷/۱۹۸) ──┴──► یک migration مشترک (امضای RPC)

فاز ۴: ۲۰۳-الف (ویزیتور) ── مستقل
       ۲۰۹-drag ── مستقل
```

---

# F5 — تأیید سلامت

```
$ git status --short
?? docs/research/req-194-209-diagnosis.md      ← تنها فایل جدید این جلسه
(بقیهٔ فایل‌های ?? از قبل موجود بودند)
```

| تعهد | وضعیت |
|---|---|
| نوشتن در دیتابیس | ❌ انجام نشد — تنها `SELECT`, `pg_get_functiondef`, `information_schema`, `pg_proc`, `pg_policies`, `pg_trigger`, `pg_constraint`. تنها دستور غیر-SELECT، `SET client_encoding='UTF8'` بود (پارامتر نشست، بدون اثر پایدار) |
| build / rebuild | ❌ انجام نشد |
| تغییر کانتینر | ❌ انجام نشد — تنها `docker ps`, `docker logs`, `docker exec` با دستورات فقط‌خواندنی (`ls`, `find`, `node -e "fetch"`, `printenv`) |
| اجرای migration | ❌ انجام نشد |
| تغییر کد اپلیکیشن | ❌ انجام نشد |
| چاپ کلید/رمز | ❌ انجام نشد — تنها host/port/نام ارائه‌دهنده گزارش شد |

**تنها نوشتن روی دیسک: همین فایل گزارش.**

---

## پیوست — فهرست شواهد کلیدی

| ادعا | شاهد |
|---|---|
| `invoices` ماژول مرده است | `registry.ts:303-306` + `SELECT count(*)` = ۰ |
| کف قیمت اجرا می‌شود | `create_sales_quote_with_items` بلوک «Phase J» + لاگ Postgres ۱۴:۰۰:۴۱ |
| دلیل رد دور ریخته می‌شود | `quote-status.functions.ts:106` + نبود ستون |
| بیعانه فقط روی جدول مرده | `information_schema.columns` — ۲ ردیف، هر دو `invoices` |
| ویزیتور وجود ندارد | `grep` صفر نتیجه + `information_schema` صفر ردیف |
| عدد→حروف وجود ندارد | `grep` هفت الگو، صفر نتیجهٔ مرتبط |
| `vfs` در pdfmake 0.3 no-op است | `node_modules/pdfmake/src/base.js` + `browser-extensions/index.js` |
| `download()` غیرهمگام است | `OutputDocumentBrowser.js` |
| pdfmake فارسی را نمی‌شکند | `src/lib/pdf/sale-list-pdf.ts:3-17` (اعتراف خود پروژه) |
| pdfmake ارتقا یافت | `git log -S` → کامیت `b8688653` (۲۰۲۶-۰۴-۲۷) |
| ۴۳ تابع خراب | `SELECT count(*) FILTER (WHERE prosrc ~ '\?\?\?')` |
| خرابی هنگام اجرا | migration `20260626083725` سالم vs `pg_proc` خراب |
| تاریخ خرابی ۲۰۲۶-۰۷-۱۱ | کامنت داخل `post_receipt_accounting` |
| کد آسان از `validation_rules` اجباری می‌شود | ردیف `f81e86fa-d93e-479e-b468-a3f5604ff52c` |
| Ollama سالم است | `docker exec afrakala-lan-web node -e "fetch(...)"` → ۴ مدل |
| چت روی ارائه‌دهندهٔ اشتباه می‌رود | `ai_provider_health`: `streaming_unsupported` + `ai-chat.ts:173` |
| دانش صفر chunk دارد | `SELECT count(*) FROM knowledge_document_chunks` = ۰ |
| عرض سایدبار کدشده | `sidebar.tsx:23` + `AppShell.tsx:17` بدون override |
| `SidebarRail` mount نشده | `AppSidebar.tsx:5` — در فهرست import نیست |
